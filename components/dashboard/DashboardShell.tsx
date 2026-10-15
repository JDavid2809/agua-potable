'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from './DashboardHeader';

export interface DashboardShellProps {
  children: React.ReactNode;
  organizacionNombre: string;
  userName: string;
  userRole: string;
  esAdmin: boolean;
}

export function DashboardShell({
  children,
  organizacionNombre,
  userName,
  userRole,
  esAdmin,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Leer estado de colapso previo de localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved !== null) {
      setCollapsed(saved === 'true');
    }
  }, []);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

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
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      {/* 1. BARRA LATERAL (SIDEBAR) PRINCIPAL */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        organizacionNombre={organizacionNombre}
        esAdmin={esAdmin}
      />

      {/* 2. ÁREA PRINCIPAL: HEADER SUPERIOR (SIN LOGOTIPO DE FLUVIB NI UBICACIÓN) + CONTENIDO */}
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
