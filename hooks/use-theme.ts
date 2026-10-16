'use client';

import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme';

function resolverTemaGuardado(): boolean {
  try {
    const guardado = localStorage.getItem(THEME_STORAGE_KEY);
    if (guardado) return guardado === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function aplicarTema(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains('dark');
const getServerSnapshot = () => false;

/**
 * Fuente única del tema para toda la aplicación.
 * El estado vive en la clase `dark` de <html>; todos los componentes que usan
 * este hook se sincronizan automáticamente cuando cambia.
 */
export function useTheme() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // En desarrollo, Strict Mode reinicia los atributos de <html>; se re-aplica antes de pintar.
  useLayoutEffect(() => {
    const dark = resolverTemaGuardado();
    if (document.documentElement.classList.contains('dark') !== dark) aplicarTema(dark);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextDark = !document.documentElement.classList.contains('dark');
    const apply = () => {
      aplicarTema(nextDark);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextDark ? 'dark' : 'light');
      } catch {
        /* almacenamiento no disponible */
      }
    };

    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }, []);

  return { isDark, toggleTheme };
}
