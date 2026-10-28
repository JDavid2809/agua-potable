'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  CreditCard,
  Banknote,
  RefreshCw,
  Ban,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { dbLocal } from '@/lib/db/offline-db';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ReciboTicketModal } from './ReciboTicketModal';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Pago, Organizacion } from '@/types/database';

export interface HistorialCobrosProps {
  pagos: Pago[];
  organizacion: Organizacion | null;
  cargando: boolean;
  puedeAnular?: boolean;
  onRefresh: () => void;
}

export function HistorialCobros({
  pagos,
  organizacion,
  cargando,
  puedeAnular = false,
  onRefresh,
}: HistorialCobrosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<'todos' | 'efectivo' | 'transferencia' | 'tarjeta'>('todos');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'completado' | 'anulado'>('todos');
  const [reciboSeleccionado, setReciboSeleccionado] = useState<Pago | null>(null);

  // Estado para anulación de recibo
  const [pagoParaAnular, setPagoParaAnular] = useState<Pago | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);

  // Filtrado reactivo de pagos
  const pagosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pagos.filter((p) => {
      const estadoActual = p.estado || 'completado';
      if (filtroEstado !== 'todos' && estadoActual !== filtroEstado) return false;
      if (filtroMetodo !== 'todos' && p.metodo_pago !== filtroMetodo) return false;

      if (!q) return true;
      const matchFolio = p.folio?.toLowerCase().includes(q);
      const matchNombre = p.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchToma = p.detalles?.some((d) => d.toma?.codigo_toma?.toLowerCase().includes(q));

      return matchFolio || matchNombre || matchToma;
    });
  }, [pagos, busqueda, filtroMetodo, filtroEstado]);

  const handleConfirmarAnulacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoParaAnular) return;

    const motivoLimpio = motivoAnulacion.trim();
    if (motivoLimpio.length < 4) {
      sileo.warning({
        title: 'Motivo requerido',
        description: 'Ingresa una justificación breve (mínimo 4 caracteres) para anular el recibo.',
      });
      return;
    }

    try {
      setAnulando(true);

      const { data, error } = await supabase.rpc('anular_pago_recibo', {
        p_pago_id: pagoParaAnular.id,
        p_motivo: motivoLimpio,
      });

      if (error) throw error;

      // Sincronizar también el estado en la caché local Dexie
      try {
        await dbLocal.pagos.update(pagoParaAnular.id, {
          estado: 'anulado',
          motivo_anulacion: motivoLimpio,
          anulado_en: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (pagoParaAnular.detalles && pagoParaAnular.detalles.length > 0) {
          for (const det of pagoParaAnular.detalles) {
            const tomaLocal = await dbLocal.tomas.get(det.toma_id);
            if (tomaLocal) {
              await dbLocal.tomas.update(det.toma_id, {
                saldo_pendiente: Number(tomaLocal.saldo_pendiente || 0) + Number(det.monto || 0),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      } catch {
        // Ignorar fallo en caché local
      }

      sileo.success({
        title: 'Recibo anulado',
        description:
          data?.mensaje ||
          `El recibo ${pagoParaAnular.folio} fue anulado y el saldo se reintegró a la toma.`,
      });

      setPagoParaAnular(null);
      setMotivoAnulacion('');
      onRefresh();
    } catch (err: unknown) {
      sileo.error({
        title: 'No se pudo anular el recibo',
        description: obtenerMensajeError(
          err,
          'Verifica tus permisos o que la migración SQL de anulación esté aplicada en Supabase.'
        ),
      });
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Barra de Filtros */}
      <FilterBar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar por folio (REC-2026-...), nombre o código de toma..."
        onRefresh={onRefresh}
        isRefreshing={cargando}
      >
        <FilterSelect
          label="Método:"
          value={filtroMetodo}
          onChange={(e) => setFiltroMetodo(e.target.value as any)}
        >
          <option value="todos">Todos los métodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </FilterSelect>

        <FilterSelect
          label="Estado:"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as any)}
        >
          <option value="todos">Todos los recibos</option>
          <option value="completado">Vigentes</option>
          <option value="anulado">Anulados</option>
        </FilterSelect>
      </FilterBar>

      {/* Panel de confirmación de anulación (Inline limpio, sin bloquear toda la vista) */}
      {pagoParaAnular && (
        <form
          onSubmit={handleConfirmarAnulacion}
          className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70 rounded-2xl p-5 sm:p-6 space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Confirmar Anulación del Recibo {pagoParaAnular.folio}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Titular: <strong>{pagoParaAnular.persona?.nombre_completo || 'Usuario'}</strong> • Monto:{' '}
                  <strong>${Number(pagoParaAnular.total).toFixed(2)} MXN</strong>. Al anular este recibo, el
                  importe pagado se reintegrará como adeudo pendiente en su toma y se descontará del corte de caja.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPagoParaAnular(null);
                setMotivoAnulacion('');
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Cerrar panel de anulación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <Input
                label="Motivo de la Anulación *"
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Ej: Error en captura de monto o cobro aplicado a toma equivocada..."
                required
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setPagoParaAnular(null);
                  setMotivoAnulacion('');
                }}
                disabled={anulando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={anulando}
                icon={<Ban className="w-4 h-4" />}
                className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white"
              >
                Confirmar Anulación
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Tabla de Cobros */}
      {cargando && pagos.length === 0 ? (
        <div className="py-20 text-center text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
          <p className="text-sm font-medium">Cargando recibos del comité...</p>
        </div>
      ) : pagosFiltrados.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-semibold">No se encontraron pagos registrados con ese filtro.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Contribuyente / Toma</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total ($ MXN)</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagosFiltrados.map((p) => {
                const esAnulado = p.estado === 'anulado';
                const fecha = new Date(p.fecha_pago || p.created_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const codigoToma =
                  p.detalles && p.detalles.length > 0 ? p.detalles[0].toma?.codigo_toma : null;

                return (
                  <TableRow key={p.id} className={esAnulado ? 'opacity-65' : ''}>
                    <TableCell className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                      {p.folio}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {fecha}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-white block text-sm">
                          {p.persona?.nombre_completo || 'Titular de padrón'}
                        </span>
                        {codigoToma && (
                          <span className="text-[11px] text-slate-400 font-mono block">
                            Toma: {codigoToma}
                          </span>
                        )}
                        {esAnulado && p.motivo_anulacion && (
                          <span className="text-[11px] text-rose-600 dark:text-rose-400 block mt-0.5">
                            Motivo: {p.motivo_anulacion}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {p.metodo_pago === 'efectivo' && <Banknote className="w-3.5 h-3.5" />}
                        {p.metodo_pago === 'transferencia' && <CreditCard className="w-3.5 h-3.5" />}
                        {p.metodo_pago === 'tarjeta' && <CreditCard className="w-3.5 h-3.5" />}
                        {p.metodo_pago}
                      </span>
                    </TableCell>
                    <TableCell>
                      {esAnulado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                          <Ban className="w-3 h-3" />
                          Anulado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Vigente
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`font-bold text-sm whitespace-nowrap ${
                        esAnulado
                          ? 'line-through text-slate-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      ${Number(p.total).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                      {p.cajero?.nombre_completo || 'Cajero'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          icon={<Printer className="w-3.5 h-3.5" />}
                          onClick={() => setReciboSeleccionado(p)}
                          title="Ver y reimprimir recibo"
                        >
                          Recibo
                        </Button>

                        {puedeAnular && !esAnulado && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            icon={<Ban className="w-3.5 h-3.5 text-rose-500" />}
                            onClick={() => {
                              setPagoParaAnular(p);
                              setMotivoAnulacion('');
                            }}
                            title="Anular recibo y revertir saldo"
                          >
                            Anular
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal para ver / reimprimir recibo */}
      {reciboSeleccionado && (
        <ReciboTicketModal
          pago={reciboSeleccionado}
          organizacion={organizacion}
          onClose={() => setReciboSeleccionado(null)}
        />
      )}
    </div>
  );
}
