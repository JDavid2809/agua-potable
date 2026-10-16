-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD CRÍTICA (C2 y C6): BLINDAJE DE CREACIÓN DE USUARIOS
-- 1. Agrega columna 'email' en perfiles para evitar listUsers globales (C6).
-- 2. Modifica handle_new_user() para confiar únicamente en raw_app_meta_data
--    (solo modificable por el Service Role en el backend) y bloquea registros
--    públicos arbitrarios no autorizados (C2).
-- ==============================================================================

-- 1. Agregar columna email en perfiles si no existe
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Poblar emails de los usuarios existentes desde auth.users
UPDATE public.perfiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 3. Crear índice para búsquedas por email dentro de perfiles
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON public.perfiles(email);

-- 4. Reemplazar handle_new_user con validación estricta de app_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_rol rol_usuario;
    v_nombre TEXT;
    v_permisos JSONB;
    v_telefono TEXT;
    v_total_usuarios INT;
BEGIN
    -- Contar usuarios actuales para permitir bootstrapping de la primera cuenta administradora
    SELECT count(*) INTO v_total_usuarios FROM public.perfiles;

    -- Extraer organizacion_id EXCLUSIVAMENTE de raw_app_meta_data (segura, solo escrita por service_role)
    IF (NEW.raw_app_meta_data->>'organizacion_id') IS NOT NULL THEN
        v_org_id := (NEW.raw_app_meta_data->>'organizacion_id')::UUID;
    ELSIF v_total_usuarios = 0 THEN
        -- Si es el primer usuario histórico del sistema, permitir asociarlo a la primera organización
        SELECT id INTO v_org_id FROM public.organizaciones ORDER BY created_at ASC LIMIT 1;
        
        IF v_org_id IS NULL THEN
            INSERT INTO public.organizaciones (nombre, slug, estado, municipio, localidad)
            VALUES ('Comité Central de Agua Potable', 'comite-central', 'Puebla', 'Puebla', 'San Gabriel Tetzoyocan')
            RETURNING id INTO v_org_id;
        END IF;
    ELSE
        -- Si NO viene en app_metadata y ya hay usuarios, RECHAZAR el registro público
        RAISE EXCEPTION 'Registro público no permitido. Las cuentas deben ser creadas por un administrador autorizado del comité.';
    END IF;

    -- Validar que la organización exista y esté activa
    IF NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id = v_org_id AND activo = true) THEN
        RAISE EXCEPTION 'La organización especificada no existe o se encuentra inactiva.';
    END IF;

    -- Obtener rol de app_metadata (o administrador si es el primer usuario)
    IF v_total_usuarios = 0 THEN
        v_rol := 'administrador';
    ELSE
        v_rol := COALESCE((NEW.raw_app_meta_data->>'rol')::rol_usuario, 'cajero');
    END IF;

    -- Obtener permisos de app_metadata
    IF (NEW.raw_app_meta_data->'permisos') IS NOT NULL THEN
        v_permisos := NEW.raw_app_meta_data->'permisos';
    ELSIF v_rol = 'administrador' THEN
        v_permisos := '["*"]'::jsonb;
    ELSIF v_rol = 'cajero' THEN
        v_permisos := '["cobros.crear", "tomas.ver", "tomas.gestionar", "personas.ver", "personas.gestionar"]'::jsonb;
    ELSE
        v_permisos := '["tomas.ver", "personas.ver"]'::jsonb;
    END IF;

    -- Datos de contacto desde user_metadata
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email);
    v_telefono := NEW.raw_user_meta_data->>'telefono';

    -- Insertar en perfiles vinculando el email real
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Re-asociar el trigger a auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
