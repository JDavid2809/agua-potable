-- ==============================================================================
-- MIGRACIÓN: TARIFAS DIFERENCIADAS EN CORTE MENSUAL + BLINDAJE RLS/RPC COOPERACIONES
-- Fecha: 2026-11-25
-- Descripción:
-- 1. Actualiza public.aplicar_cargo_ciclo para respetar config->'cuotas_por_tipo'
--    en los cortes mensuales ordinarios según el tipo_toma de cada toma activa.
-- 2. Endurece políticas RLS de cooperaciones, cooperacion_padron y cooperacion_abonos
--    exigiendo los permisos granulares correspondientes.
-- 3. Endurece las RPCs SECURITY DEFINER de cooperaciones (crear_campana_cooperacion,
--    registrar_abono_cooperacion y acreditar_faena_cooperacion) usando get_auth_org_id()
--    y validación estricta de permisos granulares.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC ACTUALIZADA: public.aplicar_cargo_ciclo
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
    v_cuotas_por_tipo JSONB;
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

    -- Obtener tarifas diferenciadas configuradas en la organización (si existen)
    SELECT o.config->'cuotas_por_tipo'
    INTO v_cuotas_por_tipo
    FROM public.organizaciones o
    WHERE o.id = v_org_id;

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

        -- Aplicar cargo mensual respetando cuota diferenciada por tipo_toma (fallback a p_monto)
        WITH calculo_tomas AS (
            SELECT
                t.id,
                CASE
                    WHEN v_cuotas_por_tipo IS NOT NULL
                      AND NULLIF(trim(COALESCE(v_cuotas_por_tipo ->> t.tipo_toma::TEXT, '')), '') IS NOT NULL
                      AND (v_cuotas_por_tipo ->> t.tipo_toma::TEXT) ~ '^\d+(\.\d+)?$'
                      AND (v_cuotas_por_tipo ->> t.tipo_toma::TEXT)::NUMERIC >= 0
                    THEN (v_cuotas_por_tipo ->> t.tipo_toma::TEXT)::NUMERIC
                    ELSE p_monto
                END AS monto_toma
            FROM public.tomas t
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
        ),
        actualizadas AS (
            UPDATE public.tomas t
            SET saldo_pendiente = COALESCE(t.saldo_pendiente, 0.00) + ct.monto_toma,
                updated_at = timezone('utc'::text, now())
            FROM calculo_tomas ct
            WHERE t.id = ct.id
            RETURNING ct.monto_toma
        )
        SELECT count(*), COALESCE(SUM(monto_toma), 0.00)
        INTO v_tomas_afectadas, v_total_generado
        FROM actualizadas;
    ELSE
        -- Cargo extraordinario (cooperación de asamblea, obra, mantenimiento): monto uniforme
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

        v_total_generado := v_tomas_afectadas * p_monto;
    END IF;

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
-- 2. POLÍTICAS RLS ENDURECIDAS PARA COOPERACIONES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "cooperaciones_select_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_select_org" ON public.cooperaciones
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.ver')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cobros.crear')
            OR public.tiene_permiso('reportes.ver')
        )
    );

DROP POLICY IF EXISTS "cooperaciones_insert_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_insert_org" ON public.cooperaciones
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (public.es_admin() OR public.tiene_permiso('cooperaciones.gestionar'))
    );

DROP POLICY IF EXISTS "cooperaciones_update_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_update_org" ON public.cooperaciones
    FOR UPDATE
    TO authenticated
    USING (
        organizacion_id = public.get_auth_org_id()
        AND (public.es_admin() OR public.tiene_permiso('cooperaciones.gestionar'))
    )
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (public.es_admin() OR public.tiene_permiso('cooperaciones.gestionar'))
    );

DROP POLICY IF EXISTS "coop_padron_select_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_select_org" ON public.cooperacion_padron
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.ver')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cobros.crear')
            OR public.tiene_permiso('reportes.ver')
        )
    );

