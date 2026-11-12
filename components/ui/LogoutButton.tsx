'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { limpiarDatosLocales, obtenerConteoPendientesSync } from '@/lib/db/offline-db';
import { sincronizarConNube } from '@/lib/sync/sync-engine';
import { sileo } from 'sileo';

export function LogoutButton() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [errorSync, setErrorSync] = useState<string | null>(null);

  const reintentarSincronizacion = async () => {
    try {
      setSincronizando(true);
      setErrorSync(null);
      const res = await sincronizarConNube();
      const count = await obtenerConteoPendientesSync();
      setPendientes(count);

      if (count === 0) {
        sileo.success({
          title: 'Sincronización completada',
          description: 'Todos los cobros locales se transmitieron exitosamente a la nube.',
        });
        setModalAbierto(false);
      } else {
        setErrorSync(
          res.mensaje || 'Algunos cobros no pudieron subirse. Revisa tu conexión con la nube.'
        );
      }
    } catch (err: unknown) {
      setErrorSync('Fallo al conectar con el servidor. Intenta de nuevo en unos momentos.');
    } finally {
      setSincronizando(false);
    }
  };

  const ejecutarSalida = async (limpiarCola: boolean) => {
    setCargando(true);
    try {
      await limpiarDatosLocales({ limpiarCola });
      await supabase.auth.signOut();
      sileo.info({
        title: 'Sesión cerrada',
        description: 'Has salido del sistema con éxito y se limpió el almacenamiento local.',
      });
      setModalAbierto(false);
      router.push('/login');
      router.refresh();
    } catch (err: unknown) {
      console.error('Error al cerrar sesión:', err);
      router.push('/login');
    } finally {
      setCargando(false);
    }
  };

  const handleLogout = async () => {
    if (cargando) return;
    setCargando(true);

    try {
      let count = await obtenerConteoPendientesSync();

      // Si hay elementos pendientes y hay conexión, intentar una última sincronización
      if (count > 0 && typeof window !== 'undefined' && navigator.onLine) {
        await sincronizarConNube();
        count = await obtenerConteoPendientesSync();
      }

      // Si aún quedan elementos pendientes sin subir a la nube, advertir al usuario
      if (count > 0) {
        setPendientes(count);
        setModalAbierto(true);
        setCargando(false);
        return;
      }

      // Si no hay pendientes, limpiar datos locales y cerrar sesión de inmediato
      await ejecutarSalida(true);
    } catch {
      await ejecutarSalida(true);
    }
  };

  return (
    <>
      <button
        onClick={handleLogout}
        disabled={cargando}
        type="button"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="flex items-center justify-center h-10 w-10 rounded-full transition-colors text-slate-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/15 disabled:opacity-50"
      >
        {cargando ? (
          <RefreshCw className="h-[18px] w-[18px] animate-spin text-slate-400" />
        ) : (
          <LogOut className="h-[18px] w-[18px]" />
        )}
      </button>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl text-left">
            <button
              onClick={() => setModalAbierto(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Cobros pendientes de sincronizar
              </h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Hay <strong className="text-amber-600 dark:text-amber-400">{pendientes} cobro(s)</strong> guardados
              localmente que aún no se han transmitido a la nube. Si limpias el equipo compartido ahora,
              esos cobros locales no respaldados podrían perderse.
            </p>

            {errorSync && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                {errorSync}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                onClick={reintentarSincronizacion}
                disabled={cargando || sincronizando}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors text-center flex items-center justify-center gap-2 shadow-xs"
              >
                {sincronizando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sincronizando con la nube...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Intentar subir cobros a la nube ahora</span>
                  </>
                )}
              </button>

              <button
                onClick={() => ejecutarSalida(false)}
                disabled={cargando || sincronizando}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-medium text-sm transition-colors text-center"
              >
                Cerrar sesión conservando cobros para sincronizar
              </button>

              <button
                onClick={() => ejecutarSalida(true)}
                disabled={cargando || sincronizando}
                className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors text-center"
              >
                Forzar salida y limpiar todo el equipo
              </button>

              <button
                onClick={() => setModalAbierto(false)}
                disabled={cargando || sincronizando}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-sm transition-colors text-center"
              >
                Cancelar y permanecer en el sistema
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
