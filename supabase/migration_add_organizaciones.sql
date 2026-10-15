-- ==============================================================================
-- SCRIPT DE MIGRACIÓN SEGURO (IDEMPOTENTE)
-- Puedes ejecutar este script sin importar qué hayas corrido antes.
-- No borrará datos existentes y agregará organizaciones, columnas y permisos.
-- ==============================================================================

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tipos enumerados seguros
DO $$ BEGIN
    CREATE TYPE rol_usuario AS ENUM ('administrador', 'cajero', 'lector');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE estado_toma AS ENUM ('activa', 'suspendida', 'cortada', 'inactiva');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE tipo_toma AS ENUM ('domestica', 'comercial', 'comunal', 'lote_baldio');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'otro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Crear tabla de Organizaciones si no existe
CREATE TABLE IF NOT EXISTS public.organizaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    slug TEXT UNIQUE,
    estado TEXT NOT NULL DEFAULT 'Puebla',
    municipio TEXT NOT NULL DEFAULT 'Puebla',
    localidad TEXT NOT NULL DEFAULT 'San Gabriel Tetzoyocan',
    telefono TEXT,
    rfc_registro TEXT,
    logo_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{
        "cuota_base": 50.00,
        "recargo_mora": 0.00,
        "moneda": "MXN",
        "permitir_cobro_offline": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Crear Organización inicial por defecto para vincular registros existentes
INSERT INTO public.organizaciones (
    id, nombre, slug, estado, municipio, localidad, telefono, activo
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Comité de Agua Potable Fluvib',
    'comite-fluvib',
    'Puebla',
    'Puebla',
    'San Gabriel Tetzoyocan',
    '2442358462',
    true
) ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    estado = EXCLUDED.estado,
    municipio = EXCLUDED.municipio,
    localidad = EXCLUDED.localidad,
    telefono = EXCLUDED.telefono;

-- 5. Asegurar columnas nuevas en perfiles
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'cajero',
    telefono TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.perfiles 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Si había perfiles sin organización, asociarlos a la organización por defecto
UPDATE public.perfiles 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

ALTER TABLE public.perfiles ALTER COLUMN organizacion_id SET NOT NULL;

-- 6. Asegurar columnas en manzanas
CREATE TABLE IF NOT EXISTS public.manzanas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barrio TEXT NOT NULL DEFAULT 'Centro',
    seccion TEXT NOT NULL DEFAULT '1',
    numero_manzana TEXT NOT NULL,
    cuadra TEXT,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.manzanas 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.manzanas 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

-- 7. Asegurar columnas en personas
CREATE TABLE IF NOT EXISTS public.personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_completo TEXT NOT NULL,
    documento_identidad TEXT,
    telefono TEXT,
    direccion TEXT,
    notas TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.personas 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.personas 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

-- 8. Asegurar columnas en tomas
CREATE TABLE IF NOT EXISTS public.tomas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_toma TEXT NOT NULL,
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    manzana_id UUID REFERENCES public.manzanas(id) ON DELETE SET NULL,
    direccion_referencia TEXT NOT NULL,
    tipo_toma tipo_toma NOT NULL DEFAULT 'domestica',
    estado estado_toma NOT NULL DEFAULT 'activa',
    numero_medidor TEXT,
    saldo_pendiente NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.tomas 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.tomas 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

-- 9. Asegurar columnas en tarifas
CREATE TABLE IF NOT EXISTS public.tarifas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anio INT NOT NULL,
    cuota_mensual NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    recargo_mora NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.tarifas 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.tarifas 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

-- Tarifa del año actual
INSERT INTO public.tarifas (organizacion_id, anio, cuota_mensual, recargo_mora, descripcion)
VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, EXTRACT(YEAR FROM CURRENT_DATE)::int, 50.00, 0.00, 'Tarifa ordinaria anual')
ON CONFLICT DO NOTHING;

-- 10. Asegurar columnas en pagos y detalles
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio TEXT NOT NULL,
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    cajero_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    total NUMERIC(10,2) NOT NULL,
    metodo_pago metodo_pago NOT NULL DEFAULT 'efectivo',
    fecha_pago TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notas TEXT,
    dispositivo_offline_id TEXT,
    sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.pagos 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.pagos 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

CREATE TABLE IF NOT EXISTS public.pago_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
    toma_id UUID NOT NULL REFERENCES public.tomas(id) ON DELETE RESTRICT,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto NUMERIC(10,2) NOT NULL,
    recargo NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.pago_detalles 
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES public.organizaciones(id) ON DELETE CASCADE;

UPDATE public.pago_detalles 
SET organizacion_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
WHERE organizacion_id IS NULL;

-- 11. Triggers y Funciones de sincronización
CREATE OR REPLACE FUNCTION actualizar_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_organizaciones_updated_at ON public.organizaciones;
CREATE TRIGGER tr_organizaciones_updated_at BEFORE UPDATE ON public.organizaciones
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_perfiles_updated_at ON public.perfiles;
CREATE TRIGGER tr_perfiles_updated_at BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_personas_updated_at ON public.personas;
CREATE TRIGGER tr_personas_updated_at BEFORE UPDATE ON public.personas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_tomas_updated_at ON public.tomas;
CREATE TRIGGER tr_tomas_updated_at BEFORE UPDATE ON public.tomas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_manzanas_updated_at ON public.manzanas;
CREATE TRIGGER tr_manzanas_updated_at BEFORE UPDATE ON public.manzanas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS tr_pagos_updated_at ON public.pagos;
CREATE TRIGGER tr_pagos_updated_at BEFORE UPDATE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

