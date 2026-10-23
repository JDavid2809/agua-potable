'use client';

import React, { useEffect, useState } from 'react';

/**
 * PageHeader — identidad en anillo
 *
 * Mismo lenguaje que Card y FilterBar: sin cajas, línea punteada inferior,
 * azul de acento y el círculo como forma. El icono de la página vive dentro
 * de un anillo que se dibuja una vez al montar (respeta prefers-reduced-motion).
 *
 * Uso:
 *   <PageHeader
 *     icon={<Droplet />}
 *     title="Padrón de tomas y ubicaciones"
 *     subtitle="Administración de conexiones, contratos, barrios y manzanas."
 *     status="2 manzanas activas"
 *     action={
 *       <PageTabs
 *         value={tab}
 *         onChange={setTab}
 *         items={[
 *           { value: 'tomas',   label: 'Tomas de agua',      icon: <Droplet /> },
 *           { value: 'barrios', label: 'Barrios y manzanas', icon: <MapPin /> },
 *         ]}
 *       />
 *     }
 *   />
 *
 * Sin `icon` no se dibuja el anillo y el encabezado funciona como antes.
 */

export type PageHeaderTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral';

const TONES: Record<
  PageHeaderTone,
  { ring: string; icon: string; dot: string; text: string }
> = {
  blue: {
    ring: 'stroke-[#2F6BFF] dark:stroke-[#6C97FF]',
    icon: 'text-[#2F6BFF] dark:text-[#6C97FF]',
    dot: 'bg-[#2F6BFF] dark:bg-[#6C97FF]',
    text: 'text-[#2F6BFF] dark:text-[#6C97FF]',
  },
  green: {
    ring: 'stroke-[#12935D] dark:stroke-[#3DDC97]',
    icon: 'text-[#12935D] dark:text-[#3DDC97]',
    dot: 'bg-[#12935D] dark:bg-[#3DDC97]',
    text: 'text-[#12935D] dark:text-[#3DDC97]',
  },
  amber: {
    ring: 'stroke-[#D98A06] dark:stroke-[#FBB43A]',
    icon: 'text-[#C77C02] dark:text-[#FBB43A]',
    dot: 'bg-[#D98A06] dark:bg-[#FBB43A]',
    text: 'text-[#C77C02] dark:text-[#FBB43A]',
  },
  red: {
    ring: 'stroke-[#E11D48] dark:stroke-[#FB7185]',
    icon: 'text-[#E11D48] dark:text-[#FB7185]',
    dot: 'bg-[#E11D48] dark:bg-[#FB7185]',
    text: 'text-[#E11D48] dark:text-[#FB7185]',
  },
  neutral: {
    ring: 'stroke-slate-500 dark:stroke-slate-400',
    icon: 'text-slate-500 dark:text-slate-400',
    dot: 'bg-slate-500 dark:bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
  },
};

const LINE = 'border-slate-300 dark:border-[#26345C]';

/* ───────────────────────────── Ring ───────────────────────────── */

const PX = 64;
const STROKE = 4;
const R = (PX - STROKE) / 2 - 2;
const C = 2 * Math.PI * R;

function HeaderRing({
  icon,
  tone,
  progress,
}: {
  icon: React.ReactNode;
  tone: PageHeaderTone;
  progress: number;
}) {
  const ratio = Math.min(1, Math.max(0, progress));

  // Se dibuja una sola vez al montar
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="relative hidden shrink-0 sm:block"
      style={{ width: PX, height: PX }}
    >
      <svg width={PX} height={PX} viewBox={`0 0 ${PX} ${PX}`} aria-hidden="true">
        <circle
          cx={PX / 2}
          cy={PX / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-slate-200 dark:stroke-[#1F2B4D]"
        />
        <circle
          cx={PX / 2}
          cy={PX / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - (drawn ? ratio : 0))}
          strokeOpacity={ratio === 0 ? 0 : 1}
          transform={`rotate(-90 ${PX / 2} ${PX / 2})`}
          className={`transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none ${TONES[tone].ring}`}
        />
      </svg>
      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center [&>svg]:h-6 [&>svg]:w-6 ${TONES[tone].icon}`}
      >
        {icon}
      </span>
    </div>
  );
}

/* ─────────────────────────── PageHeader ─────────────────────────── */

export interface PageHeaderProps {
  /** Título principal de la página (h1) */
  title: React.ReactNode;
  /** Subtítulo o descripción explicativa */
  subtitle?: React.ReactNode;
  /** Elemento opcional junto al título (badge, etiqueta, status) */
  badge?: React.ReactNode;
  /** Elemento o acciones a la derecha (botones, PageTabs, etc.) */
  action?: React.ReactNode;
  /** Icono de la página; se dibuja dentro de un anillo a la izquierda */
  icon?: React.ReactNode;
  /** Proporción de 0 a 1 que llena el anillo. Por defecto, completo */
  progress?: number;
  /** Color del anillo y del icono */
  tone?: PageHeaderTone;
  /** Línea de estado bajo el subtítulo, con un punto de color */
  status?: React.ReactNode;
  /** Color del punto y del texto de `status` */
  statusTone?: PageHeaderTone;
  /** Línea inferior: 'dashed' por defecto; false para quitarla */
  divider?: boolean | 'dashed' | 'solid';
  /** Clases adicionales para el contenedor principal */
  className?: string;
  /** Contenido libre adicional bajo el encabezado */
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  action,
  icon,
  progress = 1,
  tone = 'blue',
  status,
  statusTone = 'green',
  divider = 'dashed',
  className = '',
  children,
}: PageHeaderProps) {
  const dividerClass =
    divider === true || divider === 'dashed'
      ? `border-b border-dashed pb-5 ${LINE}`
      : divider === 'solid'
        ? `border-b pb-5 ${LINE}`
        : '';

  const s = TONES[statusTone];

  return (
    <header className={`w-full ${dividerClass} ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {icon && <HeaderRing icon={icon} tone={tone} progress={progress} />}

          <div className="min-w-0">
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
                  className={`h-1.5 w-1.5 rounded-full ${s.dot}`}
                />
                {status}
              </p>
            )}
          </div>
        </div>

        {action && (
          <div className="flex shrink-0 items-center gap-2.5">{action}</div>
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
}

/** Selector de secciones: texto con icono, separado por líneas punteadas verticales. */
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
  return (
    <div role="tablist" className={`flex items-center ${className}`}>
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <React.Fragment key={item.value}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`h-5 border-l border-dashed ${LINE}`}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 ${
                active
                  ? 'text-[#2F6BFF] dark:text-[#6C97FF]'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item.icon && (
                <span aria-hidden="true" className="[&>svg]:h-[15px] [&>svg]:w-[15px]">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}