DROP POLICY IF EXISTS "coop_padron_insert_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_insert_org" ON public.cooperacion_padron
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cobros.crear')
        )
    );

DROP POLICY IF EXISTS "coop_padron_update_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_update_org" ON public.cooperacion_padron
    FOR UPDATE
    TO authenticated
    USING (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cobros.crear')
        )
    )
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cobros.crear')
        )
    );

DROP POLICY IF EXISTS "coop_abonos_select_org" ON public.cooperacion_abonos;
CREATE POLICY "coop_abonos_select_org" ON public.cooperacion_abonos
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.ver')
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cobros.crear')
            OR public.tiene_permiso('reportes.ver')
        )
    );

DROP POLICY IF EXISTS "coop_abonos_insert_org" ON public.cooperacion_abonos;
CREATE POLICY "coop_abonos_insert_org" ON public.cooperacion_abonos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organizacion_id = public.get_auth_org_id()
        AND (
            public.es_admin()
            OR public.tiene_permiso('cooperaciones.cobrar')
            OR public.tiene_permiso('cooperaciones.gestionar')
            OR public.tiene_permiso('cobros.crear')
        )
    );

-- ------------------------------------------------------------------------------
-- 3. RPCs DE COOPERACIONES BLINDADAS CON PERMISOS GRANULARES Y CUENTA ACTIVA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_campana_cooperacion(
    p_nombre TEXT,
    p_descripcion TEXT,
    p_meta_financiera NUMERIC,
    p_cuota_requerida NUMERIC,
    p_tipo_sujeto TEXT,
    p_fecha_inicio DATE,
    p_fecha_limite DATE,
    p_permite_abonos BOOLEAN DEFAULT true,
    p_permite_faena BOOLEAN DEFAULT true,
    p_valor_equivalente_faena NUMERIC DEFAULT 0.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_coop_id UUID;
    v_total_aportantes INT := 0;
    v_total_esperado NUMERIC(12, 2) := 0.00;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa para tu usuario.';
    END IF;

    IF NOT (public.es_admin() OR public.tiene_permiso('cooperaciones.gestionar')) THEN
        RAISE EXCEPTION 'Operación denegada: No tienes permiso para crear o administrar cooperaciones.';
    END IF;

    IF trim(COALESCE(p_nombre, '')) = '' THEN
        RAISE EXCEPTION 'El nombre de la cooperación es obligatorio.';
    END IF;

    IF p_cuota_requerida IS NULL OR p_cuota_requerida <= 0 THEN
        RAISE EXCEPTION 'La cuota requerida por aportante debe ser mayor a cero.';
    END IF;

    IF p_tipo_sujeto NOT IN ('toma', 'persona') THEN
        RAISE EXCEPTION 'Tipo de asignación inválido. Debe ser "toma" o "persona".';
    END IF;

    IF p_fecha_limite < p_fecha_inicio THEN
        RAISE EXCEPTION 'La fecha límite no puede ser anterior a la fecha de inicio.';
    END IF;

    INSERT INTO public.cooperaciones (
        organizacion_id,
        nombre,
        descripcion,
        meta_financiera,
        cuota_requerida,
        tipo_sujeto,
        fecha_inicio,
        fecha_limite,
        permite_abonos,
        permite_faena,
        valor_equivalente_faena,
        estado,
        creado_por
    ) VALUES (
        v_org_id,
        trim(p_nombre),
        trim(COALESCE(p_descripcion, '')),
        COALESCE(p_meta_financiera, 0.00),
        p_cuota_requerida,
        p_tipo_sujeto,
        p_fecha_inicio,
        p_fecha_limite,
        COALESCE(p_permite_abonos, true),
        COALESCE(p_permite_faena, true),
        COALESCE(p_valor_equivalente_faena, p_cuota_requerida),
        'activa',
        v_user_id
    )
    RETURNING id INTO v_coop_id;

    IF p_tipo_sujeto = 'toma' THEN
        INSERT INTO public.cooperacion_padron (
            organizacion_id,
            cooperacion_id,
            persona_id,
            toma_id,
            monto_requerido,
            monto_pagado,
            monto_pendiente,
            cumplio_con_faena,
            estado
        )
        SELECT
            v_org_id,
            v_coop_id,
            t.persona_id,
            t.id,
            p_cuota_requerida,
            0.00,
            p_cuota_requerida,
            false,
            'pendiente'
        FROM public.tomas t
        WHERE t.organizacion_id = v_org_id
          AND t.deleted_at IS NULL
          AND t.estado = 'activa';

        GET DIAGNOSTICS v_total_aportantes = ROW_COUNT;
    ELSE
        INSERT INTO public.cooperacion_padron (
            organizacion_id,
            cooperacion_id,
            persona_id,
            toma_id,
            monto_requerido,
            monto_pagado,
            monto_pendiente,
            cumplio_con_faena,
            estado
        )
        SELECT
            v_org_id,
            v_coop_id,
            p.id,
            (
                SELECT t.id FROM public.tomas t
                WHERE t.persona_id = p.id
                  AND t.organizacion_id = v_org_id
                  AND t.deleted_at IS NULL
                ORDER BY t.codigo_toma ASC
                LIMIT 1
            ),
            p_cuota_requerida,
            0.00,
            p_cuota_requerida,
            false,
            'pendiente'
        FROM public.personas p
        WHERE p.organizacion_id = v_org_id
          AND p.deleted_at IS NULL;

        GET DIAGNOSTICS v_total_aportantes = ROW_COUNT;
    END IF;

    v_total_esperado := v_total_aportantes * p_cuota_requerida;

    RETURN jsonb_build_object(
        'cooperacion_id', v_coop_id,
        'nombre', trim(p_nombre),
        'tipo_sujeto', p_tipo_sujeto,
        'aportantes_asignados', v_total_aportantes,
        'cuota_unitaria', p_cuota_requerida,
        'total_recaudacion_esperada', v_total_esperado,
        'meta_financiera', p_meta_financiera
    );
END;
$$;

REVOKE ALL ON FUNCTION public.crear_campana_cooperacion(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE, DATE, BOOLEAN, BOOLEAN, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_campana_cooperacion(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE, DATE, BOOLEAN, BOOLEAN, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_abono_cooperacion(
    p_padron_id UUID,
    p_monto_abono NUMERIC,
    p_metodo_pago TEXT DEFAULT 'efectivo',
    p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_padron RECORD;
    v_nuevo_saldo NUMERIC(10, 2);
    v_nuevo_pagado NUMERIC(10, 2);
    v_nuevo_estado TEXT;
    v_abono_id UUID;
    v_folio TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
    END IF;

    IF NOT (
        public.es_admin()
        OR public.tiene_permiso('cooperaciones.cobrar')
        OR public.tiene_permiso('cooperaciones.gestionar')
        OR public.tiene_permiso('cobros.crear')
    ) THEN
        RAISE EXCEPTION 'Operación denegada: No tienes permiso para cobrar aportaciones de cooperaciones.';
    END IF;

    IF p_monto_abono IS NULL OR p_monto_abono <= 0 THEN
        RAISE EXCEPTION 'El monto a abonar debe ser mayor a cero.';
    END IF;

    SELECT cp.*, c.permite_abonos, c.estado AS estado_coop
    INTO v_padron
    FROM public.cooperacion_padron cp
    JOIN public.cooperaciones c ON c.id = cp.cooperacion_id
    WHERE cp.id = p_padron_id
      AND cp.organizacion_id = v_org_id
    FOR UPDATE OF cp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el registro del aportante en tu organización.';
    END IF;

    IF v_padron.estado = 'liquidado' THEN
        RAISE EXCEPTION 'Esta aportación ya se encuentra completamente liquidada.';
    END IF;

    IF v_padron.estado = 'exento_faena' THEN
        RAISE EXCEPTION 'Este aportante ya fue exentado mediante faena comunitaria.';
    END IF;

    IF p_monto_abono > v_padron.monto_pendiente THEN
        RAISE EXCEPTION 'El monto ingresado ($%) excede el saldo pendiente ($%).', p_monto_abono, v_padron.monto_pendiente;
    END IF;

    IF NOT v_padron.permite_abonos AND p_monto_abono < v_padron.monto_pendiente THEN
        RAISE EXCEPTION 'Esta campaña no admite pagos parciales en abonos; debe liquidarse en una sola exhibición.';
    END IF;

    v_nuevo_saldo := v_padron.monto_pendiente - p_monto_abono;
    v_nuevo_pagado := v_padron.monto_pagado + p_monto_abono;
    v_nuevo_estado := CASE WHEN v_nuevo_saldo <= 0 THEN 'liquidado' ELSE 'parcial' END;

    v_folio := 'COOP-' || to_char(timezone('utc'::text, now()), 'YYMM') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

    INSERT INTO public.cooperacion_abonos (
        organizacion_id,
        padron_id,
        folio_recibo,
        monto_abono,
        saldo_anterior,
        saldo_restante,
        metodo_pago,
        cajero_id,
        notas,
        fecha_pago
    ) VALUES (
        v_org_id,
        p_padron_id,
        v_folio,
        p_monto_abono,
        v_padron.monto_pendiente,
        v_nuevo_saldo,
        COALESCE(p_metodo_pago, 'efectivo'),
        v_user_id,
        trim(COALESCE(p_notas, '')),
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_abono_id;

    UPDATE public.cooperacion_padron
    SET monto_pagado = v_nuevo_pagado,
        monto_pendiente = v_nuevo_saldo,
        estado = v_nuevo_estado,
        fecha_liquidacion = CASE WHEN v_nuevo_saldo <= 0 THEN timezone('utc'::text, now()) ELSE NULL END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_padron_id;

    RETURN jsonb_build_object(
        'abono_id', v_abono_id,
        'folio_recibo', v_folio,
        'monto_abono', p_monto_abono,
        'saldo_anterior', v_padron.monto_pendiente,
        'saldo_restante', v_nuevo_saldo,
        'nuevo_estado', v_nuevo_estado
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_abono_cooperacion(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_abono_cooperacion(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.acreditar_faena_cooperacion(
    p_padron_id UUID,
    p_fecha_faena DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_padron RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
    END IF;

    IF NOT (
        public.es_admin()
        OR public.tiene_permiso('cooperaciones.gestionar')
        OR public.tiene_permiso('cooperaciones.cobrar')
    ) THEN
        RAISE EXCEPTION 'Operación denegada: No tienes permiso para acreditar faenas comunitarias.';
    END IF;

    SELECT cp.*, c.permite_faena
    INTO v_padron
    FROM public.cooperacion_padron cp
    JOIN public.cooperaciones c ON c.id = cp.cooperacion_id
    WHERE cp.id = p_padron_id
      AND cp.organizacion_id = v_org_id
    FOR UPDATE OF cp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Aportante no encontrado en tu organización.';
    END IF;

    IF NOT v_padron.permite_faena THEN
        RAISE EXCEPTION 'Esta campaña no permite acreditación por faena comunitaria.';
    END IF;

    UPDATE public.cooperacion_padron
    SET cumplio_con_faena = true,
        fecha_faena = COALESCE(p_fecha_faena, CURRENT_DATE),
        monto_pendiente = 0.00,
        estado = 'exento_faena',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_padron_id;

    RETURN jsonb_build_object(
        'padron_id', p_padron_id,
        'cumplio_con_faena', true,
        'fecha_faena', COALESCE(p_fecha_faena, CURRENT_DATE),
        'estado', 'exento_faena'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.acreditar_faena_cooperacion(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acreditar_faena_cooperacion(UUID, DATE) TO authenticated;
