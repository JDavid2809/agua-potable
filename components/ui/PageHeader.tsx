'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * PageHeader — cabecera de sección integrada con DashboardHeader.
 *
 * Cuando se renderiza dentro del DashboardShell (envuelto en PageHeaderProvider),
 * sincroniza el estado/progreso con la cápsula derecha del header superior y
 * proyecta (portal) sus pestañas (`PageTabs`) o botones (`action`) justo al lado
 * del título animado de la sección, logrando la estructura unificada de dos niveles.
 */

export type PageHeaderTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral';

const TONES: Record<
  PageHeaderTone,
  {
    stroke: string;
    track: string;
    icon: string;
    dot: string;
    text: string;
  }
> = {
  blue: {
    stroke: 'text-[#2F6BFF] dark:text-[#4F82FF]',
    track: 'text-slate-200/80 dark:text-[#1D2B4F]',
    icon: 'text-[#2F6BFF] dark:text-[#6C97FF]',
    dot: 'bg-[#2F6BFF]',
    text: 'text-[#2F6BFF] dark:text-[#6C97FF]',
  },
  green: {
    stroke: 'text-emerald-500 dark:text-emerald-400',
    track: 'text-slate-200/80 dark:text-[#1D2B4F]',
    icon: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    stroke: 'text-amber-500 dark:text-amber-400',
    track: 'text-slate-200/80 dark:text-[#1D2B4F]',
    icon: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  red: {
    stroke: 'text-red-500 dark:text-red-400',
    track: 'text-slate-200/80 dark:text-[#1D2B4F]',
    icon: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  neutral: {
    stroke: 'text-slate-400 dark:text-slate-500',
    track: 'text-slate-200/80 dark:text-[#1D2B4F]',
    icon: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-400',
  },
};

const LINE = 'border-slate-300 dark:border-[#26345C]';

/* ─────────────────── Contexto de Header Unificado ─────────────────── */

export interface PageHeaderSlotState {
  title?: string;
  status?: string;
  statusTone?: PageHeaderTone;
  tone?: PageHeaderTone;
  progress?: number;
}

interface PageHeaderContextValue {
  slotState: PageHeaderSlotState | null;
  setSlotState: React.Dispatch<React.SetStateAction<PageHeaderSlotState | null>>;
  tabsNode: HTMLDivElement | null;
  setTabsNode: (node: HTMLDivElement | null) => void;
  actionNode: HTMLDivElement | null;
  setActionNode: (node: HTMLDivElement | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [slotState, setSlotState] = useState<PageHeaderSlotState | null>(null);
  const [tabsNode, setTabsNode] = useState<HTMLDivElement | null>(null);
  const [actionNode, setActionNode] = useState<HTMLDivElement | null>(null);

  return (
    <PageHeaderContext.Provider
      value={{
        slotState,
        setSlotState,
        tabsNode,
        setTabsNode,
        actionNode,
        setActionNode,
      }}
    >
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderSlot() {
  return useContext(PageHeaderContext);
}

/* ─────────────────────────── Anillo SVG (Fallback) ─────────────────────────── */

function HeaderRing({
  icon,
  tone,
  progress = 78,
}: {
  icon: React.ReactNode;
  tone: PageHeaderTone;
  progress?: number;
}) {
  const t = TONES[tone];
  const size = 64;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(6, Math.min(100, progress));

  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const offset = c - (drawn / 100) * c;

  return (
    <div className="group relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={t.track}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)',
          }}
          className={t.stroke}
        />
      </svg>
      <span
        className={`relative flex items-center justify-center transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:stroke-[1.9] ${t.icon}`}
      >
        {icon}
      </span>
    </div>
  );
}

/* ─────────────────────────── PageHeader ─────────────────────────── */

export interface PageHeaderProps {
  /** Título principal de la página */
  title: string;
  /** Descripción corta bajo el título */
  subtitle?: React.ReactNode;
  /** Icono dentro del anillo */
  icon?: React.ReactNode;
  /** Tono del anillo e icono */
  tone?: PageHeaderTone;
  /** Porcentaje de cierre del anillo (0–100). Default 78. */
  progress?: number;
  /** Línea de estado con punto de color */
  status?: React.ReactNode;
  statusTone?: PageHeaderTone;
  /** Elemento compacto junto al título */
  badge?: React.ReactNode;
  /** Controles a la derecha (botones, PageTabs, etc.) */
  action?: React.ReactNode;
  /** Línea divisoria inferior */
  divider?: boolean | 'dashed' | 'solid';
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  tone = 'blue',
  progress,
  status,
  statusTone = 'green',
  badge,
  action,
  divider = 'dashed',
  className = '',
  children,
}: PageHeaderProps) {
  const ctx = usePageHeaderSlot();
  const statusText = typeof status === 'string' ? status : undefined;
  const setSlotState = ctx?.setSlotState;

  useEffect(() => {
    if (!setSlotState) return;
    setSlotState({
      title,
      status: statusText,
      statusTone,
      tone,
      progress,
    });
  }, [setSlotState, title, statusText, statusTone, tone, progress]);

  useEffect(() => {
    if (!setSlotState) return;
    return () => {
      setSlotState(null);
    };
  }, [setSlotState]);

  // Si estamos dentro del DashboardShell unificado, proyectamos `action` al header superior
  if (ctx) {
    return (
      <>
        {action && ctx.actionNode ? createPortal(action, ctx.actionNode) : null}
        {children ? <div className="mb-4">{children}</div> : null}
      </>
    );
  }

  // Fallback standalone (fuera del DashboardShell)
  const dividerClass =
    divider === true || divider === 'dashed'
      ? `border-b border-dashed pb-5 ${LINE}`
      : divider === 'solid'
        ? `border-b pb-5 ${LINE}`
        : '';

  const s = TONES[statusTone];

  return (
    <header className={`w-full max-w-full overflow-hidden ${dividerClass} ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {icon && <HeaderRing icon={icon} tone={tone} progress={progress} />}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-[1.75rem] sm:leading-tight">
                {title}
              </h1>
              {badge && <div className="shrink-0">{badge}</div>}
            </div>

            {subtitle && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}

            {status && (
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${s.text}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`}
                />
                <span className="truncate">{status}</span>
              </p>
            )}
          </div>
        </div>

        {action && (
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2.5 lg:w-auto lg:shrink-0">
            {action}
          </div>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/* ───────────────────────────── PageTabs ───────────────────────────── */

export interface PageTabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

/**
 * Selector de sub-secciones en cápsula flotante (estilo `[📦 Inventory | 🛒 Purchasing | 🚚 Logistics]`).
 */
export function PageTabs({
  items,
  value,
  onChange,
  className = '',
}: {
  items: PageTabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ctx = usePageHeaderSlot();

  const content = (
    <div
      role="tablist"
      className={`inline-flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:flex-nowrap ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 sm:flex-initial ${
              active
                ? 'bg-black px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm dark:bg-[#2F6BFF] dark:text-white'
                : 'px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {item.icon && (
              <span
                aria-hidden="true"
                className={`shrink-0 [&>svg]:h-[14px] [&>svg]:w-[14px] sm:[&>svg]:h-[15px] sm:[&>svg]:w-[15px] ${
                  active ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {item.icon}
              </span>
            )}
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (ctx?.tabsNode) {
    return createPortal(content, ctx.tabsNode);
  }

  return content;
}
