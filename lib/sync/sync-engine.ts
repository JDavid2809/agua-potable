import { dbLocal, obtenerOrganizacionIdLocal } from '@/lib/db/offline-db';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type {
  Pago,
  PagoDetalle,
  ElementoColaSync,
  TransaccionPagoData,
  TransaccionAbonoCoopData,
  TransaccionFaenaCoopData,
  Persona,
  Toma,
  Manzana,
  Tarifa,
  TipoToma,
  EstadoToma,
} from '@/types/database';
import type {
  Cooperacion,
  CooperacionPadronItem,
  CooperacionAbono,
  EstadoPadronCooperacion,
} from '@/types/cooperaciones';

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
export function esErrorDeRed(err: unknown): boolean {
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

/**
 * Genera un UUID v4 válido en el cliente para que los IDs creados offline coincidan al sincronizar
 */
export function generarUuidCliente(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Resuelve la organización activa usando Supabase online y respaldándose en IndexedDB si no hay conexión
 */
async function resolverOrganizacionId(): Promise<string> {
  const estaEnLinea = typeof window === 'undefined' || navigator.onLine;
  if (isSupabaseConfigured && estaEnLinea) {
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr && !esErrorDeRed(userErr)) {
        throw userErr;
      }
      if (user) {
        const { data: perfil, error: errPerfil } = await supabase
          .from('perfiles')
          .select('organizacion_id')
          .eq('id', user.id)
          .single();

        if (perfil?.organizacion_id) {
          await dbLocal.config_sync.put({
            clave: 'organizacion_activa_id',
            valor: perfil.organizacion_id,
          });
          return perfil.organizacion_id;
        }
        if (errPerfil && !esErrorDeRed(errPerfil)) {
          throw new Error('No se detectó una organización activa vinculada a tu cuenta.');
        }
      }
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) {
        throw err;
      }
    }
  }

  const orgLocal = await obtenerOrganizacionIdLocal();
  if (orgLocal) {
    return orgLocal;
  }

  throw new Error('No se detectó una organización activa vinculada a tu cuenta.');
}

