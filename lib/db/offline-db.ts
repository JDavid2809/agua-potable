import Dexie, { type Table } from 'dexie';
import type {
  Persona,
  Toma,
  Manzana,
  Tarifa,
  Pago,
  PagoDetalle,
  ElementoColaSync,
} from '@/types/database';

export interface MetadataSync {
  clave: string;
  valor: string;
}

export class AguaPotableLocalDB extends Dexie {
  personas!: Table<Persona, string>;
  tomas!: Table<Toma, string>;
  manzanas!: Table<Manzana, string>;
  tarifas!: Table<Tarifa, string>;
  pagos!: Table<Pago, string>;
  pago_detalles!: Table<PagoDetalle, string>;
  cola_sync!: Table<ElementoColaSync, number>;
  config_sync!: Table<MetadataSync, string>;

  constructor() {
    super('AguaPotableDB');
    this.version(1).stores({
      personas: 'id, organizacion_id, nombre_completo, documento_identidad, activo, updated_at',
      tomas: 'id, organizacion_id, codigo_toma, persona_id, manzana_id, estado, updated_at',
      manzanas: 'id, organizacion_id, barrio, seccion, numero_manzana, updated_at',
      tarifas: 'id, organizacion_id, anio, updated_at',
      pagos: 'id, organizacion_id, folio, persona_id, fecha_pago, updated_at',
      pago_detalles: 'id, organizacion_id, pago_id, toma_id, anio, mes, [toma_id+anio+mes]',
      cola_sync: '++id, tabla, accion, registro_id, creado_en',
      config_sync: 'clave',
    });
    this.version(2).stores({
      cola_sync: '++id, tabla, accion, registro_id, estado, creado_en',
    });
  }
}

export const dbLocal = new AguaPotableLocalDB();

/**
 * Limpia todas las tablas de datos locales (personas, tomas, manzanas, tarifas, pagos locales)
 * garantizando que ningún dato de una organización permanezca en el navegador.
 * Conserva el device_id físico si existe.
 */
export async function limpiarDatosLocales(opciones: { limpiarCola?: boolean } = {}) {
  const { limpiarCola = true } = opciones;

  await dbLocal.transaction(
    'rw',
    [
      dbLocal.personas,
      dbLocal.tomas,
      dbLocal.manzanas,
      dbLocal.tarifas,
      dbLocal.pagos,
      dbLocal.pago_detalles,
      dbLocal.cola_sync,
      dbLocal.config_sync,
    ],
    async () => {
      await Promise.all([
        dbLocal.personas.clear(),
        dbLocal.tomas.clear(),
        dbLocal.manzanas.clear(),
        dbLocal.tarifas.clear(),
        dbLocal.pagos.clear(),
        dbLocal.pago_detalles.clear(),
      ]);

      if (limpiarCola) {
        await dbLocal.cola_sync.clear();
      }

      // Limpiar claves de sesión de config_sync, preservando el device_id físico
      const deviceIdReg = await dbLocal.config_sync.get('device_id');
      await dbLocal.config_sync.clear();
      if (deviceIdReg) {
        await dbLocal.config_sync.put(deviceIdReg);
      }
    }
  );
}

/**
 * Valida la organización activa local contra la organización del usuario recién autenticado.
 * Si es una organización diferente, purga los datos locales inmediatamente para evitar
 * fugas de información entre comités en computadoras o tabletas compartidas.
 */
export async function aislarOrganizacionLocal(nuevaOrgId: string): Promise<boolean> {
  const regOrgActual = await dbLocal.config_sync.get('organizacion_activa_id');
  if (regOrgActual && regOrgActual.valor && regOrgActual.valor !== nuevaOrgId) {
    console.info(`Cambiando de organización local (${regOrgActual.valor} -> ${nuevaOrgId}). Purgando caché local.`);
    await limpiarDatosLocales({ limpiarCola: true });
  }

  await dbLocal.config_sync.put({
    clave: 'organizacion_activa_id',
    valor: nuevaOrgId,
  });

  return true;
}

/**
 * Retorna la cantidad de cobros o acciones pendientes por sincronizar en este dispositivo.
 */
export async function obtenerConteoPendientesSync(): Promise<number> {
  return await dbLocal.cola_sync.count();
}
