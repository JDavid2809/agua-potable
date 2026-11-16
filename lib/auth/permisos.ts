import type { PermisoSistema } from '@/types/database';

export type ModuloPermiso = 'caja' | 'tomas' | 'personas' | 'cooperaciones' | 'admin';

export interface DefinicionPermiso {
  id: Exclude<PermisoSistema, '*'>;
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
  { id: 'cooperaciones.ver', corto: 'Ver obras', etiqueta: 'Ver cooperaciones', modulo: 'cooperaciones' },
  { id: 'cooperaciones.cobrar', corto: 'Cobrar obras', etiqueta: 'Cobrar cooperaciones', modulo: 'cooperaciones' },
  { id: 'cooperaciones.gestionar', corto: 'Crear obras', etiqueta: 'Crear cooperaciones', modulo: 'cooperaciones' },
  { id: 'tarifas.gestionar', corto: 'Tarifas', etiqueta: 'Tarifas y cuotas', modulo: 'admin' },
  { id: 'organizacion.editar', corto: 'Comité', etiqueta: 'Datos del comité', modulo: 'admin' },
  { id: 'usuarios.gestionar', corto: 'Usuarios', etiqueta: 'Gestionar usuarios', modulo: 'admin' },
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
 * Evalúa si un usuario cuenta con un permiso específico considerando herencia lógica:
 * - Administrador o '*' tiene todos los permisos.
 * - `*.gestionar` implica `*.ver`.
 * - `cooperaciones.cobrar`, `cooperaciones.gestionar` o `cobros.crear` permiten consultar cooperaciones.
 */
export function tienePermisoUsuario(
  esAdmin: boolean,
  permisos: string[] = [],
  requerido: PermisoSistema
): boolean {
  if (esAdmin || permisos.includes('*')) return true;
  if (permisos.includes(requerido)) return true;

  if (requerido === 'tomas.ver' && permisos.includes('tomas.gestionar')) return true;
  if (requerido === 'personas.ver' && permisos.includes('personas.gestionar')) return true;
  if (
    requerido === 'cooperaciones.ver' &&
    (permisos.includes('cooperaciones.cobrar') ||
      permisos.includes('cooperaciones.gestionar') ||
      permisos.includes('cobros.crear'))
  ) {
    return true;
  }
  if (
    requerido === 'cooperaciones.cobrar' &&
    (permisos.includes('cooperaciones.gestionar') || permisos.includes('cobros.crear'))
  ) {
    return true;
  }

  return false;
}

/**
 * Evalúa si el usuario cumple al menos uno de los permisos requeridos (o todos si la lista está vacía).
 */
export function tieneAlgunPermisoUsuario(
  esAdmin: boolean,
  permisos: string[] = [],
  requeridos: PermisoSistema[] = []
): boolean {
  if (esAdmin || permisos.includes('*')) return true;
  if (requeridos.length === 0) return true;
  return requeridos.some((req) => tienePermisoUsuario(esAdmin, permisos, req));
}

/**
 * Resume una lista de permisos en etiquetas cortas y compactas para mostrar en tabla.
 * Si el usuario ya tiene permiso de edición (`*.gestionar`), omite el permiso redundante de solo lectura (`*.ver`).
 */
export function resumirPermisosParaTabla(permisos: string[] = []): ResumenPermisoChip[] {
  const set = new Set(permisos);
  const chips: ResumenPermisoChip[] = [];

  for (const def of PERMISOS_DISPONIBLES) {
    if (!set.has(def.id)) continue;
    if (def.id === 'tomas.ver' && set.has('tomas.gestionar')) continue;
    if (def.id === 'personas.ver' && set.has('personas.gestionar')) continue;
    if (
      def.id === 'cooperaciones.ver' &&
      (set.has('cooperaciones.cobrar') || set.has('cooperaciones.gestionar'))
    ) {
      continue;
    }
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
