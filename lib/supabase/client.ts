import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const SUPABASE_CONFIG_ERROR =
  'Supabase no está configurado: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) en .env.local y reinicia el servidor.';

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.error(`[Fluvib] ${SUPABASE_CONFIG_ERROR}`);
}

export function createClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}

/**
 * Cliente sin configuración: cualquier uso lanza un error explícito
 * en lugar de enviar peticiones silenciosas a una URL ficticia.
 */
const clienteNoConfigurado = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error(SUPABASE_CONFIG_ERROR);
  },
});

// Instancia singleton para uso en componentes cliente
export const supabase: SupabaseClient = isSupabaseConfigured ? createClient() : clienteNoConfigurado;
