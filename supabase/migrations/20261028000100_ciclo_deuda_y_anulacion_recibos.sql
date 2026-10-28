-- ==============================================================================
-- MIGRACIÓN: CICLO DE CARGOS MENSUALES Y ANULACIÓN TRANSACCIONAL DE RECIBOS
-- Fecha: 2026-10-28
-- Descripción:
-- 1. Agrega soporte de estado ('completado', 'anulado') y auditoría de anulación
--    a la tabla public.pagos.
-- 2. Crea la tabla public.cargos_ciclo para auditar y controlar la generación
--    de deuda mensual (cuota base) y cargos extraordinarios de asamblea, con
--    índice único parcial para impedir cobrar dos veces el mismo mes ordinario.
-- 3. Crea la RPC public.aplicar_cargo_ciclo para cargar la cuota a todas las
--    tomas activas (exentando automáticamente a las tomas que ya pagaron ese
--    mes por adelantado).
-- 4. Crea la RPC public.anular_pago_recibo para cancelar recibos con motivo
--    obligatorio y reintegrar automáticamente el saldo a las tomas asociadas.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COLUMNAS DE ESTADO Y AUDITORÍA DE ANULACIÓN EN public.pagos
-- ------------------------------------------------------------------------------
ALTER TABLE public.pagos
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'completado'
        CHECK (estado IN ('completado', 'anulado')),
    ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
    ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anulado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_org_estado
    ON public.pagos(organizacion_id, estado);

