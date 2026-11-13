import type { PermisoSistema } from '@/types/database';

export type ModuloPermiso = 'caja' | 'tomas' | 'personas' | 'admin';

export interface DefinicionPermiso {
  id: Exclude<PermisoSistema, '*' | 'usuarios.gestionar' | 'organizacion.editar'>;
  corto: string;
  etiqueta: string;
  modulo: ModuloPermiso;
}

export const PERMISOS_DISPONIBLES: DefinicionPermiso[] = [
  { id: 'cobros.crear', corto: 'Cobros', etiqueta: 'Cobrar recibos', modulo: 'caja' },
  { id: 'cobros.anular', corto: 'Anular', etiqueta: 'Anular recibos', modulo: 'caja' },
  { id: 'tomas.ver', corto: 'Ver tomas', etiqueta: 'Ver tomas', modulo: 'tomas' },
  { id: 'tomas.gestionar', corto: 'Tomas', etiqueta: 'Editar tomas', modulo: 'tomas' },
  { id: 'personas.ver', corto: 'Ver personas', etiqueta: 'Ver personas', modulo: 'personas' },
  { id: 'personas.gestionar', corto: 'Personas', etiqueta: 'Editar personas', modulo: 'personas' },
  { id: 'tarifas.gestionar', corto: 'Tarifas', etiqueta: 'Tarifas y cuotas', modulo: 'admin' },
  { id: 'reportes.ver', corto: 'Reportes', etiqueta: 'Ver reportes', modulo: 'admin' },
];

const MAPA_PERMISOS = new Map<string, DefinicionPermiso>(
  PERMISOS_DISPONIBLES.map((p) => [p.id, p])
);

export interface ResumenPermisoChip {
  key: string;
  label: string;
  modulo: ModuloPermiso;
}

/**
 * Resume una lista de permisos en chips cortos y compactos para mostrar en tabla.
 * Si el usuario ya tiene permiso de edición (`*.gestionar`), omite el permiso redundante de solo lectura (`*.ver`).
 */
export function resumirPermisosParaTabla(permisos: string[] = []): ResumenPermisoChip[] {
  const set = new Set(permisos);
  const chips: ResumenPermisoChip[] = [];

  for (const def of PERMISOS_DISPONIBLES) {
    if (!set.has(def.id)) continue;
    if (def.id === 'tomas.ver' && set.has('tomas.gestionar')) continue;
    if (def.id === 'personas.ver' && set.has('personas.gestionar')) continue;
    chips.push({ key: def.id, label: def.corto, modulo: def.modulo });
  }

  for (const raw of permisos) {
    if (raw !== '*' && !MAPA_PERMISOS.has(raw)) {
      chips.push({ key: raw, label: raw.split('.')[0] || raw, modulo: 'admin' });
    }
  }

  return chips;
}

export function etiquetaPermiso(id: string): string {
  return MAPA_PERMISOS.get(id)?.etiqueta ?? id;
}

