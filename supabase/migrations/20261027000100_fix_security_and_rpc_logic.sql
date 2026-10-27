-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD Y LÓGICA: BLINDAJE DE RPC Y DESBLOQUEO DE ABONOS MÚLTIPLES
-- Fecha: 2026-10-27
-- Descripción:
-- 1. Elimina la restricción UNIQUE(toma_id, anio, mes) en pago_detalles que impedía
--    registrar más de un abono o cobro en el mismo mes para una misma toma.
-- 2. Blinda la función SECURITY DEFINER 'registrar_pago_sincronizado' validando:
--    - Montos estrictamente positivos (total > 0, monto > 0, recargo >= 0) para
--      impedir manipulación de saldo_pendiente con números negativos.
--    - Pertenencia multi-tenant de persona_id y toma_id a la organización del cajero.
--    - Idempotencia por ID de detalle (ON CONFLICT (id) DO NOTHING).
-- ==============================================================================

-- 1. Eliminar restricción rígida UNIQUE(toma_id, anio, mes) que bloqueaba abonos múltiples
ALTER TABLE public.pago_detalles
    DROP CONSTRAINT IF EXISTS pago_detalles_toma_id_anio_mes_key;

-- Asegurar índice de búsqueda rápida por toma, año y mes (sin bloquear múltiples abonos)
CREATE INDEX IF NOT EXISTS idx_pago_detalles_toma_anio_mes
    ON public.pago_detalles(toma_id, anio, mes);

