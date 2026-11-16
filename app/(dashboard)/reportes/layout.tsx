import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSesionActual } from '@/lib/auth/session';

export const instant = false;

export default async function ReportesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const { user, perfil, esAdmin } = await getSesionActual();

  if (!user) {
    redirect('/login');
  }

  const tienePermisoReportes =
    esAdmin ||
    perfil?.permisos?.includes('*') ||
    perfil?.permisos?.includes('reportes.ver') ||
    perfil?.permisos?.includes('cobros.crear');

  if (!perfil || !perfil.activo || !tienePermisoReportes) {
    redirect('/dashboard?denegado=reportes');
  }

  return <>{children}</>;
}

