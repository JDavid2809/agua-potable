'use client';

import React, { useState } from 'react';
import { Droplets, MapPin } from 'lucide-react';
import { ManzanasManager } from '@/components/tomas/ManzanasManager';

export default function TomasPage() {
  const [tabActiva, setTabActiva] = useState<'tomas' | 'manzanas'>('manzanas');

  return (
    <div className="space-y-6">
      {/* Cabecera del módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Padrón de Tomas y Ubicaciones
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            Administración de conexiones, contratos, barrios, secciones y manzanas del comité.
          </p>
        </div>

        {/* Pestañas de navegación */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0">
          <button
            type="button"
            onClick={() => setTabActiva('tomas')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              tabActiva === 'tomas'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Droplets className="w-4 h-4" />
            <span>Tomas de Agua</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('manzanas')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              tabActiva === 'manzanas'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Barrios y Manzanas</span>
          </button>
        </div>
      </div>

      {/* Contenido según pestaña */}
      {tabActiva === 'manzanas' ? (
        <ManzanasManager />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-3">
          <Droplets className="w-10 h-10 mx-auto text-blue-500 stroke-1" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Padrón de Tomas de Agua
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Configura primero las manzanas y barrios para poder asignar la ubicación geográfica a cada contrato y toma de agua.
          </p>
        </div>
      )}
    </div>
  );
}
