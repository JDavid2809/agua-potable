'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Droplets,
  Users,
  CreditCard,
  Gauge,
  BarChart3,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  User,
  X,
  HeartHandshake,
  ChevronRight,
} from 'lucide-react';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { tieneAlgunPermisoUsuario } from '@/lib/auth/permisos';
import type { PermisoSistema } from '@/types/database';

/**
 * Sidebar
 *
 * - Escritorio (md+): píldora vertical centrada verticalmente a la izquierda,
 *   dividida por secciones (Operación / Administración), sin borde azul en el
 *   indicador activo y con espaciado amplio al expandir en hover.
 * - Móvil: píldora horizontal flotante anclada abajo + hoja de menú completo.
 */

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  organizacionNombre: string;
  userName?: string;
  userRole?: string;
  esAdmin: boolean;
  permisos?: string[];
}

interface NavItem {
  href: string;
  label: string;
  /** Etiqueta corta para la barra de tabs móvil */
  short: string;
  icon: React.ElementType;
  permisosRequeridos?: PermisoSistema[];
}

const operacionItems: NavItem[] = [
  { href: '/dashboard', label: 'Panel Principal', short: 'Panel', icon: LayoutDashboard },
  {
    href: '/tomas',
    label: 'Padrón de Tomas',
    short: 'Tomas',
    icon: Droplets,
    permisosRequeridos: ['tomas.ver', 'tomas.gestionar'],
  },
  {
    href: '/personas',
    label: 'Contratos y Personas',
    short: 'Personas',
    icon: Users,
    permisosRequeridos: ['personas.ver', 'personas.gestionar'],
  },
  {
    href: '/cobros',
    label: 'Caja y Cobros',
    short: 'Cobros',
    icon: CreditCard,
    permisosRequeridos: ['cobros.crear', 'cobros.anular', 'reportes.ver'],
  },
  {
    href: '/cooperaciones',
    label: 'Cooperaciones y Obras',
    short: 'Obras',
    icon: HeartHandshake,
    permisosRequeridos: [
      'cooperaciones.ver',
      'cooperaciones.cobrar',
      'cooperaciones.gestionar',
      'cobros.crear',
    ],
  },
  {
    href: '/reportes',
    label: 'Reportes e Ingresos',
    short: 'Reportes',
    icon: BarChart3,
    permisosRequeridos: ['reportes.ver', 'cobros.crear'],
  },
];

const medicionItems: NavItem[] = [
  { href: '/lecturas', label: 'Lecturas de Medidor', short: 'Lecturas', icon: Gauge },
  { href: '/reportes', label: 'Reportes e Ingresos', short: 'Reportes', icon: BarChart3 },
];
void medicionItems;

const adminItems: NavItem[] = [
  {
    href: '/usuarios',
    label: 'Usuarios y Roles',
    short: 'Usuarios',
    icon: ShieldCheck,
    permisosRequeridos: ['usuarios.gestionar'],
  },
  {
    href: '/configuracion',
    label: 'Tarifas y Ajustes',
    short: 'Tarifas',
    icon: SlidersHorizontal,
    permisosRequeridos: ['tarifas.gestionar', 'organizacion.editar'],
  },
];

const isActive = (pathname: string | null, href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || (href !== '/' && !!pathname?.startsWith(href));
};

function getGroups(esAdmin: boolean, permisos: string[] = []) {
  return [
    { title: 'Operación', items: operacionItems },
    { title: 'Administración', items: adminItems },
  ]
    .map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        tieneAlgunPermisoUsuario(esAdmin, permisos, item.permisosRequeridos || [])
      ),
    }))
    .filter((g) => g.items.length > 0);
}

const EASE = 'ease-[cubic-bezier(.65,0,.2,1)]';
const PILL_MS = 'duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]';

const ACCENT_TEXT = 'text-[#2F6BFF] dark:text-[#6C97FF]';
const LINE = 'border-slate-200/90 dark:border-slate-800';

// Máximo de pestañas en la barra móvil (si hay más, la última es "Ajustes")
const MAX_TABS = 5;

