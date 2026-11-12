'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { WifiOff, RefreshCw, CreditCard, LayoutDashboard, Droplets, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function OfflinePage() {
  const [enLinea, setEnLinea] = useState(false);

  useEffect(() => {
    setEnLinea(typeof navigator !== 'undefined' ? navigator.onLine : false);

    const handleOnline = () => {
      setEnLinea(true);
      window.location.replace('/dashboard');
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleReintentar = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
          <WifiOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
            {enLinea ? 'Conexión restablecida' : 'Sin conexión a internet'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Esta pantalla no está disponible sin internet. Puedes entrar a las secciones principales o volver a intentar.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-left">
          <Link
            href="/cobros"
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold">Caja y Cobros</span>
          </Link>

          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold">Panel</span>
          </Link>

          <Link
            href="/tomas"
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold">Tomas</span>
          </Link>

          <Link
            href="/personas"
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold">Personas</span>
          </Link>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleReintentar}
          icon={<RefreshCw className="w-4 h-4" />}
          className="w-full justify-center"
        >
          Reintentar conexión
        </Button>
      </div>
    </div>
  );
}

