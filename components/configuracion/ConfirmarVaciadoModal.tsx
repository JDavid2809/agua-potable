'use client';

import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  CheckCircle2,
  ShieldAlert,
  Link2Off,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type ModuloVaciado =
  | 'personas'
  | 'tomas'
  | 'manzanas'
  | 'pagos'
  | 'cache_local'
  | 'todo';

export interface ConfiguracionModuloVaciado {
  id: ModuloVaciado;
  titulo: string;
  descripcion: string;
  eliminara: string[];
  conservara: string[];
  notaRelacion: string;
}

export interface ConfirmarVaciadoModalProps {
  modulo: ConfiguracionModuloVaciado | null;
  palabraConfirmacion: string;
  onPalabraChange: (valor: string) => void;
  ejecutando: boolean;
  onConfirmar: (e: React.FormEvent) => void;
  onCerrar: () => void;
}

export function ConfirmarVaciadoModal({
  modulo,
  palabraConfirmacion,
  onPalabraChange,
  ejecutando,
  onConfirmar,
  onCerrar,
}: ConfirmarVaciadoModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!modulo) return;

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ejecutando) {
        onCerrar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modulo, ejecutando, onCerrar]);

  if (!modulo) return null;

  const esValido = palabraConfirmacion.trim().toUpperCase() === 'VACIAR';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => {
        if (!ejecutando) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-vaciado-titulo"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white dark:bg-[#121A2F] border border-slate-200 dark:border-[#243256] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-[#1E2B4A] bg-rose-50/70 dark:bg-rose-950/30">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                Acción Irreversible — Eliminación Permanente
              </span>
              <h3
                id="modal-vaciado-titulo"
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug mt-0.5"
              >
                ¿Vaciar {modulo.titulo}?
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            disabled={ejecutando}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={onConfirmar} className="p-6 space-y-5">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {modulo.descripcion}
          </p>

          {/* Resumen de Integridad y Dependencias Relacionales */}
          <div className="rounded-xl border border-slate-200 dark:border-[#243256] bg-slate-50/80 dark:bg-[#0D1426] p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Qué se elimina */}
              <div className="space-y-1.5">
                <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  Se eliminará permanentemente:
                </span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300 pl-5 list-disc">
                  {modulo.eliminara.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Qué se conserva */}
              <div className="space-y-1.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Se conservará intacto:
                </span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300 pl-5 list-disc">
                  {modulo.conservara.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Nota de cómo se maneja la relación */}
            <div className="pt-2.5 border-t border-dashed border-slate-200 dark:border-[#1E2B4A] flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <Link2Off className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <span>{modulo.notaRelacion}</span>
            </div>
          </div>

          {/* Campo de seguridad VACIAR */}
          <div>
            <Input
              ref={inputRef}
              label='Escribe la palabra "VACIAR" para confirmar *'
              value={palabraConfirmacion}
              onChange={(e) => onPalabraChange(e.target.value)}
              placeholder="VACIAR"
              autoComplete="off"
              required
            />
          </div>

          {/* Pie de botones */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#1E2B4A]">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onCerrar}
              disabled={ejecutando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={ejecutando}
              disabled={!esValido || ejecutando}
              icon={<Trash2 className="w-4 h-4" />}
              className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white"
            >
              Confirmar y Vaciar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

