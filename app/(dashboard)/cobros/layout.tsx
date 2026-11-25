import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSesionActual } from '@/lib/auth/session';
import { tieneAlgunPermisoUsuario } from '@/lib/auth/permisos';

export const instant = false;

export default async function CobrosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const { user, perfil, esAdmin } = await getSesionActual();

  if (!user) {
    redirect('/login');
  }

  const permisos = Array.isArray(perfil?.permisos) ? (perfil.permisos as string[]) : [];
  const tieneAcceso = tieneAlgunPermisoUsuario(esAdmin, permisos, [
    'cobros.crear',
    'cobros.anular',
    'reportes.ver',
  ]);

  if (!perfil || !perfil.activo || !tieneAcceso) {
    redirect('/dashboard?denegado=cobros');
  }

  return <>{children}</>;
}
