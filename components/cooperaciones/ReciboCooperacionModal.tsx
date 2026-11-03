'use client';

import React, { useEffect } from 'react';
import { Printer, X, CheckCircle2, HeartHandshake, Calendar, User, Hash, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Organizacion } from '@/types/database';
import type { CooperacionAbono, CooperacionPadronItem, Cooperacion } from '@/types/cooperaciones';

export interface ReciboCooperacionModalProps {
  isOpen?: boolean;
  abono: CooperacionAbono | null;
  item: CooperacionPadronItem | null;
  cooperacion: Cooperacion | null;
  organizacion: Organizacion | null;
  onClose: () => void;
  cambioEntregado?: number | null;
  efectivoRecibido?: number | null;
}

export function ReciboCooperacionModal({
  isOpen = true,
  abono,
  item,
  cooperacion,
  organizacion,
  onClose,
  cambioEntregado,
  efectivoRecibido,
}: ReciboCooperacionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !abono || !item || !cooperacion) return null;

  const handlePrint = () => {
    window.print();
  };

  const fechaFormateada = new Date(abono.fecha_pago).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const liquidado = Number(abono.saldo_restante) <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #recibo-coop-imprimible, #recibo-coop-imprimible * {
            visibility: visible;
          }
          #recibo-coop-imprimible {
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

      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal (no se imprime) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-dashed border-slate-300 dark:border-[#26345C] bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-bold">
              {liquidado ? 'Cooperación Liquidada en su Totalidad' : 'Abono de Cooperación Registrado'}
            </span>
          </div>
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
            id="recibo-coop-imprimible"
            className="bg-slate-50/80 dark:bg-slate-950/60 p-6 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] text-slate-900 dark:text-slate-100 font-mono text-xs space-y-4"
          >
            {/* Encabezado del Comité */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300 dark:border-[#26345C]">
              <div className="flex items-center justify-center gap-1.5 font-sans font-extrabold text-sm tracking-tight text-slate-900 dark:text-white uppercase">
                <HeartHandshake className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{organizacion?.nombre || 'Comité de Agua Potable'}</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {organizacion?.localidad ? `${organizacion.localidad}, ` : ''}
                {organizacion?.municipio ? `${organizacion.municipio}, ` : ''}
                {organizacion?.estado || 'México'}
              </p>
              <div className="pt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Comprobante Oficial de Aportación
                </span>
              </div>
            </div>

            {/* Datos del Proyecto y Folio */}
            <div className="space-y-1.5 py-1 border-b border-dashed border-slate-300 dark:border-[#26345C]">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Folio Recibo:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">
                  {abono.folio_recibo}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Fecha y Hora:</span>
                <span>{fechaFormateada}</span>
              </div>
              <div className="flex justify-between items-start pt-1">
                <span className="text-slate-500 shrink-0">Campaña / Obra:</span>
                <span className="font-bold text-right text-slate-900 dark:text-white max-w-[200px]">
                  {cooperacion.nombre}
                </span>
              </div>
            </div>

            {/* Datos del Aportante / Toma */}
            <div className="space-y-1.5 py-1 border-b border-dashed border-slate-300 dark:border-[#26345C]">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 shrink-0">Aportante:</span>
                <span className="font-bold text-right text-slate-900 dark:text-white">
                  {item.persona?.nombre_completo || 'Ciudadano'}
                </span>
              </div>
              {item.toma && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Contrato / Toma:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {item.toma.codigo_toma}
                  </span>
                </div>
              )}
              {item.toma?.direccion_referencia && (
                <div className="flex justify-between items-start text-[10px]">
                  <span className="text-slate-500 shrink-0">Ubicación:</span>
                  <span className="text-right text-slate-600 dark:text-slate-400 max-w-[200px]">
                    {item.toma.direccion_referencia}
                  </span>
                </div>
              )}
            </div>

            {/* Desglose Financiero */}
            <div className="space-y-2 py-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Cuota total requerida:</span>
                <span>${Number(item.monto_requerido).toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Saldo anterior al pago:</span>
                <span>${Number(abono.saldo_anterior).toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-emerald-600 dark:text-emerald-400 pt-1 border-t border-dashed border-slate-300 dark:border-[#26345C]">
                <span>Monto abonado en caja:</span>
                <span>${Number(abono.monto_abono).toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-dashed border-slate-300 dark:border-[#26345C]">
                <span>Saldo restante por pagar:</span>
                <span className={liquidado ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {liquidado ? '$0.00 MXN (LIQUIDADO)' : `$${Number(abono.saldo_restante).toFixed(2)} MXN`}
                </span>
              </div>

              {efectivoRecibido !== undefined && efectivoRecibido !== null && efectivoRecibido > 0 && (
                <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between">
                    <span>Efectivo entregado:</span>
                    <span>${efectivoRecibido.toFixed(2)} MXN</span>
                  </div>
                  {cambioEntregado !== undefined && cambioEntregado !== null && cambioEntregado > 0 && (
                    <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>Cambio devuelto:</span>
                      <span>${cambioEntregado.toFixed(2)} MXN</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mensaje y Firma */}
            <div className="pt-4 text-center space-y-3 border-t border-dashed border-slate-300 dark:border-[#26345C]">
              <p className="text-[10px] text-slate-400 leading-tight">
                Conserve este recibo oficial. Es su comprobante de participación comunitaria y será presentado en la próxima asamblea general.
              </p>
              <div className="pt-6">
                <div className="w-36 mx-auto border-t border-slate-400 dark:border-slate-600" />
                <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-1">
                  Firma o Sello del Comité
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Acciones del pie (no se imprimen) */}
        <div className="no-print flex items-center justify-between gap-3 px-6 py-4 border-t border-dashed border-slate-300 dark:border-[#26345C] bg-slate-50/50 dark:bg-slate-900/50">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handlePrint}
            icon={<Printer className="w-4 h-4" />}
          >
            Imprimir Comprobante
          </Button>
        </div>
      </div>
    </div>
  );
}

