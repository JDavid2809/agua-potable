'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  ChevronRight,
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

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  organizacionNombre,
  esAdmin,
}: SidebarProps) {
  const pathname = usePathname();

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

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || (href !== '/' && !!pathname?.startsWith(href));
  };

  const renderNavGroup = (title: string, items: NavItem[]) => {
    const filtered = items.filter((item) => !item.adminOnly || esAdmin);
    if (filtered.length === 0) return null;

    return (
      <div className="space-y-2 py-1.5">
        {!collapsed && (
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
            {title}
          </p>
        )}
        <div className="space-y-2">
          {filtered.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 outline-none select-none ${
                  active
                    ? 'bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-blue-950 dark:text-blue-100 font-semibold shadow-xs'
                    : 'border border-transparent text-slate-600 dark:text-slate-400 font-medium hover:bg-blue-50/90 dark:hover:bg-blue-950/40 hover:border-blue-200/80 dark:hover:border-blue-800/60 hover:text-blue-950 dark:hover:text-blue-100'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                {/* Muesca indicadora en el borde izquierdo */}
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-600 dark:bg-blue-400" />
                )}

                {/* Micro-Tile del Icono */}
                <div
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 ${
                    active
                      ? 'bg-blue-100/90 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100/80 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 group-hover:bg-blue-100/90 dark:group-hover:bg-blue-900/60 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </div>

                {!collapsed && (
                  <span className="truncate flex-1 tracking-tight">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full select-none">
      {/* 1. Header del Sidebar con Isotipo de Fluvib y Nombre del Comité */}
      <div className="h-20 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          {/* Isotipo/Logo Fluvib */}
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl p-1">
            <img
              src="/Img/Logo_Fluvib_Face.png"
              alt="Fluvib"
              className="w-full h-full object-contain"
            />
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <h2 className="text-sm font-black text-slate-900 dark:text-white truncate tracking-tight">
                {organizacionNombre}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                  Sistema Fluvib
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Botón de colapsar escritorio */}
        <button
          onClick={onToggleCollapse}
          type="button"
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          className="hidden md:flex shrink-0 items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Botón cerrar en móvil */}
        <button
          onClick={onCloseMobile}
          type="button"
          title="Cerrar menú"
          className="md:hidden shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Cuerpo de Navegación con Espaciado Generoso */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4 custom-scrollbar">
        {renderNavGroup('Operación', operacionItems)}
        <div className="h-px bg-slate-200/70 dark:bg-slate-800/70 my-1" />
        {renderNavGroup('Medición y Datos', medicionItems)}
        <div className="h-px bg-slate-200/70 dark:bg-slate-800/70 my-1" />
        {renderNavGroup('Administración', adminItems)}
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar para ESCRITORIO */}
      <aside
        className={`hidden md:block shrink-0 sticky top-0 h-screen transition-all duration-200 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Drawer para MÓVIL con Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity"
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 shadow-xl border-r border-slate-200 dark:border-slate-800 z-50">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