-- 2. Reemplazar RPC registrar_pago_sincronizado con validaciones de seguridad y negocio
CREATE OR REPLACE FUNCTION public.registrar_pago_sincronizado(
    p_pago JSONB,
    p_detalles JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_cajero_id UUID;
    v_auth_org_id UUID;
    v_pago_id UUID;
    v_org_id UUID;
    v_persona_id UUID;
    v_total NUMERIC;
    v_folio TEXT;
    v_detalle JSONB;
    v_detalle_id UUID;
    v_toma_id UUID;
    v_monto NUMERIC;
    v_recargo NUMERIC;
    v_anio INT;
    v_mes INT;
    v_folio_existente INT;
BEGIN
    -- 1. Validar sesión autenticada
    v_cajero_id := auth.uid();
    IF v_cajero_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_auth_org_id := public.get_auth_org_id();
    v_org_id := (p_pago->>'organizacion_id')::UUID;

    -- 2. Validar aislamiento multi-tenant
    IF v_auth_org_id IS NULL OR v_auth_org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Operación denegada: No perteneces a la organización del pago o tu cuenta está inactiva.';
    END IF;

    -- 3. Validar permisos granulares
    IF NOT public.tiene_permiso('cobros.crear') THEN
        RAISE EXCEPTION 'Operación denegada: Tu rol no cuenta con el permiso "cobros.crear".';
    END IF;

    v_pago_id := (p_pago->>'id')::UUID;
    v_persona_id := (p_pago->>'persona_id')::UUID;
    v_total := (p_pago->>'total')::NUMERIC;
    v_folio := trim(COALESCE(p_pago->>'folio', ''));

    IF v_pago_id IS NULL OR v_folio = '' THEN
        RAISE EXCEPTION 'Datos de pago inválidos: id y folio son obligatorios.';
    END IF;

    -- 4. Validar que el total sea estrictamente mayor a cero
    IF v_total IS NULL OR v_total <= 0 THEN
        RAISE EXCEPTION 'Operación denegada: El monto total del pago debe ser mayor a cero.';
    END IF;

    -- 5. Validar que la persona pertenezca a la organización activa
    IF v_persona_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.personas
        WHERE id = v_persona_id AND organizacion_id = v_org_id
    ) THEN
        RAISE EXCEPTION 'Operación denegada: El contribuyente especificado no pertenece a tu organización.';
    END IF;

    -- 6. Idempotencia: Si este pago ya fue recibido previamente (mismo UUID), retornar éxito
    IF EXISTS (SELECT 1 FROM public.pagos WHERE id = v_pago_id) THEN
        SELECT folio INTO v_folio FROM public.pagos WHERE id = v_pago_id;
        RETURN jsonb_build_object(
            'success', true,
            'pago_id', v_pago_id,
            'folio', v_folio,
            'status', 'already_processed',
            'mensaje', 'El pago ya se encontraba registrado previamente.'
        );
    END IF;

    -- 7. Prevención de colisión de folio offline con pagos de otros dispositivos
    SELECT count(*) INTO v_folio_existente
    FROM public.pagos
    WHERE organizacion_id = v_org_id AND folio = v_folio;

    IF v_folio_existente > 0 THEN
        v_folio := v_folio || '-COL-' || upper(substr(v_pago_id::text, 1, 4));
    END IF;

    -- 8. Insertar encabezado de pago
    INSERT INTO public.pagos (
        id,
        organizacion_id,
        folio,
        persona_id,
        cajero_id,
        total,
        metodo_pago,
        fecha_pago,
        notas,
        dispositivo_offline_id,
        sincronizado_en,
        created_at,
        updated_at
    ) VALUES (
        v_pago_id,
        v_org_id,
        v_folio,
        v_persona_id,
        v_cajero_id, -- Forzar siempre el UID real del cajero autenticado o sincronizador
        v_total,
        COALESCE((p_pago->>'metodo_pago')::metodo_pago, 'efectivo'),
        COALESCE((p_pago->>'fecha_pago')::TIMESTAMPTZ, timezone('utc'::text, now())),
        p_pago->>'notas',
        p_pago->>'dispositivo_offline_id',
        timezone('utc'::text, now()),
        COALESCE((p_pago->>'created_at')::TIMESTAMPTZ, timezone('utc'::text, now())),
        timezone('utc'::text, now())
    );

    -- 9. Insertar cada concepto del desglose validando pertenencia y signos
    IF p_detalles IS NOT NULL AND jsonb_array_length(p_detalles) > 0 THEN
        FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles)
        LOOP
            v_detalle_id := COALESCE((v_detalle->>'id')::UUID, uuid_generate_v4());
            v_toma_id := (v_detalle->>'toma_id')::UUID;
            v_anio := (v_detalle->>'anio')::INT;
            v_mes := (v_detalle->>'mes')::INT;
            v_monto := (v_detalle->>'monto')::NUMERIC;
            v_recargo := COALESCE((v_detalle->>'recargo')::NUMERIC, 0.00);

            -- Validar signos para evitar manipulación de deuda con montos negativos
            IF v_monto IS NULL OR v_monto <= 0 OR v_recargo < 0 THEN
                RAISE EXCEPTION 'Operación denegada: Los montos y recargos del detalle deben ser positivos.';
            END IF;

            IF v_mes IS NULL OR v_mes < 1 OR v_mes > 12 OR v_anio IS NULL OR v_anio < 2000 OR v_anio > 2100 THEN
                RAISE EXCEPTION 'Operación denegada: Periodo (mes/año) inválido en el detalle del pago.';
            END IF;

            -- Validar que la toma pertenezca a la misma organización
            IF v_toma_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM public.tomas
                WHERE id = v_toma_id AND organizacion_id = v_org_id
            ) THEN
                RAISE EXCEPTION 'Operación denegada: La toma especificada no pertenece a tu organización.';
            END IF;

            INSERT INTO public.pago_detalles (
                id,
                organizacion_id,
                pago_id,
                toma_id,
                anio,
                mes,
                monto,
                recargo,
                created_at,
                updated_at
            ) VALUES (
                v_detalle_id,
                v_org_id,
                v_pago_id,
                v_toma_id,
                v_anio,
                v_mes,
                v_monto,
                v_recargo,
                COALESCE((v_detalle->>'created_at')::TIMESTAMPTZ, timezone('utc'::text, now())),
                timezone('utc'::text, now())
            )
            ON CONFLICT (id) DO NOTHING;

            -- Descontar monto pagado del saldo pendiente de la toma (nunca menor a 0)
            UPDATE public.tomas
            SET saldo_pendiente = GREATEST(0.00, saldo_pendiente - v_monto),
                updated_at = timezone('utc'::text, now())
            WHERE id = v_toma_id AND organizacion_id = v_org_id;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pago_id', v_pago_id,
        'folio', v_folio,
        'status', 'created',
        'mensaje', 'Pago y detalles registrados exitosamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_sincronizado(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_sincronizado(JSONB, JSONB) TO authenticated;

