import { dbLocal } from '@/lib/db/offline-db';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Pago, PagoDetalle, ElementoColaSync } from '@/types/database';

export interface ResumenSincronizacion {
  pendientes: number;
  ultimaSincronizacion: string | null;
  enLinea: boolean;
}

/**
 * Registra un pago localmente en IndexedDB y lo encola para sincronizar.
 * Funciona 100% offline. Si hay internet, intenta enviarlo de inmediato.
 */
export async function registrarPagoLocal(pago: Pago, detalles: PagoDetalle[]) {
  // 1. Guardar en tablas locales de Dexie
  await dbLocal.transaction('rw', [dbLocal.pagos, dbLocal.pago_detalles, dbLocal.cola_sync], async () => {
    await dbLocal.pagos.put(pago);
    for (const detalle of detalles) {
      await dbLocal.pago_detalles.put(detalle);
    }

    // 2. Agregar a la cola de sincronización
    const itemPago: ElementoColaSync = {
      tabla: 'pagos',
      accion: 'INSERT',
      registro_id: pago.id,
      datos: pago,
      creado_en: new Date().toISOString(),
      intentos: 0,
    };

    const itemDetalles: ElementoColaSync = {
      tabla: 'pago_detalles',
      accion: 'INSERT',
      registro_id: pago.id,
      datos: detalles,
      creado_en: new Date().toISOString(),
      intentos: 0,
    };

    await dbLocal.cola_sync.add(itemPago);
    await dbLocal.cola_sync.add(itemDetalles);
  });

  // Si hay conexión, intentar sincronizar en segundo plano
  if (typeof window !== 'undefined' && navigator.onLine && isSupabaseConfigured) {
    sincronizarConNube().catch(console.error);
  }

  return { success: true, pagoId: pago.id, folio: pago.folio };
}

/**
 * Sincroniza datos pendientes hacia Supabase (PUSH) y descarga datos nuevos (PULL)
 */
export async function sincronizarConNube(): Promise<{
  exito: boolean;
  elementosEnviados: number;
  mensaje: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      exito: false,
      elementosEnviados: 0,
      mensaje: 'Supabase no está configurado aún en las variables de entorno.',
    };
  }

  if (typeof window !== 'undefined' && !navigator.onLine) {
    return {
      exito: false,
      elementosEnviados: 0,
      mensaje: 'Sin conexión a internet. Los cambios se guardaron localmente.',
    };
  }

  const itemsPendientes = await dbLocal.cola_sync.toArray();
  let enviados = 0;

  // --- FASE 1: PUSH (Enviar lo que se cobró u operó offline) ---
  for (const item of itemsPendientes) {
    try {
      if (item.tabla === 'pagos' && item.accion === 'INSERT') {
        const { error } = await supabase.from('pagos').upsert(item.datos);
        if (error) throw error;
      } else if (item.tabla === 'pago_detalles' && item.accion === 'INSERT') {
        const { error } = await supabase.from('pago_detalles').upsert(item.datos);
        if (error) throw error;
      } else if (item.tabla === 'personas' && item.accion === 'INSERT') {
        const { error } = await supabase.from('personas').upsert(item.datos);
        if (error) throw error;
      } else if (item.tabla === 'tomas' && item.accion === 'INSERT') {
        const { error } = await supabase.from('tomas').upsert(item.datos);
        if (error) throw error;
      }

      // Si se envió con éxito, remover de la cola local
      if (item.id) {
        await dbLocal.cola_sync.delete(item.id);
        enviados++;
      }
    } catch (err: any) {
      console.error(`Error sincronizando item ${item.id}:`, err);
      if (item.id) {
        await dbLocal.cola_sync.update(item.id, {
          intentos: (item.intentos || 0) + 1,
          ultimo_error: err?.message || 'Error desconocido',
        });
      }
    }
  }

  // --- FASE 2: PULL (Descargar del servidor para mantener la BD local al día) ---
  try {
    const [personasRes, tomasRes, manzanasRes, tarifasRes] = await Promise.all([
      supabase.from('personas').select('*'),
      supabase.from('tomas').select('*'),
      supabase.from('manzanas').select('*'),
      supabase.from('tarifas').select('*'),
    ]);

    if (personasRes.data) await dbLocal.personas.bulkPut(personasRes.data);
    if (tomasRes.data) await dbLocal.tomas.bulkPut(tomasRes.data);
    if (manzanasRes.data) await dbLocal.manzanas.bulkPut(manzanasRes.data);
    if (tarifasRes.data) await dbLocal.tarifas.bulkPut(tarifasRes.data);

    // Actualizar timestamp de última sincronización
    await dbLocal.config_sync.put({
      clave: 'ultima_sincronizacion',
      valor: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error durante la descarga de datos desde Supabase:', err);
  }

  return {
    exito: true,
    elementosEnviados: enviados,
    mensaje: `Sincronización completada. ${enviados} registro(s) subidos a la nube.`,
  };
}

/**
 * Obtiene el resumen actual de la cola de sincronización y conectividad
 */
export async function obtenerEstadoSincronizacion(): Promise<ResumenSincronizacion> {
  const count = await dbLocal.cola_sync.count();
  const config = await dbLocal.config_sync.get('ultima_sincronizacion');

  return {
    pendientes: count,
    ultimaSincronizacion: config ? config.valor : null,
    enLinea: typeof window !== 'undefined' ? navigator.onLine : true,
  };
}
