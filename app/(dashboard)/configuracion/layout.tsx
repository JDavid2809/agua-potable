import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSesionActual } from '@/lib/auth/session';

export const instant = false;

export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // Deduplicado en memoria por React.cache con el DashboardLayout
  const { user, perfil, esAdmin } = await getSesionActual();

  if (!user) {
    redirect('/login');
  }

  const tienePermisoTarifas =
    esAdmin ||
    perfil?.permisos?.includes('tarifas.gestionar') ||
    perfil?.permisos?.includes('organizacion.editar');

  if (!perfil || !perfil.activo || !tienePermisoTarifas) {
    redirect('/dashboard?denegado=configuracion');
  }

  return <>{children}</>;
}

