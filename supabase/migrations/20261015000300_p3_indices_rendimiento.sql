-- ==============================================================================
-- MIGRACIÓN P3: Optimización de Índices de Base de Datos y Reportes
-- Descripción:
-- 1. Añade índices faltantes en claves foráneas (FK) para evitar Sequential Scans
--    al eliminar o consultar pagos, personas y tomas por manzana.
-- 2. Crea un índice compuesto eficiente para reportes y cortes de caja cronológicos.
-- 3. Elimina el índice redundante idx_tomas_codigo que duplica la restricción UNIQUE.
-- ==============================================================================

-- 1. Índices en claves foráneas (FK)
CREATE INDEX IF NOT EXISTS idx_pago_detalles_pago_id ON public.pago_detalles(pago_id);
CREATE INDEX IF NOT EXISTS idx_pagos_persona_id ON public.pagos(persona_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cajero_id ON public.pagos(cajero_id);
CREATE INDEX IF NOT EXISTS idx_tomas_manzana_id ON public.tomas(manzana_id);

-- 2. Índice compuesto para reportes por fecha y organización
CREATE INDEX IF NOT EXISTS idx_pagos_org_fecha_desc ON public.pagos(organizacion_id, fecha_pago DESC);

-- 3. Eliminación de índice redundante sobre codigo_toma
-- La tabla tomas ya posee la restricción UNIQUE(organizacion_id, codigo_toma) que crea un índice compuesto.
DROP INDEX IF EXISTS public.idx_tomas_codigo;
