-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD CRÍTICA (C3, C4 y P2):
-- PERMISOS GRANULARES EN RLS + OPTIMIZACIÓN INITPLAN + CONTROL DE USUARIOS ACTIVOS
-- ==============================================================================

-- 1. Función para evaluar permisos granulares del usuario autenticado
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso TEXT)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

-- 2. Limpieza de políticas previas para evitar colisiones
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

-- Políticas específicas granulares previas (por si se re-ejecuta)
DROP POLICY IF EXISTS "Lectura de manzanas" ON public.manzanas;
DROP POLICY IF EXISTS "Gestion de manzanas" ON public.manzanas;
DROP POLICY IF EXISTS "Lectura de personas" ON public.personas;
DROP POLICY IF EXISTS "Gestion de personas" ON public.personas;
DROP POLICY IF EXISTS "Eliminar personas" ON public.personas;
DROP POLICY IF EXISTS "Lectura de tomas" ON public.tomas;
DROP POLICY IF EXISTS "Gestion de tomas" ON public.tomas;
DROP POLICY IF EXISTS "Eliminar tomas" ON public.tomas;
DROP POLICY IF EXISTS "Lectura de tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Gestion de tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Lectura de pagos" ON public.pagos;
DROP POLICY IF EXISTS "Registro de pagos" ON public.pagos;
DROP POLICY IF EXISTS "Anulacion de pagos" ON public.pagos;
DROP POLICY IF EXISTS "Lectura de detalles de pago" ON public.pago_detalles;
DROP POLICY IF EXISTS "Registro de detalles de pago" ON public.pago_detalles;
DROP POLICY IF EXISTS "Anulacion de detalles de pago" ON public.pago_detalles;

-- ==============================================================================
-- POLÍTICAS GRANULARES CON OPTIMIZACIÓN (SELECT public.func())
-- ==============================================================================

-- 1. ORGANIZACIONES
CREATE POLICY "Ver propia organizacion" ON public.organizaciones
    FOR SELECT TO authenticated
    USING (id = (SELECT public.get_auth_org_id()));

CREATE POLICY "Admins modifican su organizacion" ON public.organizaciones
    FOR UPDATE TO authenticated
    USING (
        id = (SELECT public.get_auth_org_id()) 
        AND ((SELECT public.es_admin()) OR (SELECT public.tiene_permiso('organizacion.editar')))
    )
    WITH CHECK (id = (SELECT public.get_auth_org_id()));

-- 2. PERFILES
CREATE POLICY "Ver perfiles de la organizacion" ON public.perfiles
    FOR SELECT TO authenticated
    USING (organizacion_id = (SELECT public.get_auth_org_id()));

CREATE POLICY "Admins gestionan perfiles de su organizacion" ON public.perfiles
    FOR ALL TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id()) 
        AND ((SELECT public.es_admin()) OR (SELECT public.tiene_permiso('usuarios.gestionar')))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id()) 
        AND ((SELECT public.es_admin()) OR (SELECT public.tiene_permiso('usuarios.gestionar')))
    );

CREATE POLICY "Usuario edita su propio perfil basico" ON public.perfiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 3. MANZANAS / SECCIONES
CREATE POLICY "Lectura de manzanas" ON public.manzanas
    FOR SELECT TO authenticated
    USING (organizacion_id = (SELECT public.get_auth_org_id()));

CREATE POLICY "Gestion de manzanas" ON public.manzanas
    FOR ALL TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id()) 
        AND ((SELECT public.es_admin()) OR (SELECT public.tiene_permiso('tomas.gestionar')))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id()) 
        AND ((SELECT public.es_admin()) OR (SELECT public.tiene_permiso('tomas.gestionar')))
    );

-- 4. PERSONAS (CONTRIBUYENTES)
CREATE POLICY "Lectura de personas" ON public.personas
    FOR SELECT TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('personas.ver'))
    );

CREATE POLICY "Gestion de personas" ON public.personas
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('personas.gestionar'))
    );

CREATE POLICY "Actualizar personas" ON public.personas
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('personas.gestionar'))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('personas.gestionar'))
    );

CREATE POLICY "Eliminar personas" ON public.personas
    FOR DELETE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.es_admin())
    );

-- 5. TOMAS DE AGUA
CREATE POLICY "Lectura de tomas" ON public.tomas
    FOR SELECT TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tomas.ver'))
    );

CREATE POLICY "Gestion de tomas" ON public.tomas
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tomas.gestionar'))
    );

CREATE POLICY "Actualizar tomas" ON public.tomas
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tomas.gestionar'))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tomas.gestionar'))
    );

CREATE POLICY "Eliminar tomas" ON public.tomas
    FOR DELETE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.es_admin())
    );

-- 6. TARIFAS
CREATE POLICY "Lectura de tarifas" ON public.tarifas
    FOR SELECT TO authenticated
    USING (organizacion_id = (SELECT public.get_auth_org_id()));

CREATE POLICY "Gestion de tarifas" ON public.tarifas
    FOR ALL TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tarifas.gestionar'))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('tarifas.gestionar'))
    );

-- 7. PAGOS
CREATE POLICY "Lectura de pagos" ON public.pagos
    FOR SELECT TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND ((SELECT public.tiene_permiso('cobros.crear')) OR (SELECT public.tiene_permiso('reportes.ver')))
    );

CREATE POLICY "Registro de pagos" ON public.pagos
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.crear'))
    );

CREATE POLICY "Anulacion de pagos" ON public.pagos
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.anular'))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.anular'))
    );

-- 8. DETALLES DE PAGO
CREATE POLICY "Lectura de detalles de pago" ON public.pago_detalles
    FOR SELECT TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND ((SELECT public.tiene_permiso('cobros.crear')) OR (SELECT public.tiene_permiso('reportes.ver')))
    );

CREATE POLICY "Registro de detalles de pago" ON public.pago_detalles
    FOR INSERT TO authenticated
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.crear'))
    );

CREATE POLICY "Anulacion de detalles de pago" ON public.pago_detalles
    FOR UPDATE TO authenticated
    USING (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.anular'))
    )
    WITH CHECK (
        organizacion_id = (SELECT public.get_auth_org_id())
        AND (SELECT public.tiene_permiso('cobros.anular'))
    );
