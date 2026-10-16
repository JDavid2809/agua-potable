-- ==============================================================================
-- MIGRACIÓN L1 Y L2: Folios Únicos, Transaccionalidad RPC y Motor de Sincronización
-- Descripción:
-- 1. Crea la función RPC transaccional 'registrar_pago_sincronizado' que inserta
--    atómica e idempotentemente el pago y sus detalles en una sola transacción.
-- 2. Elimina la sobrescritura destructiva (upsert ciego) que causaba pérdida de datos
--    al cobrar offline en múltiples dispositivos.
-- 3. Resuelve colisiones de folios sin sobrescribir pagos ajenos.
-- 4. Actualiza automáticamente 'tomas.saldo_pendiente' al procesar cobros.
-- 5. Añade índices para optimizar la sincronización incremental por 'updated_at'.
-- ==============================================================================

-- 1. RPC Transaccional para registrar pagos sincronizados
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
    v_folio TEXT;
    v_detalle JSONB;
    v_toma_id UUID;
    v_monto NUMERIC;
    v_recargo NUMERIC;
    v_anio INT;
    v_mes INT;
    v_folio_existente INT;
BEGIN
    -- Validar autenticación
    v_cajero_id := auth.uid();
    IF v_cajero_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_auth_org_id := public.get_auth_org_id();
    v_org_id := (p_pago->>'organizacion_id')::UUID;

    -- Validar aislamiento multi-tenant
    IF v_auth_org_id IS NULL OR v_auth_org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Operación denegada: No perteneces a la organización del pago o tu cuenta está inactiva.';
    END IF;

    -- Validar permisos granulares
    IF NOT public.tiene_permiso('cobros.crear') THEN
        RAISE EXCEPTION 'Operación denegada: Tu rol no cuenta con el permiso "cobros.crear".';
    END IF;

    v_pago_id := (p_pago->>'id')::UUID;
    v_folio := trim(p_pago->>'folio');

    IF v_pago_id IS NULL OR v_folio = '' THEN
        RAISE EXCEPTION 'Datos de pago inválidos: id y folio son obligatorios.';
    END IF;

    -- Idempotencia: Si este pago ya fue recibido previamente (mismo UUID), retornar éxito sin duplicar ni fallar
    IF EXISTS (SELECT 1 FROM public.pagos WHERE id = v_pago_id) THEN
        RETURN jsonb_build_object(
            'success', true,
            'pago_id', v_pago_id,
            'folio', v_folio,
            'status', 'already_processed',
            'mensaje', 'El pago ya se encontraba registrado previamente.'
        );
    END IF;

    -- L1: Prevención de colisión de folio offline con pagos de otros dispositivos
    SELECT count(*) INTO v_folio_existente 
    FROM public.pagos 
    WHERE organizacion_id = v_org_id AND folio = v_folio;

    IF v_folio_existente > 0 THEN
        -- Si otro dispositivo usó ese mismo folio, preservamos ambos agregando sufijo identificador
        v_folio := v_folio || '-COL-' || substr(v_pago_id::text, 1, 4);
    END IF;

    -- Insertar encabezado de pago
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
        (p_pago->>'persona_id')::UUID,
        COALESCE((p_pago->>'cajero_id')::UUID, v_cajero_id),
        (p_pago->>'total')::NUMERIC,
        COALESCE((p_pago->>'metodo_pago')::metodo_pago, 'efectivo'),
        COALESCE((p_pago->>'fecha_pago')::TIMESTAMPTZ, timezone('utc'::text, now())),
        p_pago->>'notas',
        p_pago->>'dispositivo_offline_id',
        timezone('utc'::text, now()),
        COALESCE((p_pago->>'created_at')::TIMESTAMPTZ, timezone('utc'::text, now())),
        timezone('utc'::text, now())
    );

    -- Insertar cada concepto del desglose
    IF p_detalles IS NOT NULL AND jsonb_array_length(p_detalles) > 0 THEN
        FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles)
        LOOP
            v_toma_id := (v_detalle->>'toma_id')::UUID;
            v_anio := (v_detalle->>'anio')::INT;
            v_mes := (v_detalle->>'mes')::INT;
            v_monto := (v_detalle->>'monto')::NUMERIC;
            v_recargo := COALESCE((v_detalle->>'recargo')::NUMERIC, 0.00);

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
                COALESCE((v_detalle->>'id')::UUID, uuid_generate_v4()),
                v_org_id,
                v_pago_id,
                v_toma_id,
                v_anio,
                v_mes,
                v_monto,
                v_recargo,
                COALESCE((v_detalle->>'created_at')::TIMESTAMPTZ, timezone('utc'::text, now())),
                timezone('utc'::text, now())
            );

            -- Actualizar saldo pendiente de la toma de forma segura (L4)
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

-- Permisos de ejecución de la RPC
REVOKE ALL ON FUNCTION public.registrar_pago_sincronizado(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_sincronizado(JSONB, JSONB) TO authenticated;

-- 2. Índices de aceleración para PULL incremental
CREATE INDEX IF NOT EXISTS idx_personas_updated_at ON public.personas(organizacion_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tomas_updated_at ON public.tomas(organizacion_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_manzanas_updated_at ON public.manzanas(organizacion_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarifas_updated_at ON public.tarifas(organizacion_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_dispositivo ON public.pagos(organizacion_id, dispositivo_offline_id);
