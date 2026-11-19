import React from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { getSesionActual } from '@/lib/auth/session';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { SIDEBAR_COOKIE } from '@/lib/theme';

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // 1. Obtener sesión deduplicada en memoria por React.cache (P1)
  const { user, perfil, organizacion, esAdmin } = await getSesionActual();

  if (!user || !perfil || !perfil.activo || !organizacion) {
    redirect('/login');
  }

  const orgNombre = organizacion.nombre || 'Comité de Agua Potable';
  // Por defecto la píldora vertical inicia compacta (collapsed = true) salvo que la cookie indique 'false'
  const cookieVal = (await cookies()).get(SIDEBAR_COOKIE)?.value;
  const sidebarColapsado = cookieVal ? cookieVal !== 'false' : true;

  const rolLabel =
    perfil.rol === 'administrador'
      ? 'Administrador'
      : perfil.rol === 'cajero'
      ? 'Cajero'
      : perfil.rol === 'lector'
      ? 'Lector'
      : 'Usuario';

  const permisosLista = Array.isArray(perfil.permisos)
    ? (perfil.permisos as string[])
    : [];

  return (
    <DashboardShell
      organizacionId={perfil.organizacion_id}
      currentUserId={user.id}
      organizacionNombre={orgNombre}
      userName={perfil.nombre_completo || user.email || 'Usuario'}
      userRole={rolLabel}
      esAdmin={esAdmin}
      permisos={permisosLista}
      initialCollapsed={sidebarColapsado}
    >
      {children}
    </DashboardShell>
  );
}
