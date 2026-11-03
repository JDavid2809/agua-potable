-- ==============================================================================
-- MIGRACIÓN: MÓDULO DE COOPERACIONES Y OBRAS COMUNITARIAS
-- Fecha: 2026-11-03
-- Descripción:
-- 1. Tabla public.cooperaciones para el registro de campañas extraordinarias
--    aprobadas por asamblea (cuota por toma o por persona, metas, prórrogas).
-- 2. Tabla public.cooperacion_padron para el padrón individual de aportantes
--    por obra con control de abonos, saldos y exención por faena comunitaria.
-- 3. Tabla public.cooperacion_abonos para el historial auditable de recibos
--    foliados y pagos parciales/totales en ventanilla.
-- 4. Índices de rendimiento, políticas de seguridad RLS multinquilino por
--    organizacion_id y triggers de actualización automática.
-- 5. RPC public.crear_campana_cooperacion: crea la campaña y genera atómicamente
--    el padrón contribuyente según modalidad (por cada toma activa o por persona).
-- 6. RPC public.registrar_abono_cooperacion: cobro seguro y folio de recibo.
-- 7. RPC public.acreditar_faena_cooperacion: exención por trabajo comunitario.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA public.cooperaciones
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cooperaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    meta_financiera NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (meta_financiera >= 0),
    cuota_requerida NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (cuota_requerida >= 0),
    tipo_sujeto TEXT NOT NULL DEFAULT 'toma' CHECK (tipo_sujeto IN ('toma', 'persona')),
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_limite DATE NOT NULL,
    fecha_prorroga DATE,
    motivo_prorroga TEXT,
    permite_abonos BOOLEAN NOT NULL DEFAULT true,
    permite_faena BOOLEAN NOT NULL DEFAULT true,
    valor_equivalente_faena NUMERIC(10, 2) DEFAULT 0.00,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('borrador', 'activa', 'prorrogada', 'concluida', 'cancelada')),
    creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cooperaciones_org_estado
    ON public.cooperaciones(organizacion_id, estado)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cooperaciones_fechas
    ON public.cooperaciones(organizacion_id, fecha_limite, fecha_prorroga);

-- ------------------------------------------------------------------------------
-- 2. TABLA public.cooperacion_padron
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cooperacion_padron (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    cooperacion_id UUID NOT NULL REFERENCES public.cooperaciones(id) ON DELETE CASCADE,
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
    toma_id UUID REFERENCES public.tomas(id) ON DELETE SET NULL,
    monto_requerido NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (monto_requerido >= 0),
    monto_pagado NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0),
    monto_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (monto_pendiente >= 0),
    cumplio_con_faena BOOLEAN NOT NULL DEFAULT false,
    fecha_faena DATE,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'parcial', 'liquidado', 'exento_faena')),
    fecha_liquidacion TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_padron_unico_toma
    ON public.cooperacion_padron(cooperacion_id, toma_id)
    WHERE toma_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_padron_unico_persona
    ON public.cooperacion_padron(cooperacion_id, persona_id)
    WHERE toma_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_coop_padron_org_coop_estado
    ON public.cooperacion_padron(organizacion_id, cooperacion_id, estado);

CREATE INDEX IF NOT EXISTS idx_coop_padron_persona
    ON public.cooperacion_padron(persona_id);

CREATE INDEX IF NOT EXISTS idx_coop_padron_toma
    ON public.cooperacion_padron(toma_id);

-- ------------------------------------------------------------------------------
-- 3. TABLA public.cooperacion_abonos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cooperacion_abonos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    padron_id UUID NOT NULL REFERENCES public.cooperacion_padron(id) ON DELETE CASCADE,
    folio_recibo TEXT NOT NULL,
    monto_abono NUMERIC(10, 2) NOT NULL CHECK (monto_abono > 0),
    saldo_anterior NUMERIC(10, 2) NOT NULL,
    saldo_restante NUMERIC(10, 2) NOT NULL,
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
    cajero_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    notas TEXT,
    fecha_pago TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_coop_abonos_padron
    ON public.cooperacion_abonos(padron_id, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_coop_abonos_folio
    ON public.cooperacion_abonos(organizacion_id, folio_recibo);

-- ------------------------------------------------------------------------------
-- 4. SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.cooperaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperacion_padron ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperacion_abonos ENABLE ROW LEVEL SECURITY;

-- Políticas para cooperaciones
DROP POLICY IF EXISTS "cooperaciones_select_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_select_org" ON public.cooperaciones
    FOR SELECT USING (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "cooperaciones_insert_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_insert_org" ON public.cooperaciones
    FOR INSERT WITH CHECK (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "cooperaciones_update_org" ON public.cooperaciones;
CREATE POLICY "cooperaciones_update_org" ON public.cooperaciones
    FOR UPDATE USING (organizacion_id = public.get_auth_org_id());

-- Políticas para padrón
DROP POLICY IF EXISTS "coop_padron_select_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_select_org" ON public.cooperacion_padron
    FOR SELECT USING (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "coop_padron_insert_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_insert_org" ON public.cooperacion_padron
    FOR INSERT WITH CHECK (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "coop_padron_update_org" ON public.cooperacion_padron;
CREATE POLICY "coop_padron_update_org" ON public.cooperacion_padron
    FOR UPDATE USING (organizacion_id = public.get_auth_org_id());

-- Políticas para abonos
DROP POLICY IF EXISTS "coop_abonos_select_org" ON public.cooperacion_abonos;
CREATE POLICY "coop_abonos_select_org" ON public.cooperacion_abonos
    FOR SELECT USING (organizacion_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "coop_abonos_insert_org" ON public.cooperacion_abonos;
CREATE POLICY "coop_abonos_insert_org" ON public.cooperacion_abonos
    FOR INSERT WITH CHECK (organizacion_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- 5. RPC TRANSACCIONAL: public.crear_campana_cooperacion
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

    -- Obtener organizacion_id del perfil del usuario autenticado
    SELECT p.organizacion_id INTO v_org_id
    FROM public.perfiles p
    WHERE p.id = v_user_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa para tu usuario.';
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

    -- 1. Insertar la campaña
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

    -- 2. Poblar el padrón contribuyente según modalidad
    IF p_tipo_sujeto = 'toma' THEN
        -- ASIGNACIÓN POR CADA TOMA FÍSICA:
        -- Una entrada por cada toma activa del padrón. Si un titular tiene 2 o más tomas,
        -- cada toma tiene su cuota individual en el padrón.
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
        -- ASIGNACIÓN POR TITULAR / PERSONA:
        -- Una entrada por cada titular activo en censo comunitario,
        -- independientemente de cuántas tomas tenga registradas.
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

-- ------------------------------------------------------------------------------
-- 6. RPC TRANSACCIONAL: public.registrar_abono_cooperacion
-- ------------------------------------------------------------------------------
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

    SELECT p.organizacion_id INTO v_org_id
    FROM public.perfiles p
    WHERE p.id = v_user_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
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

-- ------------------------------------------------------------------------------
-- 7. RPC TRANSACCIONAL: public.acreditar_faena_cooperacion
-- ------------------------------------------------------------------------------
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

    SELECT p.organizacion_id INTO v_org_id
    FROM public.perfiles p
    WHERE p.id = v_user_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
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
