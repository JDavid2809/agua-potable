'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  Moon,
  RefreshCw,
  WifiOff,
  AlertTriangle,
  Droplets,
  ChevronRight,
} from 'lucide-react';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { PwaInstallButton } from '@/components/pwa/PwaManager';
import { useTheme } from '@/hooks/use-theme';
import { usePageHeaderSlot } from '@/components/ui/PageHeader';

interface DashboardHeaderProps {
  onToggleMobileMenu: () => void;
  organizacionNombre: string;
  userName: string;
  userRole: string;
  enLinea?: boolean;
  pendientesSync?: number;
  isSyncing?: boolean;
  onSyncNow?: () => void;
  /** Registros que superaron el máximo de reintentos y siguen sin subirse */
  conErrores?: number;
  onRetryErrors?: () => void;
}

interface SectionMeta {
  href: string;
  label: string;
  category: 'Operación' | 'Administración';
  defaultStatus: string;
}

const SECTIONS: SectionMeta[] = [
  {
    href: '/dashboard',
    label: 'Panel General',
    category: 'Operación',
    defaultStatus: 'Sistema Activo',
  },
  {
    href: '/tomas',
    label: 'Tomas y Ubicaciones',
    category: 'Operación',
    defaultStatus: 'Padrón geográfico activo',
  },
  {
    href: '/personas',
    label: 'Contratos y Personas',
    category: 'Operación',
    defaultStatus: 'Padrón de titulares activo',
  },
  {
    href: '/cobros',
    label: 'Cobros y Caja',
    category: 'Operación',
    defaultStatus: 'Caja en operación',
  },
  {
    href: '/cooperaciones',
    label: 'Cooperaciones',
    category: 'Operación',
    defaultStatus: 'Obras comunitarias',
  },
  {
    href: '/reportes',
    label: 'Reportes e Ingresos',
    category: 'Operación',
    defaultStatus: 'Consulta financiera activa',
  },
  {
    href: '/usuarios',
    label: 'Usuarios y Permisos',
    category: 'Administración',
    defaultStatus: 'Control de acceso activo',
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    category: 'Administración',
    defaultStatus: 'Parámetros del comité',
  },
];

function obtenerIniciales(nombre: string): string {
  const limpio = (nombre || '').trim();
  if (!limpio) return 'US';
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
  }
  return limpio.slice(0, 2).toUpperCase();
}

