import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Perfil, Organizacion } from '@/types/database';
import type { User } from '@supabase/supabase-js';

export interface DatosSesion {
  user: User | null;
  perfil: Perfil | null;
  organizacion: Organizacion | null;
  esAdmin: boolean;
}

/**
 * Obtiene la sesión del usuario autenticado, su perfil y su organización.
 * Utiliza React.cache() para deduplicar consultas durante el ciclo de vida
 * de la misma petición HTTP (eliminando consultas repetidas entre layout, páginas y guards).
 */
export const getSesionActual = cache(async (): Promise<DatosSesion> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, perfil: null, organizacion: null, esAdmin: false };
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, organizacion_id, email, nombre_completo, rol, permisos, telefono, activo, created_at, updated_at')
    .eq('id', user.id)
    .single();

  if (!perfil?.organizacion_id || !perfil.activo) {
    return {
      user,
      perfil: (perfil as Perfil) || null,
      organizacion: null,
      esAdmin: false,
    };
  }

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('*')
    .eq('id', perfil.organizacion_id)
    .single();

  const esAdmin = perfil.rol === 'administrador';

  return {
    user,
    perfil: perfil as Perfil,
    organizacion: organizacion && organizacion.activo ? (organizacion as Organizacion) : null,
    esAdmin,
  };
});
