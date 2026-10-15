'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sincronizarConNube,
  obtenerEstadoSincronizacion,
  type ResumenSincronizacion,
} from '@/lib/sync/sync-engine';

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

  const actualizarEstado = useCallback(async () => {
    try {
      const res = await obtenerEstadoSincronizacion();
      setEstado(res);
    } catch (e) {
      console.error('Error al consultar estado de sincronización local:', e);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await sincronizarConNube();
      await actualizarEstado();
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [actualizarEstado]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Carga inicial de estado
    actualizarEstado();

    const handleOnline = () => {
      setEstado((prev) => ({ ...prev, enLinea: true }));
      sincronizar();
    };

    const handleOffline = () => {
      setEstado((prev) => ({ ...prev, enLinea: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Revisar y sincronizar cada 30 segundos sin recrear el intervalo innecesariamente
    const interval = setInterval(() => {
      if (navigator.onLine) {
        sincronizar();
      } else {
        actualizarEstado();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [actualizarEstado, sincronizar]);

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
