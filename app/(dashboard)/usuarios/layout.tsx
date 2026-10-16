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

  // Si el usuario no existe, está inactivo o NO es administrador, expulsar al dashboard con parámetro de error
  if (!perfil || !perfil.activo || !esAdmin) {
    redirect('/dashboard?denegado=usuarios');
  }

  return <>{children}</>;
}
