'use client';

import React from 'react';
import { Printer, X, CheckCircle2, Ban, Droplets, Calendar, User, Hash, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Pago, Organizacion } from '@/types/database';

export interface ReciboModalProps {
  pago: Pago | null;
  organizacion: Organizacion | null;
  onClose: () => void;
  cambioEntregado?: number | null;
  efectivoRecibido?: number | null;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function ReciboTicketModal({
  pago,
  organizacion,
  onClose,
  cambioEntregado,
  efectivoRecibido,
}: ReciboModalProps) {
  if (!pago) return null;

  const handlePrint = () => {
    window.print();
  };

  const fechaFormateada = new Date(pago.fecha_pago || pago.created_at).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Estilos específicos para impresión directa de ticket o carta */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #recibo-imprimible, #recibo-imprimible * {
            visibility: visible;
          }
          #recibo-imprimible {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 80mm;
            padding: 4mm;
            margin: 0;
            background: white !important;
            color: black !important;
            font-size: 11px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera del modal (no se imprime) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          {pago.estado === 'anulado' ? (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Ban className="w-5 h-5" />
              <span className="text-sm font-bold">Recibo Anulado (Sin Validez)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-bold">Cobro Registrado con Éxito</span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido del Recibo Imprimible */}
        <div className="overflow-y-auto p-6">
          <div
            id="recibo-imprimible"
            className="bg-slate-50/80 dark:bg-slate-950/60 p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs space-y-4 shadow-xs"
          >
            {pago.estado === 'anulado' && (
              <div className="p-2.5 rounded-lg border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-center space-y-0.5">
                <p className="font-extrabold uppercase tracking-wider text-xs">
                  *** RECIBO ANULADO — SIN VALIDEZ ***
                </p>
                {pago.motivo_anulacion && (
                  <p className="text-[10px]">Motivo: {pago.motivo_anulacion}</p>
                )}
              </div>
            )}
            {/* Encabezado del Comité */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
              <div className="flex items-center justify-center gap-1.5 text-blue-600 dark:text-blue-400 mb-1">
                <Droplets className="w-5 h-5" />
                <span className="font-extrabold uppercase tracking-wider text-xs">Agua Potable</span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase leading-snug">
                {organizacion?.nombre || 'Comité Comunitario de Agua Potable'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {organizacion?.localidad ? `${organizacion.localidad}, ` : ''}
                {organizacion?.municipio || ''} {organizacion?.estado ? `(${organizacion.estado})` : ''}
              </p>
              {organizacion?.telefono && (
                <p className="text-[10px] text-slate-400">Tel: {organizacion.telefono}</p>
              )}
            </div>

            {/* Metadatos del Folio y Fecha */}
            <div className="grid grid-cols-2 gap-2 text-[11px] pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
              <div>
                <span className="text-slate-500 block text-[10px]">FOLIO OFICIAL:</span>
                <span className="font-bold text-slate-900 dark:text-white">{pago.folio}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">FECHA Y HORA:</span>
                <span>{fechaFormateada}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">MÉTODO:</span>
                <span className="font-semibold uppercase">{pago.metodo_pago}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">CAJERO / OPERADOR:</span>
                <span className="truncate block max-w-[150px] ml-auto">
                  {pago.cajero?.nombre_completo || 'Caja Central'}
                </span>
              </div>
            </div>

            {/* Datos del Contribuyente y Toma */}
            <div className="space-y-1.5 pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
              <div>
                <span className="text-slate-500 block text-[10px]">CONTRIBUYENTE / TITULAR:</span>
                <span className="font-bold text-slate-900 dark:text-white text-xs">
                  {pago.persona?.nombre_completo || 'Usuario de Padrón'}
                </span>
                {pago.persona?.documento_identidad && (
                  <span className="text-slate-400 block text-[10px]">
                    Identificación: {pago.persona.documento_identidad}
                  </span>
                )}
              </div>

              {(() => {
                const tomasUnicas = Array.from(
                  new Map(
                    (pago.detalles || [])
                      .filter((d) => d.toma)
                      .map((d) => [d.toma_id || d.toma!.codigo_toma, d.toma!])
                  ).values()
                );

                if (tomasUnicas.length === 0) return null;

                if (tomasUnicas.length === 1) {
                  const t = tomasUnicas[0];
                  return (
                    <div className="pt-1 grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500 block">CÓDIGO DE TOMA:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {t.codigo_toma}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block">MEDIDOR:</span>
                        <span>{t.numero_medidor || 'Cuota Fija (Sin medidor)'}</span>
                      </div>
                      {t.direccion_referencia && (
                        <div className="col-span-2">
                          <span className="text-slate-500 block">UBICACIÓN:</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {t.direccion_referencia}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="pt-1 space-y-1 text-[10px]">
                    <span className="text-slate-500 block">
                      TOMAS INCLUIDAS ({tomasUnicas.length}):
                    </span>
                    <div className="space-y-1">
                      {tomasUnicas.map((t, idx) => (
                        <div key={t.id || idx} className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {t.codigo_toma}
                            {t.numero_medidor ? ` (Med. ${t.numero_medidor})` : ''}
                          </span>
                          {t.direccion_referencia && (
                            <span className="text-slate-600 dark:text-slate-300 truncate max-w-[210px]">
                              {t.direccion_referencia}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Desglose de Conceptos Pagados */}
            <div className="space-y-2 pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
              <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
                Desglose de Pago:
              </span>

              <div className="space-y-1.5">
                {(() => {
                  const tomasDistintas = new Set(
                    (pago.detalles || []).map((d) => d.toma_id || d.toma?.codigo_toma).filter(Boolean)
                  ).size;
                  const mostrarCodigoToma = tomasDistintas > 1;

                  if (pago.detalles && pago.detalles.length > 0) {
                    return pago.detalles.map((det, i) => (
                      <div key={det.id || i} className="flex justify-between items-start text-[11px] gap-2">
                        <div>
                          <span className="font-semibold">
                            {mostrarCodigoToma && det.toma?.codigo_toma ? (
                              <span className="text-blue-600 dark:text-blue-400 mr-1">
                                {det.toma.codigo_toma} ·
                              </span>
                            ) : null}
                            Cuota {MESES[det.mes - 1] || `Mes ${det.mes}`} {det.anio}
                          </span>
                          {Number(det.recargo || 0) > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 text-[10px] block">
                              + Recargo por mora: ${Number(det.recargo).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <span className="font-bold shrink-0">
                          ${(Number(det.monto) + Number(det.recargo || 0)).toFixed(2)}
                        </span>
                      </div>
                    ));
                  }

                  return (
                    <div className="flex justify-between items-center text-[11px]">
                      <span>Servicio de Agua Potable</span>
                      <span className="font-bold">${Number(pago.total).toFixed(2)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Totales y Cambio */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 dark:text-white">
                <span>TOTAL PAGADO:</span>
                <span className="text-base text-emerald-600 dark:text-emerald-400">
                  ${Number(pago.total).toFixed(2)} MXN
                </span>
              </div>

              {pago.metodo_pago === 'efectivo' && efectivoRecibido !== undefined && efectivoRecibido !== null && (
                <div className="pt-2 text-[10px] text-slate-500 space-y-0.5 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>Efectivo recibido:</span>
                    <span>${Number(efectivoRecibido).toFixed(2)}</span>
                  </div>
                  {cambioEntregado !== undefined && cambioEntregado !== null && (
                    <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                      <span>Cambio entregado:</span>
                      <span>${Number(cambioEntregado).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {pago.notas && (
                <p className="text-[10px] text-slate-400 italic pt-2">
                  Nota: {pago.notas}
                </p>
              )}
            </div>

            {/* Pie de Recibo Oficial */}
            <div className="text-center pt-3 text-[10px] text-slate-400 space-y-1 border-t border-dashed border-slate-300 dark:border-slate-700">
              <p className="font-semibold text-slate-600 dark:text-slate-300">
                ¡Gracias por su pago oportuno!
              </p>
              <p>Conserve este recibo como comprobante oficial ante el comité.</p>
              <p className="text-[9px] text-slate-400">
                Sistema Comunitario • {pago.dispositivo_offline_id || 'Terminal Caja'}
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Acciones (No se imprime) */}
        <div className="no-print p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onClose}
          >
            Cerrar
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            Imprimir Recibo
          </Button>
        </div>
      </div>
    </div>
  );
}