function esErrorPermisoOValidacionRpc(err: unknown): boolean {
  const meta = err as { code?: string; message?: string } | null;
  const code = meta?.code || '';
  if (code === '42501' || code === '23505' || code === '23514' || code === 'P0001') {
    return true;
  }
  const msg = obtenerMensajeError(err, '').toLowerCase();
  return (
    msg.includes('sin permisos') ||
    msg.includes('no autorizado') ||
    msg.includes('excede') ||
    msg.includes('no encontrada') ||
    msg.includes('inválido') ||
    msg.includes('invalido') ||
    msg.includes('liquidada') ||
    msg.includes('cancelada')
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
 * Genera un folio único de cooperación por dispositivo y año.
 * Formato: COOP-{ANIO}-{DISPOSITIVO_CORTO}-{CORRELATIVO}
 */
export async function generarFolioCooperacionOffline(): Promise<string> {
  const deviceId = await obtenerODefinirDispositivoId();
  const shortDevice = deviceId.replace('DEV-', '').substring(0, 4);
  const anio = new Date().getFullYear();
  const claveCorrelativo = `correlativo_coop_${anio}`;

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
  return `COOP-${anio}-${shortDevice}-${numeroPadded}`;
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
 * Envía un abono de cooperación a Supabase usando la RPC transaccional y fallback directo
 */
async function guardarAbonoCoopEnSupabase(
  payload: TransaccionAbonoCoopData
): Promise<{ abonoId: string; folioFinal: string }> {
  const { data: rpcAbono, error: errRpcAbono } = await supabase.rpc(
    'registrar_abono_cooperacion',
    {
      p_padron_id: payload.padron_id,
      p_monto_abono: payload.monto_abono,
      p_metodo_pago: payload.metodo_pago,
      p_notas: payload.notas || null,
    }
  );

  const rpcAbonoData = rpcAbono as { abono_id?: string; folio_recibo?: string } | null;
  if (!errRpcAbono && rpcAbonoData?.abono_id) {
    return {
      abonoId: rpcAbonoData.abono_id,
      folioFinal: rpcAbonoData.folio_recibo || payload.folio_recibo,
    };
  }

  if (errRpcAbono && (esErrorDeRed(errRpcAbono) || esErrorPermisoOValidacionRpc(errRpcAbono))) {
    throw errRpcAbono;
  }

  // Fallback transaccional directo por tablas (si la RPC no existe o no devolvió datos)
  const { data: abonoGuardado, error: errAbono } = await supabase
    .from('cooperacion_abonos')
    .insert([
      {
        id: payload.abono_id,
        organizacion_id: payload.organizacion_id,
        padron_id: payload.padron_id,
        folio_recibo: payload.folio_recibo,
        monto_abono: payload.monto_abono,
        saldo_anterior: payload.saldo_anterior,
        saldo_restante: payload.saldo_restante,
        metodo_pago: payload.metodo_pago,
        cajero_id: payload.cajero_id || null,
        notas: payload.notas || null,
        fecha_pago: payload.fecha_pago,
      },
    ])
    .select()
    .single();

  if (errAbono) {
    const esDuplicado =
      errAbono.code === '23505' || errAbono.message?.includes('duplicate key');
    if (!esDuplicado) {
      throw errAbono;
    }
  }

  const { error: errUpdatePadron } = await supabase
    .from('cooperacion_padron')
    .update({
      monto_pagado: payload.nuevo_total_pagado,
      monto_pendiente: payload.saldo_restante,
      estado: payload.nuevo_estado,
      fecha_liquidacion: payload.fecha_liquidacion || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.padron_id);

  if (errUpdatePadron) {
    throw errUpdatePadron;
  }

  const row = abonoGuardado as { id?: string; folio_recibo?: string } | null;
  return {
    abonoId: row?.id || payload.abono_id,
    folioFinal: row?.folio_recibo || payload.folio_recibo,
  };
}

/**
 * Envía acreditación de faena de cooperación a Supabase vía RPC y fallback directo
 */
async function guardarFaenaCoopEnSupabase(padronId: string, fechaFaena: string): Promise<void> {
  const { error: errRpcFaena } = await supabase.rpc('acreditar_faena_cooperacion', {
    p_padron_id: padronId,
    p_fecha_faena: fechaFaena,
  });

  if (!errRpcFaena) return;

  if (esErrorDeRed(errRpcFaena) || esErrorPermisoOValidacionRpc(errRpcFaena)) {
    throw errRpcFaena;
  }

  const { error: errFaena } = await supabase
    .from('cooperacion_padron')
    .update({
      cumplio_con_faena: true,
      fecha_faena: fechaFaena,
      monto_pendiente: 0,
      estado: 'exento_faena',
      updated_at: new Date().toISOString(),
    })
    .eq('id', padronId);

  if (errFaena) throw errFaena;
}

/**
 * Registra un abono de cooperación (online-first con respaldo offline en Dexie + cola_sync)
 */
export async function registrarAbonoCooperacionLocal(params: {
  organizacionId: string;
  item: CooperacionPadronItem;
  monto: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  notas?: string;
  cajeroId?: string | null;
}): Promise<{
  abono: CooperacionAbono;
  sincronizado: boolean;
  nuevoTotalPagado: number;
  nuevoSaldoRestante: number;
  nuevoEstado: EstadoPadronCooperacion;
  fechaLiquidacion: string | null;
}> {
  const { organizacionId, item, monto, metodoPago, notas, cajeroId } = params;
  const nuevoSaldoRestante = Math.max(0, Number(item.monto_pendiente) - monto);
  const nuevoTotalPagado = Number(item.monto_pagado) + monto;
  const nuevoEstado: EstadoPadronCooperacion =
    nuevoSaldoRestante <= 0 ? 'liquidado' : 'parcial';
  const fechaPago = new Date().toISOString();
  const fechaLiquidacion = nuevoEstado === 'liquidado' ? fechaPago : null;
  const abonoId = generarUuidCliente();
  const folioGenerado = await generarFolioCooperacionOffline();

  const payload: TransaccionAbonoCoopData = {
    abono_id: abonoId,
    organizacion_id: organizacionId,
    padron_id: item.id,
    folio_recibo: folioGenerado,
    monto_abono: monto,
    saldo_anterior: Number(item.monto_pendiente),
    saldo_restante: nuevoSaldoRestante,
    metodo_pago: metodoPago,
    cajero_id: cajeroId || null,
    notas: notas?.trim() || null,
    fecha_pago: fechaPago,
    nuevo_total_pagado: nuevoTotalPagado,
    nuevo_estado: nuevoEstado,
    fecha_liquidacion: fechaLiquidacion,
  };

  const padronBaseLimpio: CooperacionPadronItem = {
    id: item.id,
    organizacion_id: item.organizacion_id,
    cooperacion_id: item.cooperacion_id,
    persona_id: item.persona_id,
    toma_id: item.toma_id ?? null,
    monto_requerido: item.monto_requerido,
    monto_pagado: nuevoTotalPagado,
    monto_pendiente: nuevoSaldoRestante,
    cumplio_con_faena: item.cumplio_con_faena,
    fecha_faena: item.fecha_faena ?? null,
    estado: nuevoEstado,
    fecha_liquidacion: fechaLiquidacion,
    notas: item.notas,
    created_at: item.created_at,
    updated_at: fechaPago,
  };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { abonoId: idFinal, folioFinal } = await guardarAbonoCoopEnSupabase(payload);
      const abonoFinal: CooperacionAbono = {
        id: idFinal,
        organizacion_id: organizacionId,
        padron_id: item.id,
        folio_recibo: folioFinal,
        monto_abono: monto,
        saldo_anterior: Number(item.monto_pendiente),
        saldo_restante: nuevoSaldoRestante,
        metodo_pago: metodoPago,
        fecha_pago: fechaPago,
        cajero_id: cajeroId || undefined,
        notas: notas?.trim() || undefined,
        created_at: fechaPago,
      };

      try {
        await dbLocal.transaction(
          'rw',
          [dbLocal.cooperacion_abonos, dbLocal.cooperacion_padron],
          async () => {
            await dbLocal.cooperacion_abonos.put(abonoFinal);
            await dbLocal.cooperacion_padron.put(padronBaseLimpio);
          }
        );
      } catch {
        // Ignorar error de caché local cuando ya se guardó en Supabase
      }

      sincronizarConNube().catch(() => {});

      return {
        abono: abonoFinal,
        sincronizado: true,
        nuevoTotalPagado,
        nuevoSaldoRestante,
        nuevoEstado,
        fechaLiquidacion,
      };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) {
        throw err;
      }
      console.warn('[SyncEngine] Sin conexión real, guardando abono de cooperación offline:', err);
    }
  }

  const abonoLocal: CooperacionAbono = {
    id: abonoId,
    organizacion_id: organizacionId,
    padron_id: item.id,
    folio_recibo: folioGenerado,
    monto_abono: monto,
    saldo_anterior: Number(item.monto_pendiente),
    saldo_restante: nuevoSaldoRestante,
    metodo_pago: metodoPago,
    fecha_pago: fechaPago,
    cajero_id: cajeroId || undefined,
    notas: notas?.trim() || undefined,
    created_at: fechaPago,
  };

  await dbLocal.transaction(
    'rw',
    [dbLocal.cooperacion_abonos, dbLocal.cooperacion_padron, dbLocal.cola_sync],
    async () => {
      await dbLocal.cooperacion_abonos.put(abonoLocal);
      await dbLocal.cooperacion_padron.put(padronBaseLimpio);
      await dbLocal.cola_sync.add({
        tabla: 'cooperacion_abono',
        accion: 'INSERT',
        registro_id: abonoId,
        datos: payload,
        creado_en: fechaPago,
        intentos: 0,
        estado: 'pendiente',
      });
    }
  );

  return {
    abono: abonoLocal,
    sincronizado: false,
    nuevoTotalPagado,
    nuevoSaldoRestante,
    nuevoEstado,
    fechaLiquidacion,
  };
}

/**
 * Acredita cumplimiento por faena comunitaria (online-first con respaldo offline en Dexie)
 */
export async function acreditarFaenaCooperacionLocal(params: {
  item: CooperacionPadronItem;
  fechaFaena?: string;
}): Promise<{ sincronizado: boolean; fechaFaena: string }> {
  const { item } = params;
  const fechaHoy = params.fechaFaena || new Date().toISOString().split('T')[0];
  const ahora = new Date().toISOString();

  const padronActualizado: CooperacionPadronItem = {
    id: item.id,
    organizacion_id: item.organizacion_id,
    cooperacion_id: item.cooperacion_id,
    persona_id: item.persona_id,
    toma_id: item.toma_id ?? null,
    monto_requerido: item.monto_requerido,
    monto_pagado: item.monto_pagado,
    monto_pendiente: 0,
    cumplio_con_faena: true,
    fecha_faena: fechaHoy,
    estado: 'exento_faena',
    fecha_liquidacion: item.fecha_liquidacion ?? null,
    notas: item.notas,
    created_at: item.created_at,
    updated_at: ahora,
  };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      await guardarFaenaCoopEnSupabase(item.id, fechaHoy);
      try {
        await dbLocal.cooperacion_padron.put(padronActualizado);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true, fechaFaena: fechaHoy };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) {
        throw err;
      }
      console.warn('[SyncEngine] Sin conexión real, guardando acreditación de faena offline:', err);
    }
  }

  await dbLocal.transaction('rw', [dbLocal.cooperacion_padron, dbLocal.cola_sync], async () => {
    await dbLocal.cooperacion_padron.put(padronActualizado);
    await dbLocal.cola_sync.add({
      tabla: 'cooperacion_faena',
      accion: 'UPDATE',
      registro_id: item.id,
      datos: {
        padron_id: item.id,
        fecha_faena: fechaHoy,
      } as TransaccionFaenaCoopData,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false, fechaFaena: fechaHoy };
}

/**
 * Crea o actualiza una Persona (y opcionalmente su Toma inicial) con soporte Offline-First
 */
export async function guardarPersonaLocal(params: {
  personaEnEdicion?: Persona | null;
  nombreCompleto: string;
  documentoIdentidad?: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
  activo: boolean;
  tomaInicial?: {
    manzanaId: string | null;
    codigoToma: string;
    direccionReferencia: string;
    tipoToma: TipoToma;
    numeroMedidor?: string;
  } | null;
}): Promise<{ sincronizado: boolean; personaId: string; tomaError?: string }> {
  const ahora = new Date().toISOString();
  const { personaEnEdicion, tomaInicial } = params;

  if (personaEnEdicion) {
    const payloadUpdate = {
      nombre_completo: params.nombreCompleto.trim(),
      documento_identidad: params.documentoIdentidad?.trim() || null,
      telefono: params.telefono?.trim() || null,
      direccion: params.direccion?.trim() || null,
      notas: params.notas?.trim() || null,
      activo: params.activo,
      updated_at: ahora,
    };

    const personaLocal: Persona = {
      id: personaEnEdicion.id,
      organizacion_id: personaEnEdicion.organizacion_id,
      nombre_completo: payloadUpdate.nombre_completo,
      documento_identidad: payloadUpdate.documento_identidad ?? undefined,
      telefono: payloadUpdate.telefono ?? undefined,
      direccion: payloadUpdate.direccion ?? undefined,
      notas: payloadUpdate.notas ?? undefined,
      activo: payloadUpdate.activo,
      created_at: personaEnEdicion.created_at,
      updated_at: ahora,
      deleted_at: personaEnEdicion.deleted_at ?? null,
    };

    if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('personas')
          .update(payloadUpdate)
          .eq('id', personaEnEdicion.id);
        if (error) throw error;

        try {
          await dbLocal.personas.put(personaLocal);
        } catch {
          // Ignorar error de caché local
        }
        sincronizarConNube().catch(() => {});
        return { sincronizado: true, personaId: personaEnEdicion.id };
      } catch (err: unknown) {
        if (!esErrorDeRed(err)) throw err;
      }
    }

    await dbLocal.transaction('rw', [dbLocal.personas, dbLocal.cola_sync], async () => {
      await dbLocal.personas.put(personaLocal);
      await dbLocal.cola_sync.add({
        tabla: 'personas',
        accion: 'UPDATE',
        registro_id: personaEnEdicion.id,
        datos: payloadUpdate,
        creado_en: ahora,
        intentos: 0,
        estado: 'pendiente',
      });
    });

    return { sincronizado: false, personaId: personaEnEdicion.id };
  }

  // Modo creación
  const orgId = await resolverOrganizacionId();
  const personaId = generarUuidCliente();
  const payloadInsertPersona = {
    id: personaId,
    organizacion_id: orgId,
    nombre_completo: params.nombreCompleto.trim(),
    documento_identidad: params.documentoIdentidad?.trim() || null,
    telefono: params.telefono?.trim() || null,
    direccion: params.direccion?.trim() || null,
    notas: params.notas?.trim() || null,
    activo: true,
    created_at: ahora,
    updated_at: ahora,
  };

  const personaLocal: Persona = {
    id: personaId,
    organizacion_id: orgId,
    nombre_completo: payloadInsertPersona.nombre_completo,
    documento_identidad: payloadInsertPersona.documento_identidad ?? undefined,
    telefono: payloadInsertPersona.telefono ?? undefined,
    direccion: payloadInsertPersona.direccion ?? undefined,
    notas: payloadInsertPersona.notas ?? undefined,
    activo: true,
    created_at: ahora,
    updated_at: ahora,
  };

  const tomaId = tomaInicial ? generarUuidCliente() : null;
  const payloadInsertToma = tomaInicial && tomaId
    ? {
        id: tomaId,
        organizacion_id: orgId,
        persona_id: personaId,
        manzana_id: tomaInicial.manzanaId || null,
        codigo_toma: tomaInicial.codigoToma.trim().toUpperCase(),
        direccion_referencia: tomaInicial.direccionReferencia.trim(),
        tipo_toma: tomaInicial.tipoToma,
        estado: 'activa' as EstadoToma,
        numero_medidor: tomaInicial.numeroMedidor?.trim() || null,
        saldo_pendiente: 0.0,
        created_at: ahora,
        updated_at: ahora,
      }
    : null;

  const tomaLocal: Toma | null = payloadInsertToma
    ? {
        id: payloadInsertToma.id,
        organizacion_id: orgId,
        codigo_toma: payloadInsertToma.codigo_toma,
        persona_id: personaId,
        manzana_id: payloadInsertToma.manzana_id ?? undefined,
        direccion_referencia: payloadInsertToma.direccion_referencia,
        tipo_toma: payloadInsertToma.tipo_toma,
        estado: 'activa',
        numero_medidor: payloadInsertToma.numero_medidor ?? undefined,
        saldo_pendiente: 0.0,
        created_at: ahora,
        updated_at: ahora,
      }
    : null;

  let personaGuardadaEnNube = false;

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error: errPersona } = await supabase.from('personas').insert(payloadInsertPersona);
      if (errPersona) throw errPersona;
      personaGuardadaEnNube = true;

      try {
        await dbLocal.personas.put(personaLocal);
      } catch {
        // Ignorar error de caché local
      }

      if (payloadInsertToma && tomaLocal) {
        const { error: errToma } = await supabase.from('tomas').insert(payloadInsertToma);
        if (errToma) {
          if (esErrorDeRed(errToma)) {
            await dbLocal.transaction('rw', [dbLocal.tomas, dbLocal.cola_sync], async () => {
              await dbLocal.tomas.put(tomaLocal);
              await dbLocal.cola_sync.add({
                tabla: 'tomas',
                accion: 'INSERT',
                registro_id: tomaLocal.id,
                datos: payloadInsertToma,
                creado_en: ahora,
                intentos: 0,
                estado: 'pendiente',
              });
            });
            return { sincronizado: false, personaId };
          }
          sincronizarConNube().catch(() => {});
          return {
            sincronizado: true,
            personaId,
            tomaError: obtenerMensajeError(errToma, 'No se pudo registrar la toma inicial.'),
          };
        }

        try {
          await dbLocal.tomas.put(tomaLocal);
        } catch {
          // Ignorar error de caché local
        }
      }

      sincronizarConNube().catch(() => {});
      return { sincronizado: true, personaId };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) {
        throw err;
      }
    }
  }

  // Fallback offline completo (en orden estricto de FK: primero persona, luego toma)
  await dbLocal.transaction('rw', [dbLocal.personas, dbLocal.tomas, dbLocal.cola_sync], async () => {
    if (!personaGuardadaEnNube) {
      await dbLocal.personas.put(personaLocal);
      await dbLocal.cola_sync.add({
        tabla: 'personas',
        accion: 'INSERT',
        registro_id: personaId,
        datos: payloadInsertPersona,
        creado_en: ahora,
        intentos: 0,
        estado: 'pendiente',
      });
    }

    if (payloadInsertToma && tomaLocal) {
      await dbLocal.tomas.put(tomaLocal);
      await dbLocal.cola_sync.add({
        tabla: 'tomas',
        accion: 'INSERT',
        registro_id: tomaLocal.id,
        datos: payloadInsertToma,
        creado_en: ahora,
        intentos: 0,
        estado: 'pendiente',
      });
    }
  });

  return { sincronizado: false, personaId };
}

