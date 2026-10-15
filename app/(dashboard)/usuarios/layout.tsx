import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const instant = false;

export default async function UsuariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .single();

  // Si el usuario no existe, está inactivo o NO es administrador, expulsar al dashboard con parámetro de error
  if (!perfil || !perfil.activo || perfil.rol !== 'administrador') {
    redirect('/dashboard?denegado=usuarios');
  }

  return <>{children}</>;
}
