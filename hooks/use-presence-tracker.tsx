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
  isOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineUserIds: new Set(),
  isOnline: () => false,
});

export interface PresenceProviderProps {
  children: React.ReactNode;
  organizacionId?: string;
  currentUserId?: string;
  userName?: string;
  userRole?: string;
}

export function PresenceProvider({
  children,
  organizacionId,
  currentUserId,
  userName,
  userRole,
}: PresenceProviderProps) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!organizacionId || !currentUserId) return;

    let activo = true;

    // 1. Latido periódico en base de datos para mantener 'ultima_conexion'
    const enviarLatido = async () => {
      try {
        await supabase.rpc('registrar_actividad_usuario');
      } catch {
        // Fallback silencioso si no hay conexión
      }
    };
    void enviarLatido();

    const heartbeatTimer = setInterval(() => {
      if (typeof window !== 'undefined' && navigator.onLine) {
        void enviarLatido();
      }
    }, 5 * 60 * 1000);

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
      const ids = new Set<string>();

      Object.values(state).forEach((presencias: any) => {
        if (Array.isArray(presencias)) {
          presencias.forEach((p) => {
            if (p.userId) ids.add(p.userId);
          });
        }
      });

      setOnlineUserIds(ids);
    };

    // CRÍTICO: Los listeners .on() DEBEN asociarse antes de llamar a .subscribe()
    canal
      .on('presence', { event: 'sync' }, sincronizarPresencias)
      .on('presence', { event: 'join' }, sincronizarPresencias)
      .on('presence', { event: 'leave' }, sincronizarPresencias);

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

    return () => {
      activo = false;
      clearInterval(heartbeatTimer);
      canal.untrack().catch(() => {});
      supabase.removeChannel(canal).catch(() => {});
    };
  }, [organizacionId, currentUserId, userName, userRole]);

  const value = useMemo(
    () => ({
      onlineUserIds,
      isOnline: (id: string) => onlineUserIds.has(id),
    }),
    [onlineUserIds]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function useOnlineUsers() {
  const context = useContext(PresenceContext);
  return context.onlineUserIds;
}

export function useIsUserOnline(userId?: string) {
  const context = useContext(PresenceContext);
  if (!userId) return false;
  return context.onlineUserIds.has(userId);
}

