'use client';

import React from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';

export interface ZonaCargaArchivoProps {
  onSeleccionarClick: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function ZonaCargaArchivo({ onSeleccionarClick, onDrop }: ZonaCargaArchivoProps) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSeleccionarClick}
      className="cursor-pointer group bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-10 sm:p-16 text-center transition-all space-y-5 shadow-xs"
    >
      <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
        <Upload className="w-8 h-8" />
      </div>

      <div className="space-y-2 max-w-lg mx-auto">
        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
          Haz clic aquí para abrir tu archivo Excel o arrástralo
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Acepta archivos <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong> de tu censo, sin importar el orden de las columnas.
        </p>
      </div>

      <div className="pt-2">
        <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors">
          <FileSpreadsheet className="w-4 h-4" />
          Seleccionar Archivo Excel
        </span>
      </div>
    </div>
  );
}

