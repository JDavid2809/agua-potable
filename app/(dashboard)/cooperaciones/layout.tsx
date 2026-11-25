import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSesionActual } from '@/lib/auth/session';
import { tieneAlgunPermisoUsuario } from '@/lib/auth/permisos';

export const instant = false;

export default async function CooperacionesLayout({
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
    'cooperaciones.ver',
    'cooperaciones.cobrar',
    'cooperaciones.gestionar',
    'cobros.crear',
  ]);

  if (!perfil || !perfil.activo || !tieneAcceso) {
    redirect('/dashboard?denegado=cooperaciones');
  }

  return <>{children}</>;
}
