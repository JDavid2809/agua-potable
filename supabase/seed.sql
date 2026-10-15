-- ==============================================================================
-- SCRIPT DE INICIALIZACIÓN (SEED) - PRIMERA ORGANIZACIÓN Y PRIMER ADMINISTRADOR
-- Ejecutar en el SQL Editor de tu proyecto de Supabase
-- ==============================================================================

-- 1. Crear la primera Organización del Comité
INSERT INTO public.organizaciones (
    id,
    nombre,
    slug,
    estado,
    municipio,
    localidad,
    telefono,
    activo,
    config
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Comité de Agua Potable Fluvib',
    'comite-fluvib',
    'Puebla',
    'Puebla',
    'San Gabriel Tetzoyocan',
    '2442358462',
    true,
    '{
        "cuota_base": 50.00,
        "recargo_mora": 0.00,
        "moneda": "MXN",
        "permitir_cobro_offline": true
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    updated_at = timezone('utc'::text, now());

-- 2. Crear Tarifa Inicial para el año en curso
INSERT INTO public.tarifas (
    organizacion_id,
    anio,
    cuota_mensual,
    recargo_mora,
    descripcion
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    EXTRACT(YEAR FROM CURRENT_DATE)::int,
    50.00,
    0.00,
    'Tarifa ordinaria anual de agua potable'
) ON CONFLICT (organizacion_id, anio) DO NOTHING;

-- ==============================================================================
-- INSTRUCCIONES PARA CREAR AL PRIMER ADMINISTRADOR:
-- ==============================================================================
-- OPCIÓN A (Recomendada desde el Dashboard de Supabase):
-- 1. Ve a Supabase Dashboard -> Authentication -> Users -> "Add User" -> "Create User"
-- 2. Email: admin@fluvib.com (o tu correo deseado)
-- 3. Password: La contraseña que elijas
-- 4. Auto Confirm User: Marcado (True)
-- 5. User Metadata: Agrega este JSON:
--    {
--      "nombre_completo": "Administrador General",
--      "rol": "administrador",
--      "organizacion_id": "a0000000-0000-0000-0000-000000000001",
--      "permisos": ["*"]
--    }
--
-- El trigger on_auth_user_created creará automáticamente el registro en public.perfiles.

-- ==============================================================================
-- OPCIÓN B (Creación directa vía SQL en Supabase):
-- (Descomenta y ejecuta si prefieres crearlo directo con SQL)
-- ==============================================================================
/*
DO $$
DECLARE
    new_admin_id UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
    admin_email TEXT := 'admin@fluvib.com';
    admin_password TEXT := 'Admin123456!'; -- ¡Cambia esta contraseña!
BEGIN
    -- Insertar en auth.users si no existe
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud
        ) VALUES (
            new_admin_id,
            '00000000-0000-0000-0000-000000000000',
            admin_email,
            crypt(admin_password, gen_salt('bf')),
            timezone('utc'::text, now()),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'nombre_completo', 'Administrador Principal',
                'rol', 'administrador',
                'organizacion_id', 'a0000000-0000-0000-0000-000000000001',
                'permisos', '["*"]'::jsonb
            ),
            timezone('utc'::text, now()),
            timezone('utc'::text, now()),
            'authenticated',
            'authenticated'
        );
    END IF;
END $$;
*/
