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
  ChevronLeft,
  Settings,
  User,
  X,
} from 'lucide-react';
import { LogoutButton } from '@/components/ui/LogoutButton';

/**
 * Sidebar
 *
 * - Escritorio (md+): barra lateral con la gota viajera, igual que antes.
 * - Móvil: el menú es una píldora flotante (sin sombra) anclada abajo. La
 *   pestaña activa se expande en una cápsula azul con su etiqueta, rodeada por
 *   un anillo punteado, y las demás quedan como iconos. Si hay más de 5
 *   destinos, la quinta pestaña es "Ajustes" y abre una hoja con el menú
 *   completo (también se abre con `mobileOpen`).
 *
 * Anti-encimado: en móvil se inyecta un espaciador al final de <main> (misma
 * altura que la píldora + su margen + área segura) para que el último
 * contenido nunca quede detrás de ella. Si tu contenido no está dentro de
 * <main>, dale al contenedor `pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0`.
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
}

interface NavItem {
  href: string;
  label: string;
  /** Etiqueta corta para la barra de tabs móvil */
  short: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const operacionItems: NavItem[] = [
  { href: '/dashboard', label: 'Panel Principal', short: 'Panel', icon: LayoutDashboard },
  { href: '/tomas', label: 'Padrón de Tomas', short: 'Tomas', icon: Droplets },
  { href: '/personas', label: 'Contratos y Personas', short: 'Personas', icon: Users },
  { href: '/cobros', label: 'Caja y Cobros', short: 'Cobros', icon: CreditCard },
];

// Igual que en la versión original, este grupo no se muestra en el menú
const medicionItems: NavItem[] = [
  { href: '/lecturas', label: 'Lecturas de Medidor', short: 'Lecturas', icon: Gauge },
  { href: '/reportes', label: 'Reportes e Ingresos', short: 'Reportes', icon: BarChart3 },
];
void medicionItems;

const adminItems: NavItem[] = [
  { href: '/usuarios', label: 'Usuarios y Roles', short: 'Usuarios', icon: ShieldCheck, adminOnly: true },
  { href: '/configuracion', label: 'Tarifas y Ajustes', short: 'Tarifas', icon: SlidersHorizontal, adminOnly: true },
];

// Misma lógica de detección de ruta activa que la versión original
const isActive = (pathname: string | null, href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || (href !== '/' && !!pathname?.startsWith(href));
};

function getGroups(esAdmin: boolean) {
  return [
    { title: 'Operación', items: operacionItems },
    { title: 'Administración', items: adminItems },
  ]
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.adminOnly || esAdmin) }))
    .filter((g) => g.items.length > 0);
}

const EASE = 'ease-[cubic-bezier(.65,0,.2,1)]';
const SPRING = 'ease-[cubic-bezier(.34,1.45,.64,1)]';

const ACCENT_TEXT = 'text-[#2F6BFF] dark:text-[#6C97FF]';
const LINE = 'border-slate-300 dark:border-[#26345C]';

// Tamaño de la gota del sidebar de escritorio (px)
const DROP = 36;

// Máximo de pestañas en la barra móvil (si hay más, la última es "Ajustes")
const MAX_TABS = 5;

const css = `
@keyframes fv-in{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes fv-fade{from{opacity:0}to{opacity:1}}
@keyframes fv-fade-out{to{opacity:0}}
@keyframes fv-rise{from{transform:translateY(100%)}to{transform:none}}
@keyframes fv-sheet{from{transform:translateY(100%)}to{transform:none}}
@keyframes fv-sheet-out{to{transform:translateY(100%)}}
@keyframes fv-ripple{from{transform:scale(.8);opacity:.5}to{transform:scale(2.1);opacity:0}}
.fv-in{animation:fv-in .55s cubic-bezier(.22,1,.36,1) backwards}
.fv-fade{animation:fv-fade .25s ease-out both}
.fv-fade-out{animation:fv-fade-out .2s ease-in both}
.fv-rise{animation:fv-rise .5s cubic-bezier(.22,1,.36,1) both}
.fv-sheet{animation:fv-sheet .38s cubic-bezier(.22,1,.36,1) both}
.fv-sheet-out{animation:fv-sheet-out .2s ease-in both}
.fv-ripple{animation:fv-ripple .9s ease-out both}
@media (max-width:767px){main::after{content:"";display:block;height:calc(5.5rem + env(safe-area-inset-bottom,0px))}}
@media (prefers-reduced-motion:reduce){.fv-in,.fv-fade,.fv-fade-out,.fv-rise,.fv-sheet,.fv-sheet-out,.fv-ripple{animation:none}}
`;

