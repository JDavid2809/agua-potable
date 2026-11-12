'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface PresenciaUsuarioPayload {
  userId: string;
  nombre: string;
  rol: string;
  onlineAt: string;
}

interface PresenceContextValue {
  onlineUserIds: Set<string>;
  lastSeenMap: Record<string, string>;
  isOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineUserIds: new Set(),
  lastSeenMap: {},
  isOnline: () => false,
});

export interface PresenceProviderProps {
  children: React.ReactNode;
  organizacionId?: string;
  currentUserId?: string;
  userName?: string;
  userRole?: string;
}

function extraerUserIds(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  Object.values(state).forEach((presencias) => {
    if (Array.isArray(presencias)) {
      presencias.forEach((p: any) => {
        if (p?.userId) ids.add(p.userId);
      });
    }
  });
  return ids;
}

export function PresenceProvider({
  children,
  organizacionId,
  currentUserId,
  userName,
  userRole,
}: PresenceProviderProps) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!organizacionId || !currentUserId) return;

    let activo = true;

    // 1. Latido periódico en base de datos para mantener 'ultima_conexion'
    const enviarLatido = async () => {
      if (typeof window !== 'undefined' && !navigator.onLine) return;
      try {
        const { data } = await supabase.rpc('registrar_actividad_usuario');
        if (activo && data) {
          setLastSeenMap((prev) => ({ ...prev, [currentUserId]: String(data) }));
        }
      } catch {
        // Fallback silencioso si no hay conexión
      }
    };
    void enviarLatido();

    // Cada 60 segundos para mantener precisa la última actividad en BD
    const heartbeatTimer = setInterval(() => {
      void enviarLatido();
    }, 60 * 1000);

    // Registrar también al ocultar/cerrar la pestaña o volver a enfocarla
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') {
        void enviarLatido();
      }
    };
    const handlePageHide = () => {
      void enviarLatido();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handlePageHide);
    }

    // 2. Canal Realtime Presence único por organización
    const canalName = `presencia-org-${organizacionId}`;

    // Si ya existía un canal previo con este topic (ej. Fast Refresh de Turbopack), removerlo antes
    const canalesPrevios = supabase.getChannels().filter((c) => c.topic === `realtime:${canalName}`);
    for (const c of canalesPrevios) {
      supabase.removeChannel(c).catch(() => {});
    }

    const canal = supabase.channel(canalName, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    const sincronizarPresencias = () => {
      if (!activo) return;
      const state = canal.presenceState();
      setOnlineUserIds(extraerUserIds(state));
    };

    // CRÍTICO: Los listeners .on() DEBEN asociarse antes de llamar a .subscribe()
    canal
      .on('presence', { event: 'sync' }, sincronizarPresencias)
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        sincronizarPresencias();
        if (!activo || !Array.isArray(newPresences)) return;
        const ahoraIso = new Date().toISOString();
        setLastSeenMap((prev) => {
          const next = { ...prev };
          newPresences.forEach((p: any) => {
            if (p?.userId) {
              next[p.userId] = p.onlineAt || ahoraIso;
            }
          });
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const stateActual = canal.presenceState();
        const idsRestantes = extraerUserIds(stateActual);
        if (activo) {
          setOnlineUserIds(idsRestantes);
        }
        if (!activo || !Array.isArray(leftPresences)) return;
        const ahoraIso = new Date().toISOString();
        setLastSeenMap((prev) => {
          const next = { ...prev };
          leftPresences.forEach((p: any) => {
            // Actualizar hora exacta de salida si ya no tiene otra pestaña activa
            if (p?.userId && !idsRestantes.has(p.userId)) {
              next[p.userId] = ahoraIso;
            }
          });
          return next;
        });
      });

    canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && activo) {
        await canal.track({
          userId: currentUserId,
          nombre: userName || 'Usuario',
          rol: userRole || 'cajero',
          onlineAt: new Date().toISOString(),
        });
      }
    });

    // 3. Canal secundario opcional por si 'perfiles' está en supabase_realtime (actualizaciones de latido en BD)
    const dbChannelName = `perfiles-conexion-${organizacionId}`;
    const dbCanalesPrevios = supabase.getChannels().filter((c) => c.topic === `realtime:${dbChannelName}`);
    for (const c of dbCanalesPrevios) {
      supabase.removeChannel(c).catch(() => {});
    }

    const dbCanal = supabase
      .channel(dbChannelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'perfiles',
          filter: `organizacion_id=eq.${organizacionId}`,
        },
        (payload) => {
          if (!activo) return;
          const nuevo = payload.new as { id?: string; ultima_conexion?: string | null };
          if (nuevo?.id && nuevo?.ultima_conexion) {
            setLastSeenMap((prev) => ({
              ...prev,
              [nuevo.id!]: nuevo.ultima_conexion!,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      activo = false;
      clearInterval(heartbeatTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handlePageHide);
      }
      canal.untrack().catch(() => {});
      supabase.removeChannel(canal).catch(() => {});
      supabase.removeChannel(dbCanal).catch(() => {});
    };
  }, [organizacionId, currentUserId, userName, userRole]);

  const value = useMemo(
    () => ({
      onlineUserIds,
      lastSeenMap,
      isOnline: (id: string) => onlineUserIds.has(id),
    }),
    [onlineUserIds, lastSeenMap]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function useOnlineUsers() {
  const context = useContext(PresenceContext);
  return context.onlineUserIds;
}

export function useLastSeenMap() {
  const context = useContext(PresenceContext);
  return context.lastSeenMap;
}

export function useIsUserOnline(userId?: string) {
  const context = useContext(PresenceContext);
  if (!userId) return false;
  return context.onlineUserIds.has(userId);
}
