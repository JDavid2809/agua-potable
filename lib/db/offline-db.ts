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
      personas: 'id, nombre_completo, documento_identidad, activo, updated_at',
      tomas: 'id, codigo_toma, persona_id, manzana_id, estado, updated_at',
      manzanas: 'id, barrio, seccion, numero_manzana, updated_at',
      tarifas: 'id, anio, updated_at',
      pagos: 'id, folio, persona_id, fecha_pago, updated_at',
      pago_detalles: 'id, pago_id, toma_id, anio, mes, [toma_id+anio+mes]',
      cola_sync: '++id, tabla, accion, registro_id, creado_en',
      config_sync: 'clave',
    });
  }
}

export const dbLocal = new AguaPotableLocalDB();
