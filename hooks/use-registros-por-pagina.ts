'use client';

import { useState, useEffect } from 'react';

export const CLAVE_REGISTROS_POR_PAGINA = 'fluvib_registros_por_pagina';
export const MAX_REGISTROS_POR_PAGINA = 50;
export const MIN_REGISTROS_POR_PAGINA = 5;
export const DEFAULT_REGISTROS_POR_PAGINA = 50;

const EVENTO_CAMBIO = 'fluvib:registros_por_pagina';

export function normalizarRegistrosPorPagina(valor: unknown): number {
  const num = Number(valor);
  if (Number.isNaN(num) || num <= 0) return DEFAULT_REGISTROS_POR_PAGINA;
  return Math.min(MAX_REGISTROS_POR_PAGINA, Math.max(MIN_REGISTROS_POR_PAGINA, Math.round(num)));
}

export function obtenerRegistrosPorPaginaActual(): number {
  if (typeof window === 'undefined') return DEFAULT_REGISTROS_POR_PAGINA;
  const guardado = localStorage.getItem(CLAVE_REGISTROS_POR_PAGINA);
  if (!guardado) return DEFAULT_REGISTROS_POR_PAGINA;
  return normalizarRegistrosPorPagina(guardado);
}

export function guardarRegistrosPorPagina(valor: number): number {
  const normalizado = normalizarRegistrosPorPagina(valor);
  if (typeof window !== 'undefined') {
    localStorage.setItem(CLAVE_REGISTROS_POR_PAGINA, String(normalizado));
    window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: normalizado }));
  }
  return normalizado;
}

export function useRegistrosPorPagina(): number {
  const [cantidad, setCantidad] = useState<number>(DEFAULT_REGISTROS_POR_PAGINA);

  useEffect(() => {
    setCantidad(obtenerRegistrosPorPaginaActual());

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<number>;
      if (custom.detail) {
        setCantidad(normalizarRegistrosPorPagina(custom.detail));
      } else {
        setCantidad(obtenerRegistrosPorPaginaActual());
      }
    };

    window.addEventListener(EVENTO_CAMBIO, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return cantidad;
}

