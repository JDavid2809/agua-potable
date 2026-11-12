-- ==============================================================================
-- MIGRACIÓN: PRESENCIA DE USUARIOS Y AUDITORÍA DE RECIBOS POR CAJERO
-- Fecha: 2026-11-12
-- Descripción:
-- 1. Agrega columna 'ultima_conexion' a public.perfiles.
-- 2. Crea función RPC 'registrar_actividad_usuario' para registrar latido de conexión.
-- 3. Agrega índices para optimizar la consulta de recibos y cobros por cajero_id.
-- ==============================================================================

-- 1. Columna de última conexión en perfiles
ALTER TABLE public.perfiles
    ADD COLUMN IF NOT EXISTS ultima_conexion TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_perfiles_org_conexion
    ON public.perfiles(organizacion_id, ultima_conexion DESC);

-- 2. Índices de rendimiento para auditoría de cobros por cajero
CREATE INDEX IF NOT EXISTS idx_pagos_cajero_fecha
    ON public.pagos(cajero_id, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_cooperacion_abonos_cajero
    ON public.cooperacion_abonos(cajero_id, created_at DESC);

-- 3. Función RPC segura para registrar actividad/latido de sesión
CREATE OR REPLACE FUNCTION public.registrar_actividad_usuario()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID;
    v_ahora TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.perfiles
    SET ultima_conexion = v_ahora,
        updated_at = v_ahora
    WHERE id = v_uid;

    RETURN v_ahora;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_actividad_usuario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_actividad_usuario() TO authenticated;


