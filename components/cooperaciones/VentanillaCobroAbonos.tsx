'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Check,
  Receipt,
  Droplets,
  Users,
  RotateCcw,
  Banknote,
  Building2,
  X,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Toma } from '@/types/database';
import type {
  Cooperacion,
  CooperacionPadronItem,
  EstadoPadronCooperacion,
} from '@/types/cooperaciones';

export interface VentanillaCobroAbonosProps {
  coopActiva: Cooperacion;
  padron: CooperacionPadronItem[];
  tomas: Toma[];
  itemSeleccionado: CooperacionPadronItem | null;
  onSeleccionarItem: (item: CooperacionPadronItem | null) => void;
  onRegistrarAbono: (params: {
    item: CooperacionPadronItem;
    monto: number;
    metodoPago: 'efectivo' | 'transferencia';
    efectivoRecibido?: number;
    notas?: string;
  }) => Promise<void>;
  onAcreditarFaena: (item: CooperacionPadronItem) => Promise<void>;
  guardando: boolean;
}

export function limpiarDireccion(direccion?: string | null): string {
  if (!direccion || !direccion.trim()) return 'Sin dirección registrada';
  return direccion.replace(/\s+(true|false)\s*$/i, '').trim() || 'Sin dirección registrada';
}

export function VentanillaCobroAbonos({
  coopActiva,
  padron,
  tomas,
  itemSeleccionado,
  onSeleccionarItem,
  onRegistrarAbono,
  onAcreditarFaena,
  guardando,
}: VentanillaCobroAbonosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Formulario de cobro
  const [tipoPago, setTipoPago] = useState<'total' | 'parcial'>('total');
  const [montoInput, setMontoInput] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [notas, setNotas] = useState('');

  // Sincronizar monto por defecto al cambiar de aportante
  useEffect(() => {
    if (itemSeleccionado) {
      if (itemSeleccionado.monto_pendiente > 0) {
        setTipoPago('total');
        setMontoInput(itemSeleccionado.monto_pendiente.toFixed(2));
      } else {
        setTipoPago('parcial');
        setMontoInput('');
      }
      setEfectivoRecibido('');
      setNotas('');
    }
  }, [itemSeleccionado]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar cooperadores en tiempo real
  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return padron.filter((item) => {
      const nombre = (item.persona?.nombre_completo || '').toLowerCase();
      const codigoToma = (item.toma?.codigo_toma || '').toLowerCase();
      const direccion = (item.toma?.direccion_referencia || '').toLowerCase();
      return nombre.includes(q) || codigoToma.includes(q) || direccion.includes(q);
    });
  }, [padron, busqueda]);

  // Tomas asociadas a la persona seleccionada
  const tomasDePersona = useMemo(() => {
    if (!itemSeleccionado?.persona_id) return [];
    return tomas.filter((t) => t.persona_id === itemSeleccionado.persona_id);
  }, [itemSeleccionado, tomas]);

  // Si la obra es por toma, buscar otras tomas de este mismo titular en el padrón
  const otrasTomasMismoTitular = useMemo(() => {
    if (!itemSeleccionado || coopActiva.tipo_sujeto !== 'toma') return [];
    return padron.filter(
      (p) => p.persona_id === itemSeleccionado.persona_id && p.id !== itemSeleccionado.id
    );
  }, [itemSeleccionado, coopActiva, padron]);

  // Acción al seleccionar un aportante del buscador
  const handleSeleccionar = (item: CooperacionPadronItem) => {
    onSeleccionarItem(item);
    setBusqueda('');
    setDropdownAbierto(false);
  };

  // Limpiar selección para buscar a otro
  const handleCambiarAportante = () => {
    onSeleccionarItem(null);
    setBusqueda('');
    setDropdownAbierto(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  // Cálculo del monto actual a abonar
  const montoAbonar = useMemo(() => {
    if (!itemSeleccionado) return 0;
    if (tipoPago === 'total') return itemSeleccionado.monto_pendiente;
    return Number(montoInput) || 0;
  }, [itemSeleccionado, tipoPago, montoInput]);

  const efRecibidoNum = Number(efectivoRecibido) || 0;
  const cambio = efRecibidoNum > montoAbonar ? efRecibidoNum - montoAbonar : 0;
  const efectivoSuficiente = metodoPago !== 'efectivo' || efRecibidoNum >= montoAbonar || efRecibidoNum === 0;

  const handleSubmitCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSeleccionado) return;

    if (montoAbonar <= 0) {
      sileo.warning({
        title: 'Monto inválido',
        description: 'Ingresa un monto mayor a cero para abonar.',
      });
      return;
    }

    if (montoAbonar > itemSeleccionado.monto_pendiente) {
      sileo.warning({
        title: 'Monto excede el adeudo',
        description: `El saldo pendiente de este cooperador es de $${itemSeleccionado.monto_pendiente.toFixed(2)} MXN.`,
      });
      return;
    }

    if (metodoPago === 'efectivo' && efRecibidoNum > 0 && efRecibidoNum < montoAbonar) {
      sileo.warning({
        title: 'Efectivo insuficiente',
        description: `El efectivo recibido ($${efRecibidoNum.toFixed(2)}) es menor al monto a cobrar ($${montoAbonar.toFixed(2)}).`,
      });
      return;
    }

    await onRegistrarAbono({
      item: itemSeleccionado,
      monto: montoAbonar,
      metodoPago,
      efectivoRecibido: efRecibidoNum > 0 ? efRecibidoNum : undefined,
      notas: notas.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Encabezado de la Ventanilla */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dashed border-slate-300 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Ventanilla de Cobro — {coopActiva.nombre}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Busca al ciudadano o número de toma para registrar su abono o liquidación total
          </p>
        </div>
        <div className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 self-start sm:self-auto">
          Cuota: ${coopActiva.cuota_requerida.toFixed(2)} por {coopActiva.tipo_sujeto}
        </div>
      </div>

      {/* 2. Cuadrícula Principal (Izquierda: Búsqueda y Datos / Derecha: Caja) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (7 COLS): Búsqueda + Perfil del Cooperador */}
        <div className="lg:col-span-7 space-y-4">
          {/* BUSCADOR CON RESULTADOS FLOTANTES (POP-OVER OVERLAY) */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Buscar Cooperador / Toma de Agua *
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={busqueda}
                onFocus={() => setDropdownAbierto(true)}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setDropdownAbierto(true);
                }}
                placeholder="Escribe el nombre del vecino, código de toma o calle..."
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors shadow-xs"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* DROPDOWN FLOTANTE QUE SE CIERRA AL SELECCIONAR (NO EMPUJA EL CONTENIDO) */}
            {dropdownAbierto && busqueda.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {resultadosBusqueda.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No se encontraron aportantes con &ldquo;{busqueda}&rdquo; en el padrón de esta obra.
                  </div>
                ) : (
                  resultadosBusqueda.map((item) => {
                    const liquidado = item.estado === 'liquidado';
                    const faena = item.cumplio_con_faena || item.estado === 'exento_faena';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSeleccionar(item)}
                        className={`w-full text-left p-3.5 flex items-center justify-between gap-3 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 transition-colors ${
                          itemSeleccionado?.id === item.id ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-900 dark:text-white block truncate">
                            {item.persona?.nombre_completo || 'Titular sin nombre'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                            {item.toma?.codigo_toma
                              ? `Toma ${item.toma.codigo_toma} — ${limpiarDireccion(item.toma.direccion_referencia)}`
                              : `Censo: ${item.persona?.telefono || 'Sin teléfono'}`}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          {liquidado ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Liquidado
                            </span>
                          ) : faena ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400">
                              <Check className="w-3.5 h-3.5" /> Faena Cumplida
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                              Resta: ${item.monto_pendiente.toFixed(2)} MXN
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* FICHA DEL COOPERADOR SELECCIONADO */}
          {itemSeleccionado ? (
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base shrink-0">
                    {itemSeleccionado.persona?.nombre_completo?.charAt(0) || 'C'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Cooperador Seleccionado
                    </span>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {itemSeleccionado.persona?.nombre_completo}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {itemSeleccionado.toma?.codigo_toma
                        ? `Toma: ${itemSeleccionado.toma.codigo_toma} — ${limpiarDireccion(itemSeleccionado.toma.direccion_referencia)}`
                        : 'Aportante titular en censo'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                      itemSeleccionado.estado === 'liquidado'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : itemSeleccionado.estado === 'exento_faena'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : itemSeleccionado.estado === 'parcial'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {itemSeleccionado.estado === 'liquidado'
                      ? 'Liquidado'
                      : itemSeleccionado.estado === 'exento_faena'
                      ? 'Faena'
                      : itemSeleccionado.estado === 'parcial'
                      ? 'En Abonos'
                      : 'Pendiente'}
                  </span>

                  <button
                    type="button"
                    onClick={handleCambiarAportante}
                    title="Buscar o seleccionar otro cooperador"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tomas múltiples del mismo titular (modalidad por toma) */}
              {coopActiva.tipo_sujeto === 'toma' && tomasDePersona.length > 1 && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Titular con {tomasDePersona.length} tomas registradas</span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    Esta obra se fijó <strong>por toma física</strong> (${coopActiva.cuota_requerida.toFixed(2)} por toma). Alterna entre las tomas del titular para cobrar cada una:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {otrasTomasMismoTitular.map((otra) => (
                      <button
                        key={otra.id}
                        type="button"
                        onClick={() => handleSeleccionar(otra)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs hover:border-blue-500 transition-colors flex items-center gap-1.5"
                      >
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {otra.toma?.codigo_toma}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            otra.monto_pendiente <= 0 ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {otra.monto_pendiente <= 0 ? 'Liquidada' : `Resta $${otra.monto_pendiente.toFixed(2)}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modalidad por persona */}
              {coopActiva.tipo_sujeto === 'persona' && tomasDePersona.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Modalidad por Titular / Ciudadano</span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    Esta cuota única de ${coopActiva.cuota_requerida.toFixed(2)} cubre a{' '}
                    <strong>{itemSeleccionado.persona?.nombre_completo}</strong>, quien tiene{' '}
                    <strong>{tomasDePersona.length} toma(s)</strong> a su nombre ({tomasDePersona.map((t) => t.codigo_toma).join(', ')}).
                  </p>
                </div>
              )}

              {/* Desglose Financiero */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-[11px] text-slate-400 block">Cuota Acordada</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    ${itemSeleccionado.monto_requerido.toFixed(2)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <span className="text-[11px] block">Abonado a la Fecha</span>
                  <span className="text-sm font-bold font-mono">
                    ${itemSeleccionado.monto_pagado.toFixed(2)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <span className="text-[11px] block">Resta por Pagar</span>
                  <span className="text-sm font-bold font-mono">
                    ${itemSeleccionado.monto_pendiente.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Acreditar Faena Comunitaria */}
              {coopActiva.permite_faena && itemSeleccionado.monto_pendiente > 0 && (
                <div className="pt-2 flex items-center justify-between bg-purple-500/5 p-3 rounded-xl border border-dashed border-purple-500/20">
                  <div className="text-xs">
                    <span className="font-bold text-purple-900 dark:text-purple-300 block">
                      ¿Cumplió con faena comunitaria?
                    </span>
                    <span className="text-[11px] text-purple-700 dark:text-purple-400">
                      Exenta el pago monetario y salda la cuota de esta obra.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={guardando}
                    onClick={() => onAcreditarFaena(itemSeleccionado)}
                    className="border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 shrink-0"
                  >
                    Acreditar Faena
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white/40 dark:bg-slate-900/40 space-y-2">
              <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Selecciona a un aportante
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Utiliza el buscador superior para seleccionar al vecino o toma que realizará su aportación.
              </p>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA (5 COLS): Caja y Registro de Pago */}
        <div className="lg:col-span-5">
          {!itemSeleccionado ? (
            /* Estado vacío cuando no hay nadie seleccionado */
            <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <Banknote className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Caja en Espera
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Selecciona a un cooperador en el panel izquierdo para calcular el saldo pendiente y habilitar la ventanilla de cobro.
              </p>
            </div>
          ) : itemSeleccionado.monto_pendiente <= 0 ? (
            /* Estado cuando el cooperador ya no debe nada */
            <div className="p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Aportación Liquidada
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 max-w-xs mx-auto">
                Este cooperador ya liquidó el total de su cuota establecida o acreditó su faena para esta campaña.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCambiarAportante}
                className="mt-2 text-xs"
              >
                Cobrar a otro vecino
              </Button>
            </div>
          ) : (
            /* Formulario activo de cobro */
            <form
              onSubmit={handleSubmitCobro}
              className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Caja y Registro de Pago
                </h4>
                <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  Resta: ${itemSeleccionado.monto_pendiente.toFixed(2)}
                </span>
              </div>

              {/* Modalidad de pago: Total vs Parcial */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Tipo de Cobro
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoPago('total');
                      setMontoInput(itemSeleccionado.monto_pendiente.toFixed(2));
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      tipoPago === 'total'
                        ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Liquidación Total (${itemSeleccionado.monto_pendiente.toFixed(2)})
                  </button>

                  <button
                    type="button"
                    disabled={!coopActiva.permite_abonos}
                    onClick={() => {
                      setTipoPago('parcial');
                      setMontoInput('');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      tipoPago === 'parcial'
                        ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Abono Parcial
                  </button>
                </div>
              </div>

              {/* Monto a Cobrar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Monto a Ingresar ($ MXN) *
                  </label>
                  {tipoPago === 'total' && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                      Liquidación completa
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  step="0.50"
                  min="1"
                  max={itemSeleccionado.monto_pendiente}
                  value={tipoPago === 'total' ? itemSeleccionado.monto_pendiente.toFixed(2) : montoInput}
                  readOnly={tipoPago === 'total'}
                  onChange={(e) => setMontoInput(e.target.value)}
                  placeholder="Cantidad a cobrar..."
                  required
                  className={tipoPago === 'total' ? 'bg-slate-50 dark:bg-slate-800/60 font-bold' : ''}
                />

                {/* Atajos de abono rápido si es parcial */}
                {tipoPago === 'parcial' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[100, 200, 500].filter((val) => val <= itemSeleccionado.monto_pendiente).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMontoInput(val.toString())}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500"
                      >
                        +${val}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMontoInput(itemSeleccionado.monto_pendiente.toFixed(2))}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-bold border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                    >
                      Todo (${itemSeleccionado.monto_pendiente.toFixed(2)})
                    </button>
                  </div>
                )}
              </div>

              {/* Método de Pago */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Forma de Pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMetodoPago('efectivo')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                      metodoPago === 'efectivo'
                        ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Efectivo en Ventanilla</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMetodoPago('transferencia')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                      metodoPago === 'transferencia'
                        ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Transferencia / Banco</span>
                  </button>
                </div>
              </div>

              {/* Calculadora de Efectivo y Cambio */}
              {metodoPago === 'efectivo' && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Efectivo Recibido:
                    </span>
                    <input
                      type="number"
                      step="0.50"
                      value={efectivoRecibido}
                      onChange={(e) => setEfectivoRecibido(e.target.value)}
                      placeholder="$0.00"
                      className="w-32 text-right px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Atajos de billetes rápidos */}
                  <div className="flex items-center justify-end gap-1.5 pt-0.5">
                    {[200, 500, 1000].map((billete) => (
                      <button
                        key={billete}
                        type="button"
                        onClick={() => setEfectivoRecibido(billete.toString())}
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                      >
                        ${billete}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEfectivoRecibido(montoAbonar.toFixed(2))}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                    >
                      Exacto
                    </button>
                  </div>

                  {/* Resumen de Cambio */}
                  {efRecibidoNum > 0 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        {efRecibidoNum >= montoAbonar ? 'Cambio a entregar:' : 'Efectivo faltante:'}
                      </span>
                      <span
                        className={`font-mono font-bold text-sm ${
                          efRecibidoNum >= montoAbonar
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {efRecibidoNum >= montoAbonar
                          ? `$${cambio.toFixed(2)} MXN`
                          : `Faltan $${(montoAbonar - efRecibidoNum).toFixed(2)} MXN`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Observaciones */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Observaciones en Recibo
                </label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Aportación entregada por familiar..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-transparent border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Botón de Confirmación y Cobro */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={guardando || montoAbonar <= 0}
                className="w-full justify-center text-sm font-bold shadow-md"
              >
                <Receipt className="w-4 h-4 mr-1.5" />
                <span>
                  {guardando
                    ? 'Procesando cobro...'
                    : `Cobrar $${montoAbonar.toFixed(2)} y Generar Recibo`}
                </span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

