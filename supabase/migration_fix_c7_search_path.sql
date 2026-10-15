-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD C7: Search Path Inmutable y Protección de Funciones
-- Descripción:
-- 1. Fija 'SET search_path = public, auth, pg_temp' en todas las funciones SECURITY DEFINER
--    para erradicar la vulnerabilidad de schema hijacking (secuestro de esquema) señalada
--    por el Supabase Security Advisor.
-- 2. Asegura 'SET search_path = public, pg_temp' en la función de actualización de timestamp.
-- 3. Agrega triggers faltantes de 'updated_at' en las tablas 'tarifas' y 'pago_detalles' (L5).
-- ==============================================================================

-- 1. Función para actualizar timestamps automáticamente (Triggers)
CREATE OR REPLACE FUNCTION public.actualizar_timestamp_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Asegurar triggers en todas las tablas con columna updated_at
DROP TRIGGER IF EXISTS tr_organizaciones_updated_at ON public.organizaciones;
CREATE TRIGGER tr_organizaciones_updated_at BEFORE UPDATE ON public.organizaciones
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_perfiles_updated_at ON public.perfiles;
CREATE TRIGGER tr_perfiles_updated_at BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_personas_updated_at ON public.personas;
CREATE TRIGGER tr_personas_updated_at BEFORE UPDATE ON public.personas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_tomas_updated_at ON public.tomas;
CREATE TRIGGER tr_tomas_updated_at BEFORE UPDATE ON public.tomas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_manzanas_updated_at ON public.manzanas;
CREATE TRIGGER tr_manzanas_updated_at BEFORE UPDATE ON public.manzanas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_tarifas_updated_at ON public.tarifas;
CREATE TRIGGER tr_tarifas_updated_at BEFORE UPDATE ON public.tarifas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_pagos_updated_at ON public.pagos;
CREATE TRIGGER tr_pagos_updated_at BEFORE UPDATE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_pago_detalles_updated_at ON public.pago_detalles;
CREATE TRIGGER tr_pago_detalles_updated_at BEFORE UPDATE ON public.pago_detalles
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_updated_at();


-- 2. Trigger para nuevos usuarios con app_metadata y validación
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_rol rol_usuario;
    v_nombre TEXT;
    v_permisos JSONB;
    v_telefono TEXT;
    v_total_usuarios INT;
BEGIN
    SELECT count(*) INTO v_total_usuarios FROM public.perfiles;

    IF (NEW.raw_app_meta_data->>'organizacion_id') IS NOT NULL THEN
        v_org_id := (NEW.raw_app_meta_data->>'organizacion_id')::UUID;
    ELSIF v_total_usuarios = 0 THEN
        -- Bootstrapping: Si es el primer usuario absoluto de la base de datos, asignarlo a la primera org
        SELECT id INTO v_org_id FROM public.organizaciones ORDER BY created_at ASC LIMIT 1;
        
        IF v_org_id IS NULL THEN
            INSERT INTO public.organizaciones (nombre, slug, estado, municipio, localidad)
            VALUES ('Comité Central de Agua Potable', 'comite-central', 'Puebla', 'Puebla', 'San Gabriel Tetzoyocan')
            RETURNING id INTO v_org_id;
        END IF;
    ELSE
        RAISE EXCEPTION 'Registro público no permitido. Las cuentas deben ser creadas por un administrador autorizado del comité.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id = v_org_id AND activo = true) THEN
        RAISE EXCEPTION 'La organización especificada no existe o se encuentra inactiva.';
    END IF;

    IF v_total_usuarios = 0 THEN
        v_rol := 'administrador';
    ELSE
        v_rol := COALESCE((NEW.raw_app_meta_data->>'rol')::rol_usuario, 'cajero');
    END IF;

    IF (NEW.raw_app_meta_data->'permisos') IS NOT NULL THEN
        v_permisos := NEW.raw_app_meta_data->'permisos';
    ELSIF v_rol = 'administrador' THEN
        v_permisos := '["*"]'::jsonb;
    ELSIF v_rol = 'cajero' THEN
        v_permisos := '["cobros.crear", "tomas.ver", "tomas.gestionar", "personas.ver", "personas.gestionar"]'::jsonb;
    ELSE
        v_permisos := '["tomas.ver", "personas.ver"]'::jsonb;
    END IF;

    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email);
    v_telefono := NEW.raw_user_meta_data->>'telefono';

    INSERT INTO public.perfiles (id, organizacion_id, email, nombre_completo, rol, permisos, telefono, activo)
    VALUES (NEW.id, v_org_id, NEW.email, v_nombre, v_rol, v_permisos, v_telefono, true)
    ON CONFLICT (id) DO UPDATE
    SET
        organizacion_id = EXCLUDED.organizacion_id,
        email = EXCLUDED.email,
        nombre_completo = EXCLUDED.nombre_completo,
        rol = EXCLUDED.rol,
        permisos = EXCLUDED.permisos,
        telefono = COALESCE(EXCLUDED.telefono, perfiles.telefono),
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$;


-- 3. Funciones Helper de Seguridad RLS
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
    SELECT organizacion_id 
    FROM public.perfiles 
    WHERE id = auth.uid() AND activo = true;
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'administrador' AND activo = true
    );
$$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso TEXT)
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid()
          AND activo = true
          AND (
              rol = 'administrador'
              OR permisos ? '*'
              OR permisos ? p_permiso
          )
    );
$$;


-- 4. Trigger Anti-Escalamiento de Privilegios
CREATE OR REPLACE FUNCTION public.validar_modificacion_perfil()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_es_admin BOOLEAN;
    v_auth_org_id UUID;
BEGIN
    IF (current_setting('role', true) = 'service_role') THEN
        RETURN NEW;
    END IF;

    v_es_admin := public.es_admin();
    v_auth_org_id := public.get_auth_org_id();

    IF NOT v_es_admin THEN
        IF NEW.rol IS DISTINCT FROM OLD.rol THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar tu rol de usuario.';
        END IF;

        IF NEW.permisos IS DISTINCT FROM OLD.permisos THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar permisos de acceso.';
        END IF;

        IF NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para cambiar de organización.';
        END IF;

        IF NEW.activo IS DISTINCT FROM OLD.activo THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar el estado activo de la cuenta.';
        END IF;
    ELSE
        IF NEW.organizacion_id IS DISTINCT FROM v_auth_org_id THEN
            RAISE EXCEPTION 'Operación denegada: No puedes mover perfiles a otra organización.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
