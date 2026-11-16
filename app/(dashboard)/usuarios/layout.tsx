import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSesionActual } from '@/lib/auth/session';

export const instant = false;

export default async function UsuariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // Deduplicado en memoria por React.cache con el DashboardLayout (0 consultas adicionales)
  const { user, perfil, esAdmin } = await getSesionActual();

  if (!user) {
    redirect('/login');
  }

  const tienePermisoUsuarios =
    esAdmin ||
    perfil?.permisos?.includes('*') ||
    perfil?.permisos?.includes('usuarios.gestionar');

  if (!perfil || !perfil.activo || !tienePermisoUsuarios) {
    redirect('/dashboard?denegado=usuarios');
  }

  return <>{children}</>;
}