-- ------------------------------------------------------------------------------
-- 2. TABLA public.cargos_ciclo (HISTORIAL Y CANDADO DE CORTES MENSUALES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cargos_ciclo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'mensual' CHECK (tipo IN ('mensual', 'extraordinario')),
    anio INT NOT NULL CHECK (anio >= 2020 AND anio <= 2100),
    mes INT NOT NULL CHECK (mes >= 1 AND mes <= 12),
    monto_unitario NUMERIC(10, 2) NOT NULL CHECK (monto_unitario > 0),
    tomas_afectadas INT NOT NULL DEFAULT 0,
    tomas_exentas_adelanto INT NOT NULL DEFAULT 0,
    total_generado NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    concepto TEXT NOT NULL,
    creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Candado único: solo puede aplicarse UN corte mensual ordinario por (organizacion_id, anio, mes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cargos_ciclo_unico_mensual
    ON public.cargos_ciclo(organizacion_id, anio, mes)
    WHERE (tipo = 'mensual');

CREATE INDEX IF NOT EXISTS idx_cargos_ciclo_org_fecha
    ON public.cargos_ciclo(organizacion_id, created_at DESC);

ALTER TABLE public.cargos_ciclo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cargos_ciclo_select_mi_org" ON public.cargos_ciclo;
CREATE POLICY "cargos_ciclo_select_mi_org"
    ON public.cargos_ciclo
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "cargos_ciclo_insert_admin" ON public.cargos_ciclo;
CREATE POLICY "cargos_ciclo_insert_admin"
    ON public.cargos_ciclo
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (public.es_admin() OR public.tiene_permiso('tarifas.gestionar'))
    );

-- ------------------------------------------------------------------------------
-- 3. RPC TRANSACCIONAL: public.aplicar_cargo_ciclo
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_cargo_ciclo(
    p_anio INT,
    p_mes INT,
    p_tipo TEXT,
    p_monto NUMERIC,
    p_concepto TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_cargo_id UUID;
    v_tomas_afectadas INT := 0;
    v_tomas_exentas INT := 0;
    v_total_generado NUMERIC(12, 2) := 0.00;
    v_concepto_limpio TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa para tu usuario.';
    END IF;

    IF NOT (public.es_admin() OR public.tiene_permiso('tarifas.gestionar')) THEN
        RAISE EXCEPTION 'Operación denegada: No tienes permisos para aplicar cortes o cargos al padrón.';
    END IF;

    IF p_tipo IS NULL OR p_tipo NOT IN ('mensual', 'extraordinario') THEN
        RAISE EXCEPTION 'Tipo de cargo inválido. Debe ser "mensual" o "extraordinario".';
    END IF;

    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto del cargo debe ser mayor a cero.';
    END IF;

    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 OR p_anio IS NULL OR p_anio < 2020 OR p_anio > 2100 THEN
        RAISE EXCEPTION 'Periodo inválido (mes/año).';
    END IF;

    v_concepto_limpio := trim(COALESCE(p_concepto, ''));
    IF v_concepto_limpio = '' THEN
        RAISE EXCEPTION 'El concepto o descripción del cargo es obligatorio.';
    END IF;

    -- Verificar candado si es un corte mensual ordinario
    IF p_tipo = 'mensual' AND EXISTS (
        SELECT 1 FROM public.cargos_ciclo
        WHERE organizacion_id = v_org_id
          AND anio = p_anio
          AND mes = p_mes
          AND tipo = 'mensual'
    ) THEN
        RAISE EXCEPTION 'El corte mensual para el periodo %/% ya fue aplicado anteriormente en tu organización.', p_mes, p_anio;
    END IF;

    IF p_tipo = 'mensual' THEN
        -- Contar tomas activas que YA pagaron por adelantado este (anio, mes) en un recibo no anulado
        SELECT count(*) INTO v_tomas_exentas
        FROM public.tomas t
        WHERE t.organizacion_id = v_org_id
          AND t.deleted_at IS NULL
          AND t.estado = 'activa'
          AND EXISTS (
              SELECT 1
              FROM public.pago_detalles pd
              JOIN public.pagos p ON p.id = pd.pago_id
              WHERE pd.toma_id = t.id
                AND pd.anio = p_anio
                AND pd.mes = p_mes
                AND p.estado = 'completado'
          );

        -- Aplicar cargo solo a las tomas activas que NO tengan cubierto ese mes por adelantado
        WITH actualizadas AS (
            UPDATE public.tomas t
            SET saldo_pendiente = COALESCE(t.saldo_pendiente, 0.00) + p_monto,
                updated_at = timezone('utc'::text, now())
            WHERE t.organizacion_id = v_org_id
              AND t.deleted_at IS NULL
              AND t.estado = 'activa'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.pago_detalles pd
                  JOIN public.pagos p ON p.id = pd.pago_id
                  WHERE pd.toma_id = t.id
                    AND pd.anio = p_anio
                    AND pd.mes = p_mes
                    AND p.estado = 'completado'
              )
            RETURNING t.id
        )
        SELECT count(*) INTO v_tomas_afectadas FROM actualizadas;
    ELSE
        -- Cargo extraordinario (cooperación de asamblea, obra, mantenimiento): aplica a todas las tomas activas
        WITH actualizadas AS (
            UPDATE public.tomas t
            SET saldo_pendiente = COALESCE(t.saldo_pendiente, 0.00) + p_monto,
                updated_at = timezone('utc'::text, now())
            WHERE t.organizacion_id = v_org_id
              AND t.deleted_at IS NULL
              AND t.estado = 'activa'
            RETURNING t.id
        )
        SELECT count(*) INTO v_tomas_afectadas FROM actualizadas;
    END IF;

    v_total_generado := v_tomas_afectadas * p_monto;

    INSERT INTO public.cargos_ciclo (
        organizacion_id,
        tipo,
        anio,
        mes,
        monto_unitario,
        tomas_afectadas,
        tomas_exentas_adelanto,
        total_generado,
        concepto,
        creado_por
    ) VALUES (
        v_org_id,
        p_tipo,
        p_anio,
        p_mes,
        p_monto,
        v_tomas_afectadas,
        v_tomas_exentas,
        v_total_generado,
        v_concepto_limpio,
        v_user_id
    )
    RETURNING id INTO v_cargo_id;

    RETURN jsonb_build_object(
        'success', true,
        'cargo_id', v_cargo_id,
        'tomas_afectadas', v_tomas_afectadas,
        'tomas_exentas_adelanto', v_tomas_exentas,
        'total_generado', v_total_generado,
        'mensaje', format('Cargo aplicado a %s tomas activas ($%s).', v_tomas_afectadas, v_total_generado)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_cargo_ciclo(INT, INT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_cargo_ciclo(INT, INT, TEXT, NUMERIC, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC TRANSACCIONAL: public.anular_pago_recibo
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_pago_recibo(
    p_pago_id UUID,
    p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_pago RECORD;
    v_det RECORD;
    v_motivo_limpio TEXT;
    v_monto_revertido NUMERIC(12, 2) := 0.00;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Cuenta sin organización activa.';
    END IF;

    IF NOT (public.es_admin() OR public.tiene_permiso('cobros.anular')) THEN
        RAISE EXCEPTION 'Operación denegada: No cuentas con el permiso "cobros.anular" para cancelar recibos.';
    END IF;

    v_motivo_limpio := trim(COALESCE(p_motivo, ''));
    IF length(v_motivo_limpio) < 4 THEN
        RAISE EXCEPTION 'Debes ingresar un motivo válido para justificar la anulación del recibo.';
    END IF;

    SELECT * INTO v_pago
    FROM public.pagos
    WHERE id = p_pago_id AND organizacion_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El recibo especificado no existe o no pertenece a tu organización.';
    END IF;

    IF v_pago.estado = 'anulado' THEN
        RAISE EXCEPTION 'El recibo % ya fue anulado previamente.', v_pago.folio;
    END IF;

    -- Marcar el recibo como anulado
    UPDATE public.pagos
    SET estado = 'anulado',
        motivo_anulacion = v_motivo_limpio,
        anulado_en = timezone('utc'::text, now()),
        anulado_por = v_user_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_pago_id AND organizacion_id = v_org_id;

    -- Reintegrar el monto de cada concepto a la deuda (saldo_pendiente) de su toma
    FOR v_det IN
        SELECT toma_id, monto
        FROM public.pago_detalles
        WHERE pago_id = p_pago_id AND organizacion_id = v_org_id
    LOOP
        UPDATE public.tomas
        SET saldo_pendiente = COALESCE(saldo_pendiente, 0.00) + COALESCE(v_det.monto, 0.00),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_det.toma_id AND organizacion_id = v_org_id;

        v_monto_revertido := v_monto_revertido + COALESCE(v_det.monto, 0.00);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'pago_id', p_pago_id,
        'folio', v_pago.folio,
        'monto_revertido', v_monto_revertido,
        'mensaje', format('Recibo %s anulado correctamente. Se reintegraron $%s al saldo de la toma.', v_pago.folio, v_monto_revertido)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.anular_pago_recibo(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_pago_recibo(UUID, TEXT) TO authenticated;

