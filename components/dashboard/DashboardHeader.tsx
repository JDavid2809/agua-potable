'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { LogoutButton } from '@/components/ui/LogoutButton';

export interface DashboardHeaderProps {
  onToggleMobileMenu: () => void;
  organizacionNombre: string;
  userName: string;
  userRole: string;
}

const SECTION_NAMES: Record<string, string> = {
  '/dashboard': 'Panel Principal',
  '/tomas': 'Padrón de Tomas',
  '/personas': 'Contratos y Personas',
  '/cobros': 'Caja y Cobros',
  '/lecturas': 'Lecturas de Medidor',
  '/reportes': 'Reportes e Ingresos',
  '/usuarios': 'Usuarios y Roles',
  '/configuracion': 'Tarifas y Ajustes',
};

export function DashboardHeader({
  onToggleMobileMenu,
  organizacionNombre,
  userName,
  userRole,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkCurrent =
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches) ||
      document.documentElement.classList.contains('dark');

    setIsDark(isDarkCurrent);
    document.documentElement.classList.toggle('dark', isDarkCurrent);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    const apply = () => {
      setIsDark(nextDark);
      document.documentElement.classList.toggle('dark', nextDark);
      localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    };

    if (!document.startViewTransition) {
      apply();
    } else {
      document.startViewTransition(apply);
    }
  };

  const currentSection = SECTION_NAMES[pathname] || 'Panel';

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* 1. Lado Izquierdo: Menú móvil y sección actual (SIN LOGOTIPO DE FLUVIB) */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          type="button"
          aria-label="Abrir menú de navegación"
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="hidden sm:inline-block font-medium text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
            {organizacionNombre}
          </span>
          <ChevronRight className="hidden sm:inline-block w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0" />
          <span className="font-bold text-slate-900 dark:text-white truncate">
            {currentSection}
          </span>
        </div>
      </div>

      {/* 2. Lado Derecho: Tema, Usuario y Cerrar Sesión (SIN UBICACIÓN) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Botón de Tema */}
        <button
          onClick={toggleTheme}
          type="button"
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Sun
            className={`w-[18px] h-[18px] transition-all duration-200 ${
              isDark ? 'scale-0 opacity-0 absolute' : 'scale-100 opacity-100'
            }`}
          />
          <Moon
            className={`w-[18px] h-[18px] transition-all duration-200 ${
              isDark ? 'scale-100 opacity-100' : 'scale-0 opacity-0 absolute'
            }`}
          />
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Chip de Usuario */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-200 dark:border-slate-700">
            {getInitials(userName)}
          </div>
          <div className="hidden md:flex flex-col text-left leading-tight">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px]">
              {userName}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {userRole}
            </span>
          </div>
        </div>

        {/* Botón de Cerrar Sesión único en el sistema */}
        <LogoutButton />
      </div>
    </header>
  );
}