export function DashboardHeader({
  onToggleMobileMenu,
  organizacionNombre,
  userName,
  userRole,
  enLinea = true,
  pendientesSync = 0,
  isSyncing = false,
  onSyncNow,
  conErrores = 0,
  onRetryErrors,
}: DashboardHeaderProps) {
  void onToggleMobileMenu;
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const pageHeaderCtx = usePageHeaderSlot();
  const slotState = pageHeaderCtx?.slotState;

  const matchedIndex = SECTIONS.findIndex(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`)
  );
  const activeSection =
    matchedIndex >= 0 ? SECTIONS[matchedIndex] : SECTIONS[0];

  const displayTitle = activeSection.label;
  // Título específico de la vista (p. ej. nombre de una obra) si difiere del nombre de la sección
  const detalleTitulo =
    slotState?.title && slotState.title !== displayTitle ? slotState.title : null;
  const statusLabel = !enLinea ? 'Modo sin conexión' : slotState?.status || null;
  const statusTone = !enLinea
    ? 'amber'
    : isSyncing && pendientesSync > 0
      ? 'blue'
      : slotState?.statusTone || 'green';
  const statusDotClass =
    statusTone === 'amber'
      ? 'bg-amber-500'
      : statusTone === 'blue'
        ? 'bg-[#2F6BFF]'
        : statusTone === 'red'
          ? 'bg-red-500'
          : 'bg-emerald-500';
  const statusTextClass =
    statusTone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : statusTone === 'blue'
        ? 'text-[#2F6BFF] dark:text-[#6C97FF]'
        : statusTone === 'red'
          ? 'text-red-600 dark:text-red-400'
          : 'text-emerald-600 dark:text-emerald-400';

  const iniciales = obtenerIniciales(userName);

  const dotColor =
    statusTone === 'amber'
      ? 'bg-amber-500'
      : statusTone === 'blue'
        ? 'bg-[#2F6BFF]'
        : 'bg-emerald-500';

  return (
    <header className="mx-auto w-full max-w-7xl px-4 pt-5 pb-5 sm:px-6 sm:pb-6 lg:px-8">
      <style>{`
        @keyframes fh-char {
          from { transform: translateY(115%); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
        .fh-rise {
          display: inline-block;
          animation: fh-char 560ms cubic-bezier(.22,1,.36,1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .fh-rise { animation: none; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════
          FILA 1: Identidad de Marca + Opciones de la Sección Activa + Controles
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap lg:gap-4">
        {/* Izquierda: Identidad Fluvib + Comité */}
        <Link
          href="/dashboard"
          className="group flex shrink-0 items-center gap-3 focus:outline-none"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-black text-white shadow-sm transition-transform duration-200 group-hover:scale-105 dark:bg-[#0B1224] dark:shadow-black/40">
            <Droplets className="h-5 w-5 text-white" strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <span className="block text-[18px] font-extrabold leading-none tracking-tight text-slate-900 dark:text-white">
              Fluvib
            </span>
            <span className="mt-1 block max-w-[160px] truncate text-[11.5px] font-medium leading-none text-slate-400 dark:text-slate-500 sm:max-w-[210px]">
              {organizacionNombre}
            </span>
          </div>
        </Link>

        {/* Centro: Slot de sub-opciones (PageTabs) de la sección actual; vacío si la sección no tiene opciones */}
        <div
          ref={pageHeaderCtx?.setTabsNode ?? undefined}
          className="order-3 flex w-full min-w-0 items-center justify-center empty:hidden lg:order-none lg:w-auto lg:flex-1"
        />

        {/* Derecha: Botones circulares flotantes (Sync solo cuando hay pendientes o sin red, PWA, Tema, Iniciales Usuario, Salir) */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {(!enLinea || pendientesSync > 0 || conErrores > 0) && (
            <button
              type="button"
              onClick={
                enLinea && !isSyncing
                  ? conErrores > 0 && pendientesSync === 0
                    ? onRetryErrors
                    : onSyncNow
                  : undefined
              }
              disabled={!enLinea || isSyncing}
              title={
                !enLinea
                  ? `Modo sin conexión (${pendientesSync} pendientes)`
                  : isSyncing
                    ? `Sincronizando ${pendientesSync} pendiente(s)...`
                    : conErrores > 0 && pendientesSync === 0
                      ? `${conErrores} registro(s) no se pudieron subir. Clic para reintentar`
                      : `Sincronizar ahora (${pendientesSync} pendientes)`
              }
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.08)] transition-colors hover:text-slate-950 disabled:cursor-default dark:bg-[#0B1224] dark:text-slate-200 dark:shadow-black/35"
            >
              {!enLinea ? (
                <WifiOff className="h-3.5 w-3.5 text-amber-500" />
              ) : conErrores > 0 && pendientesSync === 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <RefreshCw
                  className={`h-3.5 w-3.5 text-[#2F6BFF] ${isSyncing ? 'animate-spin' : ''}`}
                />
              )}
              {pendientesSync > 0 && (
                <span className="tabular-nums font-bold text-[#2F6BFF] dark:text-[#6C97FF]">
                  {pendientesSync}
                </span>
              )}
              {conErrores > 0 && (
                <span className="tabular-nums font-bold text-red-600 dark:text-red-400">
                  {conErrores}
                </span>
              )}
            </button>
          )}

          <PwaInstallButton />

          {/* Botón circular de Tema */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.08)] transition-transform duration-200 hover:scale-105 active:scale-95 dark:bg-[#0B1224] dark:text-slate-200 dark:shadow-black/35"
          >
            {isDark ? (
              <Sun className="h-[18px] w-[18px] text-amber-400 transition-transform duration-500 ease-out group-hover:rotate-45" />
            ) : (
              <Moon className="h-[18px] w-[18px] text-slate-700 transition-transform duration-500 ease-out group-hover:-rotate-12" />
            )}
          </button>

          {/* Círculo de Iniciales del Usuario (estilo NH en la referencia) */}
          <div
            title={`${userName} · ${userRole}`}
            className="relative flex h-10 w-10 select-none items-center justify-center rounded-full bg-emerald-100/90 text-xs font-extrabold tracking-tight text-emerald-800 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.08)] dark:bg-emerald-500/20 dark:text-emerald-300 dark:shadow-black/35"
          >
            <span>{iniciales}</span>
            <span
              aria-hidden="true"
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-50 dark:ring-slate-950 ${dotColor}`}
            />
          </div>

          <LogoutButton />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          FILA 2: Breadcrumb + Título con Transición (Izquierda) y Botones de la Sección con Tamaño Uniforme (Derecha)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {/* Izquierda: Breadcrumb + Nombre de Sección */}
        <div className="min-w-0">
          {/* Breadcrumb (Fluvib › Categoría › Sección Activa) */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-slate-400 dark:text-slate-500">Fluvib</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
            <span className="text-slate-400 dark:text-slate-500">
              {activeSection.category}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
            <span
              className={`truncate ${
                detalleTitulo
                  ? 'text-slate-400 dark:text-slate-500'
                  : 'font-semibold text-[#2F6BFF] dark:text-[#6C97FF]'
              }`}
            >
              {displayTitle}
            </span>
            {detalleTitulo && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
                <span className="truncate font-semibold text-[#2F6BFF] dark:text-[#6C97FF]">
                  {detalleTitulo}
                </span>
              </>
            )}
          </div>

          {/* Título Grande de la Sección */}
          <div className="mt-1.5 flex items-center">
            <h1
              key={activeSection.href}
              aria-label={displayTitle}
              className="inline-flex overflow-hidden text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[32px] sm:leading-none"
            >
              {[...displayTitle].map((ch, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="fh-rise"
                  style={{ animationDelay: `${i * 22}ms` }}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>
          </div>

          {/* Estado de la vista (y descripción como tooltip) */}
          {statusLabel && (
            <p
              title={slotState?.subtitle}
              className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${statusTextClass}`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass}`}
              />
              <span className="truncate">{statusLabel}</span>
            </p>
          )}
        </div>

        {/* Derecha: Todos los botones de acción de la sección activa, todos con el mismo tamaño */}
        <div
          ref={pageHeaderCtx?.setActionNode ?? undefined}
          className="flex flex-wrap items-center gap-2.5 empty:hidden lg:justify-end [&_.flex]:gap-2.5 [&_button]:h-10 [&_button]:w-full [&_button]:px-4 [&_button]:py-0 [&_button]:text-[13px] [&_button]:whitespace-nowrap sm:[&_button]:w-[192px]"
        />
      </div>
    </header>
  );
}