-- 12. Trigger para nuevos usuarios de Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_rol rol_usuario;
    v_nombre TEXT;
    v_permisos JSONB;
BEGIN
    IF (NEW.raw_user_meta_data->>'organizacion_id') IS NOT NULL THEN
        v_org_id := (NEW.raw_user_meta_data->>'organizacion_id')::UUID;
    ELSE
        SELECT id INTO v_org_id FROM public.organizaciones ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
        INSERT INTO public.organizaciones (id, nombre, slug, estado, municipio, localidad)
        VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, 'Comité de Agua Potable Fluvib', 'comite-fluvib', 'Puebla', 'Puebla', 'San Gabriel Tetzoyocan')
        RETURNING id INTO v_org_id;
    END IF;

    v_rol := COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'cajero');
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email);

    IF (NEW.raw_user_meta_data->'permisos') IS NOT NULL THEN
        v_permisos := NEW.raw_user_meta_data->'permisos';
    ELSIF v_rol = 'administrador' THEN
        v_permisos := '["*"]'::jsonb;
    ELSIF v_rol = 'cajero' THEN
        v_permisos := '["cobros.crear", "tomas.ver", "tomas.gestionar", "personas.ver", "personas.gestionar"]'::jsonb;
    ELSE
        v_permisos := '["tomas.ver", "personas.ver"]'::jsonb;
    END IF;

    INSERT INTO public.perfiles (id, organizacion_id, nombre_completo, rol, permisos)
    VALUES (NEW.id, v_org_id, v_nombre, v_rol, v_permisos)
    ON CONFLICT (id) DO UPDATE
    SET
        organizacion_id = EXCLUDED.organizacion_id,
        nombre_completo = EXCLUDED.nombre_completo,
        rol = EXCLUDED.rol,
        permisos = EXCLUDED.permisos,
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. Funciones helper para RLS
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
    SELECT organizacion_id FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'administrador' AND activo = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 14. Habilitar RLS y Limpiar políticas previas para evitar colisiones
ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manzanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_detalles ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas anteriores (si existían)
DROP POLICY IF EXISTS "Permitir lectura completa a usuarios autenticados" ON public.perfiles;
DROP POLICY IF EXISTS "Permitir lectura y escritura a manzanas" ON public.manzanas;
DROP POLICY IF EXISTS "Permitir lectura y escritura a personas" ON public.personas;
DROP POLICY IF EXISTS "Permitir lectura y escritura a tomas" ON public.tomas;
DROP POLICY IF EXISTS "Permitir lectura a tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Permitir lectura y registro de pagos" ON public.pagos;
DROP POLICY IF EXISTS "Permitir lectura y registro de detalles de pago" ON public.pago_detalles;

DROP POLICY IF EXISTS "Ver propia organizacion" ON public.organizaciones;
DROP POLICY IF EXISTS "Admins modifican su organizacion" ON public.organizaciones;
DROP POLICY IF EXISTS "Ver perfiles de la organizacion" ON public.perfiles;
DROP POLICY IF EXISTS "Admins gestionan perfiles de su organizacion" ON public.perfiles;
DROP POLICY IF EXISTS "Usuario edita su propio perfil basico" ON public.perfiles;
DROP POLICY IF EXISTS "Acceso a manzanas por organizacion" ON public.manzanas;
DROP POLICY IF EXISTS "Acceso a personas por organizacion" ON public.personas;
DROP POLICY IF EXISTS "Acceso a tomas por organizacion" ON public.tomas;
DROP POLICY IF EXISTS "Acceso a tarifas por organizacion" ON public.tarifas;
DROP POLICY IF EXISTS "Acceso a pagos por organizacion" ON public.pagos;
DROP POLICY IF EXISTS "Acceso a detalles de pago por organizacion" ON public.pago_detalles;

-- Crear políticas definitivas
CREATE POLICY "Ver propia organizacion" ON public.organizaciones
    FOR SELECT TO authenticated
    USING (id = public.get_auth_org_id());

CREATE POLICY "Admins modifican su organizacion" ON public.organizaciones
    FOR UPDATE TO authenticated
    USING (id = public.get_auth_org_id() AND public.es_admin())
    WITH CHECK (id = public.get_auth_org_id());

CREATE POLICY "Ver perfiles de la organizacion" ON public.perfiles
    FOR SELECT TO authenticated
    USING (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Admins gestionan perfiles de su organizacion" ON public.perfiles
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id() AND public.es_admin())
    WITH CHECK (organizacion_id = public.get_auth_org_id() AND public.es_admin());

CREATE POLICY "Usuario edita su propio perfil basico" ON public.perfiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Acceso a manzanas por organizacion" ON public.manzanas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a personas por organizacion" ON public.personas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a tomas por organizacion" ON public.tomas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a tarifas por organizacion" ON public.tarifas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a pagos por organizacion" ON public.pagos
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a detalles de pago por organizacion" ON public.pago_detalles
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());
