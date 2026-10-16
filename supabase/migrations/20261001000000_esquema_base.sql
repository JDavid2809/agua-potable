-- ==============================================================================
-- SISTEMA DE CONTROL DE AGUA POTABLE COMUNITARIO (FLUVIB)
-- Esquema de Base de Datos para Supabase (PostgreSQL)
-- Multi-organización (Tenancy), Roles, Permisos Granulares y Sincronización Offline
-- ==============================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tipos enumerados
DO $$ BEGIN
    CREATE TYPE rol_usuario AS ENUM ('administrador', 'cajero', 'lector');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_toma AS ENUM ('activa', 'suspendida', 'cortada', 'inactiva');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_toma AS ENUM ('domestica', 'comercial', 'comunal', 'lote_baldio');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'otro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabla: Organizaciones (Comités de Agua Potable / Localidades)
CREATE TABLE IF NOT EXISTS public.organizaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,                                -- Ej: 'Comité de Agua Potable La Esmeralda'
    slug TEXT UNIQUE,                                   -- Ej: 'comite-la-esmeralda'
    estado TEXT NOT NULL DEFAULT '',                    -- Ej: 'Hidalgo'
    municipio TEXT NOT NULL DEFAULT '',                 -- Ej: 'Ixmiquilpan'
    localidad TEXT NOT NULL DEFAULT '',                 -- Ej: 'La Esmeralda'
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

-- 4. Tabla: Perfiles de Usuario (Vinculados a auth.users y a una Organización)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'cajero',
    permisos JSONB NOT NULL DEFAULT '[]'::jsonb,         -- Ej: ["cobros.crear", "tomas.gestionar", "reportes.ver"]
    telefono TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Tabla: Manzanas / Secciones / Ubicaciones comunitarias
CREATE TABLE IF NOT EXISTS public.manzanas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    barrio TEXT NOT NULL DEFAULT 'Centro',
    seccion TEXT NOT NULL DEFAULT '1',
    numero_manzana TEXT NOT NULL,                        -- Ej: 'Manzana 4', 'Mz 12'
    cuadra TEXT,                                         -- Ej: 'Cuadra 2'
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 6. Tabla: Personas (Contribuyentes / Titulares)
CREATE TABLE IF NOT EXISTS public.personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    documento_identidad TEXT,                            -- DNI / INE / CURP
    telefono TEXT,
    direccion TEXT,
    notas TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 7. Tabla: Tomas de Agua
CREATE TABLE IF NOT EXISTS public.tomas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    codigo_toma TEXT NOT NULL,                           -- Ej: 'TOMA-0012'
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    manzana_id UUID REFERENCES public.manzanas(id) ON DELETE SET NULL,
    direccion_referencia TEXT NOT NULL,                  -- Ej: 'Calle Hidalgo #24 frente a la tienda'
    tipo_toma tipo_toma NOT NULL DEFAULT 'domestica',
    estado estado_toma NOT NULL DEFAULT 'activa',
    numero_medidor TEXT,                                 -- Opcional
    saldo_pendiente NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    UNIQUE(organizacion_id, codigo_toma)
);

-- 8. Tabla: Tarifas / Cuotas fijas por año por organización
CREATE TABLE IF NOT EXISTS public.tarifas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    anio INT NOT NULL,
    cuota_mensual NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    recargo_mora NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organizacion_id, anio)
);

-- 9. Tabla: Pagos (Encabezado del Recibo)
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    folio TEXT NOT NULL,                                 -- Ej: 'REC-2026-0001'
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    cajero_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    total NUMERIC(10,2) NOT NULL,
    metodo_pago metodo_pago NOT NULL DEFAULT 'efectivo',
    fecha_pago TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notas TEXT,
    dispositivo_offline_id TEXT,                        -- Identificador si se cobró offline
    sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organizacion_id, folio)
);

