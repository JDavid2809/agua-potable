'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from './DashboardHeader';
import { PageHeaderProvider } from '@/components/ui/PageHeader';
import { sileo } from 'sileo';
import { SIDEBAR_COOKIE } from '@/lib/theme';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { PresenceProvider } from '@/hooks/use-presence-tracker';
import { PermisosProvider, usePermisosUsuario } from '@/hooks/use-permisos-usuario';
import { usePwa } from '@/components/pwa/PwaManager';
import { aislarOrganizacionLocal } from '@/lib/db/offline-db';

export { usePermisosUsuario };

function AccesoDenegadoListener() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const denegado = searchParams.get('denegado');
    if (denegado) {
      sileo.error({
        title: 'Acceso restringido',
        description: 'No cuentas con los permisos necesarios para abrir ese apartado.',
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
  permisos?: string[];
  organizacionId?: string;
  currentUserId?: string;
  initialCollapsed?: boolean;
}

export function DashboardShell({
  children,
  organizacionNombre,
  userName,
  userRole,
  esAdmin,
  permisos = [],
  organizacionId,
  currentUserId,
  initialCollapsed = false,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Activar motor de sincronización offline/online automático en todo el dashboard
  const syncState = useOfflineSync();
  const { warmRoutes } = usePwa();

  // Pre-cachear rutas operativas clave en el Service Worker para navegación sin conexión
  useEffect(() => {
    warmRoutes(['/dashboard', '/cobros', '/personas', '/tomas', '/cooperaciones']);
  }, [warmRoutes]);

  // Persistir organizacion_activa_id en IndexedDB y aislar caché multi-organización al montar
  useEffect(() => {
    if (organizacionId) {
      void aislarOrganizacionLocal(organizacionId).catch(() => {});
    }
  }, [organizacionId]);

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
    <PermisosProvider esAdmin={esAdmin} permisos={permisos}>
      <PresenceProvider
        organizacionId={organizacionId}
        currentUserId={currentUserId}
        userName={userName}
        userRole={userRole}
      >
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
            userName={userName}
            userRole={userRole}
            esAdmin={esAdmin}
            permisos={permisos}
          />

          {/* 2. ÁREA PRINCIPAL: HEADER UNIFICADO + CONTENIDO */}
          <PageHeaderProvider>
            <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
              <DashboardHeader
                onToggleMobileMenu={() => setMobileOpen(true)}
                organizacionNombre={organizacionNombre}
                userName={userName}
                userRole={userRole}
                enLinea={syncState.enLinea}
                pendientesSync={syncState.pendientes}
                isSyncing={syncState.isSyncing}
                onSyncNow={syncState.sincronizar}
                conErrores={syncState.conError}
                onRetryErrors={syncState.reintentarErrores}
              />

              <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>
          </PageHeaderProvider>
        </div>
      </PresenceProvider>
    </PermisosProvider>
  );
}
