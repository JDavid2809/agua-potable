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
 * Determina si un error corresponde a una falla real de red / desconexión
 */
function esErrorDeRed(err: unknown): boolean {
  if (typeof window !== 'undefined' && !navigator.onLine) return true;
  const msg = obtenerMensajeError(err, '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('internet') ||
    msg.includes('offline')
  );
}

function generarSufijoDispositivoSeguro(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(2);
      crypto.getRandomValues(buffer);
      return Array.from(buffer, (n) => n.toString(16).padStart(8, '0'))
        .join('')
        .substring(0, 8)
        .toUpperCase();
    }
  }
  return Date.now().toString(36).toUpperCase();
}

/**
 * Obtiene o inicializa un identificador único persistente para este dispositivo físico.
 * Utilizado para generar folios únicos offline y auditar el origen del cobro.
 */
export async function obtenerODefinirDispositivoId(): Promise<string> {
  if (typeof window === 'undefined') {
    return 'DEV-SERVER';
  }

  let deviceId = localStorage.getItem('fluvib_device_id');
  if (deviceId && deviceId.trim()) {
    return deviceId.trim();
  }

  const registroDb = await dbLocal.config_sync.get('device_id');
  if (registroDb && registroDb.valor) {
    deviceId = registroDb.valor;
    localStorage.setItem('fluvib_device_id', deviceId);
    return deviceId;
  }

  const randomPart = generarSufijoDispositivoSeguro();

  deviceId = `DEV-${randomPart}`;

  localStorage.setItem('fluvib_device_id', deviceId);
  await dbLocal.config_sync.put({ clave: 'device_id', valor: deviceId });

  return deviceId;
}

/**
 * Genera un folio garantizado único por dispositivo y año.
 * Formato: REC-{ANIO}-{DISPOSITIVO_CORTO}-{CORRELATIVO} (Ej: REC-2026-F8A2-0001)
 */
export async function generarFolioOffline(_organizacionId?: string): Promise<string> {
  void _organizacionId;
  const deviceId = await obtenerODefinirDispositivoId();
  const shortDevice = deviceId.replace('DEV-', '').substring(0, 4);
  const anio = new Date().getFullYear();
  const claveCorrelativo = `correlativo_folio_${anio}`;

  const itemConfig = await dbLocal.config_sync.get(claveCorrelativo);
  let consecutivo = 1;
  if (itemConfig && !Number.isNaN(Number.parseInt(itemConfig.valor, 10))) {
    consecutivo = Number.parseInt(itemConfig.valor, 10) + 1;
  }

  await dbLocal.config_sync.put({
    clave: claveCorrelativo,
    valor: consecutivo.toString(),
  });

  const numeroPadded = consecutivo.toString().padStart(4, '0');
  return `REC-${anio}-${shortDevice}-${numeroPadded}`;
}

/**
 * Guarda un pago y sus detalles directamente en Supabase.
 * 1. Intenta primero la RPC transaccional `registrar_pago_sincronizado`.
 * 2. Si la RPC falla (ej. restricción antigua UNIQUE(toma_id, anio, mes) o RPC no creada),
 *    ejecuta INSERT directo en `pagos`, `pago_detalles` y actualiza `tomas.saldo_pendiente`.
 *    Usa `.insert()` en lugar de `.upsert()` para no requerir permisos RLS de UPDATE (cobros.anular).
 */
