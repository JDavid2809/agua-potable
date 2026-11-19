'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  subtitle?: string;
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
  const subtitleText = typeof subtitle === 'string' ? subtitle : undefined;
  const setSlotState = ctx?.setSlotState;

  useEffect(() => {
    if (!setSlotState) return;
    setSlotState({
      title,
      subtitle: subtitleText,
      status: statusText,
      statusTone,
      tone,
      progress,
    });
  }, [setSlotState, title, subtitleText, statusText, statusTone, tone, progress]);

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [pillRect, setPillRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoveredVal, setHoveredVal] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [threeTabsMaxW, setThreeTabsMaxW] = useState<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // El indicador principal sigue al tab en hover; al hacer clic se actualiza `value` y se mantiene ahí
  const targetValue = hoveredVal ?? value;

  const updateScrollArrows = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const { scrollLeft, scrollWidth, clientWidth } = sc;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  const measureTarget = useCallback(() => {
    // Si hay más de 3 pestañas, calcular el ancho exacto de las primeras 3 para mostrar máximo 3 a la vez
    if (items.length > 3) {
      const b0 = btnRefs.current[items[0].value];
      const b1 = btnRefs.current[items[1].value];
      const b2 = btnRefs.current[items[2].value];
      if (b0 && b1 && b2) {
        // 3 botones + 2 gaps (6px c/u) + padding horizontal (12px)
        const w = b0.offsetWidth + b1.offsetWidth + b2.offsetWidth + 24;
        setThreeTabsMaxW((prev) => (prev === w ? prev : w));
      }
    } else {
      setThreeTabsMaxW(null);
    }

    const el = btnRefs.current[targetValue];
    if (!el) {
      setPillRect(null);
      return;
    }
    const next = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    setPillRect((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next
    );

    updateScrollArrows();
  }, [items, targetValue, updateScrollArrows]);

  useEffect(() => {
    measureTarget();
    const id = requestAnimationFrame(() => {
      measureTarget();
      updateScrollArrows();
      setReady(true);
    });

    if (typeof ResizeObserver === 'undefined' || !scrollRef.current) {
      return () => cancelAnimationFrame(id);
    }

    const ro = new ResizeObserver(() => {
      measureTarget();
      updateScrollArrows();
    });
    ro.observe(scrollRef.current);
    Object.values(btnRefs.current).forEach((btn) => {
      if (btn) ro.observe(btn);
    });

    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [measureTarget, updateScrollArrows, items]);

  // Asegurar que la pestaña activa quede visible dentro de la ventana de 3 opciones al seleccionarla
  useEffect(() => {
    const el = btnRefs.current[value];
    if (!el || !scrollRef.current) return;
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [value]);

  const scrollByStep = useCallback((dir: -1 | 1) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const step = Math.max(160, Math.round(sc.clientWidth * 0.55));
    sc.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (sc.scrollWidth <= sc.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      sc.scrollLeft += e.deltaY;
    }
  }, []);

  const showArrows = items.length > 3 || canScrollLeft || canScrollRight;

  const content = (
    <div className={`inline-flex max-w-full items-center gap-1.5 ${className}`}>
      {/* Flecha lateral izquierda sin contenedor ni sombra */}
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          disabled={!canScrollLeft}
          aria-label="Ver opciones anteriores"
          title="Desplazar a la izquierda"
          className={`flex shrink-0 items-center justify-center p-1 transition-all duration-200 focus-visible:outline-none ${
            canScrollLeft
              ? 'cursor-pointer text-slate-600 hover:-translate-x-0.5 hover:text-slate-950 active:scale-95 dark:text-slate-300 dark:hover:text-white'
              : 'pointer-events-none opacity-20 text-slate-400 dark:text-slate-600'
          }`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Ventana deslizable horizontal (máximo 3 opciones visibles a la vez) */}
      <div
        ref={scrollRef}
        role="tablist"
        onScroll={updateScrollArrows}
        onWheel={handleWheel}
        onMouseLeave={() => setHoveredVal(null)}
        style={{
          maxWidth: threeTabsMaxW ? `${threeTabsMaxW}px` : undefined,
        }}
        className="relative inline-flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto scroll-smooth px-1.5 py-1 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Píldora principal deslizante sin sombra */}
        <span
          aria-hidden="true"
          style={{
            width: pillRect ? pillRect.width + 6 : 0,
            height: pillRect ? pillRect.height + 4 : 0,
            transform: `translate3d(${(pillRect?.left ?? 0) - 3}px, ${(pillRect?.top ?? 0) - 2}px, 0)`,
            transition: ready
              ? 'transform 360ms cubic-bezier(.22,1,.36,1), width 340ms cubic-bezier(.22,1,.36,1), height 340ms cubic-bezier(.22,1,.36,1), opacity 200ms ease'
              : 'none',
          }}
          className={`pointer-events-none absolute top-0 left-0 z-0 rounded-full bg-black dark:bg-[#2F6BFF] ${
            pillRect ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {items.map((item) => {
          const active = item.value === value;
          const highlighted = item.value === targetValue;
          return (
            <button
              key={item.value}
              ref={(el) => {
                btnRefs.current[item.value] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              onMouseEnter={() => setHoveredVal(item.value)}
              onFocus={() => setHoveredVal(item.value)}
              onBlur={() => setHoveredVal(null)}
              onClick={() => {
                setHoveredVal(item.value);
                onChange(item.value);
              }}
              className={`relative z-10 flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-[color,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 sm:px-4 ${
                highlighted
                  ? 'scale-[1.02] font-semibold text-white'
                  : 'font-medium text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon && (
                <span
                  aria-hidden="true"
                  className={`shrink-0 transition-colors duration-300 [&>svg]:h-[14px] [&>svg]:w-[14px] sm:[&>svg]:h-[15px] sm:[&>svg]:w-[15px] ${
                    highlighted ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none transition-colors duration-300 ${
                    highlighted
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

      {/* Flecha lateral derecha sin contenedor ni sombra */}
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          disabled={!canScrollRight}
          aria-label="Ver más opciones"
          title="Desplazar a la derecha"
          className={`flex shrink-0 items-center justify-center p-1 transition-all duration-200 focus-visible:outline-none ${
            canScrollRight
              ? 'cursor-pointer text-slate-600 hover:translate-x-0.5 hover:text-slate-950 active:scale-95 dark:text-slate-300 dark:hover:text-white'
              : 'pointer-events-none opacity-20 text-slate-400 dark:text-slate-600'
          }`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (ctx?.tabsNode) {
    return createPortal(content, ctx.tabsNode);
  }

  return content;
}
