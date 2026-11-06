'use client';

import React from 'react';
import {
  Table2,
  AlertCircle,
  Check,
  Ban,
  Wand2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DEFINICION_CAMPOS,
  MAPA_DEFINICION_CAMPO,
  type CampoDestinoKey,
  type ColumnaInfoExcel,
  type FilaMatrizExcel,
} from './types';

export interface PasoMapeoColumnasProps {
  hojasDisponibles: string[];
  hojaActiva: string;
  onCambiarHoja: (nuevaHoja: string) => void;
  archivoTieneEncabezados: boolean;
  indiceFilaEncabezado: number;
  filasMatriz: FilaMatrizExcel[];
  onCambiarFilaEncabezado: (nuevoIdx: number, tieneTitulos: boolean) => void;
  tieneColumnaNombreAsignada: boolean;
  infoColumnas: ColumnaInfoExcel[];
  asignacionColumnas: Record<number, CampoDestinoKey>;
  onCambiarDestinoColumna: (colIndex: number, nuevoDestino: CampoDestinoKey) => void;
  filasMuestraExcel: FilaMatrizExcel[];
  onContinuarPrevisualizacion: () => void;
}

export function PasoMapeoColumnas({
  hojasDisponibles,
  hojaActiva,
  onCambiarHoja,
  archivoTieneEncabezados,
  indiceFilaEncabezado,
  filasMatriz,
  onCambiarFilaEncabezado,
  tieneColumnaNombreAsignada,
  infoColumnas,
  asignacionColumnas,
  onCambiarDestinoColumna,
  filasMuestraExcel,
  onContinuarPrevisualizacion,
}: PasoMapeoColumnasProps) {
  const camposPrincipales = DEFINICION_CAMPOS.slice(0, 6);
  const camposOpcionales = DEFINICION_CAMPOS.slice(6);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      {/* Cabecera */}
      <div className="p-5 sm:p-6 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Asignación de Columnas de tu Archivo Excel
            </h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
              <Wand2 className="w-3 h-3" />
              Auto-detectadas
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Usa el selector superior de cada columna (<strong>A</strong>, <strong>B</strong>, <strong>C</strong>...) para indicar qué dato representa o ignorarla.
          </p>
        </div>

        {/* Controles de Hoja y Fila de Encabezados */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {hojasDisponibles.length > 1 && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500">Hoja:</span>
              <select
                value={hojaActiva}
                onChange={(e) => onCambiarHoja(e.target.value)}
                className="text-xs font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
              >
                {hojasDisponibles.map((h) => (
                  <option key={h} value={h} className="bg-white dark:bg-slate-900">
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Table2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Fila de títulos:
            </span>
            <select
              value={archivoTieneEncabezados ? String(indiceFilaEncabezado) : 'sin_titulos'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'sin_titulos') {
                  onCambiarFilaEncabezado(0, false);
                } else {
                  onCambiarFilaEncabezado(Number(val), true);
                }
              }}
              className="text-xs font-bold bg-transparent text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
            >
              <option value="sin_titulos" className="bg-white dark:bg-slate-900">
                Sin títulos (empieza con datos)
              </option>
              {filasMatriz.slice(0, 15).map((f, idx) => {
                const previewTexto = f.celdas
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(' | ')
                  .slice(0, 38);
                return (
                  <option
                    key={f.numeroFilaExcel}
                    value={String(idx)}
                    className="bg-white dark:bg-slate-900"
                  >
                    Fila {f.numeroFilaExcel}: {previewTexto || '(Vacía)'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Alerta si falta la columna de Nombre */}
      {!tieneColumnaNombreAsignada && (
        <div className="mx-5 mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center gap-3 text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <div className="text-xs">
            <strong className="font-bold block">
              Falta seleccionar la columna del Nombre del Contribuyente
            </strong>
            Elige <strong>«Nombre / Apellidos»</strong> en la columna correspondiente para poder leer el padrón.
          </div>
        </div>
      )}

      {/* Tabla Visual Tipo Excel */}
      <div className="p-5 sm:p-6 space-y-5">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
                <th className="w-16 p-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 sticky left-0 z-10">
                  Fila
                </th>
                {infoColumnas.map((col) => {
                  const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                  const def =
                    destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;

                  return (
                    <th
                      key={col.colIndex}
                      className={`min-w-[210px] max-w-[260px] p-2.5 align-top border-r last:border-r-0 border-slate-200 dark:border-slate-700 transition-colors ${
                        def
                          ? `${def.colorBg}`
                          : 'bg-slate-50/60 dark:bg-slate-900/40 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                          Columna {col.letraExcel}
                        </span>
                        {def ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${def.colorBadge}`}
                          >
                            <Check className="w-3 h-3" />
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-500">
                            <Ban className="w-2.5 h-2.5" />
                            Ignorada
                          </span>
                        )}
                      </div>

                      <select
                        value={destino}
                        onChange={(e) =>
                          onCambiarDestinoColumna(
                            col.colIndex,
                            e.target.value as CampoDestinoKey
                          )
                        }
                        className={`w-full text-xs font-bold rounded-lg px-2.5 py-2 border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                          def
                            ? `bg-white dark:bg-slate-900 ${def.colorBorder} ${def.colorText} shadow-2xs`
                            : 'bg-white/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <option value="ignorar">Ignorar esta columna</option>
                        <optgroup label="Datos Principales">
                          {camposPrincipales.map((campo) => (
                            <option key={campo.key} value={campo.key}>
                              {campo.shortLabel}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Datos Adicionales">
                          {camposOpcionales.map((campo) => (
                            <option key={campo.key} value={campo.key}>
                              {campo.shortLabel}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </th>
                  );
                })}
              </tr>

              {archivoTieneEncabezados && filasMatriz[indiceFilaEncabezado] && (
                <tr className="bg-slate-200/60 dark:bg-slate-800/60 border-b-2 border-slate-300 dark:border-slate-700">
                  <td className="px-2 py-2 text-center font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 border-r border-slate-200 dark:border-slate-700 bg-blue-50/60 dark:bg-slate-900 sticky left-0 z-10">
                    #{filasMatriz[indiceFilaEncabezado].numeroFilaExcel}
                    <span className="block text-[9px] uppercase tracking-tighter text-blue-500">
                      Títulos
                    </span>
                  </td>
                  {infoColumnas.map((col) => {
                    const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                    const def =
                      destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;
                    const textoTitulo =
                      filasMatriz[indiceFilaEncabezado]?.celdas[col.colIndex] || '';

                    return (
                      <td
                        key={col.colIndex}
                        className={`px-3 py-2 text-xs font-extrabold border-r last:border-r-0 border-slate-200 dark:border-slate-700 truncate max-w-[240px] ${
                          def
                            ? 'text-slate-900 dark:text-white bg-white/50 dark:bg-slate-900/50'
                            : 'text-slate-400 dark:text-slate-500 italic'
                        }`}
                        title={textoTitulo}
                      >
                        {textoTitulo || '(Sin encabezado)'}
                      </td>
                    );
                  })}
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
              {filasMuestraExcel.map((fila) => (
                <tr
                  key={fila.numeroFilaExcel}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-2 py-2 text-center font-mono text-[11px] text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 sticky left-0 z-10">
                    #{fila.numeroFilaExcel}
                  </td>
                  {infoColumnas.map((col) => {
                    const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                    const def =
                      destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;
                    const valorCelda = fila.celdas[col.colIndex] || '';

                    return (
                      <td
                        key={col.colIndex}
                        className={`px-3 py-2 border-r last:border-r-0 border-slate-200/70 dark:border-slate-800 truncate max-w-[240px] ${
                          def
                            ? `${def.colorBg} font-semibold text-slate-800 dark:text-slate-200`
                            : 'text-slate-400 dark:text-slate-600 line-through decoration-slate-300 dark:decoration-slate-700'
                        }`}
                        title={valorCelda}
                      >
                        {valorCelda || <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Barra inferior compacta de estado y avance */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Columnas activas:</span>
            {DEFINICION_CAMPOS.map((campo) => {
              const cols = infoColumnas.filter(
                (c) => asignacionColumnas[c.colIndex] === campo.key
              );
              if (cols.length === 0) return null;
              return (
                <span
                  key={campo.key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${campo.colorBorder} ${campo.colorBg} ${campo.colorText}`}
                >
                  {campo.shortLabel}: Col {cols.map((c) => c.letraExcel).join('+')}
                </span>
              );
            })}
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!tieneColumnaNombreAsignada}
            onClick={onContinuarPrevisualizacion}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Revisar Padrón Detectado
          </Button>
        </div>
      </div>
    </div>
  );
}

