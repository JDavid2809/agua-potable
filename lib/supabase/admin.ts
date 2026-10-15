import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Cliente con privilegios administrativos (Service Role)
 * EXCLUSIVO DE RUTAS DEL SERVIDOR / API. NUNCA EXPONER AL CLIENTE.
 */
export function createAdminClient() {
  if (!serviceRoleKey) {
    throw new Error(
      'La variable SUPABASE_SERVICE_ROLE_KEY no está configurada en el archivo .env.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
