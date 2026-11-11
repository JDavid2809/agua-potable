'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  HeartHandshake,
  CheckCircle2,
  Droplets,
  Users,
  Calendar,
  Banknote,
  Calculator,
  Info,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { TipoSujetoCooperacion } from '@/types/cooperaciones';
import type { Toma, Persona } from '@/types/database';

export interface NuevaCooperacionData {
  nombre: string;
  descripcion: string;
  meta_financiera: number;
  cuota_requerida: number;
  tipo_sujeto: TipoSujetoCooperacion;
  fecha_inicio: string;
  fecha_limite: string;
  permite_abonos: boolean;
  permite_faena: boolean;
}

export interface ModalNuevaCooperacionProps {
  isOpen: boolean;
  onClose: () => void;
  onCrear: (datos: NuevaCooperacionData) => Promise<void>;
  guardando: boolean;
  tomas: (Toma & { persona?: Persona })[];
  personas: Persona[];
}

export function ModalNuevaCooperacion({
  isOpen,
  onClose,
  onCrear,
  guardando,
  tomas,
  personas,
}: ModalNuevaCooperacionProps) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoSujeto, setTipoSujeto] = useState<TipoSujetoCooperacion>('toma');

  // Modo de cálculo del presupuesto: fijar cuota o fijar costo total de la obra
  const [modoCalculo, setModoCalculo] = useState<'cuota' | 'meta'>('cuota');
  const [cuotaInput, setCuotaInput] = useState('250');
  const [metaInput, setMetaInput] = useState('35000');

  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const getFechaFutura = () => {
    const f = new Date();
    f.setDate(f.getDate() + 30);
    return f.toISOString().split('T')[0];
  };
  const [fechaLimite, setFechaLimite] = useState(getFechaFutura());
  const [permiteAbonos, setPermiteAbonos] = useState(true);
  const [permiteFaena, setPermiteFaena] = useState(true);

  // Cerrar al presionar Escape
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

  // Análisis del universo de tomas y personas reales
  const statsUniverso = useMemo(() => {
    const tomasActivas = tomas.filter((t) => t.estado === 'activa');
    const conteoTomas = tomasActivas.length || tomas.length;
    const conteoPersonas = personas.length;

    // Mapa de tomas por persona
    const tomasPorPersonaMap = new Map<string, number>();
    tomas.forEach((t) => {
      if (t.persona_id) {
        tomasPorPersonaMap.set(t.persona_id, (tomasPorPersonaMap.get(t.persona_id) || 0) + 1);
      }
    });

    let personasCon1Toma = 0;
    let personasCon2Tomas = 0;
    let personasCon3oMas = 0;
    let personasSinTomas = 0;

    personas.forEach((p) => {
      const cant = tomasPorPersonaMap.get(p.id) || 0;
      if (cant === 0) personasSinTomas++;
      else if (cant === 1) personasCon1Toma++;
      else if (cant === 2) personasCon2Tomas++;
      else personasCon3oMas++;
    });

    return {
      conteoTomas,
      conteoPersonas,
      personasCon1Toma,
      personasCon2Tomas,
      personasCon3oMas,
      personasSinTomas,
    };
  }, [tomas, personas]);

  // Universo activo según opción elegida (por toma o por persona)
  const universoActivo =
    tipoSujeto === 'toma' ? statsUniverso.conteoTomas : statsUniverso.conteoPersonas;

  // Sincronización automática de cálculos al cambiar valores o tipo de sujeto
  useEffect(() => {
    const univ = universoActivo || 1;
    if (modoCalculo === 'cuota') {
      const c = Number(cuotaInput) || 0;
      const m = Math.round(c * univ);
      setMetaInput(m.toString());
    } else {
      const m = Number(metaInput) || 0;
      const c = univ > 0 ? (m / univ).toFixed(2) : '0';
      setCuotaInput(c);
    }
  }, [tipoSujeto, modoCalculo, universoActivo]);

  // Cuando el usuario escribe en la cuota
  const handleCuotaChange = (val: string) => {
    setCuotaInput(val);
    if (modoCalculo === 'cuota') {
      const c = Number(val) || 0;
      const univ = universoActivo || 1;
      setMetaInput(Math.round(c * univ).toString());
    }
  };

  // Cuando el usuario escribe en el presupuesto meta
  const handleMetaChange = (val: string) => {
    setMetaInput(val);
    if (modoCalculo === 'meta') {
      const m = Number(val) || 0;
      const univ = universoActivo || 1;
      const c = univ > 0 ? (m / univ).toFixed(2) : '0';
      setCuotaInput(c);
    }
  };

  const cuotaNumerica = Number(cuotaInput) || 0;
  const metaNumerica = Number(metaInput) || 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || cuotaNumerica <= 0) return;

    await onCrear({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      meta_financiera: metaNumerica,
      cuota_requerida: cuotaNumerica,
      tipo_sujeto: tipoSujeto,
      fecha_inicio: fechaInicio,
      fecha_limite: fechaLimite,
      permite_abonos: permiteAbonos,
      permite_faena: permiteFaena,
    });
  };

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
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dashed border-slate-300 dark:border-[#26345C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-dashed border-[#2F6BFF] dark:border-[#6C97FF] text-[#2F6BFF] dark:text-[#6C97FF] flex items-center justify-center shrink-0">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Nueva Campaña de Cooperación
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aprobada por asamblea general para obras o mejoras del sistema
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label
              htmlFor="coop-nombre"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Nombre de la Obra o Proyecto Comunitario *
            </label>
            <Input
              id="coop-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Mantenimiento Mayor Bomba Pozo #2"
              required
            />
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <label
              htmlFor="coop-descripcion"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Descripción y Justificación del Acuerdo de Asamblea
            </label>
            <textarea
              id="coop-descripcion"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles acordados en asamblea general comunitaria..."
              className="w-full px-4 py-2.5 text-sm rounded-xl bg-transparent border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* ─────────────────────────────────────────────────────────────
             MODALIDAD DE COBRO: POR TOMA VS POR PERSONA
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Modalidad de Asignación del Padrón *
              </span>
              <span className="text-[11px] text-slate-400">
                Define cómo se calcula el cobro a vecinos con 1 o más tomas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opción 1: Por Toma */}
              <button
                type="button"
                onClick={() => setTipoSujeto('toma')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  tipoSujeto === 'toma'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-900 dark:text-blue-100 ring-1 ring-blue-500/30'
                    : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 shrink-0 mt-0.5">
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-bold block">Por Cada Toma de Agua</span>
                  <span className="text-xs opacity-90 block mt-0.5 font-semibold text-blue-700 dark:text-blue-300">
                    {statsUniverso.conteoTomas} tomas activas en el padrón
                  </span>
                  <span className="text-[11px] opacity-75 block mt-1">
                    Si una persona tiene 2 o más tomas, aporta una cuota por cada toma que posea.
                  </span>
                </div>
              </button>

              {/* Opción 2: Por Titular / Persona */}
              <button
                type="button"
                onClick={() => setTipoSujeto('persona')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  tipoSujeto === 'persona'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-500/30'
                    : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0 mt-0.5">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-bold block">Por Titular / Ciudadano</span>
                  <span className="text-xs opacity-90 block mt-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                    {statsUniverso.conteoPersonas} titulares registrados en censo
                  </span>
                  <span className="text-[11px] opacity-75 block mt-1">
                    Cada titular paga una cuota fija sin importar cuántas tomas tenga registradas.
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
             CALCULADORA DE CUOTA VS PRESUPUESTO META
          ───────────────────────────────────────────────────────────── */}
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] bg-slate-50/50 dark:bg-slate-900/50 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Cálculo de Cuota y Presupuesto Meta
                </span>
              </div>

              {/* Selector de modo de cálculo */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setModoCalculo('cuota')}
                  className={`px-2 py-1 rounded-md font-medium transition-colors ${
                    modoCalculo === 'cuota'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Fijar Cuota
                </button>
                <button
                  type="button"
                  onClick={() => setModoCalculo('meta')}
                  className={`px-2 py-1 rounded-md font-medium transition-colors ${
                    modoCalculo === 'meta'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Fijar Meta de Obra
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="coop-cuota-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Cuota por {tipoSujeto === 'toma' ? 'Toma' : 'Persona'} ($ MXN) *
                </label>
                <Input
                  id="coop-cuota-input"
                  type="number"
                  min="1"
                  step="0.50"
                  value={cuotaInput}
                  onChange={(e) => handleCuotaChange(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="text-[11px] text-slate-400 block">
                  {modoCalculo === 'meta' ? 'Calculada automáticamente' : 'Cuota unitaria fija'}
                </span>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="coop-meta-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Presupuesto Meta de la Obra ($ MXN) *
                </label>
                <Input
                  id="coop-meta-input"
                  type="number"
                  min="1"
                  step="1"
                  value={metaInput}
                  onChange={(e) => handleMetaChange(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="text-[11px] text-slate-400 block">
                  {modoCalculo === 'cuota'
                    ? `Total: ${universoActivo} aportantes x $${cuotaNumerica.toFixed(2)}`
                    : 'Costo total fijado en asamblea'}
                </span>
              </div>
            </div>

            {/* Desglose de impacto en ciudadanos con 1 o más tomas */}
            <div className="p-3 rounded-lg bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold">
                <Info className="w-3.5 h-3.5" />
                <span>
                  Desglose para cooperadores según tomas registradas ({tipoSujeto === 'toma' ? 'Cobro por toma' : 'Cobro por titular'}):
                </span>
              </div>

              {tipoSujeto === 'toma' ? (
                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                  <div className="p-1.5 rounded bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400">Titular con 1 toma:</span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      1 x ${cuotaNumerica.toFixed(2)} = ${cuotaNumerica.toFixed(2)}
                    </strong>
                    <span className="block text-[10px] text-slate-400">({statsUniverso.personasCon1Toma} vecinos)</span>
                  </div>

                  <div className="p-1.5 rounded bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400">Titular con 2 tomas:</span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      2 x ${cuotaNumerica.toFixed(2)} = ${(cuotaNumerica * 2).toFixed(2)}
                    </strong>
                    <span className="block text-[10px] text-slate-400">({statsUniverso.personasCon2Tomas} vecinos)</span>
                  </div>

                  <div className="p-1.5 rounded bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400">Titular con 3 tomas:</span>
                    <strong className="font-mono text-slate-900 dark:text-white">
                      3 x ${cuotaNumerica.toFixed(2)} = ${(cuotaNumerica * 3).toFixed(2)}
                    </strong>
                    <span className="block text-[10px] text-slate-400">({statsUniverso.personasCon3oMas} vecinos)</span>
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>
                    Cada uno de los <strong>{statsUniverso.conteoPersonas} titulares</strong> censados aportará una cuota única de{' '}
                    <strong className="font-mono text-emerald-600 dark:text-emerald-400">${cuotaNumerica.toFixed(2)} MXN</strong>,
                    independientemente de si tienen 0, 1, 2 o más tomas registradas a su nombre.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="coop-fecha-inicio"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Fecha de Inicio de Recaudación *
              </label>
              <Input
                id="coop-fecha-inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="coop-fecha-limite"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Fecha Límite para Aportar *
              </label>
              <Input
                id="coop-fecha-limite"
                type="date"
                value={fechaLimite}
                min={fechaInicio}
                onChange={(e) => setFechaLimite(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Opciones comunitarias: Abonos parciales y Faenas */}
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
              Reglas de Recaudación Comunitaria
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                htmlFor="coop-permite-abonos"
                className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <input
                  id="coop-permite-abonos"
                  type="checkbox"
                  checked={permiteAbonos}
                  onChange={(e) => setPermiteAbonos(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>Permitir pagos en abonos parciales</span>
              </label>

              <label
                htmlFor="coop-permite-faena"
                className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <input
                  id="coop-permite-faena"
                  type="checkbox"
                  checked={permiteFaena}
                  onChange={(e) => setPermiteFaena(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>Permitir exención/acreditación por faena</span>
              </label>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-dashed border-slate-300 dark:border-[#26345C]">
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
              Crear Campaña de Cooperación
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
