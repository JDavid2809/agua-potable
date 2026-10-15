import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();

  // 1. Validar autenticación
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Cargar perfil y organización
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol, organizacion_id, activo')
    .eq('id', user.id)
    .single();

  if (!perfil || !perfil.activo || !perfil.organizacion_id) {
    redirect('/login');
  }

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('nombre, localidad, municipio, estado, activo')
    .eq('id', perfil.organizacion_id)
    .single();

  if (!organizacion || !organizacion.activo) {
    redirect('/login');
  }

  const esAdmin = perfil.rol === 'administrador';

  const orgNombre = organizacion?.nombre || 'Comité de Agua Potable';
  const orgUbicacion = organizacion?.localidad
    ? `${organizacion.localidad}, ${organizacion.municipio || organizacion.estado}`
    : 'Sistema Fluvib';

  const rolLabel =
    perfil?.rol === 'administrador'
      ? 'Administrador'
      : perfil?.rol === 'cajero'
      ? 'Cajero'
      : perfil?.rol === 'lector'
      ? 'Lector'
      : 'Usuario';

  return (
    <DashboardShell
      organizacionNombre={orgNombre}
      userName={perfil?.nombre_completo || user.email || 'Usuario'}
      userRole={rolLabel}
      esAdmin={esAdmin}
    >
      {children}
    </DashboardShell>
  );
}
