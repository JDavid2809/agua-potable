'use client';

import React from 'react';
import {
  Check,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import type { RegistroImportar, ResumenImportacion } from './types';

export interface PasoPrevisualizacionRegistrosProps {
  registros: RegistroImportar[];
  registrosFiltrados: RegistroImportar[];
  registrosPaginados: RegistroImportar[];
  resumen: ResumenImportacion;
  busquedaPreview: string;
  onCambiarBusqueda: (val: string) => void;
  filtroPreview: 'todos' | 'seleccionados' | 'nuevos' | 'existentes';
  onCambiarFiltro: (val: 'todos' | 'seleccionados' | 'nuevos' | 'existentes') => void;
  todosVisiblesSeleccionados: boolean;
  onToggleTodosVisibles: () => void;
  onActualizarFila: <K extends keyof RegistroImportar>(
    idTemporal: string,
    campo: K,
    valor: RegistroImportar[K]
  ) => void;
  tieneColumnaNombreAsignada: boolean;
  paginaSeguraPreview: number;
  totalPaginasPreview: number;
  indiceInicioPreview: number;
  indiceFinPreview: number;
  itemsPorPagina: number;
  onCambiarPagina: (nuevaPagina: number) => void;
  importando: boolean;
  progresoActual: number;
  progresoTotal: number;
  onEjecutarImportacion: () => void;
  onVolverAMapeo: () => void;
}

export function PasoPrevisualizacionRegistros({
  registros,
  registrosFiltrados,
  registrosPaginados,
  resumen,
  busquedaPreview,
  onCambiarBusqueda,
  filtroPreview,
  onCambiarFiltro,
  todosVisiblesSeleccionados,
  onToggleTodosVisibles,
  onActualizarFila,
  tieneColumnaNombreAsignada,
  paginaSeguraPreview,
  totalPaginasPreview,
  indiceInicioPreview,
  indiceFinPreview,
  itemsPorPagina,
  onCambiarPagina,
  importando,
  progresoActual,
  progresoTotal,
  onEjecutarImportacion,
  onVolverAMapeo,
}: PasoPrevisualizacionRegistrosProps) {
  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
            Padrón Listo para Guardar ({resumen.totalSeleccionados} contribuyentes
            {resumen.totalTomas > 0 ? ` y ${resumen.totalTomas} tomas` : ''})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Revisa o edita cualquier dato directamente en la tabla antes de guardar en la base de datos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={importando}
            icon={<Table2 className="w-4 h-4" />}
            onClick={onVolverAMapeo}
          >
            Ajustar Columnas
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            isLoading={importando}
            disabled={resumen.totalSeleccionados === 0 || importando}
            icon={<Sparkles className="w-4 h-4" />}
            onClick={onEjecutarImportacion}
          >
            {importando
              ? `Guardando (${progresoActual}/${progresoTotal})...`
              : `Guardar ${resumen.totalSeleccionados} Contribuyentes`}
          </Button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <FilterBar
        searchValue={busquedaPreview}
        onSearchChange={onCambiarBusqueda}
        searchPlaceholder="Buscar por nombre, calle, teléfono o barrio en la lista a importar..."
      >
        <FilterSelect
          label="Ver:"
          value={filtroPreview}
          onChange={(e) =>
            onCambiarFiltro(
              e.target.value as 'todos' | 'seleccionados' | 'nuevos' | 'existentes'
            )
          }
        >
          <option value="todos">Todos los detectados ({registros.length})</option>
          <option value="seleccionados">
            Seleccionados ({resumen.totalSeleccionados})
          </option>
          <option value="nuevos">Nuevos en padrón ({resumen.nuevos})</option>
          <option value="existentes">Ya registrados ({resumen.existentes})</option>
        </FilterSelect>
      </FilterBar>

      {/* Barra de progreso en vivo */}
      {importando && progresoTotal > 0 && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Guardando contribuyentes en la base de datos...
            </span>
            <span>
              {progresoActual} / {progresoTotal} (
              {Math.round((progresoActual / progresoTotal) * 100)}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-blue-200/70 dark:bg-blue-900 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.round((progresoActual / progresoTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabla Interactiva de Selección y Edición en Vivo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={todosVisiblesSeleccionados}
                  onChange={onToggleTodosVisibles}
                  title="Seleccionar o desmarcar todos los visibles"
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </TableHead>
              <TableHead className="w-14">Fila</TableHead>
              <TableHead>Nombre Completo / Titular</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Dirección / Referencia</TableHead>
              <TableHead>Barrio / Manzana</TableHead>
              <TableHead className="text-center w-28">Tomas</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrosFiltrados.length === 0 ? (
              <TableRow elevate={false}>
                <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                  {!tieneColumnaNombreAsignada
                    ? 'Selecciona en el paso anterior cuál columna del Excel contiene el Nombre del Titular.'
                    : 'No hay registros que coincidan con el filtro actual.'}
                </TableCell>
              </TableRow>
            ) : (
              registrosPaginados.map((reg) => (
                <TableRow
                  key={reg.idTemporal}
                  className={!reg.seleccionado ? 'opacity-50' : ''}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={reg.seleccionado}
                      onChange={(e) =>
                        onActualizarFila(reg.idTemporal, 'seleccionado', e.target.checked)
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                    />
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-400">
                    #{reg.filaOrigen}
                  </TableCell>

                  <TableCell>
                    <input
                      type="text"
                      value={reg.nombre_completo}
                      onChange={(e) =>
                        onActualizarFila(reg.idTemporal, 'nombre_completo', e.target.value)
                      }
                      className="w-full min-w-[180px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-sm font-bold text-slate-900 dark:text-white py-0.5"
                    />
                    {reg.documento_identidad && (
                      <span className="block text-[11px] font-mono text-slate-400">
                        ID: {reg.documento_identidad}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <input
                      type="text"
                      value={reg.telefono}
                      placeholder="Sin teléfono"
                      onChange={(e) =>
                        onActualizarFila(reg.idTemporal, 'telefono', e.target.value)
                      }
                      className="w-full min-w-[110px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-xs text-slate-700 dark:text-slate-300 py-0.5"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      type="text"
                      value={reg.direccion}
                      placeholder="Sin dirección"
                      onChange={(e) =>
                        onActualizarFila(reg.idTemporal, 'direccion', e.target.value)
                      }
                      className="w-full min-w-[180px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-xs text-slate-700 dark:text-slate-300 py-0.5"
                    />
                  </TableCell>

                  <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                    {reg.barrioTexto || reg.manzanaTexto ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {reg.barrioTexto}
                        {reg.barrioTexto && reg.manzanaTexto ? ' • ' : ''}
                        {reg.manzanaTexto}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={reg.cantidadTomas}
                      onChange={(e) =>
                        onActualizarFila(
                          reg.idTemporal,
                          'cantidadTomas',
                          Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                        )
                      }
                      className="w-16 text-center font-extrabold text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1 text-blue-600 dark:text-blue-400"
                    />
                  </TableCell>

                  <TableCell className="text-center whitespace-nowrap">
                    {reg.yaExisteEnPadron ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Ya registrado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <Check className="w-3 h-3" />
                        Nuevo
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Barra de Paginación */}
      {registrosFiltrados.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-dashed border-slate-300 dark:border-[#26345C] text-xs text-slate-500 dark:text-slate-400">
          <div>
            Mostrando{' '}
            <span className="font-bold text-slate-900 dark:text-white">
              {indiceInicioPreview + 1}–{indiceFinPreview}
            </span>{' '}
            de{' '}
            <span className="font-bold text-slate-900 dark:text-white">
              {registrosFiltrados.length}
            </span>{' '}
            registros ({itemsPorPagina} por página)
          </div>

          {totalPaginasPreview > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paginaSeguraPreview <= 1}
                onClick={() => onCambiarPagina(Math.max(1, paginaSeguraPreview - 1))}
                icon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Anterior
              </Button>

              <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                Página {paginaSeguraPreview} de {totalPaginasPreview}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paginaSeguraPreview >= totalPaginasPreview}
                onClick={() =>
                  onCambiarPagina(Math.min(totalPaginasPreview, paginaSeguraPreview + 1))
                }
              >
                <span className="flex items-center gap-1">
                  Siguiente
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

