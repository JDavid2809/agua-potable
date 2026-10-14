-- ==============================================================================
-- SISTEMA DE CONTROL DE AGUA POTABLE COMUNITARIO
-- Esquema de Base de Datos para Supabase (PostgreSQL)
-- Soporta: Multi-cajero, Personas, Múltiples Tomas, Manzanas y Sincronización Offline
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

-- 3. Tabla: Perfiles de Usuario (Cajeros y Administradores vinculados a auth.users)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'cajero',
    telefono TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Tabla: Manzanas / Secciones / Ubicaciones comunitarias
CREATE TABLE IF NOT EXISTS public.manzanas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barrio TEXT NOT NULL DEFAULT 'Centro',
    seccion TEXT NOT NULL DEFAULT '1',
    numero_manzana TEXT NOT NULL,          -- Ej: 'Manzana 4', 'Mz 12'
    cuadra TEXT,                           -- Ej: 'Cuadra 2'
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 5. Tabla: Personas (Contribuyentes / Titulares)
CREATE TABLE IF NOT EXISTS public.personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_completo TEXT NOT NULL,
    documento_identidad TEXT,              -- DNI / INE / CURP (opcional)
    telefono TEXT,
    direccion TEXT,
    notas TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ                 -- Para borrado lógico en modo offline
);

-- 6. Tabla: Tomas de Agua
-- Una persona puede ser titular de 1 o más tomas de agua
CREATE TABLE IF NOT EXISTS public.tomas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_toma TEXT NOT NULL UNIQUE,      -- Ej: 'TOMA-0012' o número de tarjeta física anterior
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    manzana_id UUID REFERENCES public.manzanas(id) ON DELETE SET NULL,
    direccion_referencia TEXT NOT NULL,    -- Ej: 'Calle Hidalgo #24 frente a la tienda'
    tipo_toma tipo_toma NOT NULL DEFAULT 'domestica',
    estado estado_toma NOT NULL DEFAULT 'activa',
    numero_medidor TEXT,                   -- Opcional (por si instalan medidores en el futuro)
    saldo_pendiente NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 7. Tabla: Tarifas / Cuotas fijas por año
CREATE TABLE IF NOT EXISTS public.tarifas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anio INT NOT NULL,
    cuota_mensual NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    recargo_mora NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(anio)
);

-- 8. Tabla: Pagos (Encabezado del Recibo)
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio TEXT NOT NULL UNIQUE,            -- Ej: 'REC-2024-0001' o prefijo de cajero offline
    persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    cajero_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    total NUMERIC(10,2) NOT NULL,
    metodo_pago metodo_pago NOT NULL DEFAULT 'efectivo',
    fecha_pago TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notas TEXT,
    dispositivo_offline_id TEXT,          -- Identificador del dispositivo si se cobró offline
    sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Tabla: Detalle de Pago (Meses y Años cubiertos por cada toma)
CREATE TABLE IF NOT EXISTS public.pago_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
    toma_id UUID NOT NULL REFERENCES public.tomas(id) ON DELETE RESTRICT,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto NUMERIC(10,2) NOT NULL,
    recargo NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Evitar que una misma toma registre dos pagos para el mismo mes y año
    UNIQUE(toma_id, anio, mes)
);

-- ==============================================================================
-- ÍNDICES DE ALTO RENDIMIENTO (Para búsquedas rápidas de cajeros)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_personas_nombre ON public.personas USING gin(to_tsvector('spanish', nombre_completo));
CREATE INDEX IF NOT EXISTS idx_tomas_codigo ON public.tomas(codigo_toma);
CREATE INDEX IF NOT EXISTS idx_tomas_persona ON public.tomas(persona_id);
CREATE INDEX IF NOT EXISTS idx_tomas_manzana ON public.tomas(manzana_id);
CREATE INDEX IF NOT EXISTS idx_pago_detalles_toma ON public.pago_detalles(toma_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON public.pagos(fecha_pago DESC);

-- ==============================================================================
-- TRIGGER PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- (Crucial para el motor de sincronización offline delta)
-- ==============================================================================
CREATE OR REPLACE FUNCTION actualizar_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_personas_updated_at BEFORE UPDATE ON public.personas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_tomas_updated_at BEFORE UPDATE ON public.tomas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_manzanas_updated_at BEFORE UPDATE ON public.manzanas
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

CREATE OR REPLACE TRIGGER tr_pagos_updated_at BEFORE UPDATE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp_updated_at();

-- ==============================================================================
-- TRIGGER PARA CREAR PERFIL AL CREAR USUARIO EN SUPABASE AUTH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
        COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'cajero')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- SEGURIDAD A NIVEL DE FILAS (RLS)
-- ==============================================================================
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manzanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_detalles ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios autenticados (cajeros y administradores)
CREATE POLICY "Permitir lectura completa a usuarios autenticados" ON public.perfiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura y escritura a manzanas" ON public.manzanas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir lectura y escritura a personas" ON public.personas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir lectura y escritura a tomas" ON public.tomas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir lectura a tarifas" ON public.tarifas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir lectura y registro de pagos" ON public.pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir lectura y registro de detalles de pago" ON public.pago_detalles FOR ALL TO authenticated USING (true) WITH CHECK (true);
