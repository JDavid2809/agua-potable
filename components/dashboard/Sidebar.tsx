'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  organizacionNombre: string;
  esAdmin: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const operacionItems: NavItem[] = [
  { href: '/dashboard', label: 'Panel Principal', icon: LayoutDashboard },
  { href: '/tomas', label: 'Padrón de Tomas', icon: Droplets },
  { href: '/personas', label: 'Contratos y Personas', icon: Users },
  { href: '/cobros', label: 'Caja y Cobros', icon: CreditCard },
];

const medicionItems: NavItem[] = [
  { href: '/lecturas', label: 'Lecturas de Medidor', icon: Gauge },
  { href: '/reportes', label: 'Reportes e Ingresos', icon: BarChart3 },
];

const adminItems: NavItem[] = [
  { href: '/usuarios', label: 'Usuarios y Roles', icon: ShieldCheck, adminOnly: true },
  { href: '/configuracion', label: 'Tarifas y Ajustes', icon: SlidersHorizontal, adminOnly: true },
];

// Misma lógica de detección de ruta activa que la versión original
const isActive = (pathname: string | null, href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || (href !== '/' && !!pathname?.startsWith(href));
};

const EASE = 'ease-[cubic-bezier(.65,0,.2,1)]';
const SPRING = 'ease-[cubic-bezier(.34,1.45,.64,1)]';

// Tamaño de la gota y alto de cada tab (en px) para posicionar el indicador
const DROP = 36;

const css = `
@keyframes fv-in{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes fv-fade{from{opacity:0}to{opacity:1}}
@keyframes fv-slide{from{transform:translateX(-100%)}to{transform:none}}
@keyframes fv-ripple{from{transform:scale(.8);opacity:.5}to{transform:scale(2.1);opacity:0}}
.fv-in{animation:fv-in .55s cubic-bezier(.22,1,.36,1) backwards}
.fv-fade{animation:fv-fade .25s ease-out both}
.fv-slide{animation:fv-slide .38s cubic-bezier(.22,1,.36,1) both}
.fv-ripple{animation:fv-ripple .9s ease-out both}
@media (prefers-reduced-motion:reduce){.fv-in,.fv-fade,.fv-slide,.fv-ripple{animation:none}}
`;

interface BodyProps {
  collapsed: boolean;
  mobile: boolean;
  onCloseMobile: () => void;
  organizacionNombre: string;
  esAdmin: boolean;
}

function SidebarBody({ collapsed, mobile, onCloseMobile, organizacionNombre, esAdmin }: BodyProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pos, setPos] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  const groups = [
    { title: 'Operación', items: operacionItems },
    { title: 'Administración', items: adminItems },
  ]
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.adminOnly || esAdmin) }))
    .filter((g) => g.items.length > 0);

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

        {mobile && (
          <button
            onClick={onCloseMobile}
            type="button"
            title="Cerrar menú"
            aria-label="Cerrar menú"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:rotate-90 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        )}
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

              {/* Cauce: una línea vertical que une los nodos del grupo */}
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
                      onClick={onCloseMobile}
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function MobileDrawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

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
        onClose();
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
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div aria-hidden onClick={onClose} className="fv-fade fixed inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className="fv-slide fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        {children}
      </div>
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  organizacionNombre,
  esAdmin,
}: SidebarProps) {
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
          mobile={false}
          onCloseMobile={onCloseMobile}
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

      {/* Drawer para MÓVIL con Backdrop */}
      {mobileOpen && (
        <MobileDrawer onClose={onCloseMobile}>
          <SidebarBody
            collapsed={false}
            mobile
            onCloseMobile={onCloseMobile}
            organizacionNombre={organizacionNombre}
            esAdmin={esAdmin}
          />
        </MobileDrawer>
      )}
    </>
  );
}