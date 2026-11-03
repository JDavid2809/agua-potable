'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Cooperacion } from '@/types/cooperaciones';

export interface ModalProrrogaProps {
  isOpen?: boolean;
  cooperacion: Cooperacion | null;
  onClose: () => void;
  onConfirmar: (nuevaFecha: string, motivo: string) => Promise<void>;
  guardando: boolean;
}

export function ModalProrroga({
  isOpen = true,
  cooperacion,
  onClose,
  onConfirmar,
  guardando,
}: ModalProrrogaProps) {
  const [nuevaFecha, setNuevaFecha] = useState(
    cooperacion?.fecha_prorroga || cooperacion?.fecha_limite || ''
  );
  const [motivo, setMotivo] = useState(cooperacion?.motivo_prorroga || '');

  // Sincronizar campos cuando cambie la cooperación o al abrirse
  useEffect(() => {
    if (cooperacion) {
      setNuevaFecha(cooperacion.fecha_prorroga || cooperacion.fecha_limite || '');
      setMotivo(cooperacion.motivo_prorroga || '');
    }
  }, [cooperacion, isOpen]);

  // Cerrar al presionar tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, guardando, onClose]);

  if (!isOpen || !cooperacion) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaFecha) return;
    await onConfirmar(nuevaFecha, motivo);
  };

  const fechaLimiteActual = cooperacion.fecha_prorroga || cooperacion.fecha_limite;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dashed border-slate-300 dark:border-[#26345C]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full border border-dashed border-purple-400 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Aplazar Fecha / Conceder Prórroga
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Extensión del plazo límite de la cooperación
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar modal"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-800 dark:text-purple-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-purple-400" />
            <div>
              <span className="font-bold block">Proyecto: {cooperacion.nombre}</span>
              <span className="text-[11px] opacity-90 block mt-0.5">
                Fecha límite vigente:{' '}
                {new Date(fechaLimiteActual).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Nueva Fecha Límite de Aportación *
            </label>
            <Input
              type="date"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              min={cooperacion.fecha_inicio}
              required
            />
            <p className="text-[11px] text-slate-400">
              El sistema extenderá el periodo sin marcar a los ciudadanos como morosos antes de este día.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Motivo o Acuerdo de Asamblea *
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Aprobada prórroga de 15 días en asamblea extraordinaria por solicitud de los vecinos..."
              className="w-full px-4 py-2.5 text-sm rounded-xl bg-transparent border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-dashed border-slate-300 dark:border-[#26345C]">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={guardando}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              Confirmar Prórroga
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
