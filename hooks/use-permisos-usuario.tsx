'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { tienePermisoUsuario, tieneAlgunPermisoUsuario } from '@/lib/auth/permisos';
import type { PermisoSistema } from '@/types/database';

export interface PermisosContextValue {
  esAdmin: boolean;
  permisos: string[];
  puede: (permiso: PermisoSistema) => boolean;
  puedeAlguno: (permisosRequeridos: PermisoSistema[]) => boolean;
}

const PermisosContext = createContext<PermisosContextValue>({
  esAdmin: false,
  permisos: [],
  puede: () => true,
  puedeAlguno: () => true,
});

export interface PermisosProviderProps {
  esAdmin: boolean;
  permisos?: string[];
  children: React.ReactNode;
}

export function PermisosProvider({
  esAdmin,
  permisos = [],
  children,
}: PermisosProviderProps) {
  const value = useMemo<PermisosContextValue>(
    () => ({
      esAdmin,
      permisos,
      puede: (permiso: PermisoSistema) => tienePermisoUsuario(esAdmin, permisos, permiso),
      puedeAlguno: (requeridos: PermisoSistema[]) =>
        tieneAlgunPermisoUsuario(esAdmin, permisos, requeridos),
    }),
    [esAdmin, permisos]
  );

  return (
    <PermisosContext.Provider value={value}>
      {children}
    </PermisosContext.Provider>
  );
}

export function usePermisosUsuario(): PermisosContextValue {
  return useContext(PermisosContext);
}

