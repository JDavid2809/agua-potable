'use client';

import React, { useEffect, useState } from 'react';

export type CardTone =
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'purple'
  | 'cyan'
  | 'neutral';
export type CardSize = 'sm' | 'md' | 'lg';

const TONES: Record<CardTone, { ring: string; icon: string }> = {
  blue: {
    ring: 'stroke-[#2F6BFF] dark:stroke-[#6C97FF]',
    icon: 'text-[#2F6BFF] dark:text-[#6C97FF]',
  },
  green: {
    ring: 'stroke-[#12935D] dark:stroke-[#3DDC97]',
    icon: 'text-[#12935D] dark:text-[#3DDC97]',
  },
  amber: {
    ring: 'stroke-[#D98A06] dark:stroke-[#FBB43A]',
    icon: 'text-[#C77C02] dark:text-[#FBB43A]',
  },
  red: {
    ring: 'stroke-[#E11D48] dark:stroke-[#FB7185]',
    icon: 'text-[#E11D48] dark:text-[#FB7185]',
  },
  purple: {
    ring: 'stroke-[#9333EA] dark:stroke-[#C084FC]',
    icon: 'text-[#9333EA] dark:text-[#C084FC]',
  },
  cyan: {
    ring: 'stroke-[#0284C7] dark:stroke-[#38BDF8]',
    icon: 'text-[#0284C7] dark:text-[#38BDF8]',
  },
  neutral: {
    ring: 'stroke-slate-500 dark:stroke-slate-400',
    icon: 'text-slate-500 dark:text-slate-400',
  },
};

const SIZES: Record<CardSize, { px: number; stroke: number; text: string }> = {
  sm: { px: 64, stroke: 4, text: 'text-xl' },
  md: { px: 96, stroke: 5, text: 'text-3xl' },
  lg: { px: 128, stroke: 6, text: 'text-4xl' },
};

const DASH = 'border-slate-300 dark:border-[#26345C]';

/* ───────────────────────────── Card ───────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Contenido libre. Se muestra bajo el medidor, o solo si no hay `value`. */
  children?: React.ReactNode;
  /** Cifra al centro del anillo. Si se omite, Card es un contenedor limpio. */
  value?: React.ReactNode;
  /** Etiqueta bajo el anillo. */
  label?: string;
  /** Icono junto a la etiqueta. */
  icon?: React.ReactNode;
  /** Línea de apoyo bajo la etiqueta. */
  hint?: string;
  /** Texto pequeño junto a la cifra, p. ej. "%". */
  unit?: string;
  /** Proporción de 0 a 1 que llena el anillo. Por defecto, completo. */
  progress?: number;
  tone?: CardTone;
  size?: CardSize;
}

export function Card({
  children,
  className = '',
  value,
  label,
  icon,
  hint,
  unit,
  progress = 1,
  tone = 'blue',
  size = 'md',
  ...props
}: CardProps) {
  const t = TONES[tone];
  const { px, stroke, text } = SIZES[size];
  const r = (px - stroke) / 2 - 3;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, progress));

  // El anillo se dibuja una sola vez al montar
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasGauge = value !== undefined && value !== null;

  if (!hasGauge) {
    return (
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm text-slate-900 dark:text-slate-100 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center text-center text-slate-900 dark:text-slate-100 ${className}`}
      {...props}
    >
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          aria-hidden="true"
        >
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-slate-200 dark:stroke-[#1F2B4D]"
          />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (drawn ? ratio : 0))}
            strokeOpacity={ratio === 0 ? 0 : 1}
            transform={`rotate(-90 ${px / 2} ${px / 2})`}
            className={`transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none ${t.ring}`}
          />
        </svg>
        <div
          className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums tracking-tight text-slate-900 dark:text-white ${text}`}
        >
          {unit ? (
            <span className="flex items-baseline">
              {value}
              <span className="ml-0.5 text-[0.4em] font-semibold text-slate-500 dark:text-slate-400">
                {unit}
              </span>
            </span>
          ) : (
            value
          )}
        </div>
      </div>

      {label && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
          {icon && (
            <span
              aria-hidden="true"
              className={`[&>svg]:h-[15px] [&>svg]:w-[15px] ${t.icon}`}
            >
              {icon}
            </span>
          )}
          {label}
        </p>
      )}
      {hint && (
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
      {children && <div className="mt-4 w-full">{children}</div>}
    </div>
  );
}

/* ─────────────────────────── CardGroup ─────────────────────────── */

/** Fila de Card separadas por líneas punteadas (horizontales en móvil). */
export function CardGroup({
  children,
  className = '',
  divider = 'dashed',
}: {
  children: React.ReactNode;
  className?: string;
  divider?: 'dashed' | 'solid' | 'none';
}) {
  const items = React.Children.toArray(children);
  const style = divider === 'dashed' ? 'border-dashed' : 'border-solid';

  return (
    <div
      className={`grid grid-cols-1 sm:grid-flow-col sm:auto-cols-fr ${className}`}
    >
      {items.map((child, i) => (
        <div
          key={i}
          className={`px-4 py-6 ${
            i > 0 && divider !== 'none'
              ? `border-t ${style} sm:border-l sm:border-t-0 ${DASH}`
              : ''
          }`}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── CardHeader ─────────────────────────── */

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 max-w-[52ch] text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Alias por compatibilidad: CardStat ahora es simplemente Card. */
export const CardStat = Card;