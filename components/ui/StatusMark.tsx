import React from 'react';

export type StatusTone = 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
export type StatusMode = 'rail' | 'inline';

const TONE_INK: Record<StatusTone, string> = {
  brand: 'text-[#2F6BFF] dark:text-[#6C97FF]',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  rose: 'text-rose-700 dark:text-rose-400',
  violet: 'text-violet-700 dark:text-violet-400',
  slate: 'text-slate-500 dark:text-slate-400',
};

const ICON_INK: Record<StatusTone, string> = {
  brand: 'text-[#2F6BFF] dark:text-[#6C97FF]',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  violet: 'text-violet-600 dark:text-violet-400',
  slate: 'text-slate-400 dark:text-slate-500',
};

const DOT_COLOR: Record<StatusTone, string> = {
  brand: 'bg-[#2F6BFF] dark:bg-[#6C97FF]',
  emerald: 'bg-emerald-500 dark:bg-emerald-400',
  amber: 'bg-amber-500 dark:bg-amber-400',
  rose: 'bg-rose-500 dark:bg-rose-400',
  violet: 'bg-violet-500 dark:bg-violet-400',
  slate: 'bg-slate-400 dark:bg-slate-500',
};

export interface StatusMarkProps {
  tone?: StatusTone;
  mode?: StatusMode;
  pulse?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/**
 * Marca tipográfica limpia sin contenedores ni cajas de relleno.
 * Usa exclusivamente color, peso tipográfico, ícono o punto de estado directo sobre la superficie.
 */
export function StatusMark({
  tone = 'slate',
  mode = 'rail',
  pulse = false,
  icon,
  children,
  onClick,
  title,
  className = '',
}: StatusMarkProps) {
  if (mode === 'inline') {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight whitespace-nowrap ${TONE_INK[tone]} ${className}`}
      >
        {icon ? (
          <span className={`shrink-0 flex items-center ${ICON_INK[tone]}`}>{icon}</span>
        ) : (
          <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
            {pulse && (
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${DOT_COLOR[tone]}`}
              />
            )}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOT_COLOR[tone]}`} />
          </span>
        )}
        <span>{children}</span>
      </span>
    );
  }

  const textTone =
    tone === 'slate'
      ? 'text-slate-600 dark:text-slate-300'
      : tone === 'rose' || tone === 'amber'
        ? TONE_INK[tone]
        : 'text-slate-800 dark:text-slate-100';

  const content = (
    <>
      {icon && <span className={`shrink-0 flex items-center ${ICON_INK[tone]}`}>{icon}</span>}
      <span className="inline-flex items-center gap-1.5 tabular-nums">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight whitespace-nowrap cursor-pointer transition-colors ${textTone} underline decoration-slate-300/80 dark:decoration-slate-600/80 underline-offset-4 hover:text-[#2F6BFF] dark:hover:text-[#6C97FF] hover:decoration-current ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight whitespace-nowrap ${textTone} ${className}`}
    >
      {content}
    </span>
  );
}
