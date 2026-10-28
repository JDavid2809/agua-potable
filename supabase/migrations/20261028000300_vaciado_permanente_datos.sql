-- ==============================================================================
-- MIGRACIÓN: VACIADO PERMANENTE DE DATOS POR MÓDULO (HARD DELETE ADMINISTRATIVO)
-- Fecha: 2026-10-28
-- Descripción:
-- 1. Habilita políticas RLS FOR DELETE para administradores en pagos, pago_detalles y cargos_ciclo.
-- 2. Crea la función RPC transaccional public.vaciar_datos_organizacion(p_modulo TEXT)
--    exclusiva para administradores activos de la organización, respetando el orden
--    estricto de llaves foráneas (pago_detalles -> pagos -> cargos_ciclo -> tomas -> personas -> manzanas)
--    para evitar errores de integridad referencial o registros huérfanos.
-- ==============================================================================

-- 1. Asegurar políticas RLS de eliminación permanente (FOR DELETE) solo para administradores
DROP POLICY IF EXISTS "Eliminar pagos admin" ON public.pagos;
CREATE POLICY "Eliminar pagos admin" ON public.pagos
    FOR DELETE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.es_admin())
    );

DROP POLICY IF EXISTS "Eliminar detalles de pago admin" ON public.pago_detalles;
CREATE POLICY "Eliminar detalles de pago admin" ON public.pago_detalles
    FOR DELETE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.es_admin())
    );

DO $$
BEGIN
    IF to_regclass('public.cargos_ciclo') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "Eliminar cargos_ciclo admin" ON public.cargos_ciclo';
        EXECUTE '
            CREATE POLICY "Eliminar cargos_ciclo admin" ON public.cargos_ciclo
            FOR DELETE TO authenticated
            USING (
                organizacion_id = (SELECT public.get_auth_org_id())
                AND (SELECT public.es_admin())
            )
        ';
    END IF;
END $$;

-- 2. Función RPC atómica para vaciar datos respetando dependencias relacionales
CREATE OR REPLACE FUNCTION public.vaciar_datos_organizacion(
    p_modulo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_pagos_eliminados INT := 0;
    v_tomas_eliminadas INT := 0;
    v_personas_eliminadas INT := 0;
    v_manzanas_eliminadas INT := 0;
    v_cargos_eliminados INT := 0;
BEGIN
    -- 1. Validar sesión y rol de administrador
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
    END IF;

    IF NOT public.es_admin() THEN
        RAISE EXCEPTION 'Operación denegada: Solo un administrador activo puede vaciar datos permanentemente.';
    END IF;

    IF p_modulo IS NULL OR p_modulo NOT IN ('pagos', 'tomas', 'personas', 'manzanas', 'todo') THEN
        RAISE EXCEPTION 'Módulo inválido. Valores permitidos: pagos, tomas, personas, manzanas, todo.';
    END IF;

    -- 2. Ejecutar vaciado permanente según el módulo solicitado y sus dependencias
    IF p_modulo = 'pagos' THEN
        -- Borra desgloses, encabezados de recibo y bitácora de cortes, reiniciando saldos a $0.00
        DELETE FROM public.pago_detalles WHERE organizacion_id = v_org_id;

        WITH del_pagos AS (
            DELETE FROM public.pagos WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_pagos_eliminados FROM del_pagos;

        IF to_regclass('public.cargos_ciclo') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.cargos_ciclo WHERE organizacion_id = $1' USING v_org_id;
            GET DIAGNOSTICS v_cargos_eliminados = ROW_COUNT;
        END IF;

        UPDATE public.tomas
        SET saldo_pendiente = 0.00,
            updated_at = timezone('utc'::text, now())
        WHERE organizacion_id = v_org_id;

    ELSIF p_modulo = 'tomas' THEN
        -- Las tomas tienen restricción ON DELETE RESTRICT desde pago_detalles.
        -- Se limpian detalles, recibos y cortes vinculados antes de borrar las tomas.
        -- Los contribuyentes (personas) y barrios (manzanas) se conservan intactos.
        DELETE FROM public.pago_detalles WHERE organizacion_id = v_org_id;

        WITH del_pagos AS (
            DELETE FROM public.pagos WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_pagos_eliminados FROM del_pagos;

        IF to_regclass('public.cargos_ciclo') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.cargos_ciclo WHERE organizacion_id = $1' USING v_org_id;
            GET DIAGNOSTICS v_cargos_eliminados = ROW_COUNT;
        END IF;

        WITH del_tomas AS (
            DELETE FROM public.tomas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_tomas_eliminadas FROM del_tomas;

    ELSIF p_modulo = 'personas' THEN
        -- Los contribuyentes tienen restricción ON DELETE RESTRICT desde tomas y pagos.
        -- Se limpian pago_detalles -> pagos -> cargos_ciclo -> tomas -> personas.
        -- Los barrios y manzanas se conservan intactos.
        DELETE FROM public.pago_detalles WHERE organizacion_id = v_org_id;

        WITH del_pagos AS (
            DELETE FROM public.pagos WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_pagos_eliminados FROM del_pagos;

        IF to_regclass('public.cargos_ciclo') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.cargos_ciclo WHERE organizacion_id = $1' USING v_org_id;
            GET DIAGNOSTICS v_cargos_eliminados = ROW_COUNT;
        END IF;

        WITH del_tomas AS (
            DELETE FROM public.tomas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_tomas_eliminadas FROM del_tomas;

        WITH del_personas AS (
            DELETE FROM public.personas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_personas_eliminadas FROM del_personas;

    ELSIF p_modulo = 'manzanas' THEN
        -- tomas.manzana_id es NULLABLE (ON DELETE SET NULL).
        -- Primero desvinculamos todas las tomas existentes (manzana_id = NULL) y luego
        -- borramos los barrios/manzanas sin afectar a los contribuyentes ni a sus tomas.
        UPDATE public.tomas
        SET manzana_id = NULL,
            updated_at = timezone('utc'::text, now())
        WHERE organizacion_id = v_org_id
          AND manzana_id IS NOT NULL;

        WITH del_manzanas AS (
            DELETE FROM public.manzanas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_manzanas_eliminadas FROM del_manzanas;

    ELSIF p_modulo = 'todo' THEN
        DELETE FROM public.pago_detalles WHERE organizacion_id = v_org_id;

        WITH del_pagos AS (
            DELETE FROM public.pagos WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_pagos_eliminados FROM del_pagos;

        IF to_regclass('public.cargos_ciclo') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.cargos_ciclo WHERE organizacion_id = $1' USING v_org_id;
            GET DIAGNOSTICS v_cargos_eliminados = ROW_COUNT;
        END IF;

        WITH del_tomas AS (
            DELETE FROM public.tomas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_tomas_eliminadas FROM del_tomas;

        WITH del_personas AS (
            DELETE FROM public.personas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_personas_eliminadas FROM del_personas;

        WITH del_manzanas AS (
            DELETE FROM public.manzanas WHERE organizacion_id = v_org_id RETURNING id
        )
        SELECT count(*) INTO v_manzanas_eliminadas FROM del_manzanas;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'modulo', p_modulo,
        'personas_eliminadas', v_personas_eliminadas,
        'tomas_eliminadas', v_tomas_eliminadas,
        'manzanas_eliminadas', v_manzanas_eliminadas,
        'pagos_eliminados', v_pagos_eliminados,
        'cargos_eliminados', v_cargos_eliminados,
        'mensaje', 'Los datos seleccionados fueron eliminados de manera permanente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vaciar_datos_organizacion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vaciar_datos_organizacion(TEXT) TO authenticated;
