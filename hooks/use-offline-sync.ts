'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  sincronizarConNube,
  obtenerEstadoSincronizacion,
  type ResumenSincronizacion,
} from '@/lib/sync/sync-engine';

export function useOfflineSync() {
  const [estado, setEstado] = useState<ResumenSincronizacion>({
    pendientes: 0,
    ultimaSincronizacion: null,
    enLinea: true,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const actualizarEstado = useCallback(async () => {
    try {
      const res = await obtenerEstadoSincronizacion();
      setEstado(res);
    } catch (e) {
      console.error('Error al obtener estado de sincronización:', e);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await sincronizarConNube();
      await actualizarEstado();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, actualizarEstado]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    actualizarEstado();

    const handleOnline = () => {
      setEstado((prev) => ({ ...prev, enLinea: true }));
      // Al recuperar conexión a internet, sincronizar automáticamente
      sincronizar();
    };

    const handleOffline = () => {
      setEstado((prev) => ({ ...prev, enLinea: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Revisar cola periódicamente cada 30 segundos si hay internet
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
    ultimaSincronizacion: estado.ultimaSincronizacion,
    isSyncing,
    sincronizar,
    actualizarEstado,
  };
}