/* ─────────────────────── Sidebar de escritorio ─────────────────────── */

interface BodyProps {
  collapsed: boolean;
  organizacionNombre: string;
  esAdmin: boolean;
}

function SidebarBody({ collapsed, organizacionNombre, esAdmin }: BodyProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pos, setPos] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  const groups = getGroups(esAdmin);

  const activeHref =
    groups.flatMap((g) => g.items).find((item) => isActive(pathname, item.href))?.href ?? null;

  // Mide el tab activo (en coordenadas del contenido) para que la gota viaje hasta él
  useEffect(() => {
    const updatePos = () => {
      const nav = navRef.current;
      const el = activeHref ? itemRefs.current[activeHref] : null;
      if (!nav || !el) {
        setPos(null);
        return;
      }
      const top = Math.round(
        el.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop
      );
      const height = el.offsetHeight;
      setPos((prev) => (prev && prev.top === top && prev.height === height ? prev : { top, height }));
    };

    updatePos();
    // El primer posicionamiento no se anima; los siguientes sí
    const id = requestAnimationFrame(() => setReady(true));

    if (typeof ResizeObserver === 'undefined' || !navRef.current) {
      return () => cancelAnimationFrame(id);
    }

    const ro = new ResizeObserver(updatePos);
    ro.observe(navRef.current);

    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [activeHref, collapsed]);

  let order = 0;

  return (
    <div className="flex h-full select-none flex-col overflow-hidden">
      {/* Header: logo fijo, el nombre se desvanece al colapsar */}
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-200/70 px-5 dark:border-slate-800/70">
        <Image
          src="/Img/Logo_Fluvib_Face.webp"
          alt="Fluvib"
          width={40}
          height={40}
          loading="eager"
          className={`h-10 w-10 shrink-0 object-contain transition-transform duration-500 ${SPRING} hover:rotate-[8deg] hover:scale-110`}
        />

        <div
          className={`min-w-0 flex-1 leading-tight transition-all duration-300 ${EASE} ${
            collapsed ? '-translate-x-2 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'
          }`}
        >
          <h2 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            {organizacionNombre}
          </h2>
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
            Sistema Fluvib
          </span>
        </div>
      </div>

      {/* Navegación */}
      <div ref={navRef} className="custom-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden p-3.5">
        {/* Círculo indicador que viaja hasta el tab activo */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-[22px] top-0 ${
            ready ? `transition-transform duration-500 ${SPRING}` : ''
          }`}
          style={{
            width: DROP,
            height: DROP,
            transform: `translateY(${(pos?.top ?? 0) + ((pos?.height ?? DROP) - DROP) / 2}px)`,
            opacity: pos ? 1 : 0,
          }}
        >
          {/* Onda que se emite al llegar a un tab nuevo */}
          {pos && (
            <span
              key={activeHref}
              className="fv-ripple absolute inset-0 rounded-full border-2 border-blue-500/70 dark:border-blue-400/70"
            />
          )}
          <span className="absolute inset-0 rounded-full bg-blue-600 shadow-lg shadow-blue-600/30 dark:bg-blue-500 dark:shadow-blue-500/20" />
        </div>

        <div className="space-y-9">
          {groups.map((group) => (
            <div key={group.title} className="space-y-3">
              {/* Título del grupo ⇄ línea cuando está colapsado (sin saltos de layout) */}
              <div className="relative flex h-4 items-center px-3">
                <p
                  className={`select-none whitespace-nowrap text-[11px] font-medium text-slate-400 transition-all duration-300 ${EASE} dark:text-slate-500 ${
                    collapsed ? '-translate-x-2 opacity-0' : 'translate-x-0 opacity-100'
                  }`}
                >
                  {group.title}
                </p>
                <span
                  aria-hidden
                  className={`absolute left-1/2 h-px -translate-x-1/2 bg-slate-200 transition-all duration-300 ${EASE} dark:bg-slate-700 ${
                    collapsed ? 'w-5 opacity-100' : 'w-0 opacity-0'
                  }`}
                />
              </div>

              <div className="relative space-y-2.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  const delay = 120 + order++ * 55;

                  return (
                    <Link
                      key={item.href}
                      ref={(el) => {
                        itemRefs.current[item.href] = el;
                      }}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      style={{ animationDelay: `${delay}ms` }}
                      className="fv-in group relative z-10 flex h-11 items-center rounded-xl pl-2.5 pr-3 text-[13px] outline-none transition-transform duration-200 active:scale-[.97] focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    >
                      {/* Nodo: tapa la línea detrás del icono; el activo queda sobre la gota */}
                      <span
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                          active
                            ? 'bg-transparent'
                            : 'bg-white group-hover:bg-blue-50 dark:bg-slate-900 dark:group-hover:bg-blue-950/60'
                        }`}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] transition-all duration-300 ${SPRING} group-hover:scale-110 ${
                            active
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400'
                          }`}
                        />
                      </span>

                      <span
                        className={`truncate whitespace-nowrap transition-all duration-300 ${EASE} group-hover:translate-x-1 ${
                          collapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-3.5 max-w-[168px] opacity-100'
                        } ${
                          active
                            ? 'font-semibold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white'
                        }`}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Tabs inferiores (móvil) ───────────────────────── */

// Ancho de una pestaña inactiva (px); la activa ocupa el resto de la píldora
const TAB_W = 52;
const PILL_MS = 'duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)]';

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

  // Ancho de cada pestaña y del indicador comparten duración y curva, así que
  // la cápsula y los iconos se mueven siempre en sincronía.
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
        {/* Cápsula activa con anillo punteado; viaja y se ensancha hasta la pestaña */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 z-0 h-full ${
            ready ? `transition-[transform,width] ${PILL_MS} motion-reduce:transition-none` : ''
          }`}
          style={{
            width: activeIndex < 0 ? `${100 / count}%` : activeWidth,
            transform: `translateX(${Math.max(activeIndex, 0) * TAB_W}px)`,
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        >
          <span className="absolute -inset-[3px] rounded-full border border-dashed border-[#2F6BFF]/50 dark:border-[#6C97FF]/50" />
          <span className="absolute inset-0 rounded-full bg-[#2F6BFF]" />
        </div>

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
  activeHref,
  organizacionNombre,
  userName = 'Usuario',
  userRole = 'Operador',
  onClose,
}: {
  groups: ReturnType<typeof getGroups>;
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
  requestCloseRef.current = requestClose;

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

  const mobileGroups = groups.filter((g) => g.title !== 'Operación');

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

        {/* Grupos restantes (en móvil se excluye Operación) */}
        {mobileGroups.length > 0 && (
          <div className="mt-5 space-y-5">
            {mobileGroups.map((group) => (
              <div key={group.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
                <div className={`mt-1 divide-y divide-dashed divide-slate-300 dark:divide-[#26345C]`}>
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
}: SidebarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const groups = getGroups(esAdmin);
  const items = groups.flatMap((g) => g.items);
  const activeHref = items.find((item) => isActive(pathname, item.href))?.href ?? null;

  const sheetOpen = moreOpen || mobileOpen;
  const closeSheet = useCallback(() => {
    setMoreOpen(false);
    onCloseMobile();
  }, [onCloseMobile]);

  return (
    <>
      <style>{css}</style>

      {/* Sidebar para ESCRITORIO */}
      <aside
        className={`group/aside sticky top-0 z-30 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ${EASE} dark:border-slate-800 dark:bg-slate-900 md:block ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <SidebarBody
          collapsed={collapsed}
          organizacionNombre={organizacionNombre}
          esAdmin={esAdmin}
        />

        {/* Botón de colapsar: flota sobre el borde y aparece al pasar el cursor */}
        <button
          onClick={onToggleCollapse}
          type="button"
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          className="absolute -right-3 top-7 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-xs transition-all duration-200 hover:scale-110 hover:text-blue-600 focus-visible:opacity-100 group-hover/aside:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-blue-400"
        >
          <ChevronLeft
            className={`h-3.5 w-3.5 transition-transform duration-300 ${EASE} ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </aside>

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