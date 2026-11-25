'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  FileSpreadsheet,
  Droplets,
  Calendar,
  Receipt,
  Check,
  Ban,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { dbLocal } from '@/lib/db/offline-db';
import { Button } from '@/components/ui/Button';
import { StatusMark } from '@/components/ui/StatusMark';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { exportarMultiplesHojasAExcel } from '@/lib/utils/export-excel';
import { obtenerMensajeError } from '@/lib/utils/errors';
import { sileo } from 'sileo';
import type { Toma, Pago, PagoDetalle } from '@/types/database';

const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const MESES_LARGOS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface ModalEstadoCuentaProps {
  personaId: string | null;
  personaNombre?: string;
  personaDocumento?: string;
  personaTelefono?: string;
  tomasIniciales?: Toma[];
  onClose: () => void;
}

export function ModalEstadoCuenta({
  personaId,
  personaNombre,
  personaDocumento,
  personaTelefono,
  tomasIniciales = [],
  onClose,
}: ModalEstadoCuentaProps) {
  const anioActual = new Date().getFullYear();
  const [cargando, setCargando] = useState(true);
  const [tomas, setTomas] = useState<Toma[]>(tomasIniciales);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(anioActual);

  const cargarEstadoCuenta = useCallback(async () => {
    if (!personaId) return;
    try {
      setCargando(true);

      const [resTomas, resPagos] = await Promise.all([
        supabase
          .from('tomas')
          .select('*, manzana:manzanas(id, barrio, seccion, numero_manzana)')
          .eq('persona_id', personaId)
          .is('deleted_at', null)
          .order('codigo_toma', { ascending: true }),
        supabase
          .from('pagos')
          .select(`
            *,
            cajero:perfiles!cajero_id(id, nombre_completo),
            detalles:pago_detalles(
              id,
              toma_id,
              anio,
              mes,
              monto,
              recargo,
              toma:tomas(codigo_toma, tipo_toma)
            )
          `)
          .eq('persona_id', personaId)
          .order('fecha_pago', { ascending: false }),
      ]);

      if (resTomas.error) throw resTomas.error;
      if (resPagos.error) throw resPagos.error;

      setTomas((resTomas.data || []) as unknown as Toma[]);
      setPagos((resPagos.data || []) as unknown as Pago[]);
    } catch (err: unknown) {
      // Fallback local en Dexie si no hay conexión
      try {
        const [tomasLocal, pagosLocal, detallesLocal] = await Promise.all([
          dbLocal.tomas.where('persona_id').equals(personaId).toArray(),
          dbLocal.pagos.where('persona_id').equals(personaId).toArray(),
          dbLocal.pago_detalles.toArray(),
        ]);

        const mapaTomas = new Map(tomasLocal.map((t) => [t.id, t]));
        const detallesPorPago = new Map<string, PagoDetalle[]>();
        for (const d of detallesLocal) {
          const arr = detallesPorPago.get(d.pago_id) || [];
          arr.push({ ...d, toma: mapaTomas.get(d.toma_id) });
          detallesPorPago.set(d.pago_id, arr);
        }

        if (tomasLocal.length > 0 || tomasIniciales.length > 0) {
          setTomas(tomasLocal.length > 0 ? tomasLocal : tomasIniciales);
        }
        setPagos(
          pagosLocal
            .map((p) => ({
              ...p,
              detalles: p.detalles || detallesPorPago.get(p.id) || [],
            }))
            .sort(
              (a, b) =>
                new Date(b.fecha_pago || b.created_at).getTime() -
                new Date(a.fecha_pago || a.created_at).getTime()
            )
        );
      } catch {
        sileo.error({
          title: 'Error al consultar estado de cuenta',
          description: obtenerMensajeError(err, 'No se pudo cargar el historial del contribuyente.'),
        });
      }
    } finally {
      setCargando(false);
    }
  }, [personaId, tomasIniciales]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void cargarEstadoCuenta();
    });
    return () => {
      cancelled = true;
    };
  }, [cargarEstadoCuenta]);

  // Años disponibles en el selector (año actual, anterior y años con pagos)
  const aniosDisponibles = useMemo(() => {
    const setAnios = new Set<number>([anioActual, anioActual - 1]);
    for (const p of pagos) {
      if (p.estado === 'anulado') continue;
      for (const d of p.detalles || []) {
        if (d.anio) setAnios.add(Number(d.anio));
      }
    }
    return Array.from(setAnios).sort((a, b) => b - a);
  }, [pagos, anioActual]);

  // Mapa de meses pagados por toma en el año seleccionado: Map<`${tomaId}-${mes}`, { folio, fecha, monto }>
  const mapaMesesPagados = useMemo(() => {
    const mapa = new Map<string, { folio: string; fecha: string; monto: number }>();
    for (const p of pagos) {
      if (p.estado === 'anulado') continue;
      for (const d of p.detalles || []) {
        if (Number(d.anio) === anioSeleccionado) {
          const key = `${d.toma_id}-${Number(d.mes)}`;
          const existente = mapa.get(key);
          const montoTotal = Number(d.monto || 0) + Number(d.recargo || 0);
          mapa.set(key, {
            folio: p.folio,
            fecha: p.fecha_pago || p.created_at,
            monto: (existente?.monto || 0) + montoTotal,
          });
        }
      }
    }
    return mapa;
  }, [pagos, anioSeleccionado]);

  // Resumen financiero del titular
  const resumen = useMemo(() => {
    const adeudoTotal = tomas.reduce((acc, t) => acc + Number(t.saldo_pendiente || 0), 0);
    const pagosVigentes = pagos.filter((p) => p.estado !== 'anulado');
    const totalAbonado = pagosVigentes.reduce((acc, p) => acc + Number(p.total || 0), 0);
    return {
      adeudoTotal,
      totalAbonado,
      recibosVigentes: pagosVigentes.length,
      recibosAnulados: pagos.length - pagosVigentes.length,
    };
  }, [tomas, pagos]);

  if (!personaId) return null;

  const handleExportarExcel = () => {
    const filasMeses = tomas.map((t) => {
      const fila: Record<string, unknown> = {
        'Código de Toma': t.codigo_toma,
        'Tipo de Toma': t.tipo_toma,
        Estado: t.estado,
        'Saldo Pendiente ($)': Number(t.saldo_pendiente || 0),
        Año: anioSeleccionado,
      };
      MESES_CORTOS.forEach((mesNombre, idx) => {
        const info = mapaMesesPagados.get(`${t.id}-${idx + 1}`);
        fila[mesNombre] = info ? `Pagado (${info.folio})` : 'Pendiente';
      });
      return fila;
    });

    const filasRecibos = pagos.map((p) => {
      const codigos = Array.from(
        new Set(
          (p.detalles || [])
            .map((d) => d.toma?.codigo_toma)
            .filter((c): c is string => Boolean(c))
        )
      ).join(', ');

      const periodos = (p.detalles || [])
        .map((d) => `${MESES_CORTOS[(d.mes || 1) - 1]} ${d.anio}`)
        .join(', ');

      return {
        Folio: p.folio,
        Fecha: new Date(p.fecha_pago || p.created_at).toLocaleString('es-MX'),
        Tomas: codigos || '—',
        'Periodos Cubiertos': periodos || 'Abono general',
        'Método de Pago': p.metodo_pago,
        'Total ($ MXN)': Number(p.total || 0),
        Estado: p.estado === 'anulado' ? 'Anulado' : 'Vigente',
        Cajero: p.cajero?.nombre_completo || 'Caja',
        Notas: p.notas || '',
      };
    });

    const slugNombre = (personaNombre || 'contribuyente')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '');

    exportarMultiplesHojasAExcel(
      [
        {
          nombre: `Meses ${anioSeleccionado}`,
          filas:
            filasMeses.length > 0
              ? filasMeses
              : [{ Mensaje: 'Sin tomas registradas para este contribuyente' }],
        },
        {
          nombre: 'Historial de Recibos',
          filas:
            filasRecibos.length > 0
              ? filasRecibos
              : [{ Mensaje: 'Sin recibos registrados para este contribuyente' }],
        },
      ],
      `estado_cuenta_${slugNombre}_${anioSeleccionado}.xlsx`
    );

    sileo.success({
      title: 'Estado de cuenta exportado',
      description: 'Se descargó el archivo Excel con los meses cubiertos y el historial de recibos.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {personaNombre || 'Estado de Cuenta del Contribuyente'}
              </h2>
              <StatusMark
                mode="rail"
                tone="brand"
                icon={<Droplets className="w-3.5 h-3.5" />}
              >
                {tomas.length} {tomas.length === 1 ? 'toma' : 'tomas'}
              </StatusMark>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {personaDocumento ? `Doc: ${personaDocumento} · ` : ''}
              {personaTelefono ? `Tel: ${personaTelefono} · ` : ''}
              Control de mensualidades cubiertas e historial de recibos
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              onClick={handleExportarExcel}
              disabled={cargando}
            >
              Exportar Excel
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar estado de cuenta"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Resumen numérico rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-dashed border-slate-300 dark:border-[#26345C]">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Adeudo Actual
              </span>
              <span
                className={`text-lg font-black tabular-nums ${
                  resumen.adeudoTotal > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                ${resumen.adeudoTotal.toFixed(2)} MXN
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Total Abonado
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                ${resumen.totalAbonado.toFixed(2)} MXN
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Recibos Vigentes
              </span>
              <span className="text-lg font-black text-blue-600 dark:text-blue-400 tabular-nums">
                {resumen.recibosVigentes}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Tomas Registradas
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {tomas.length}
              </span>
            </div>
          </div>

          {cargando ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-xs font-medium">Consultando estado de cuenta...</p>
            </div>
          ) : (
            <>
              {/* 1. Matriz de Mensualidades Cubiertas por Toma */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span>Mensualidades por Toma — Ejercicio {anioSeleccionado}</span>
                  </h3>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Año:</span>
                    {aniosDisponibles.map((anio) => (
                      <button
                        key={anio}
                        type="button"
                        onClick={() => setAnioSeleccionado(anio)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer tabular-nums ${
                          anioSeleccionado === anio
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {anio}
                      </button>
                    ))}
                  </div>
                </div>

                {tomas.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    Este contribuyente no tiene tomas registradas.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {tomas.map((t) => {
                      const adeudo = Number(t.saldo_pendiente || 0);
                      return (
                        <div
                          key={t.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                {t.codigo_toma}
                              </span>
                              <span className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t.tipo_toma}
                              </span>
                              {t.direccion_referencia && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                                  · {t.direccion_referencia}
                                </span>
                              )}
                            </div>

                            {adeudo > 0 ? (
                              <StatusMark mode="inline" tone="amber">
                                Adeuda ${adeudo.toFixed(2)}
                              </StatusMark>
                            ) : (
                              <StatusMark mode="inline" tone="emerald">
                                Al corriente
                              </StatusMark>
                            )}
                          </div>

                          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
                            {MESES_CORTOS.map((mesCorto, idx) => {
                              const numMes = idx + 1;
                              const pagado = mapaMesesPagados.get(`${t.id}-${numMes}`);

                              return (
                                <div
                                  key={mesCorto}
                                  title={
                                    pagado
                                      ? `${MESES_LARGOS[idx]} ${anioSeleccionado}: Pagado ($${pagado.monto.toFixed(2)}) — Recibo ${pagado.folio}`
                                      : `${MESES_LARGOS[idx]} ${anioSeleccionado}: Sin registro de pago`
                                  }
                                  className={`py-1.5 px-1 rounded-lg border text-center transition-colors ${
                                    pagado
                                      ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                                      : 'border-slate-200/70 dark:border-slate-800 text-slate-400 dark:text-slate-600'
                                  }`}
                                >
                                  <span className="block text-[10px] font-bold uppercase">
                                    {mesCorto}
                                  </span>
                                  <span className="mt-0.5 flex items-center justify-center text-[10px] font-semibold">
                                    {pagado ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Historial de Recibos del Contribuyente */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-500" />
                  <span>Historial de Recibos ({pagos.length})</span>
                </h3>

                {pagos.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    Aún no se han emitido recibos para este contribuyente.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <tr>
                        <TableHead>Folio</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tomas / Periodos</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {pagos.map((p) => {
                        const esAnulado = p.estado === 'anulado';
                        const codigos = Array.from(
                          new Set(
                            (p.detalles || [])
                              .map((d) => d.toma?.codigo_toma)
                              .filter((c): c is string => Boolean(c))
                          )
                        ).join(', ');
                        const periodos = (p.detalles || [])
                          .map((d) => `${MESES_CORTOS[(d.mes || 1) - 1]} ${d.anio}`)
                          .join(', ');

                        return (
                          <TableRow key={p.id} className={esAnulado ? 'opacity-60' : ''}>
                            <TableCell className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                              {p.folio}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(p.fecha_pago || p.created_at).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </TableCell>
                            <TableCell>
                              <div className="text-xs">
                                {codigos && (
                                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mr-1.5">
                                    {codigos}:
                                  </span>
                                )}
                                <span className="text-slate-600 dark:text-slate-400">
                                  {periodos || 'Abono a cuenta'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize text-xs text-slate-600 dark:text-slate-300">
                              {p.metodo_pago}
                            </TableCell>
                            <TableCell>
                              {esAnulado ? (
                                <StatusMark
                                  mode="inline"
                                  tone="rose"
                                  icon={<Ban className="w-3 h-3" />}
                                >
                                  Anulado
                                </StatusMark>
                              ) : (
                                <StatusMark
                                  mode="inline"
                                  tone="emerald"
                                  icon={<CheckCircle2 className="w-3 h-3" />}
                                >
                                  Vigente
                                </StatusMark>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">
                              ${Number(p.total || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/50">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

