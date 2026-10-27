import { dbLocal } from '@/lib/db/offline-db';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type {
  Pago,
  PagoDetalle,
  ElementoColaSync,
  TransaccionPagoData,
  Persona,
  Toma,
  Manzana,
  Tarifa,
} from '@/types/database';

export interface ResumenSincronizacion {
  pendientes: number;
  conError: number;
  ultimaSincronizacion: string | null;
  enLinea: boolean;
  sincronizando: boolean;
}

export interface ResultadoSincronizacion {
  exito: boolean;
  elementosEnviados: number;
  elementosConError: number;
  mensaje: string;
}

const MAX_INTENTOS = 5;
const TAMANIO_PAGINA = 500;

// Mutex a nivel de módulo para prevenir sincronizaciones concurrentes
let isSyncInProgress = false;
let activeSyncPromise: Promise<ResultadoSincronizacion> | null = null;

/**
 * Obtiene o inicializa un identificador único persistente para este dispositivo físico.
 * Utilizado para generar folios únicos offline y auditar el origen del cobro.
 */
export async function obtenerODefinirDispositivoId(): Promise<string> {
  if (typeof window === 'undefined') {
    return 'DEV-SERVER';
  }

  // 1. Intentar leer de localStorage
  let deviceId = localStorage.getItem('fluvib_device_id');
  if (deviceId && deviceId.trim()) {
    return deviceId.trim();
  }

  // 2. Intentar leer de la base de datos local Dexie
  const registroDb = await dbLocal.config_sync.get('device_id');
  if (registroDb && registroDb.valor) {
    deviceId = registroDb.valor;
    localStorage.setItem('fluvib_device_id', deviceId);
    return deviceId;
  }

  // 3. Generar un nuevo ID con entropía de 8 caracteres alfanuméricos
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    : Math.random().toString(36).substring(2, 10).toUpperCase();

  deviceId = `DEV-${randomPart}`;

  localStorage.setItem('fluvib_device_id', deviceId);
  await dbLocal.config_sync.put({ clave: 'device_id', valor: deviceId });

  return deviceId;
}

/**
 * Genera un folio offline garantizado único por dispositivo y año.
 * Formato: REC-{ANIO}-{DISPOSITIVO_CORTO}-{CORRELATIVO} (Ej: REC-2026-F8A2-0001)
 */
export async function generarFolioOffline(_organizacionId?: string): Promise<string> {
  void _organizacionId;
  const deviceId = await obtenerODefinirDispositivoId();
  const shortDevice = deviceId.replace('DEV-', '').substring(0, 4);
  const anio = new Date().getFullYear();
  const claveCorrelativo = `correlativo_folio_${anio}`;

  // Obtener último número usado en este dispositivo
  const itemConfig = await dbLocal.config_sync.get(claveCorrelativo);
  let consecutivo = 1;
  if (itemConfig && !isNaN(parseInt(itemConfig.valor, 10))) {
    consecutivo = parseInt(itemConfig.valor, 10) + 1;
  }

  // Guardar nuevo consecutivo local
  await dbLocal.config_sync.put({
    clave: claveCorrelativo,
    valor: consecutivo.toString(),
  });

  const numeroPadded = consecutivo.toString().padStart(4, '0');
  return `REC-${anio}-${shortDevice}-${numeroPadded}`;
}

/**
 * Registra un cobro de forma atómica en Dexie (IndexedDB) y encola la transacción
 * completa (pago + conceptos) como una sola unidad para la RPC en la nube.
 */