/**
 * Baja lógica de una Persona con soporte Offline-First
 */
export async function eliminarPersonaLocal(personaId: string): Promise<{ sincronizado: boolean }> {
  const ahora = new Date().toISOString();
  const datosBaja = { deleted_at: ahora };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('personas').update(datosBaja).eq('id', personaId);
      if (error) throw error;

      try {
        await dbLocal.personas.delete(personaId);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) throw err;
    }
  }

  await dbLocal.transaction('rw', [dbLocal.personas, dbLocal.cola_sync], async () => {
    await dbLocal.personas.delete(personaId);
    await dbLocal.cola_sync.add({
      tabla: 'personas',
      accion: 'DELETE',
      registro_id: personaId,
      datos: datosBaja,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false };
}

/**
 * Crea o actualiza una Toma de agua con soporte Offline-First
 */
export async function guardarTomaLocal(params: {
  tomaEnEdicion?: Toma | null;
  personaId: string;
  manzanaId?: string | null;
  codigoToma: string;
  tipoToma: TipoToma;
  estado?: EstadoToma;
  direccionReferencia: string;
  numeroMedidor?: string;
  saldoPendiente?: number;
}): Promise<{ sincronizado: boolean; tomaId: string }> {
  const ahora = new Date().toISOString();
  const { tomaEnEdicion } = params;

  if (tomaEnEdicion) {
    const payloadUpdate = {
      persona_id: params.personaId,
      manzana_id: params.manzanaId || null,
      codigo_toma: params.codigoToma.trim().toUpperCase(),
      tipo_toma: params.tipoToma,
      estado: params.estado || tomaEnEdicion.estado || 'activa',
      direccion_referencia: params.direccionReferencia.trim(),
      numero_medidor: params.numeroMedidor?.trim() || null,
      saldo_pendiente:
        typeof params.saldoPendiente === 'number'
          ? params.saldoPendiente
          : tomaEnEdicion.saldo_pendiente,
      updated_at: ahora,
    };

    const tomaLocal: Toma = {
      id: tomaEnEdicion.id,
      organizacion_id: tomaEnEdicion.organizacion_id,
      persona_id: payloadUpdate.persona_id,
      manzana_id: payloadUpdate.manzana_id ?? undefined,
      codigo_toma: payloadUpdate.codigo_toma,
      tipo_toma: payloadUpdate.tipo_toma,
      estado: payloadUpdate.estado,
      direccion_referencia: payloadUpdate.direccion_referencia,
      numero_medidor: payloadUpdate.numero_medidor ?? undefined,
      saldo_pendiente: payloadUpdate.saldo_pendiente,
      created_at: tomaEnEdicion.created_at,
      updated_at: ahora,
      deleted_at: tomaEnEdicion.deleted_at ?? null,
    };

    if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('tomas')
          .update(payloadUpdate)
          .eq('id', tomaEnEdicion.id);
        if (error) throw error;

        try {
          await dbLocal.tomas.put(tomaLocal);
        } catch {
          // Ignorar error de caché local
        }
        sincronizarConNube().catch(() => {});
        return { sincronizado: true, tomaId: tomaEnEdicion.id };
      } catch (err: unknown) {
        if (!esErrorDeRed(err)) throw err;
      }
    }

    await dbLocal.transaction('rw', [dbLocal.tomas, dbLocal.cola_sync], async () => {
      await dbLocal.tomas.put(tomaLocal);
      await dbLocal.cola_sync.add({
        tabla: 'tomas',
        accion: 'UPDATE',
        registro_id: tomaEnEdicion.id,
        datos: payloadUpdate,
        creado_en: ahora,
        intentos: 0,
        estado: 'pendiente',
      });
    });

    return { sincronizado: false, tomaId: tomaEnEdicion.id };
  }

  const orgId = await resolverOrganizacionId();
  const tomaId = generarUuidCliente();
  const payloadInsert = {
    id: tomaId,
    organizacion_id: orgId,
    persona_id: params.personaId,
    manzana_id: params.manzanaId || null,
    codigo_toma: params.codigoToma.trim().toUpperCase(),
    tipo_toma: params.tipoToma,
    estado: params.estado || ('activa' as EstadoToma),
    direccion_referencia: params.direccionReferencia.trim(),
    numero_medidor: params.numeroMedidor?.trim() || null,
    saldo_pendiente: typeof params.saldoPendiente === 'number' ? params.saldoPendiente : 0.0,
    created_at: ahora,
    updated_at: ahora,
  };

  const tomaLocal: Toma = {
    id: tomaId,
    organizacion_id: orgId,
    persona_id: payloadInsert.persona_id,
    manzana_id: payloadInsert.manzana_id ?? undefined,
    codigo_toma: payloadInsert.codigo_toma,
    tipo_toma: payloadInsert.tipo_toma,
    estado: payloadInsert.estado,
    direccion_referencia: payloadInsert.direccion_referencia,
    numero_medidor: payloadInsert.numero_medidor ?? undefined,
    saldo_pendiente: payloadInsert.saldo_pendiente,
    created_at: ahora,
    updated_at: ahora,
  };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('tomas').insert(payloadInsert);
      if (error) throw error;

      try {
        await dbLocal.tomas.put(tomaLocal);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true, tomaId };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) throw err;
    }
  }

  await dbLocal.transaction('rw', [dbLocal.tomas, dbLocal.cola_sync], async () => {
    await dbLocal.tomas.put(tomaLocal);
    await dbLocal.cola_sync.add({
      tabla: 'tomas',
      accion: 'INSERT',
      registro_id: tomaId,
      datos: payloadInsert,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false, tomaId };
}

/**
 * Baja lógica de una Toma con soporte Offline-First
 */
export async function eliminarTomaLocal(tomaId: string): Promise<{ sincronizado: boolean }> {
  const ahora = new Date().toISOString();
  const datosBaja = { deleted_at: ahora, estado: 'inactiva', updated_at: ahora };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('tomas').update(datosBaja).eq('id', tomaId);
      if (error) throw error;

      try {
        await dbLocal.tomas.delete(tomaId);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) throw err;
    }
  }

  await dbLocal.transaction('rw', [dbLocal.tomas, dbLocal.cola_sync], async () => {
    await dbLocal.tomas.delete(tomaId);
    await dbLocal.cola_sync.add({
      tabla: 'tomas',
      accion: 'DELETE',
      registro_id: tomaId,
      datos: datosBaja,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false };
}

/**
 * Crea o actualiza una Manzana con soporte Offline-First
 */
export async function guardarManzanaLocal(params: {
  manzanaEnEdicion?: Manzana | null;
  barrio: string;
  seccion: string;
  numeroManzana: string;
  cuadra?: string;
  descripcion?: string;
  activo: boolean;
}): Promise<{ sincronizado: boolean; manzanaId: string }> {
  const ahora = new Date().toISOString();
  const { manzanaEnEdicion } = params;

  if (manzanaEnEdicion) {
    const payloadUpdate = {
      barrio: params.barrio.trim(),
      seccion: params.seccion.trim() || '1',
      numero_manzana: params.numeroManzana.trim(),
      cuadra: params.cuadra?.trim() || null,
      descripcion: params.descripcion?.trim() || null,
      activo: params.activo,
      updated_at: ahora,
    };

    const manzanaLocal: Manzana = {
      id: manzanaEnEdicion.id,
      organizacion_id: manzanaEnEdicion.organizacion_id,
      barrio: payloadUpdate.barrio,
      seccion: payloadUpdate.seccion,
      numero_manzana: payloadUpdate.numero_manzana,
      cuadra: payloadUpdate.cuadra ?? undefined,
      descripcion: payloadUpdate.descripcion ?? undefined,
      activo: payloadUpdate.activo,
      created_at: manzanaEnEdicion.created_at,
      updated_at: ahora,
      deleted_at: manzanaEnEdicion.deleted_at ?? null,
    };

    if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('manzanas')
          .update(payloadUpdate)
          .eq('id', manzanaEnEdicion.id);
        if (error) throw error;

        try {
          await dbLocal.manzanas.put(manzanaLocal);
        } catch {
          // Ignorar error de caché local
        }
        sincronizarConNube().catch(() => {});
        return { sincronizado: true, manzanaId: manzanaEnEdicion.id };
      } catch (err: unknown) {
        if (!esErrorDeRed(err)) throw err;
      }
    }

    await dbLocal.transaction('rw', [dbLocal.manzanas, dbLocal.cola_sync], async () => {
      await dbLocal.manzanas.put(manzanaLocal);
      await dbLocal.cola_sync.add({
        tabla: 'manzanas',
        accion: 'UPDATE',
        registro_id: manzanaEnEdicion.id,
        datos: payloadUpdate,
        creado_en: ahora,
        intentos: 0,
        estado: 'pendiente',
      });
    });

    return { sincronizado: false, manzanaId: manzanaEnEdicion.id };
  }

  const orgId = await resolverOrganizacionId();
  const manzanaId = generarUuidCliente();
  const payloadInsert = {
    id: manzanaId,
    organizacion_id: orgId,
    barrio: params.barrio.trim(),
    seccion: params.seccion.trim() || '1',
    numero_manzana: params.numeroManzana.trim(),
    cuadra: params.cuadra?.trim() || null,
    descripcion: params.descripcion?.trim() || null,
    activo: true,
    created_at: ahora,
    updated_at: ahora,
  };

  const manzanaLocal: Manzana = {
    id: manzanaId,
    organizacion_id: orgId,
    barrio: payloadInsert.barrio,
    seccion: payloadInsert.seccion,
    numero_manzana: payloadInsert.numero_manzana,
    cuadra: payloadInsert.cuadra ?? undefined,
    descripcion: payloadInsert.descripcion ?? undefined,
    activo: true,
    created_at: ahora,
    updated_at: ahora,
  };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('manzanas').insert(payloadInsert);
      if (error) throw error;

      try {
        await dbLocal.manzanas.put(manzanaLocal);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true, manzanaId };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) throw err;
    }
  }

  await dbLocal.transaction('rw', [dbLocal.manzanas, dbLocal.cola_sync], async () => {
    await dbLocal.manzanas.put(manzanaLocal);
    await dbLocal.cola_sync.add({
      tabla: 'manzanas',
      accion: 'INSERT',
      registro_id: manzanaId,
      datos: payloadInsert,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false, manzanaId };
}

/**
 * Baja lógica de una Manzana con soporte Offline-First
 */
export async function eliminarManzanaLocal(manzanaId: string): Promise<{ sincronizado: boolean }> {
  const ahora = new Date().toISOString();
  const datosBaja = { deleted_at: ahora, activo: false, updated_at: ahora };

  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('manzanas').update(datosBaja).eq('id', manzanaId);
      if (error) throw error;

      try {
        await dbLocal.manzanas.delete(manzanaId);
      } catch {
        // Ignorar error de caché local
      }
      sincronizarConNube().catch(() => {});
      return { sincronizado: true };
    } catch (err: unknown) {
      if (!esErrorDeRed(err)) throw err;
    }
  }

  await dbLocal.transaction('rw', [dbLocal.manzanas, dbLocal.cola_sync], async () => {
    await dbLocal.manzanas.delete(manzanaId);
    await dbLocal.cola_sync.add({
      tabla: 'manzanas',
      accion: 'DELETE',
      registro_id: manzanaId,
      datos: datosBaja,
      creado_en: ahora,
      intentos: 0,
      estado: 'pendiente',
    });
  });

  return { sincronizado: false };
}

