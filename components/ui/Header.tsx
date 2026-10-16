'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'motion/react';
import { Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export interface HeaderNavItem {
  href: string;
  label: string;
}

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  logoSrc?: string;
  showThemeToggle?: boolean;
  userRole?: string;
  userName?: string;
  actions?: React.ReactNode;
  className?: string;
  nav?: HeaderNavItem[];
  onSearchClick?: () => void;
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

const spring = { type: 'spring', stiffness: 420, damping: 38 } as const;

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

function getInitials(name?: string, fallback?: string) {
  const base = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('')
    : '';
  return base || fallback?.charAt(0).toUpperCase() || '';
}

/* ------------------------------ Piezas ------------------------------ */

function FreeLogo({
  logoSrc,
  imgOk,
  onImgError,
  title,
}: {
  logoSrc: string;
  imgOk: boolean;
  onImgError: () => void;
  title: string;
}) {
  if (!imgOk) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold text-white">
        {title.charAt(0)}
      </span>
    );
  }
  return (
    <Image
      src={logoSrc}
      alt={title || 'Fluvib'}
      width={480}
      height={148}
      loading="eager"
      onError={onImgError}
      className="h-12 w-auto max-w-[200px] shrink-0 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.45)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
    />
  );
}

function IconButton({
  label,
  onClick,
  children,
  isDark,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${focusRing} ${
        isDark
          ? 'bg-neutral-100/10 text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900'
          : 'bg-white/8 text-white/80 hover:bg-white/18 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <IconButton
      label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={onToggle}
      isDark={isDark}
    >
      <Sun
        className={`absolute h-[18px] w-[18px] transition-all duration-300 motion-reduce:transition-none ${
          isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
      />
      <Moon
        className={`absolute h-[18px] w-[18px] transition-all duration-300 motion-reduce:transition-none ${
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
        }`}
      />
    </IconButton>
  );
}

function UserChip({
  userName,
  userRole,
  textClass,
}: {
  userName?: string;
  userRole?: string;
  textClass: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/5 p-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300 text-xs font-bold text-neutral-950">
        {getInitials(userName, userRole)}
      </span>
      <div className={`flex-col pl-0.5 pr-3 leading-tight ${textClass}`}>
        {userName && <span className="text-sm font-medium text-white">{userName}</span>}
        {userRole && <span className="text-xs text-white/55">{userRole}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ Header ------------------------------ */

export function Header({
  title = '',
  subtitle = '',
  logoSrc = '/Img/Logo_Fluvib.webp',
  showThemeToggle = true,
  userRole,
  userName,
  actions,
  className = '',
  nav = [],
  onSearchClick,
}: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();
  const [imgOk, setImgOk] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [kbd, setKbd] = useState(false);
  const [hoverHref, setHoverHref] = useState<string | null>(null);
  const pathname = usePathname();

  // Luz que sigue al cursor dentro de la cápsula
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(180px circle at ${mx}px ${my}px, rgba(255,255,255,0.10), transparent 75%)`;

  // Colapso al hacer scroll (con histéresis para evitar parpadeos)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 8 : y > 80));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Con teclado (Tab) la cápsula no se colapsa, para poder navegar los enlaces
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Tab' && setKbd(true);
    const onPointer = () => setKbd(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && !!pathname?.startsWith(href));

  const currentLabel = nav.find((i) => isActive(i.href))?.label ?? title;
  const compact = scrolled && !hovered && !kbd;

  const mark = (
    <FreeLogo
      title={title}
      logoSrc={logoSrc}
      imgOk={imgOk}
      onImgError={() => setImgOk(false)}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <header
        className={`pointer-events-none sticky top-0 z-50 flex w-full justify-center px-3 pt-3 sm:pt-4 ${className}`}
      >
        <motion.div
          layout
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ default: { ...spring, stiffness: 300 }, layout: spring }}
          style={{ borderRadius: 28 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            setHovered(false);
            setHoverHref(null);
          }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            mx.set(e.clientX - r.left);
            my.set(e.clientY - r.top);
          }}
          className={`pointer-events-auto relative w-full max-w-full overflow-hidden shadow-2xl backdrop-blur-xl transition-colors duration-300 md:w-auto ${
            isDark
              ? 'bg-white/95 text-neutral-900 shadow-black/20 ring-1 ring-black/8'
              : 'bg-neutral-950/90 text-white shadow-black/30 ring-1 ring-white/10'
          }`}
        >
          {/* Luz del cursor */}
          <motion.div
            aria-hidden
            style={{ background: isDark
              ? `radial-gradient(180px circle at ${0}px ${0}px, rgba(0,0,0,0.06), transparent 75%)`
              : spotlight
            }}
            className={`pointer-events-none absolute inset-0 hidden transition-opacity duration-300 md:block ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* ============ ESCRITORIO ============ */}
          <div className="relative hidden md:block" style={{ minWidth: 'min(78vw, 820px)' }}>
            <AnimatePresence initial={false} mode="popLayout">
              {compact ? (
                <motion.div
                  key="compact"
                  layout="position"
                  {...fade}
                  className="flex h-16 w-full items-center justify-between gap-3 px-5"
                >
                  <div className="flex items-center gap-3">
                    {mark}
                    <span className={`text-sm font-medium ${isDark ? 'text-neutral-800' : 'text-white/90'}`}>{currentLabel}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="full"
                  layout="position"
                  {...fade}
                  className="flex h-16 w-full items-center justify-between gap-4 px-4 py-2"
                >
                  {/* Marca */}
                  <Link
                    href="/"
                    className={`group flex shrink-0 items-center gap-3 rounded-full pr-4 ${focusRing}`}
                  >
                    {mark}
                    <span className="flex flex-col leading-none">
                      <span className="text-base font-semibold tracking-tight">{title}</span>
                      {subtitle && (
                        <span className={`mt-1 hidden text-[11px] lg:block ${isDark ? 'text-neutral-500' : 'text-white/50'}`}>
                          {subtitle}
                        </span>
                      )}
                    </span>
                  </Link>

                  {/* Menú con píldoras que se deslizan */}
                  {nav.length > 0 && (
                    <>
                      <span className={`mx-1 h-6 w-px ${isDark ? 'bg-neutral-900/15' : 'bg-white/15'}`} />
                      <nav
                        aria-label="Principal"
                        className="flex items-center gap-0.5"
                        onMouseLeave={() => setHoverHref(null)}
                      >
                        {nav.map(({ href, label }) => {
                          const active = isActive(href);
                          return (
                            <Link
                              key={href}
                              href={href}
                              aria-current={active ? 'page' : undefined}
                              onMouseEnter={() => setHoverHref(href)}
                              className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${focusRing} ${
                                active
                                  ? isDark
                                    ? 'text-white'
                                    : 'text-neutral-950'
                                  : isDark
                                    ? 'text-neutral-700 hover:text-neutral-950'
                                    : 'text-white/70 hover:text-white'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="nav-active"
                                  transition={spring}
                                  className={`absolute inset-0 rounded-full ${isDark ? 'bg-neutral-950' : 'bg-white'}`}
                                />
                              )}
                              {!active && hoverHref === href && (
                                <motion.span
                                  layoutId="nav-hover"
                                  transition={spring}
                                  className={`absolute inset-0 rounded-full ${isDark ? 'bg-neutral-900/10' : 'bg-white/10'}`}
                                />
                              )}
                              <span className="relative z-10">{label}</span>
                            </Link>
                          );
                        })}
                      </nav>
                      <span className={`mx-1 h-6 w-px ${isDark ? 'bg-neutral-900/15' : 'bg-white/15'}`} />
                    </>
                  )}

                  {/* Herramientas */}
                  <div className="flex items-center gap-2">
                    {onSearchClick && (
                      <IconButton label="Buscar" onClick={onSearchClick} isDark={isDark}>
                        <Search className="h-[18px] w-[18px]" />
                      </IconButton>
                    )}
                    {actions}
                    {showThemeToggle && <ThemeToggle isDark={isDark} onToggle={toggleTheme} />}
                    {(userName || userRole) && (
                      <UserChip
                        userName={userName}
                        userRole={userRole}
                        textClass="hidden xl:flex"
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ============ MÓVIL: Logo a la izquierda y controles/icono a la derecha ============ */}
          <div className="relative md:hidden">
            <div className="flex h-14 items-center justify-between px-4">
              <Link href="/" className={`group flex items-center gap-2 rounded-full ${focusRing}`} aria-label="Inicio">
                {mark}
                {title && <span className="text-sm font-semibold tracking-tight">{title}</span>}
              </Link>
              <div className="flex items-center gap-2">
                {onSearchClick && (
                  <IconButton label="Buscar" onClick={onSearchClick} isDark={isDark}>
                    <Search className="h-[18px] w-[18px]" />
                  </IconButton>
                )}
                {actions}
                {showThemeToggle && <ThemeToggle isDark={isDark} onToggle={toggleTheme} />}
                {(userName || userRole) && (
                  <UserChip
                    userName={userName}
                    userRole={userRole}
                    textClass="hidden"
                  />
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </header>
    </MotionConfig>
  );
}