export async function registrarPagoLocal(pago: Pago, detalles: PagoDetalle[]) {
  const deviceId = await obtenerODefinirDispositivoId();

  // Asegurar dispositivo offline id y folio
  const pagoFinal: Pago = {
    ...pago,
    dispositivo_offline_id: pago.dispositivo_offline_id || deviceId,
    folio: pago.folio || (await generarFolioOffline(pago.organizacion_id)),
  };

  // 1. Guardar de forma atómica en Dexie
  await dbLocal.transaction('rw', [dbLocal.pagos, dbLocal.pago_detalles, dbLocal.tomas, dbLocal.cola_sync], async () => {
    // Guardar encabezado del pago
    await dbLocal.pagos.put(pagoFinal);

    // Guardar cada detalle del recibo
    for (const detalle of detalles) {
      await dbLocal.pago_detalles.put(detalle);

      // Actualizar saldo de la toma en la BD local de inmediato para el cajero
      const tomaLocal = await dbLocal.tomas.get(detalle.toma_id);
      if (tomaLocal) {
        const nuevoSaldo = Math.max(0, (tomaLocal.saldo_pendiente || 0) - detalle.monto);
        await dbLocal.tomas.update(detalle.toma_id, {
          saldo_pendiente: nuevoSaldo,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 2. Encolar como transacción atómica única (L1 & L2)
    const itemTransaccion: ElementoColaSync = {
      tabla: 'transaccion_pago',
      accion: 'INSERT',
      registro_id: pagoFinal.id,
      datos: {
        pago: pagoFinal,
        detalles,
      } as TransaccionPagoData,
      creado_en: new Date().toISOString(),
      intentos: 0,
      estado: 'pendiente',
    };

    await dbLocal.cola_sync.add(itemTransaccion);
  });

  // Si hay conexión activa, sincronizar antes de resolver para que las vistas en la nube reflejen el pago de inmediato
  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      await sincronizarConNube();
    } catch (err) {
      console.warn('Sincronización en segundo plano pospuesta:', err);
    }
  }

  return { success: true, pagoId: pagoFinal.id, folio: pagoFinal.folio };
}

/**
 * Descarga registros de una tabla de forma paginada e incremental desde Supabase
 */
async function descargarTablaPaginada<T extends { id: string; updated_at?: string; deleted_at?: string | null }>(
  nombreTabla: 'personas' | 'tomas' | 'manzanas' | 'tarifas',
  desdeTimestamp: string | null
): Promise<T[]> {
  const acumulados: T[] = [];
  let desde = 0;
  let tieneMas = true;

  while (tieneMas) {
    let query = supabase
      .from(nombreTabla)
      .select('*')
      .range(desde, desde + TAMANIO_PAGINA - 1);

    if (desdeTimestamp) {
      query = query.gt('updated_at', desdeTimestamp);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      acumulados.push(...(data as T[]));
      if (data.length < TAMANIO_PAGINA) {
        tieneMas = false;
      } else {
        desde += TAMANIO_PAGINA;
      }
    } else {
      tieneMas = false;
    }
  }

  return acumulados;
}

/**
 * Sincroniza datos pendientes hacia Supabase (PUSH) usando RPC transaccional
 * y descarga datos nuevos/modificados de forma paginada (PULL).
 * Protegido contra concurrencia con un mutex de módulo.
 */
export async function sincronizarConNube(): Promise<ResultadoSincronizacion> {
  // Si ya hay una sincronización en curso, reutilizar la promesa existente
  if (isSyncInProgress && activeSyncPromise) {
    return activeSyncPromise;
  }

  if (!isSupabaseConfigured) {
    return {
      exito: false,
      elementosEnviados: 0,
      elementosConError: 0,
      mensaje: 'Supabase no está configurado en las variables de entorno.',
    };
  }

  if (typeof window !== 'undefined' && !navigator.onLine) {
    return {
      exito: false,
      elementosEnviados: 0,
      elementosConError: 0,
      mensaje: 'Sin conexión a internet. Los cambios se conservan seguros de forma local.',
    };
  }

  isSyncInProgress = true;

  activeSyncPromise = (async () => {
    let enviados = 0;
    let conError = 0;

    try {
      // --- FASE 1: PUSH (Enviar lo que se cobró u operó offline) ---
      // Traer elementos pendientes o procesables (excluyendo aquellos que ya superaron el límite de reintentos)
      const todosLosItems = await dbLocal.cola_sync.toArray();
      const itemsAProcesar = todosLosItems.filter(
        (item) => item.estado !== 'error' && (item.intentos || 0) < MAX_INTENTOS
      );

      for (const item of itemsAProcesar) {
        try {
          if (item.tabla === 'transaccion_pago') {
            // L1 & L2: RPC transaccional e idempotente en Postgres
            const payload = item.datos as TransaccionPagoData;
            const { data: rpcRes, error: rpcErr } = await supabase.rpc(
              'registrar_pago_sincronizado',
              {
                p_pago: payload.pago,
                p_detalles: payload.detalles,
              }
            );

            if (rpcErr) throw rpcErr;
            if (!rpcRes?.success) {
              throw new Error(rpcRes?.mensaje || 'Error desconocido al registrar pago.');
            }

            // Actualizar timestamp de sincronización en el registro local
            await dbLocal.pagos.update(payload.pago.id, {
              sincronizado_en: new Date().toISOString(),
            });
          } else if (item.tabla === 'pagos' && item.accion === 'INSERT') {
            // Compatibilidad hacia atrás con items individuales
            const { error } = await supabase.from('pagos').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          } else if (item.tabla === 'pago_detalles' && item.accion === 'INSERT') {
            const { error } = await supabase.from('pago_detalles').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          } else if (item.tabla === 'personas' && item.accion === 'INSERT') {
            const { error } = await supabase.from('personas').upsert(item.datos);
            if (error) throw error;
          } else if (item.tabla === 'tomas' && item.accion === 'INSERT') {
            const { error } = await supabase.from('tomas').upsert(item.datos);
            if (error) throw error;
          }

          // Si el envío concluyó con éxito, retirar de la cola local
          if (item.id !== undefined) {
            await dbLocal.cola_sync.delete(item.id);
            enviados++;
          }
        } catch (err: unknown) {
          console.error(`Error sincronizando item #${item.id} (${item.tabla}):`, err);
          conError++;
          if (item.id !== undefined) {
            const nuevosIntentos = (item.intentos || 0) + 1;
            const nuevoEstado = nuevosIntentos >= MAX_INTENTOS ? 'error' : 'pendiente';
            await dbLocal.cola_sync.update(item.id, {
              intentos: nuevosIntentos,
              estado: nuevoEstado,
              ultimo_error: obtenerMensajeError(err, 'Error de red o procesamiento.'),
            });
          }
        }
      }

      // --- FASE 2: PULL Paginado e Incremental ---
      try {
        const configTimestamp = await dbLocal.config_sync.get('ultima_sincronizacion');
        const desdeTimestamp = configTimestamp ? configTimestamp.valor : null;
        const inicioDescarga = new Date().toISOString();

        const [personasNuevas, tomasNuevas, manzanasNuevas, tarifasNuevas] = await Promise.all([
          descargarTablaPaginada<Persona>('personas', desdeTimestamp),
          descargarTablaPaginada<Toma>('tomas', desdeTimestamp),
          descargarTablaPaginada<Manzana>('manzanas', desdeTimestamp),
          descargarTablaPaginada<Tarifa>('tarifas', desdeTimestamp),
        ]);

        // Procesar inserciones/actualizaciones y borrados suaves (soft-deletes)
        if (personasNuevas.length > 0) {
          const activas = personasNuevas.filter((p) => !p.deleted_at);
          const eliminadas = personasNuevas.filter((p) => !!p.deleted_at);
          if (activas.length > 0) await dbLocal.personas.bulkPut(activas);
          for (const p of eliminadas) await dbLocal.personas.delete(p.id);
        }

        if (tomasNuevas.length > 0) {
          const activas = tomasNuevas.filter((t) => !t.deleted_at);
          const eliminadas = tomasNuevas.filter((t) => !!t.deleted_at);
          if (activas.length > 0) await dbLocal.tomas.bulkPut(activas);
          for (const t of eliminadas) await dbLocal.tomas.delete(t.id);
        }

        if (manzanasNuevas.length > 0) {
          const activas = manzanasNuevas.filter((m) => !m.deleted_at);
          const eliminadas = manzanasNuevas.filter((m) => !!m.deleted_at);
          if (activas.length > 0) await dbLocal.manzanas.bulkPut(activas);
          for (const m of eliminadas) await dbLocal.manzanas.delete(m.id);
        }

        if (tarifasNuevas.length > 0) {
          await dbLocal.tarifas.bulkPut(tarifasNuevas);
        }

        // Actualizar marca de agua de última sincronización completada
        await dbLocal.config_sync.put({
          clave: 'ultima_sincronizacion',
          valor: inicioDescarga,
        });
      } catch (pullErr) {
        console.warn('Error durante PULL incremental:', pullErr);
      }

      return {
        exito: true,
        elementosEnviados: enviados,
        elementosConError: conError,
        mensaje: `Sincronización finalizada. ${enviados} subido(s) a la nube.${conError > 0 ? ` ${conError} con error.` : ''}`,
      };
    } finally {
      isSyncInProgress = false;
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

/**
 * Obtiene el resumen actual de la cola de sincronización, errores y conectividad
 */
export async function obtenerEstadoSincronizacion(): Promise<ResumenSincronizacion> {
  const todosLosItems = await dbLocal.cola_sync.toArray();
  const pendientes = todosLosItems.filter((i) => i.estado !== 'error' && (i.intentos || 0) < MAX_INTENTOS).length;
  const conError = todosLosItems.filter((i) => i.estado === 'error' || (i.intentos || 0) >= MAX_INTENTOS).length;
  const config = await dbLocal.config_sync.get('ultima_sincronizacion');

  return {
    pendientes,
    conError,
    ultimaSincronizacion: config ? config.valor : null,
    enLinea: typeof window !== 'undefined' ? navigator.onLine : true,
    sincronizando: isSyncInProgress,
  };
}

/**
 * Reintenta manualmente un elemento que se encontraba en estado 'error'
 */
export async function reintentarElementoError(id: number): Promise<boolean> {
  await dbLocal.cola_sync.update(id, {
    intentos: 0,
    estado: 'pendiente',
    ultimo_error: undefined,
  });
  sincronizarConNube().catch(console.error);
  return true;
}

/**
 * Obtiene la lista de elementos envenenados o con fallos permanentes en la cola local
 */
export async function obtenerElementosConError(): Promise<ElementoColaSync[]> {
  const items = await dbLocal.cola_sync.toArray();
  return items.filter((i) => i.estado === 'error' || (i.intentos || 0) >= MAX_INTENTOS);
}
