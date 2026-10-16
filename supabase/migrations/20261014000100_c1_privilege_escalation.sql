-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD CRÍTICA (C1): PREVENCIÓN DE ESCALAMIENTO DE PRIVILEGIOS
-- Impide que usuarios no administradores modifiquen su propio rol, permisos,
-- estado activo o se cambien de organización.
-- ==============================================================================

-- 1. Función de validación estricta antes de actualizar cualquier perfil
CREATE OR REPLACE FUNCTION public.validar_modificacion_perfil()
RETURNS TRIGGER AS $$
DECLARE
    v_es_admin BOOLEAN;
    v_auth_org_id UUID;
BEGIN
    -- Permitir cualquier cambio si se ejecuta desde el backend mediante el service_role (Admin API)
    IF (current_setting('role', true) = 'service_role') THEN
        RETURN NEW;
    END IF;

    -- Obtener si el usuario en sesión es administrador activo
    v_es_admin := public.es_admin();
    v_auth_org_id := public.get_auth_org_id();

    -- CASO 1: Si el usuario NO es administrador
    IF NOT v_es_admin THEN
        -- No puede cambiar su propio rol (ej: de cajero a administrador)
        IF NEW.rol IS DISTINCT FROM OLD.rol THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar tu rol de usuario.';
        END IF;

        -- No puede concederse o alterar permisos
        IF NEW.permisos IS DISTINCT FROM OLD.permisos THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar permisos de acceso.';
        END IF;

        -- No puede transferirse a otra organización/comité
        IF NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para cambiar de organización.';
        END IF;

        -- No puede reactivarse a sí mismo si fue suspendido o desactivado
        IF NEW.activo IS DISTINCT FROM OLD.activo THEN
            RAISE EXCEPTION 'Operación denegada: No tienes privilegios para modificar el estado activo de la cuenta.';
        END IF;

    -- CASO 2: Si el usuario ES administrador
    ELSE
        -- Un administrador no puede reasignar un perfil a una organización diferente a la suya
        IF NEW.organizacion_id IS DISTINCT FROM v_auth_org_id THEN
            RAISE EXCEPTION 'Operación denegada: No puedes mover perfiles a otra organización.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 2. Vincular el trigger a la tabla perfiles
DROP TRIGGER IF EXISTS tr_validar_modificacion_perfil ON public.perfiles;

CREATE TRIGGER tr_validar_modificacion_perfil
BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.validar_modificacion_perfil();

-- 3. Blindar también la función helper get_auth_org_id() para considerar solo usuarios activos
-- y fijar su search_path
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
    SELECT organizacion_id 
    FROM public.perfiles 
    WHERE id = auth.uid() AND activo = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

-- 4. Blindar es_admin() fijando search_path
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'administrador' AND activo = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;
