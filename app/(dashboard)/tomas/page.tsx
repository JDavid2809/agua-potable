'use client';

import React, { useState } from 'react';
import { Droplets, MapPin } from 'lucide-react';
import { ManzanasManager } from '@/components/tomas/ManzanasManager';
import { TomasManager } from '@/components/tomas/TomasManager';

export default function TomasPage() {
  const [tabActiva, setTabActiva] = useState<'tomas' | 'manzanas'>('manzanas');
  const [vistaManzanas, setVistaManzanas] = useState<'lista' | 'formulario'>('lista');
  const [vistaTomas, setVistaTomas] = useState<'lista' | 'formulario'>('lista');

  const enFormulario =
    (tabActiva === 'manzanas' && vistaManzanas === 'formulario') ||
    (tabActiva === 'tomas' && vistaTomas === 'formulario');

  return (
    <div className="w-full space-y-6">
      {/* Cabecera del módulo solo en vista de lista */}
      {!enFormulario && (
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
      )}

      {/* Contenido según pestaña */}
      {tabActiva === 'manzanas' ? (
        <ManzanasManager onVistaChange={setVistaManzanas} />
      ) : (
        <TomasManager onVistaChange={setVistaTomas} />
      )}
    </div>
  );
}
