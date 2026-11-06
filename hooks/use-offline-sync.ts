'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sincronizarConNube,
  obtenerEstadoSincronizacion,
  type ResumenSincronizacion,
} from '@/lib/sync/sync-engine';

/**
 * Comprueba de forma activa si realmente existe conexión a internet y acceso a los servidores,
 * resolviendo las limitaciones de `navigator.onLine` (adaptadores virtuales en Windows, WiFi sin internet, etc.)
 */
export async function probarConexionReal(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!navigator.onLine) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const testUrl = urlSupabase
      ? `${urlSupabase}/rest/v1/?_ping=${Date.now()}`
      : `https://www.google.com/generate_204?_ping=${Date.now()}`;

    await fetch(testUrl, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function useOfflineSync() {
  const [estado, setEstado] = useState<ResumenSincronizacion>({
    pendientes: 0,
    conError: 0,
    ultimaSincronizacion: null,
    enLinea: typeof window !== 'undefined' ? navigator.onLine : true,
    sincronizando: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const verificarYActualizarConectividad = useCallback(async () => {
    const realmenteEnLinea = await probarConexionReal();
    setEstado((prev) => {
      if (prev.enLinea !== realmenteEnLinea) {
        return { ...prev, enLinea: realmenteEnLinea };
      }
      return prev;
    });
    return realmenteEnLinea;
  }, []);

  const actualizarEstado = useCallback(async () => {
    try {
      const res = await obtenerEstadoSincronizacion();
      const realOnline = await probarConexionReal();
      setEstado({ ...res, enLinea: realOnline });
    } catch (e) {
      console.error('Error al consultar estado de sincronización local:', e);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    if (isSyncingRef.current) return;

    // Verificar si hay internet real antes de intentar sincronizar
    const conectado = await verificarYActualizarConectividad();
    if (!conectado) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const res = await sincronizarConNube();
      if (!res.exito && res.mensaje?.toLowerCase().includes('conexi')) {
        setEstado((prev) => ({ ...prev, enLinea: false }));
      }
      await actualizarEstado();
    } catch {
      await verificarYActualizarConectividad();
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [actualizarEstado, verificarYActualizarConectividad]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ignore = false;

    // 1. Verificación inicial inmediata de estado local y conectividad real
    void (async () => {
      try {
        const res = await obtenerEstadoSincronizacion();
        const online = await probarConexionReal();
        if (!ignore) {
          setEstado({ ...res, enLinea: online });
        }
      } catch (e) {
        console.error('Error al inicializar estado de sincronización:', e);
      }
    })();

    // 2. Manejadores de eventos de red y visibilidad
    const handleOnline = async () => {
      const online = await probarConexionReal();
      if (!ignore) {
        setEstado((prev) => ({ ...prev, enLinea: online }));
        if (online) sincronizar();
      }
    };

    const handleOffline = () => {
      if (!ignore) {
        setEstado((prev) => ({ ...prev, enLinea: false }));
      }
    };

    const handleFocus = () => {
      void verificarYActualizarConectividad();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // 3. Verificación periódica cada 10 segundos
    const interval = setInterval(async () => {
      if (document.hidden) return;
      const online = await probarConexionReal();
      if (!ignore) {
        setEstado((prev) => {
          if (prev.enLinea !== online) {
            return { ...prev, enLinea: online };
          }
          return prev;
        });
        if (online) {
          sincronizar();
        } else {
          actualizarEstado();
        }
      }
    }, 10000);

    return () => {
      ignore = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(interval);
    };
  }, [actualizarEstado, sincronizar, verificarYActualizarConectividad]);

  return {
    enLinea: estado.enLinea,
    pendientes: estado.pendientes,
    conError: estado.conError,
    ultimaSincronizacion: estado.ultimaSincronizacion,
    isSyncing: isSyncing || estado.sincronizando,
    sincronizar,
    actualizarEstado,
  };
}