const css = `
@keyframes fv-fade{from{opacity:0}to{opacity:1}}
@keyframes fv-fade-out{to{opacity:0}}
@keyframes fv-rise{from{transform:translateY(100%)}to{transform:none}}
@keyframes fv-sheet{from{transform:translateY(100%)}to{transform:none}}
@keyframes fv-sheet-out{to{transform:translateY(100%)}}
.fv-fade{animation:fv-fade .25s ease-out both}
.fv-fade-out{animation:fv-fade-out .2s ease-in both}
.fv-rise{animation:fv-rise .5s cubic-bezier(.22,1,.36,1) both}
.fv-sheet{animation:fv-sheet .38s cubic-bezier(.22,1,.36,1) both}
.fv-sheet-out{animation:fv-sheet-out .2s ease-in both}
@media (max-width:767px){main::after{content:"";display:block;height:calc(5.5rem + env(safe-area-inset-bottom,0px))}}
@media (prefers-reduced-motion:reduce){.fv-fade,.fv-fade-out,.fv-rise,.fv-sheet,.fv-sheet-out{animation:none}}
`;

/* ─────────────────── Píldora Vertical (Escritorio md+) ─────────────────── */

function DesktopVerticalPill({
  groups,
  activeHref,
}: {
  groups: ReturnType<typeof getGroups>;
  activeHref: string | null;
}) {
  const navRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const measureRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const [pos, setPos] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Estado de la extensión líquida que emerge del propio sidebar al pasar el cursor
  const [hoverData, setHoverData] = useState<{
    key: string;
    label: string;
    top: number;
    width: number;
    isActive: boolean;
  } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [glideVertical, setGlideVertical] = useState(false);

  const handleRowEnter = useCallback(
    (key: string, label: string, active: boolean) => {
      if (expanded) return;
      const navEl = navRef.current;
      const rowEl = rowRefs.current[key];
      if (!navEl || !rowEl) return;

      const navRect = navEl.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      // Centrar la cápsula de 52px exactamente en el centro vertical de la opción
      const top = Math.round(
        rowRect.top - navRect.top + rowRect.height / 2 - 26
      );

      const measureEl = measureRefs.current[key];
      const textWidth = measureEl ? measureEl.offsetWidth : label.length * 8;
      // 64px de base del sidebar + ancho del texto + padding derecho
      const width = 64 + textWidth + (active ? 34 : 24);

      setHoverData({ key, label, top, width, isActive: active });

      if (!isHovering) {
        setGlideVertical(false);
        setIsHovering(true);
        requestAnimationFrame(() => {
          setGlideVertical(true);
        });
      }
    },
    [expanded, isHovering]
  );

  const handleNavLeave = useCallback(() => {
    setIsHovering(false);
    setGlideVertical(false);
  }, []);

  useEffect(() => {
    if (expanded) {
      setIsHovering(false);
      setGlideVertical(false);
    }
  }, [expanded]);

  useEffect(() => {
    const updatePos = () => {
      const container = containerRef.current;
      const el = activeHref ? itemRefs.current[activeHref] : null;
      if (!container || !el) {
        setPos(null);
        return;
      }
      const top = Math.round(
        el.getBoundingClientRect().top - container.getBoundingClientRect().top
      );
      const height = el.offsetHeight;
      setPos((prev) =>
        prev && prev.top === top && prev.height === height ? prev : { top, height }
      );
    };

    updatePos();
    const id = requestAnimationFrame(() => setReady(true));

    if (typeof ResizeObserver === 'undefined' || !containerRef.current) {
      return () => cancelAnimationFrame(id);
    }

    const ro = new ResizeObserver(updatePos);
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [activeHref, groups, expanded]);

  const allItems = groups.flatMap((g) => g.items);

  return (
    <>
      {/* Espaciador fijo para reservar el carril izquierdo sin saltos de layout */}
      <div aria-hidden className="hidden w-[84px] shrink-0 md:block" />

      {/* Contenedor flex de alto completo que centra la píldora exactamente a la mitad vertical */}
      <div className="pointer-events-none fixed inset-y-0 left-4 z-40 hidden items-center md:flex">
        <nav
          ref={navRef}
          onMouseLeave={handleNavLeave}
          aria-label="Navegación principal"
          className={`pointer-events-auto relative rounded-[32px] bg-black px-2.5 py-4 shadow-2xl shadow-black/30 transition-[width,box-shadow] ${PILL_MS} dark:bg-[#0B1224] dark:shadow-black/60 ${
            expanded ? 'w-[256px]' : 'w-[64px]'
          }`}
        >
          {/* Medidores invisibles para calcular el ancho exacto de cada etiqueta al instante */}
          <div
            aria-hidden
            className="pointer-events-none invisible fixed -top-96 -left-96 select-none"
          >
            <span
              ref={(el) => {
                measureRefs.current['__toggle__'] = el;
              }}
              className="whitespace-nowrap text-[13px] font-semibold"
            >
              Mostrar menú
            </span>
            {allItems.map((it) => (
              <span
                key={it.href}
                ref={(el) => {
                  measureRefs.current[it.href] = el;
                }}
                className="whitespace-nowrap text-[13px] font-semibold"
              >
                {it.label}
              </span>
            ))}
          </div>

          {/* Extensión líquida compartida: sale del propio sidebar y se desliza entre opciones */}
          {!expanded && (
            <div
              aria-hidden
              style={{
                width: isHovering && hoverData ? hoverData.width : 64,
                transform: `translateY(${hoverData?.top ?? 0}px)`,
                transitionProperty: glideVertical
                  ? 'transform, width, opacity'
                  : 'width, opacity',
                transitionDuration: glideVertical ? '320ms, 280ms, 180ms' : '260ms, 180ms',
                transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
              }}
              className={`pointer-events-none absolute top-0 left-0 z-0 flex h-[52px] items-center overflow-hidden rounded-full bg-black shadow-[14px_10px_28px_-8px_rgba(0,0,0,0.38)] dark:bg-[#0B1224] dark:shadow-[14px_10px_28px_-8px_rgba(0,0,0,0.7)] ${
                isHovering && hoverData ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2 pl-[60px] pr-5">
                <span
                  key={hoverData?.key}
                  className="fv-rise whitespace-nowrap text-[13px] font-semibold tracking-tight text-white"
                >
                  {hoverData?.label}
                </span>
                {hoverData?.isActive && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F6BFF]" />
                )}
              </div>
            </div>
          )}

          {/* Botón superior con flecha indicadora para mostrar u ocultar todas las opciones a detalle */}
          <div className="relative z-20 mb-3 flex items-center border-b border-white/10 pb-3">
            <button
              type="button"
              ref={(el) => {
                rowRefs.current['__toggle__'] = el;
              }}
              onMouseEnter={() =>
                handleRowEnter('__toggle__', 'Mostrar menú', false)
              }
              onFocus={() =>
                handleRowEnter('__toggle__', 'Mostrar menú', false)
              }
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? 'Ocultar detalle del menú'
                  : 'Mostrar todas las opciones a detalle'
              }
              className="group/toggle relative flex h-10 w-full items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50"
            >
              <span className="flex h-10 w-[44px] shrink-0 items-center justify-center">
                <ChevronRight
                  className={`h-[18px] w-[18px] transition-transform duration-300 ${EASE} ${
                    expanded ? 'rotate-180 text-white' : 'group-hover/toggle:translate-x-0.5'
                  }`}
                />
              </span>

              <span className="flex-1 overflow-hidden text-left">
                <span
                  className={`ml-3 pr-4 block truncate whitespace-nowrap text-xs font-semibold tracking-wide text-slate-300 transition-all duration-300 ${EASE} ${
                    expanded
                      ? 'translate-x-0 opacity-100'
                      : '-translate-x-2 opacity-0 pointer-events-none'
                  }`}
                >
                  Ocultar menú
                </span>
              </span>
            </button>
          </div>

          <div ref={containerRef} className="relative z-10 flex flex-col">
            {/* Cápsula activa limpia (sin borde) */}
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-0 z-0 rounded-full bg-[#2F6BFF] ${
                ready ? `transition-[transform,height] ${PILL_MS} motion-reduce:transition-none` : ''
              }`}
              style={{
                height: pos?.height ?? 44,
                transform: `translateY(${pos?.top ?? 0}px)`,
                opacity: pos ? 1 : 0,
              }}
            />

            <div className="space-y-6">
              {groups.map((group, groupIdx) => (
                <div key={group.title} className="space-y-2.5">
                  {/* Divisor de sección en modo compacto ⇄ Título de sección cuando está expandido */}
                  <div className="relative flex h-4 items-center overflow-hidden px-2.5">
                    <span
                      className={`select-none whitespace-nowrap text-[11px] font-semibold tracking-wide text-slate-400 transition-all duration-300 ${EASE} ${
                        expanded
                          ? 'translate-x-0 opacity-100'
                          : '-translate-x-2 opacity-0 pointer-events-none'
                      }`}
                    >
                      {group.title}
                    </span>
                    {groupIdx > 0 && (
                      <span
                        aria-hidden
                        className={`absolute left-1/2 h-px -translate-x-1/2 bg-white/20 transition-all duration-300 ${EASE} ${
                          expanded ? 'w-0 opacity-0' : 'w-6 opacity-100'
                        }`}
                      />
                    )}
                  </div>

                  {/* Opciones de la sección */}
                  <div className="flex flex-col gap-3.5">
                    {group.items.map((item) => {
                      const active = item.href === activeHref;
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          ref={(el) => {
                            itemRefs.current[item.href] = el;
                            rowRefs.current[item.href] = el;
                          }}
                          href={item.href}
                          onMouseEnter={() =>
                            handleRowEnter(item.href, item.label, active)
                          }
                          onFocus={() =>
                            handleRowEnter(item.href, item.label, active)
                          }
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          className="group/item relative z-10 flex h-11 w-full items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50"
                        >
                          <span className="flex h-11 w-[44px] shrink-0 items-center justify-center">
                            <Icon
                              className={`h-[20px] w-[20px] shrink-0 transition-transform duration-300 ${
                                active
                                  ? 'text-white'
                                  : 'text-slate-400 group-hover/item:scale-110 group-hover/item:text-[#6C97FF]'
                              }`}
                            />
                          </span>

                          {/* Texto interno solo cuando el sidebar está expandido con la flecha */}
                          <span className="flex-1 overflow-hidden">
                            <span
                              className={`ml-3 pr-4 block truncate whitespace-nowrap text-[13.5px] transition-all duration-300 ${EASE} ${
                                expanded
                                  ? 'translate-x-0 opacity-100'
                                  : '-translate-x-2 opacity-0 pointer-events-none'
                              } ${
                                active
                                  ? 'font-semibold text-white'
                                  : 'font-medium text-slate-300 group-hover/item:text-white'
                              }`}
                            >
                              {item.label}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

/* ───────────────────────── Tabs inferiores (móvil) ───────────────────────── */

// Ancho de una pestaña inactiva (px); la activa ocupa el resto de la píldora
const TAB_W = 52;

function MobileTabBar({
  items,
  activeHref,
  onOpenMore,
}: {
  items: NavItem[];
  activeHref: string | null;
  onOpenMore: () => void;
}) {
  const needMore = true;
  const tabs = items.slice(0, MAX_TABS - 1);
  const count = tabs.length + 1;

  const activeInTabs = tabs.findIndex((item) => item.href === activeHref);
  const moreActive = needMore && activeHref !== null && activeInTabs === -1;
  const activeIndex = activeInTabs >= 0 ? activeInTabs : moreActive ? tabs.length : -1;

  // El primer posicionamiento no se anima; los siguientes sí
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const activeWidth = `calc(100% - ${(count - 1) * TAB_W}px)`;
  const widthFor = (i: number) =>
    activeIndex < 0 ? `${100 / count}%` : i === activeIndex ? activeWidth : `${TAB_W}px`;

  const motion = ready ? `transition-[width] ${PILL_MS} motion-reduce:transition-none` : '';
  const tabClass = `group relative z-10 flex h-12 shrink-0 items-center justify-center overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 ${motion}`;

  const content = (active: boolean, Icon: React.ElementType, label: string) => (
    <>
      <Icon
        className={`h-[22px] w-[22px] shrink-0 transition-colors duration-300 ${
          active ? 'text-white' : 'text-slate-500 group-active:scale-90 dark:text-slate-400'
        }`}
      />
      <span
        className={`truncate whitespace-nowrap text-[13px] font-semibold text-white transition-all duration-300 ${
          active ? 'ml-2 max-w-[96px] opacity-100 delay-150' : 'ml-0 max-w-0 opacity-0'
        }`}
      >
        {label}
      </span>
    </>
  );

  return (
    <nav
      aria-label="Navegación principal"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      className={`fv-rise fixed inset-x-3 z-40 mx-auto max-w-md rounded-full border bg-white p-2 dark:bg-[#0B1224] md:hidden ${LINE}`}
    >
      <div className="relative flex items-center">
        {/* Cápsula activa sin borde azul punteado */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 z-0 h-full rounded-full bg-[#2F6BFF] ${
            ready ? `transition-[transform,width] ${PILL_MS} motion-reduce:transition-none` : ''
          }`}
          style={{
            width: activeIndex < 0 ? `${100 / count}%` : activeWidth,
            transform: `translateX(${Math.max(activeIndex, 0) * TAB_W}px)`,
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />

        {tabs.map((item, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{ width: widthFor(i) }}
              className={tabClass}
            >
              {content(active, item.icon, item.short)}
            </Link>
          );
        })}

        {needMore && (
          <button
            type="button"
            onClick={onOpenMore}
            aria-label="Ajustes y menú completo"
            aria-haspopup="dialog"
            style={{ width: widthFor(tabs.length) }}
            className={tabClass}
          >
            {content(moreActive, Settings, 'Ajustes')}
          </button>
        )}
      </div>
    </nav>
  );
}

/* ─────────────────────── Hoja de menú completo (móvil) ─────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function MobileSheet({
  groups,
  visibleTabs,
  activeHref,
  organizacionNombre,
  userName = 'Usuario',
  userRole = 'Operador',
  onClose,
}: {
  groups: ReturnType<typeof getGroups>;
  visibleTabs: NavItem[];
  activeHref: string | null;
  organizacionNombre: string;
  userName?: string;
  userRole?: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(onClose, 200);
  }, [onClose]);

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Bloquear el scroll del fondo (compensando el ancho de la barra de scroll)
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    // Enfocar el primer elemento del panel
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused?.focus?.();
    };
  }, []);

  const tabHrefs = new Set(visibleTabs.map((item) => item.href));
  const mobileGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !tabHrefs.has(item.href)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        aria-hidden
        onClick={requestClose}
        className={`fixed inset-0 bg-slate-950/70 ${closing ? 'fv-fade-out' : 'fv-fade'}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes y navegación"
        className={`fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 dark:bg-[#0B1224] ${LINE} ${
          closing ? 'fv-sheet-out' : 'fv-sheet'
        }`}
      >
        {/* Asa */}
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-[#26345C]" />

        {/* Cabecera */}
        <div className="mt-4 flex items-center gap-3">
          <Image
            src="/Img/Logo_Fluvib_Face.webp"
            alt="Fluvib"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              {organizacionNombre}
            </h2>
            <span className={`text-[11px] font-medium ${ACCENT_TEXT}`}>Sistema Fluvib</span>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-slate-500 transition-colors hover:border-[#2F6BFF] hover:text-[#2F6BFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 dark:text-slate-400 dark:hover:border-[#6C97FF] dark:hover:text-[#6C97FF] ${LINE}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Perfil del usuario y botón de Cerrar Sesión en Ajustes (Móvil) - al inicio */}
        <div className={`mt-5 border-t border-dashed pt-4 ${LINE}`}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Tu Cuenta
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-[#1E2B4A] dark:bg-[#0D162C]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#2F6BFF] shadow-xs dark:border-[#26345C] dark:bg-[#121E3A] dark:text-[#6C97FF]">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {userName}
                </p>
                <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                  {userRole}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Salir
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* Grupos restantes (en móvil se excluyen los tabs visibles abajo) */}
        {mobileGroups.length > 0 && (
          <div className="mt-5 space-y-5">
            {mobileGroups.map((group) => (
              <div key={group.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
                <div className="mt-1 divide-y divide-dashed divide-slate-300 dark:divide-[#26345C]">
                  {group.items.map((item) => {
                    const active = item.href === activeHref;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={requestClose}
                        aria-current={active ? 'page' : undefined}
                        className="group flex items-center gap-3.5 py-3 outline-none focus-visible:bg-[#2F6BFF]/5"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            active
                              ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                              : `text-slate-500 dark:text-slate-400 ${LINE}`
                          }`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span
                          className={`flex-1 text-sm ${
                            active
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.label}
                        </span>
                        {active && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-[#2F6BFF] dark:bg-[#6C97FF]"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Sidebar ───────────────────────────── */

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  organizacionNombre,
  userName,
  userRole,
  esAdmin,
  permisos = [],
}: SidebarProps) {
  void collapsed;
  void onToggleCollapse;

  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const groups = getGroups(esAdmin, permisos);
  const items = groups.flatMap((g) => g.items);
  const activeHref = items.find((item) => isActive(pathname, item.href))?.href ?? null;
  const visibleMobileTabs = items.slice(0, MAX_TABS - 1);

  const sheetOpen = moreOpen || mobileOpen;
  const closeSheet = useCallback(() => {
    setMoreOpen(false);
    onCloseMobile();
  }, [onCloseMobile]);

  return (
    <>
      <style>{css}</style>

      {/* Píldora vertical para ESCRITORIO (md+) */}
      <DesktopVerticalPill groups={groups} activeHref={activeHref} />

      {/* Tabs inferiores para MÓVIL */}
      <MobileTabBar
        items={items}
        activeHref={activeHref}
        onOpenMore={() => setMoreOpen(true)}
      />

      {/* Hoja con el menú completo (botón "Ajustes" o `mobileOpen`) */}
      {sheetOpen && (
        <MobileSheet
          groups={groups}
          visibleTabs={visibleMobileTabs}
          activeHref={activeHref}
          organizacionNombre={organizacionNombre}
          userName={userName}
          userRole={userRole}
          onClose={closeSheet}
        />
      )}
    </>
  );
}
