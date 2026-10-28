'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Trash2,
  X,
  CheckCircle2,
  ShieldAlert,
  Link2Off,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

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

const PALABRA = 'VACIAR';
const LINE = 'border-slate-300 dark:border-[#26345C]';

/* Anillo de progreso de confirmación */
const PX = 56;
const STROKE = 4;
const R = (PX - STROKE) / 2 - 2;
const C = 2 * Math.PI * R;

export function ConfirmarVaciadoModal({
  modulo,
  palabraConfirmacion,
  onPalabraChange,
  ejecutando,
  onConfirmar,
  onCerrar,
}: ConfirmarVaciadoModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reducirMovimiento = useReducedMotion();

  useEffect(() => {
    if (!modulo) return;

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ejecutando) {
        onCerrar();
      }
    };

    // Evita que la página de fondo se desplace mientras el modal está abierto
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modulo, ejecutando, onCerrar]);

  const tecleado = palabraConfirmacion.trim().toUpperCase();
  const esValido = tecleado === PALABRA;

  // Letras correctas seguidas desde el inicio; nunca llega a 100% sin ser válido
  let aciertos = 0;
  while (aciertos < PALABRA.length && tecleado[aciertos] === PALABRA[aciertos]) {
    aciertos++;
  }
  const ratio = esValido
    ? 1
    : Math.min(aciertos, PALABRA.length - 1) / PALABRA.length;

  // Con movimiento reducido solo se hace un fundido
  const entradaPanel = reducirMovimiento
    ? { opacity: 0 }
    : { opacity: 0, y: 28, scale: 0.96 };
  const salidaPanel = reducirMovimiento
    ? { opacity: 0, transition: { duration: 0.12 } }
    : {
        opacity: 0,
        y: 16,
        scale: 0.97,
        transition: { duration: 0.18, ease: 'easeIn' as const },
      };
  const estadoPanel = reducirMovimiento
    ? { opacity: 1, transition: { duration: 0.12 } }
    : {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring' as const, stiffness: 380, damping: 30 },
      };

  return (
    <AnimatePresence>
      {modulo && (
        <motion.div
          key="vaciado-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.18, delay: 0.04 } }}
          onClick={() => {
            if (!ejecutando) onCerrar();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-vaciado-titulo"
            onClick={(e) => e.stopPropagation()}
            initial={entradaPanel}
            animate={estadoPanel}
            exit={salidaPanel}
            className={`max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-white p-5 text-slate-900 shadow-2xl dark:bg-[#0B1224] dark:text-slate-100 sm:p-6 ${LINE}`}
          >
            <form onSubmit={onConfirmar}>
              {/* Encabezado: anillo + título + descripción + cerrar */}
              <div className="flex items-start gap-4">
                <div
                  className="relative shrink-0"
                  style={{ width: PX, height: PX }}
                >
                  <svg
                    width={PX}
                    height={PX}
                    viewBox={`0 0 ${PX} ${PX}`}
                    aria-hidden="true"
                  >
                    <circle
                      cx={PX / 2}
                      cy={PX / 2}
                      r={R}
                      fill="none"
                      strokeWidth={STROKE}
                      className="stroke-slate-200 dark:stroke-[#1F2B4D]"
                    />
                    <circle
                      cx={PX / 2}
                      cy={PX / 2}
                      r={R}
                      fill="none"
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - ratio)}
                      strokeOpacity={ratio === 0 ? 0 : 1}
                      transform={`rotate(-90 ${PX / 2} ${PX / 2})`}
                      className="stroke-rose-600 transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none dark:stroke-rose-400"
                    />
                  </svg>
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center text-rose-600 dark:text-rose-400"
                  >
                    <AlertTriangle className="h-6 w-6" />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-400">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400"
                    />
                    Acción irreversible
                  </span>
                  <h3
                    id="modal-vaciado-titulo"
                    className="mt-0.5 text-lg font-bold leading-snug tracking-tight text-slate-900 dark:text-white sm:text-xl"
                  >
                    ¿Vaciar {modulo.titulo}?
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {modulo.descripcion}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onCerrar}
                  disabled={ejecutando}
                  aria-label="Cerrar"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-slate-500 transition-colors hover:border-rose-500 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 disabled:opacity-50 dark:text-slate-400 dark:hover:border-rose-400 dark:hover:text-rose-400 ${LINE}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tres columnas en escritorio: eliminar / conservar / relaciones */}
              <div
                className={`mt-4 grid grid-cols-1 border-t border-dashed md:grid-cols-3 ${LINE}`}
              >
                <div className="py-4 md:pr-5">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-rose-600 dark:text-rose-400">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Se eliminará
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {modulo.eliminara.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600 dark:bg-rose-400"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className={`border-t border-dashed py-4 md:border-l md:border-t-0 md:px-5 ${LINE}`}
                >
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Se conservará
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {modulo.conservara.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Confirmación y acciones en una sola fila (escritorio) */}
              <div
                className={`flex flex-col gap-4 border-t border-dashed pt-4 md:flex-row md:items-end md:gap-6 ${LINE}`}
              >
                <div className="min-w-0 md:flex-1">
                  <label
                    htmlFor="vaciado-confirmacion"
                    className="text-xs font-medium text-slate-500 dark:text-slate-400"
                  >
                    Escribe &quot;{PALABRA}&quot; para confirmar
                  </label>
                  <div
                    className={`group/field relative mt-1 border-b border-dashed ${LINE}`}
                  >
                    <input
                      id="vaciado-confirmacion"
                      ref={inputRef}
                      value={palabraConfirmacion}
                      onChange={(e) => onPalabraChange(e.target.value)}
                      placeholder={PALABRA}
                      autoComplete="off"
                      autoCapitalize="characters"
                      required
                      disabled={ejecutando}
                      className="w-full bg-transparent py-2 pr-12 text-base font-semibold uppercase tracking-[0.2em] text-slate-900 placeholder:text-slate-300 focus:outline-none disabled:opacity-50 dark:text-white dark:placeholder:text-slate-700"
                    />
                    <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-slate-400">
                      {Math.min(tecleado.length, PALABRA.length)}/
                      {PALABRA.length}
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-px left-0 h-[2px] w-full origin-left scale-x-0 bg-rose-600 transition-transform duration-300 ease-out group-focus-within/field:scale-x-100 motion-reduce:transition-none dark:bg-rose-400"
                    />
                  </div>
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onCerrar}
                    disabled={ejecutando}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={ejecutando}
                    disabled={!esValido || ejecutando}
                    icon={<Trash2 className="h-4 w-4" />}
                    className="w-full border-rose-600 bg-rose-600 text-white hover:bg-rose-700 sm:w-auto"
                  >
                    Confirmar y vaciar
                  </Button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}