/**
 * Descarga registros de una tabla de forma paginada e incremental desde Supabase
 */
async function descargarTablaPaginada<
  T extends { id: string; updated_at?: string; created_at?: string; deleted_at?: string | null },
>(
  nombreTabla:
    | 'personas'
    | 'tomas'
    | 'manzanas'
    | 'tarifas'
    | 'cooperaciones'
    | 'cooperacion_padron'
    | 'cooperacion_abonos',
  desdeTimestamp: string | null,
  columnaTimestamp: 'updated_at' | 'created_at' = 'updated_at'
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
      query = query.gt(columnaTimestamp, desdeTimestamp);
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
      mensaje: 'El servicio no está disponible en este momento.',
    };
  }

  if (typeof window !== 'undefined' && !navigator.onLine) {
    return {
      exito: false,
      elementosEnviados: 0,
      elementosConError: 0,
      mensaje: 'Sin conexión a internet. Tus cambios siguen guardados en este equipo.',
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
          } else if (item.tabla === 'cooperacion_abono') {
            const payload = item.datos as TransaccionAbonoCoopData;
            const { abonoId, folioFinal } = await guardarAbonoCoopEnSupabase(payload);

            if (abonoId !== payload.abono_id) {
              const localPrev = await dbLocal.cooperacion_abonos.get(payload.abono_id);
              await dbLocal.cooperacion_abonos.delete(payload.abono_id);
              await dbLocal.cooperacion_abonos.put({
                id: abonoId,
                organizacion_id: payload.organizacion_id,
                padron_id: payload.padron_id,
                folio_recibo: folioFinal,
                monto_abono: payload.monto_abono,
                saldo_anterior: payload.saldo_anterior,
                saldo_restante: payload.saldo_restante,
                metodo_pago: payload.metodo_pago,
                fecha_pago: payload.fecha_pago,
                cajero_id: payload.cajero_id || undefined,
                notas: payload.notas || undefined,
                created_at: localPrev?.created_at || payload.fecha_pago,
              });
            } else {
              await dbLocal.cooperacion_abonos.update(payload.abono_id, {
                folio_recibo: folioFinal,
              });
            }
          } else if (item.tabla === 'cooperacion_faena') {
            const payload = item.datos as TransaccionFaenaCoopData;
            await guardarFaenaCoopEnSupabase(payload.padron_id, payload.fecha_faena);
          } else if (
            item.tabla === 'pagos' ||
            item.tabla === 'pago_detalles' ||
            item.tabla === 'personas' ||
            item.tabla === 'tomas' ||
            item.tabla === 'manzanas'
          ) {
            if (item.accion === 'INSERT') {
              const { error } = await supabase
                .from(item.tabla)
                .insert(item.datos as Record<string, unknown>);
              if (error && !error.message.includes('duplicate key')) throw error;
            } else if (item.accion === 'UPDATE') {
              const { error } = await supabase
                .from(item.tabla)
                .update(item.datos as Record<string, unknown>)
                .eq('id', item.registro_id);
              if (error) throw error;
            } else if (item.accion === 'DELETE') {
              if (
                item.tabla === 'personas' ||
                item.tabla === 'tomas' ||
                item.tabla === 'manzanas'
              ) {
                const payloadDelete =
                  item.datos && typeof item.datos === 'object' && 'deleted_at' in item.datos
                    ? (item.datos as Record<string, unknown>)
                    : { deleted_at: new Date().toISOString() };
                const { error } = await supabase
                  .from(item.tabla)
                  .update(payloadDelete)
                  .eq('id', item.registro_id);
                if (error) throw error;
              } else {
                const { error } = await supabase
                  .from(item.tabla)
                  .delete()
                  .eq('id', item.registro_id);
                if (error) throw error;
              }
            }
          }

          // Si el envío concluyó con éxito, retirar de la cola local
          if (item.id !== undefined) {
            await dbLocal.cola_sync.delete(item.id);
            enviados++;
          }
        } catch (err: unknown) {
          const mensajeError = obtenerMensajeError(err);
          const errMeta = err as {
            details?: string;
            hint?: string;
            code?: string;
          } | null;
          const detalleError =
            errMeta?.details || errMeta?.hint || errMeta?.code || '';
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

      // --- FASE 2B: PULL Incremental de Cooperaciones ---
      try {
        const configCoop = await dbLocal.config_sync.get('ultima_sincronizacion_cooperaciones');
        const desdeCoop = configCoop ? configCoop.valor : null;
        const inicioDescargaCoop = new Date().toISOString();

        const [coopsNuevas, padronNuevo, abonosNuevos] = await Promise.all([
          descargarTablaPaginada<Cooperacion>('cooperaciones', desdeCoop, 'updated_at'),
          descargarTablaPaginada<CooperacionPadronItem>(
            'cooperacion_padron',
            desdeCoop,
            'updated_at'
          ),
          descargarTablaPaginada<CooperacionAbono>(
            'cooperacion_abonos',
            desdeCoop,
            'created_at'
          ),
        ]);

        if (coopsNuevas.length > 0) {
          const activas = coopsNuevas.filter((c) => !c.deleted_at);
          const eliminadas = coopsNuevas.filter((c) => Boolean(c.deleted_at));
          if (activas.length > 0) await dbLocal.cooperaciones.bulkPut(activas);
          for (const c of eliminadas) await dbLocal.cooperaciones.delete(c.id);
        }

        if (padronNuevo.length > 0) {
          await dbLocal.cooperacion_padron.bulkPut(padronNuevo);
        }

        if (abonosNuevos.length > 0) {
          await dbLocal.cooperacion_abonos.bulkPut(abonosNuevos);
        }

        await dbLocal.config_sync.put({
          clave: 'ultima_sincronizacion_cooperaciones',
          valor: inicioDescargaCoop,
        });
      } catch (coopPullErr) {
        console.warn('Error durante PULL incremental de cooperaciones:', coopPullErr);
      }

      return {
        exito: conError === 0,
        elementosEnviados: enviados,
        elementosConError: conError,
        mensaje: `${enviados} registro(s) guardado(s).${conError > 0 ? ` ${conError} con error.` : ''}`,
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