-- 10. Tabla: Detalle de Pago (Meses y Años cubiertos por cada toma)
CREATE TABLE IF NOT EXISTS public.pago_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
    toma_id UUID NOT NULL REFERENCES public.tomas(id) ON DELETE RESTRICT,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto NUMERIC(10,2) NOT NULL,
    recargo NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(toma_id, anio, mes)
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO Y BÚSQUEDA MULTI-TENANT
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_organizaciones_slug ON public.organizaciones(slug);
CREATE INDEX IF NOT EXISTS idx_perfiles_org ON public.perfiles(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_manzanas_org ON public.manzanas(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_personas_org ON public.personas(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_personas_nombre ON public.personas USING gin(to_tsvector('spanish', nombre_completo));
CREATE INDEX IF NOT EXISTS idx_tomas_org ON public.tomas(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_tomas_codigo ON public.tomas(codigo_toma);
CREATE INDEX IF NOT EXISTS idx_tomas_persona ON public.tomas(persona_id);
CREATE INDEX IF NOT EXISTS idx_tarifas_org_anio ON public.tarifas(organizacion_id, anio);
CREATE INDEX IF NOT EXISTS idx_pagos_org ON public.pagos(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON public.pagos(fecha_pago DESC);
CREATE INDEX IF NOT EXISTS idx_pago_detalles_toma ON public.pago_detalles(toma_id, anio, mes);

-- ==============================================================================
-- TRIGGER PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ==============================================================================
CREATE OR REPLACE FUNCTION actualizar_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_organizaciones_updated_at BEFORE UPDATE ON public.organizaciones
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_perfiles_updated_at BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_personas_updated_at BEFORE UPDATE ON public.personas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_tomas_updated_at BEFORE UPDATE ON public.tomas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_manzanas_updated_at BEFORE UPDATE ON public.manzanas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_pagos_updated_at BEFORE UPDATE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

-- ==============================================================================
-- TRIGGER PARA CREAR PERFIL AUTOMÁTICAMENTE AL CREAR USUARIO EN SUPABASE AUTH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_rol rol_usuario;
    v_nombre TEXT;
    v_permisos JSONB;
BEGIN
    -- 1. Obtener organizacion_id de la metadata o asignar la primera existente
    IF (NEW.raw_user_meta_data->>'organizacion_id') IS NOT NULL THEN
        v_org_id := (NEW.raw_user_meta_data->>'organizacion_id')::UUID;
    ELSE
        SELECT id INTO v_org_id FROM public.organizaciones ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- Si aún no existe ninguna organización, crear una por defecto
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizaciones (nombre, slug, estado, municipio, localidad)
        VALUES ('Comité Central de Agua Potable', 'comite-central', 'Hidalgo', 'Principal', 'Centro')
        RETURNING id INTO v_org_id;
    END IF;

    -- 2. Obtener rol
    v_rol := COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'cajero');

    -- 3. Obtener nombre
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email);

    -- 4. Obtener permisos predeterminados según el rol si no vienen explícitos
    IF (NEW.raw_user_meta_data->'permisos') IS NOT NULL THEN
        v_permisos := NEW.raw_user_meta_data->'permisos';
    ELSIF v_rol = 'administrador' THEN
        v_permisos := '["*"]'::jsonb;
    ELSIF v_rol = 'cajero' THEN
        v_permisos := '["cobros.crear", "tomas.ver", "tomas.gestionar", "personas.ver", "personas.gestionar"]'::jsonb;
    ELSE
        v_permisos := '["tomas.ver", "personas.ver"]'::jsonb;
    END IF;

    -- 5. Insertar en perfiles
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

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- FUNCIONES HELPER PARA SEGURIDAD (RLS)
-- ==============================================================================
-- Obtiene el ID de la organización del usuario autenticado actual
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
    SELECT organizacion_id FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Comprueba si el usuario autenticado tiene rol de administrador
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'administrador' AND activo = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- SEGURIDAD A NIVEL DE FILAS (RLS MULTI-TENANT)
-- ==============================================================================
ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manzanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_detalles ENABLE ROW LEVEL SECURITY;

-- 1. Organizaciones: los miembros ven su propia organización, admins pueden editarla
CREATE POLICY "Ver propia organizacion" ON public.organizaciones
    FOR SELECT TO authenticated
    USING (id = public.get_auth_org_id());

CREATE POLICY "Admins modifican su organizacion" ON public.organizaciones
    FOR UPDATE TO authenticated
    USING (id = public.get_auth_org_id() AND public.es_admin())
    WITH CHECK (id = public.get_auth_org_id());

-- 2. Perfiles: usuarios autenticados ven perfiles de su misma organización
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

-- 3. Manzanas
CREATE POLICY "Acceso a manzanas por organizacion" ON public.manzanas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

-- 4. Personas
CREATE POLICY "Acceso a personas por organizacion" ON public.personas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

-- 5. Tomas
CREATE POLICY "Acceso a tomas por organizacion" ON public.tomas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

-- 6. Tarifas
CREATE POLICY "Acceso a tarifas por organizacion" ON public.tarifas
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

-- 7. Pagos y Detalles
CREATE POLICY "Acceso a pagos por organizacion" ON public.pagos
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());

CREATE POLICY "Acceso a detalles de pago por organizacion" ON public.pago_detalles
    FOR ALL TO authenticated
    USING (organizacion_id = public.get_auth_org_id())
    WITH CHECK (organizacion_id = public.get_auth_org_id());
