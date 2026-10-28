'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Sun, Moon, User, WifiOff, RefreshCw } from 'lucide-react';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { useTheme } from '@/hooks/use-theme';

export interface DashboardHeaderProps {
  onToggleMobileMenu: () => void;
  organizacionNombre: string;
  userName: string;
  userRole: string;
  enLinea?: boolean;
  pendientesSync?: number;
  isSyncing?: boolean;
  onSyncNow?: () => void;
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

const SECTION_KEYS = Object.keys(SECTION_NAMES);
const pad = (n: number) => String(n).padStart(2, '0');
const ROW = 28; // alto (px) de cada número del contador

const EASE = 'ease-[cubic-bezier(.65,0,.2,1)]';
const SPRING = 'ease-[cubic-bezier(.34,1.45,.64,1)]';

const css = `
@keyframes fh-rise{from{transform:translateY(115%)}to{transform:none}}
@keyframes fh-fade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes fh-flow{from{transform:translateX(-100%)}to{transform:translateX(300%)}}
.fh-rise{animation:fh-rise .6s cubic-bezier(.22,1,.36,1) both}
.fh-fade{animation:fh-fade .6s cubic-bezier(.22,1,.36,1) backwards}
.fh-flow{animation:fh-flow 1.1s cubic-bezier(.65,0,.2,1) both}
@media (prefers-reduced-motion:reduce){.fh-rise,.fh-fade,.fh-flow{animation:none}}
`;

export function DashboardHeader({
  onToggleMobileMenu,
  organizacionNombre,
  userName,
  userRole,
  enLinea = true,
  pendientesSync = 0,
  isSyncing = false,
  onSyncNow,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const [now, setNow] = useState<Date | null>(null);

  const path = pathname ?? '';
  const currentSection = SECTION_NAMES[path] || 'Panel';
  const sectionIndex = SECTION_KEYS.indexOf(path);

  // Reloj: se monta en cliente para evitar diferencias de hidratación
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const fecha = now
    ?.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
  const hh = now ? pad(now.getHours()) : '';
  const mm = now ? pad(now.getMinutes()) : '';

  return (
    <header className="sticky top-0 z-20 flex h-20 w-full items-center justify-between gap-6 border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/85 sm:px-6 lg:px-8">
      <style>{css}</style>

      {/* Destello azul que recorre el borde en cada cambio de ruta */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-px overflow-hidden">
        <span
          key={path}
          className="fh-flow absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent dark:via-blue-400"
        />
      </span>

      {/* 1. Lado Izquierdo: menú móvil, contador de sección y título */}
      <div className="flex min-w-0 items-center gap-5">
        <button
          onClick={onToggleMobileMenu}
          type="button"
          aria-label="Abrir menú de navegación"
          className="group flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-all duration-200 hover:bg-slate-100 active:scale-90 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
        </button>

        <nav aria-label="Sección actual" className="fh-fade min-w-0 leading-tight">
          <p className="max-w-[220px] truncate text-xs font-medium text-slate-400 dark:text-slate-500">
            {organizacionNombre}
          </p>
          {/* El título entra letra por letra al cambiar de sección */}
          <span
            key={currentSection}
            aria-label={currentSection}
            aria-current="page"
            className="mt-0.5 flex max-w-full overflow-hidden text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-[17px]"
          >
            {[...currentSection].map((ch, i) => (
              <span
                key={i}
                aria-hidden
                className="fh-rise inline-block whitespace-pre py-0.5 leading-6"
                style={{ animationDelay: `${i * 24}ms` }}
              >
                {ch}
              </span>
            ))}
          </span>
        </nav>
      </div>

      {/* 2. Lado Derecho: estado offline/sync, fecha, tema, usuario y cerrar sesión */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Indicador de conectividad y cola de sincronización */}
        <button
          type="button"
          onClick={onSyncNow}
          disabled={!enLinea || isSyncing}
          title={
            !enLinea
              ? `Modo sin conexión (${pendientesSync} pendiente${pendientesSync === 1 ? '' : 's'} de subir)`
              : pendientesSync > 0
                ? `Sincronizar ahora (${pendientesSync} pendiente${pendientesSync === 1 ? '' : 's'})`
                : 'Conectado y sincronizado con la nube'
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            !enLinea
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-300'
              : isSyncing || pendientesSync > 0
                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'
          }`}
        >
          {!enLinea ? (
            <>
              <WifiOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Offline</span>
              {pendientesSync > 0 && (
                <span className="rounded-full bg-amber-200/80 px-1.5 py-0.2 text-[10px] font-extrabold dark:bg-amber-900">
                  {pendientesSync}
                </span>
              )}
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Sincronizando</span>
            </>
          ) : pendientesSync > 0 ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>{pendientesSync} pend.</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">En línea</span>
            </>
          )}
        </button>

        {fecha && (
          <div className="fh-fade hidden items-center gap-3 font-mono text-xs text-slate-400 dark:text-slate-500 lg:flex">
            <span className="capitalize">{fecha}</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">
              {hh}
              <span className="animate-pulse">:</span>
              {mm}
            </span>
          </div>
        )}

        {/* Botón de alternar tema (modo claro / oscuro) */}
        <button
          onClick={toggleTheme}
          type="button"
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition-all duration-300 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {isDark ? (
            <Sun className="h-4.5 w-4.5 text-amber-500 transition-transform duration-300 group-hover:rotate-45" />
          ) : (
            <Moon className="h-4.5 w-4.5 text-slate-700 transition-transform duration-300 group-hover:-rotate-12 dark:text-slate-300" />
          )}
        </button>

        <div aria-hidden className="h-8 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Usuario: icono en un círculo */}
        <div className="group flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 shadow-xs transition-all duration-300 group-hover:border-blue-500/50 group-hover:bg-blue-50 group-hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:border-blue-400/50 dark:group-hover:bg-blue-950/40 dark:group-hover:text-blue-400"
          >
            <User className="h-5 w-5" />
          </div>

          <div className="hidden flex-col text-left leading-tight md:flex">
            <span className="max-w-[150px] truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {userName}
            </span>
            <span
              className={`text-[11px] text-slate-400 transition-all duration-300 ${EASE} group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400`}
            >
              {userRole}
            </span>
          </div>
        </div>

        {/* Botón de Cerrar Sesión único en el sistema */}
        <LogoutButton />
      </div>
    </header>
  );
};