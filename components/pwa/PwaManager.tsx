'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaContextValue {
  isInstalled: boolean;
  canInstallNative: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<void>;
  openIosGuide: () => void;
  warmRoutes: (routes: string[]) => void;
}

const PwaContext = createContext<PwaContextValue>({
  isInstalled: false,
  canInstallNative: false,
  isIOS: false,
  promptInstall: async () => {},
  openIosGuide: () => {},
  warmRoutes: () => {},
});

export function usePwa() {
  return useContext(PwaContext);
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standaloneMatch =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standaloneMatch);

    const ua = window.navigator.userAgent;
    const iosDetected =
      /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(iosDetected);

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                sileo.info({
                  title: 'Nueva actualización lista',
                  description: 'Recarga la página cuando termines tus cobros para aplicar la versión más reciente.',
                });
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] No se pudo registrar el Service Worker:', err);
        });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setIosGuideOpen(false);
      sileo.success({
        title: '¡Aplicación instalada!',
        description: 'Fluvib ya está instalada en tu dispositivo con acceso directo y soporte offline.',
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }

    if (isIOS && !isInstalled) {
      setIosGuideOpen(true);
    }
  }, [deferredPrompt, isIOS, isInstalled]);

  const warmRoutes = useCallback((routes: string[]) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.onLine) {
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({
          type: 'WARM_ROUTES',
          routes,
        });
      })
      .catch(() => {});
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      isInstalled,
      canInstallNative: Boolean(deferredPrompt),
      isIOS,
      promptInstall,
      openIosGuide: () => setIosGuideOpen(true),
      warmRoutes,
    }),
    [deferredPrompt, isIOS, isInstalled, promptInstall, warmRoutes]
  );

  return (
    <PwaContext.Provider value={value}>
      {children}

      {/* Guía limpia de instalación para iOS Safari */}
      {iosGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              aria-label="Cerrar instrucciones de instalación"
              className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Instalar Fluvib en iPhone / iPad
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Úsala como app nativa sin conexión
                </p>
              </div>
            </div>

            <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Toca el botón <strong>Compartir</strong>{' '}
                  <Share className="w-3.5 h-3.5 inline text-blue-600 dark:text-blue-400 mx-0.5" /> en
                  la barra inferior de Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Desliza y selecciona <strong>Agregar a inicio</strong>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-blue-600 dark:text-blue-400 mx-0.5" />.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Confirma tocando <strong>Agregar</strong> en la esquina superior derecha.
                </span>
              </li>
            </ol>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIosGuideOpen(false)}
              className="w-full justify-center"
            >
              Entendido
            </Button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

export function PwaInstallButton() {
  const { isInstalled, canInstallNative, isIOS, promptInstall, openIosGuide } = usePwa();

  if (isInstalled) return null;
  if (!canInstallNative && !isIOS) return null;

  return (
    <button
      type="button"
      onClick={canInstallNative ? promptInstall : openIosGuide}
      title="Instalar Fluvib como aplicación en este dispositivo"
      aria-label="Instalar aplicación"
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 shrink-0"
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">Instalar App</span>
    </button>
  );
}

