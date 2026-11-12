'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Receipt,
  Calendar,
  DollarSign,
  Ban,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  HeartHandshake,
  Droplets,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { obtenerMensajeError } from '@/lib/utils/errors';

export interface ModalActividadCajeroProps {
  cajeroId: string | null;
  cajeroNombre?: string;
  isOnline: boolean;
  onClose: () => void;
}

interface ResumenActividad {
  totalCobrado: number;
  totalRecibos: number;
  totalRecibosAgua: number;
  totalRecibosCoop: number;
  montoAgua: number;
  montoCooperaciones: number;
  recaudadoHoy: number;
  recibosAnulados: number;
}

interface ReciboAguaItem {
  id: string;
  folio: string;
  total: number;
  metodo_pago: string;
  fecha_pago: string;
  estado: string;
  notas?: string;
  persona?: {
    id: string;
    nombre_completo: string;
    documento_identidad?: string;
  };
  detalles?: {
    id: string;
    monto: number;
    recargo: number;
    anio: number;
    mes: number;
    toma?: {
      id: string;
      codigo_toma: string;
    };
  }[];
}

interface ReciboCoopItem {
  id: string;
  cooperacion_id: string;
  folio_recibo: string;
  monto: number;
  metodo_pago: string;
  created_at: string;
  cooperacion?: {
    id: string;
    nombre: string;
    monto_sugerido: number;
  };
  item_padron?: {
    id: string;
    persona?: {
      id: string;
      nombre_completo: string;
    };
    toma?: {
      id: string;
      codigo_toma: string;
    };
  };
}

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function ModalActividadCajero({
  cajeroId,
  cajeroNombre,
  isOnline,
  onClose,
}: ModalActividadCajeroProps) {
  const [tabActiva, setTabActiva] = useState<'agua' | 'cooperaciones'>('agua');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');

  const [cajero, setCajero] = useState<{
    id: string;
    nombre_completo: string;
    email: string;
    rol: string;
    ultima_conexion?: string | null;
  } | null>(null);

  const [resumen, setResumen] = useState<ResumenActividad | null>(null);
  const [recibosAgua, setRecibosAgua] = useState<ReciboAguaItem[]>([]);
  const [recibosCoop, setRecibosCoop] = useState<ReciboCoopItem[]>([]);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const itemsPorPagina = 10;

  useEffect(() => {
    if (!cajeroId) return;

    let activo = true;
    const cargarActividad = async () => {
      try {
        setCargando(true);
        setError(null);
        setPagina(1);
        const res = await fetch(`/api/admin/users/${cajeroId}/recibos`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'No se pudo cargar el historial del usuario.');
        }

        if (activo) {
          setCajero(data.cajero);
          setResumen(data.resumen);
          setRecibosAgua(data.recibosAgua || []);
          setRecibosCoop(data.recibosCooperacion || []);
        }
      } catch (err: unknown) {
        if (activo) {
          setError(obtenerMensajeError(err, 'Error al consultar la actividad.'));
        }
      } finally {
        if (activo) setCargando(false);
      }
    };

    void cargarActividad();

    return () => {
      activo = false;
    };
  }, [cajeroId]);

  // Filtrado de recibos de agua
  const recibosAguaFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    if (!q) return recibosAgua;

    return recibosAgua.filter((r) => {
      const matchFolio = r.folio?.toLowerCase().includes(q);
      const matchPersona = r.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchMetodo = r.metodo_pago?.toLowerCase().includes(q);
      const matchToma = r.detalles?.some((d) => d.toma?.codigo_toma?.toLowerCase().includes(q));
      return matchFolio || matchPersona || matchMetodo || matchToma;
    });
  }, [recibosAgua, filtroTexto]);

  // Filtrado de recibos de cooperaciones
  const recibosCoopFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    if (!q) return recibosCoop;

    return recibosCoop.filter((r) => {
      const matchFolio = r.folio_recibo?.toLowerCase().includes(q);
      const matchCoop = r.cooperacion?.nombre?.toLowerCase().includes(q);
      const matchPersona = r.item_padron?.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchToma = r.item_padron?.toma?.codigo_toma?.toLowerCase().includes(q);
      return matchFolio || matchCoop || matchPersona || matchToma;
    });
  }, [recibosCoop, filtroTexto]);

  // Lista según tab
  const listaActiva = tabActiva === 'agua' ? recibosAguaFiltrados : recibosCoopFiltrados;
  const totalPaginas = Math.max(1, Math.ceil(listaActiva.length / itemsPorPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const itemsPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * itemsPorPagina;
    return listaActiva.slice(inicio, inicio + itemsPorPagina);
  }, [listaActiva, paginaSegura, itemsPorPagina]);

  if (!cajeroId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left">
        {/* Cabecera del modal */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {cajero?.nombre_completo || cajeroNombre || 'Auditoría de Cajero'}
                </h2>
                {/* Badge En línea / Desconectado */}
                {isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    En línea
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Desconectado
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{cajero?.email || 'Cargando datos...'}</span>
                <span>•</span>
                <span className="capitalize">{cajero?.rol || 'cajero'}</span>
                {cajero?.ultima_conexion && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Última conexión:{' '}
                      {new Date(cajero.ultima_conexion).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {cargando ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-medium text-slate-500">
                Consultando cobros y recibos emitidos en la base de datos...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Error al cargar datos</strong>
                <span>{error}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Tarjetas de métricas rápidas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Cobrado
                  </span>
                  <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
                    ${(resumen?.totalCobrado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {resumen?.totalRecibos || 0} recibo(s) en total
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                    Cobrado Hoy
                  </span>
                  <span className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 block">
                    ${(resumen?.recaudadoHoy || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 block">
                    Turno activo de hoy
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    Cuotas Agua
                  </span>
                  <span className="text-xl font-black text-blue-700 dark:text-blue-300 mt-1 block">
                    ${(resumen?.montoAgua || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5 block">
                    {resumen?.totalRecibosAgua || 0} recibo(s) ordinarios
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40">
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                    Cooperaciones
                  </span>
                  <span className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1 block">
                    ${(resumen?.montoCooperaciones || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5 block">
                    {resumen?.totalRecibosCoop || 0} aportación(es)
                  </span>
                </div>
              </div>

              {/* Pestañas de tipo de cobro y buscador */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 border-b sm:border-b-0 border-slate-200 dark:border-slate-800 pb-2 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTabActiva('agua');
                      setPagina(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                      tabActiva === 'agua'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Droplets className="w-4 h-4" />
                    <span>Recibos de Agua ({recibosAgua.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTabActiva('cooperaciones');
                      setPagina(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                      tabActiva === 'cooperaciones'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4" />
                    <span>Cooperaciones ({recibosCoop.length})</span>
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={filtroTexto}
                    onChange={(e) => {
                      setFiltroTexto(e.target.value);
                      setPagina(1);
                    }}
                    placeholder="Buscar por folio, titular..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tabla de recibos */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Fecha y Hora</th>
                      <th className="px-4 py-3">Contribuyente / Toma</th>
                      <th className="px-4 py-3">Concepto</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {itemsPaginados.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                          No se encontraron recibos emitidos por este cajero con el criterio buscado.
                        </td>
                      </tr>
                    ) : tabActiva === 'agua' ? (
                      (itemsPaginados as ReciboAguaItem[]).map((r) => {
                        const primerDetalle = r.detalles?.[0];
                        const codigoToma = primerDetalle?.toma?.codigo_toma;
                        const periodosTexto =
                          r.detalles && r.detalles.length > 0
                            ? r.detalles
                                .map((d) => `${MESES[(d.mes || 1) - 1]} ${d.anio}`)
                                .join(', ')
                            : 'Cuota de agua';

                        return (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {r.folio}
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(r.fecha_pago).toLocaleString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-slate-900 dark:text-white block">
                                {r.persona?.nombre_completo || 'Titular sin asignar'}
                              </span>
                              {codigoToma && (
                                <span className="text-[11px] text-slate-400 block font-mono">
                                  {codigoToma}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title={periodosTexto}>
                              {periodosTexto}
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                              {r.metodo_pago}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                              ${Number(r.total).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.estado === 'anulado' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                                  <Ban className="w-3 h-3" />
                                  Anulado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Cobrado
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      (itemsPaginados as ReciboCoopItem[]).map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono font-bold text-purple-600 dark:text-purple-400">
                            {c.folio_recibo}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(c.created_at).toLocaleString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {c.item_padron?.persona?.nombre_completo || 'Ciudadano'}
                            </span>
                            {c.item_padron?.toma?.codigo_toma && (
                              <span className="text-[11px] text-slate-400 block font-mono">
                                {c.item_padron.toma.codigo_toma}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title={c.cooperacion?.nombre}>
                            {c.cooperacion?.nombre || 'Obra Comunitaria'}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                            {c.metodo_pago}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                            ${Number(c.monto).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Abonado
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                  <span>
                    Página {paginaSegura} de {totalPaginas} ({listaActiva.length} recibos)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      disabled={paginaSegura <= 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                      disabled={paginaSegura >= totalPaginas}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie del modal */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/50">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

