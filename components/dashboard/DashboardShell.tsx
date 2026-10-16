'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from './DashboardHeader';
import { sileo } from 'sileo';
import { SIDEBAR_COOKIE } from '@/lib/theme';

function AccesoDenegadoListener() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const denegado = searchParams.get('denegado');
    if (denegado) {
      sileo.error({
        title: 'Acceso restringido',
        description: 'No tienes permisos de administrador para acceder a ese apartado.',
      });
      // Limpiar el parámetro de la URL para que no vuelva a dispararse al recargar
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return null;
}

export interface DashboardShellProps {
  children: React.ReactNode;
  organizacionNombre: string;
  userName: string;
  userRole: string;
  esAdmin: boolean;
  initialCollapsed?: boolean;
}

export function DashboardShell({
  children,
  organizacionNombre,
  userName,
  userRole,
  esAdmin,
  initialCollapsed = false,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }, []);

  const handleCloseMobile = useCallback(() => setMobileOpen(false), []);

  // Atajo de teclado: Ctrl + B o Cmd + B para colapsar barra lateral
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleCollapse]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      <Suspense fallback={null}>
        <AccesoDenegadoListener />
      </Suspense>

      {/* 1. BARRA LATERAL (SIDEBAR) PRINCIPAL */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={handleCloseMobile}
        organizacionNombre={organizacionNombre}
        esAdmin={esAdmin}
      />

      {/* 2. ÁREA PRINCIPAL: HEADER SUPERIOR + CONTENIDO */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          onToggleMobileMenu={() => setMobileOpen(true)}
          organizacionNombre={organizacionNombre}
          userName={userName}
          userRole={userRole}
        />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
