import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSesionActual } from '@/lib/auth/session';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import type { Toma, Pago } from '@/types/database';

export const instant = false;

export default async function DashboardPage() {
  await connection();

  // 1. Obtener sesión deduplicada de memoria por React.cache
  const { user, perfil, organizacion, esAdmin } = await getSesionActual();

  if (!user || !perfil?.organizacion_id || !organizacion) {
    redirect('/login');
  }

  const supabase = await createClient();
  const orgId = perfil.organizacion_id;

  // 2. Cargar en paralelo métricas, padrón y cobros para el panel general
  const [
    { count: tomasCount, data: tomasData },
    { count: personasCount },
    { count: usuariosCount },
    { data: pagosData },
  ] = await Promise.all([
    supabase
      .from('tomas')
      .select('id, codigo_toma, tipo_toma, estado, saldo_pendiente, persona:personas(nombre_completo)', { count: 'exact' })
      .eq('organizacion_id', orgId)
      .is('deleted_at', null)
      .order('codigo_toma', { ascending: true }),
    supabase
      .from('personas')
      .select('*', { count: 'exact', head: true })
      .eq('organizacion_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('perfiles')
      .select('*', { count: 'exact', head: true })
      .eq('organizacion_id', orgId),
    supabase
      .from('pagos')
      .select(`
        id,
        folio,
        total,
        metodo_pago,
        fecha_pago,
        created_at,
        persona:personas(nombre_completo),
        detalles:pago_detalles(monto, recargo)
      `)
      .eq('organizacion_id', orgId)
      .order('fecha_pago', { ascending: false })
      .limit(100),
  ]);

  return (
    <DashboardOverview
      tomas={(tomasData || []) as unknown as Toma[]}
      totalTomasCount={tomasCount || 0}
      totalPersonasCount={personasCount || 0}
      totalUsuariosCount={usuariosCount || 0}
      pagos={(pagosData || []) as unknown as Pago[]}
      organizacion={organizacion}
      perfil={perfil}
      esAdmin={esAdmin}
    />
  );
}