async function guardarPagoEnSupabase(
  pago: Pago,
  detalles: PagoDetalle[]
): Promise<{ folioFinal: string }> {
  let folioActual = pago.folio;

  const pagoLimpio: Record<string, unknown> = {
    id: pago.id,
    organizacion_id: pago.organizacion_id,
    folio: folioActual,
    persona_id: pago.persona_id,
    cajero_id: pago.cajero_id || null,
    total: Number(pago.total),
    metodo_pago: pago.metodo_pago || 'efectivo',
    fecha_pago: pago.fecha_pago || new Date().toISOString(),
    estado: pago.estado || 'completado',
    notas: pago.notas || null,
    dispositivo_offline_id: pago.dispositivo_offline_id || null,
    created_at: pago.created_at || new Date().toISOString(),
  };

  const detallesLimpios: Record<string, unknown>[] = (detalles || []).map((d) => ({
    id: d.id,
    organizacion_id: d.organizacion_id || pago.organizacion_id,
    pago_id: d.pago_id || pago.id,
    toma_id: d.toma_id,
    anio: Number(d.anio),
    mes: Number(d.mes),
    monto: Number(d.monto),
    recargo: Number(d.recargo || 0),
    created_at: d.created_at || new Date().toISOString(),
  }));

  // 1. Intentar mediante RPC transaccional
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    'registrar_pago_sincronizado',
    {
      p_pago: pagoLimpio,
      p_detalles: detallesLimpios,
    }
  );

  if (!rpcErr && rpcRes?.success) {
    return { folioFinal: (rpcRes.folio as string) || folioActual };
  }

  if (rpcErr) {
    console.warn(
      `[SyncEngine] RPC registrar_pago_sincronizado devolvió error (${rpcErr.code}): ${rpcErr.message}. Usando inserción directa.`
    );
  }

  // 2. Fallback directo con INSERT (compatible con políticas RLS de cobros.crear)
  const { data: pagoExistente } = await supabase
    .from('pagos')
    .select('id, folio')
    .eq('id', pago.id)
    .maybeSingle();

  if (!pagoExistente) {
    let { error: errInsertPago } = await supabase.from('pagos').insert(pagoLimpio);

    // Si hubo colisión de folio en la misma organización, agregar sufijo único y reintentar
    if (
      errInsertPago &&
      (errInsertPago.code === '23505' || errInsertPago.message?.includes('duplicate key')) &&
      errInsertPago.message?.includes('folio')
    ) {
      folioActual = `${folioActual}-${pago.id.substring(0, 4).toUpperCase()}`;
      pagoLimpio.folio = folioActual;
      const retry = await supabase.from('pagos').insert(pagoLimpio);
      errInsertPago = retry.error;
    }

    if (
      errInsertPago &&
      errInsertPago.code !== '23505' &&
      !errInsertPago.message?.includes('duplicate key')
    ) {
      throw errInsertPago;
    }
  } else if (pagoExistente.folio) {
    folioActual = pagoExistente.folio;
  }

  // 3. Insertar cada detalle de pago con INSERT individual tolerante a duplicados de periodo
  for (const det of detallesLimpios) {
    const { error: errDet } = await supabase.from('pago_detalles').insert(det);
    if (errDet) {
      const esDuplicado =
        errDet.code === '23505' || errDet.message?.includes('duplicate key');
      if (!esDuplicado) {
        throw errDet;
      }
    }
  }

  // 4. Descontar saldo pendiente de la toma en Supabase
  for (const det of detallesLimpios) {
    try {
      const { data: tomaNube } = await supabase
        .from('tomas')
        .select('saldo_pendiente')
        .eq('id', det.toma_id)
        .maybeSingle();

      if (tomaNube && typeof tomaNube.saldo_pendiente === 'number') {
        const nuevoSaldo = Math.max(0, Number(tomaNube.saldo_pendiente) - Number(det.monto));
        await supabase
          .from('tomas')
          .update({
            saldo_pendiente: nuevoSaldo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', det.toma_id);
      }
    } catch {
      // No bloquear si el rol cajero no tiene permiso de update directo en tomas
    }
  }

  return { folioFinal: folioActual };
}

/**
 * Registra un cobro:
 * - Si hay conexión a internet: lo guarda DIRECTAMENTE en Supabase sin encolarlo en local.
 * - Solo si NO hay internet (fallo de red real): lo guarda en IndexedDB (`cola_sync`)
 *   para sincronizarlo cuando regrese la conexión.
 */
export async function registrarPagoLocal(pago: Pago, detalles: PagoDetalle[]) {
  const deviceId = await obtenerODefinirDispositivoId();

  const pagoFinal: Pago = {
    ...pago,
    dispositivo_offline_id: pago.dispositivo_offline_id || deviceId,
    folio: pago.folio || (await generarFolioOffline(pago.organizacion_id)),
  };

  // MODO EN LÍNEA PRIMERO: Si hay conectividad, guardar directamente en Supabase
  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { folioFinal } = await guardarPagoEnSupabase(pagoFinal, detalles);
      pagoFinal.folio = folioFinal;
      pagoFinal.sincronizado_en = new Date().toISOString();

      // Actualizar caché local de solo lectura (sin agregar nada a cola_sync)
      try {
        await dbLocal.transaction('rw', [dbLocal.pagos, dbLocal.pago_detalles, dbLocal.tomas], async () => {
          await dbLocal.pagos.put(pagoFinal);
          for (const detalle of detalles) {
            await dbLocal.pago_detalles.put(detalle);
            const tomaLocal = await dbLocal.tomas.get(detalle.toma_id);
            if (tomaLocal) {
              const nuevoSaldo = Math.max(0, (tomaLocal.saldo_pendiente || 0) - detalle.monto);
              await dbLocal.tomas.update(detalle.toma_id, {
                saldo_pendiente: nuevoSaldo,
                updated_at: new Date().toISOString(),
              });
            }
          }
        });
      } catch {
        // Ignorar errores de caché local cuando ya se guardó en Supabase
      }

      // Aprovechar conexión para vaciar cualquier otro elemento antiguo de la cola
      sincronizarConNube().catch(() => {});

      return {
        success: true,
        pagoId: pagoFinal.id,
        folio: pagoFinal.folio,
        guardadoEnNube: true,
      };
    } catch (err: unknown) {
      // Si NO es un fallo de desconexión de internet (ej. error de permisos o validación de BD),
      // lanzar el error para que el usuario lo vea en pantalla y NO guardarlo engañosamente en local.
      if (!esErrorDeRed(err)) {
        throw err;
      }
      console.warn('[SyncEngine] Sin conexión real a Supabase, guardando cobro en cola offline:', err);
    }
  }

  // MODO OFFLINE (Solo cuando realmente no hay conexión a internet)
  await dbLocal.transaction('rw', [dbLocal.pagos, dbLocal.pago_detalles, dbLocal.tomas, dbLocal.cola_sync], async () => {
    await dbLocal.pagos.put(pagoFinal);

    for (const detalle of detalles) {
      await dbLocal.pago_detalles.put(detalle);

      const tomaLocal = await dbLocal.tomas.get(detalle.toma_id);
      if (tomaLocal) {
        const nuevoSaldo = Math.max(0, (tomaLocal.saldo_pendiente || 0) - detalle.monto);
        await dbLocal.tomas.update(detalle.toma_id, {
          saldo_pendiente: nuevoSaldo,
          updated_at: new Date().toISOString(),
        });
      }
    }

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

  return {
    success: true,
    pagoId: pagoFinal.id,
    folio: pagoFinal.folio,
    guardadoEnNube: false,
  };
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
 * Sincroniza todos los datos pendientes en `cola_sync` hacia Supabase (PUSH)
 * y descarga datos nuevos/modificados de forma paginada (PULL).
 */
export async function sincronizarConNube(): Promise<ResultadoSincronizacion> {
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
      // --- FASE 1: PUSH (Procesar elementos activos pendientes de la cola local) ---
      const todosLosItemsCola = await dbLocal.cola_sync.toArray();
      const itemsConErrorPermanente = todosLosItemsCola.filter(
        (i) => i.estado === 'error' || (i.intentos || 0) >= MAX_INTENTOS
      );
      const itemsAProcesar = todosLosItemsCola.filter(
        (i) => i.estado !== 'error' && (i.intentos || 0) < MAX_INTENTOS
      );
      conError += itemsConErrorPermanente.length;

      for (const item of itemsAProcesar) {
        try {
          if (item.tabla === 'transaccion_pago') {
            const payload = item.datos as TransaccionPagoData;
            const { folioFinal } = await guardarPagoEnSupabase(
              payload.pago,
              payload.detalles || []
            );

            await dbLocal.pagos.update(payload.pago.id, {
              folio: folioFinal,
              sincronizado_en: new Date().toISOString(),
            });
          } else if (item.tabla === 'pagos' && item.accion === 'INSERT') {
            const { error } = await supabase.from('pagos').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          } else if (item.tabla === 'pago_detalles' && item.accion === 'INSERT') {
            const { error } = await supabase.from('pago_detalles').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          } else if (item.tabla === 'personas' && item.accion === 'INSERT') {
            const { error } = await supabase.from('personas').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          } else if (item.tabla === 'tomas' && item.accion === 'INSERT') {
            const { error } = await supabase.from('tomas').insert(item.datos);
            if (error && !error.message.includes('duplicate key')) throw error;
          }

          // Si el envío concluyó con éxito, retirar de la cola local
          if (item.id !== undefined) {
            await dbLocal.cola_sync.delete(item.id);
            enviados++;
          }
        } catch (err: unknown) {
          const mensajeError = obtenerMensajeError(err);
          const detalleError =
            (err as any)?.details || (err as any)?.hint || (err as any)?.code || '';
          console.error(
            `[SyncEngine] Error sincronizando item #${item.id} (${item.tabla}): ${mensajeError}${
              detalleError ? ` | Detalle: ${detalleError}` : ''
            }`,
            err
          );
          conError++;
          if (item.id !== undefined) {
            const nuevosIntentos = (item.intentos || 0) + 1;
            const nuevoEstado = nuevosIntentos >= MAX_INTENTOS ? 'error' : 'pendiente';
            await dbLocal.cola_sync.update(item.id, {
              intentos: nuevosIntentos,
              estado: nuevoEstado,
              ultimo_error: `${mensajeError}${detalleError ? ` (${detalleError})` : ''}`,
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
          const eliminadas = manzanasNuevas.filter((m) => !!tHasDeleted(m));
          if (activas.length > 0) await dbLocal.manzanas.bulkPut(activas);
          for (const m of eliminadas) await dbLocal.manzanas.delete(m.id);
        }

        if (tarifasNuevas.length > 0) {
          await dbLocal.tarifas.bulkPut(tarifasNuevas);
        }

        await dbLocal.config_sync.put({
          clave: 'ultima_sincronizacion',
          valor: inicioDescarga,
        });
      } catch (pullErr) {
        console.warn('Error durante PULL incremental:', pullErr);
      }

      return {
        exito: conError === 0,
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

function tHasDeleted(m: Manzana): boolean {
  return Boolean(m.deleted_at);
}

/**
 * Obtiene el resumen actual de la cola de sincronización, errores y conectividad
 */
export async function obtenerEstadoSincronizacion(): Promise<ResumenSincronizacion> {
  const todosLosItems = await dbLocal.cola_sync.toArray();
  const pendientes = todosLosItems.length;
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
  await sincronizarConNube();
  return true;
}

/**
 * Obtiene la lista de elementos envenenados o con fallos en la cola local
 */
export async function obtenerElementosConError(): Promise<ElementoColaSync[]> {
  const items = await dbLocal.cola_sync.toArray();
  return items.filter((i) => i.estado === 'error' || (i.intentos || 0) >= MAX_INTENTOS || Boolean(i.ultimo_error));
}
