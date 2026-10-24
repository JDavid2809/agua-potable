'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Droplets,
  User,
  CreditCard,
  Banknote,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ArrowRight,
  Receipt,
  RotateCcw,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/FilterBar';
import { registrarPagoLocal } from '@/lib/sync/sync-engine';
import { ReciboTicketModal } from './ReciboTicketModal';
import type {
  Persona,
  Toma,
  Pago,
  PagoDetalle,
  MetodoPago,
  Organizacion,
} from '@/types/database';

export interface VentanillaCobroProps {
  personas: Persona[];
  tomas: (Toma & { persona?: Persona; manzana?: any })[];
  organizacion: Organizacion | null;
  cajeroId?: string;
  cajeroNombre?: string;
  onPagoCompletado: () => void;
  onCuotaActualizada?: (nuevaCuota: number, nuevoRecargo: number) => void;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function VentanillaCobro({
  personas,
  tomas,
  organizacion,
  cajeroId,
  cajeroNombre,
  onPagoCompletado,
  onCuotaActualizada,
}: VentanillaCobroProps) {
  // Estado de búsqueda
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [tomaSeleccionada, setTomaSeleccionada] = useState<(Toma & { persona?: Persona; manzana?: any }) | null>(null);

  // Configuración de cuotas
  const cuotaBase = Number(organizacion?.config?.cuota_base || 50);
  const recargoMora = Number(organizacion?.config?.recargo_mora || 0);

  // Opciones de cobro por toma
  const [modoCobro, setModoCobro] = useState<'meses' | 'saldo' | 'personalizado'>('meses');
  const [cantidadMeses, setCantidadMeses] = useState(1);
  const [montoPersonalizado, setMontoPersonalizado] = useState(cuotaBase.toString());
  const [aplicarRecargo, setAplicarRecargo] = useState(false);

  // Datos de pago
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState<string>('');
  const [referenciaTransferencia, setReferenciaTransferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Modales
  const [modalReciboOpen, setModalReciboOpen] = useState(false);
  const [ultimoPagoRegistrado, setUltimoPagoRegistrado] = useState<Pago | null>(null);
  const [ultimoCambio, setUltimoCambio] = useState<number | null>(null);

  // Búsqueda en vivo de tomas o contribuyentes
  const resultadosBusqueda = useMemo(() => {
    const q = terminoBusqueda.trim().toLowerCase();
    if (!q) return [];

    return tomas.filter((t) => {
      const matchCodigo = t.codigo_toma?.toLowerCase().includes(q);
      const matchMedidor = t.numero_medidor?.toLowerCase().includes(q);
      const matchTitular = t.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchIdentidad = t.persona?.documento_identidad?.toLowerCase().includes(q);
      const matchDireccion = t.direccion_referencia?.toLowerCase().includes(q);
      const matchBarrio = t.manzana?.barrio?.toLowerCase().includes(q);

      return (
        matchCodigo ||
        matchMedidor ||
        matchTitular ||
        matchIdentidad ||
        matchDireccion ||
        matchBarrio
      );
    }).slice(0, 8);
  }, [tomas, terminoBusqueda]);

  // Selección de toma
  const handleSeleccionarToma = (t: Toma & { persona?: Persona; manzana?: any }) => {
    setTomaSeleccionada(t);
    setTerminoBusqueda('');
    // Si tiene saldo pendiente, sugerir si amerita recargo
    if (t.saldo_pendiente > cuotaBase) {
      setAplicarRecargo(recargoMora > 0);
    }
  };

  // Deseleccionar toma actual
  const handleLimpiarSeleccion = () => {
    setTomaSeleccionada(null);
    setCantidadMeses(1);
    setEfectivoRecibido('');
    setReferenciaTransferencia('');
    setNotas('');
  };

  // Cálculo de totales a pagar
  const calculos = useMemo(() => {
    let subtotal = 0;
    let recargos = 0;

    if (modoCobro === 'meses') {
      subtotal = cuotaBase * cantidadMeses;
      if (aplicarRecargo && recargoMora > 0) {
        recargos = recargoMora * cantidadMeses;
      }
    } else if (modoCobro === 'saldo') {
      subtotal = tomaSeleccionada?.saldo_pendiente || cuotaBase;
    } else {
      subtotal = parseFloat(montoPersonalizado) || 0;
    }

    const total = subtotal + recargos;
    const efectivoNum = parseFloat(efectivoRecibido) || 0;
    const cambio = metodoPago === 'efectivo' && efectivoNum >= total ? efectivoNum - total : 0;

    return {
      subtotal,
      recargos,
      total,
      efectivoNum,
      cambio,
      esEfectivoSuficiente: metodoPago !== 'efectivo' || efectivoNum >= total,
    };
  }, [
    modoCobro,
    cuotaBase,
    cantidadMeses,
    aplicarRecargo,
    recargoMora,
    tomaSeleccionada,
    montoPersonalizado,
    metodoPago,
    efectivoRecibido,
  ]);

  // Registrar cobro
  const handleCobrar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tomaSeleccionada || !tomaSeleccionada.persona_id) {
      sileo.error({
        title: 'Selecciona una toma',
        description: 'Debes buscar y seleccionar la toma que se va a cobrar.',
      });
      return;
    }

    if (calculos.total <= 0) {
      sileo.error({
        title: 'Monto inválido',
        description: 'El total a cobrar debe ser mayor a cero.',
      });
      return;
    }

    if (metodoPago === 'efectivo' && !calculos.esEfectivoSuficiente) {
      sileo.error({
        title: 'Efectivo insuficiente',
        description: `El efectivo recibido ($${calculos.efectivoNum}) es menor al total a pagar ($${calculos.total}).`,
      });
      return;
    }

    try {
      setProcesando(true);
      const pagoId = crypto.randomUUID();
      const orgId = organizacion?.id || tomaSeleccionada.organizacion_id;
      const anioActual = new Date().getFullYear();
      const mesActual = new Date().getMonth() + 1;

      // Construir detalles de los periodos pagados
      const detalles: PagoDetalle[] = [];

      if (modoCobro === 'meses') {
        const cuotaPorMes = cuotaBase;
        const recargoPorMes = aplicarRecargo ? recargoMora : 0;

        for (let i = 0; i < cantidadMeses; i++) {
          let mesCalculado = mesActual + i;
          let anioCalculado = anioActual;

          while (mesCalculado > 12) {
            mesCalculado -= 12;
            anioCalculado += 1;
          }

          detalles.push({
            id: crypto.randomUUID(),
            organizacion_id: orgId,
            pago_id: pagoId,
            toma_id: tomaSeleccionada.id,
            anio: anioCalculado,
            mes: mesCalculado,
            monto: cuotaPorMes,
            recargo: recargoPorMes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            toma: tomaSeleccionada,
          });
        }
      } else {
        // Modo saldo o abono personalizado
        detalles.push({
          id: crypto.randomUUID(),
          organizacion_id: orgId,
          pago_id: pagoId,
          toma_id: tomaSeleccionada.id,
          anio: anioActual,
          mes: mesActual,
          monto: calculos.subtotal,
          recargo: calculos.recargos,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          toma: tomaSeleccionada,
        });
      }

      // Construir encabezado del pago
      let notasFinales = notas.trim();
      if (referenciaTransferencia.trim()) {
        notasFinales = `Ref: ${referenciaTransferencia.trim()}${notasFinales ? ` | ${notasFinales}` : ''}`;
      }

      const pagoObj: Pago = {
        id: pagoId,
        organizacion_id: orgId,
        folio: '', // el motor offline generará el consecutivo garantizado
        persona_id: tomaSeleccionada.persona_id,
        cajero_id: cajeroId,
        total: calculos.total,
        metodo_pago: metodoPago,
        fecha_pago: new Date().toISOString(),
        notas: notasFinales || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        persona: tomaSeleccionada.persona,
        cajero: cajeroNombre ? ({ nombre_completo: cajeroNombre } as any) : undefined,
        detalles,
      };

      // Registrar de forma atómica con soporte offline / online
      const res = await registrarPagoLocal(pagoObj, detalles);

      pagoObj.folio = res.folio;

      sileo.success({
        title: '¡Cobro registrado!',
        description: `Recibo ${res.folio} emitido por $${calculos.total.toFixed(2)} MXN.`,
      });

      // Guardar datos para recibo y abrir modal
      setUltimoPagoRegistrado(pagoObj);
      setUltimoCambio(calculos.cambio);
      setModalReciboOpen(true);

      // Limpiar selección para el siguiente usuario
      handleLimpiarSeleccion();
      onPagoCompletado();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al procesar cobro',
        description: 'No se pudo registrar el pago. Intenta de nuevo.',
      });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* 1. Barra de Búsqueda y Ajuste de Cuota Base */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-lg">
          <SearchInput
            value={terminoBusqueda}
            onChange={setTerminoBusqueda}
            placeholder="Buscar por código de toma (TOMA-01), medidor o titular..."
            className="w-full max-w-none"
            dropdown={
              resultadosBusqueda.length > 0 ? (
                resultadosBusqueda.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSeleccionarToma(t)}
                    className="w-full text-left px-4 py-3 hover:bg-[#2F6BFF]/10 dark:hover:bg-[#2F6BFF]/20 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#2F6BFF] dark:text-[#6C97FF]">
                          {t.codigo_toma}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate font-semibold">
                          {t.persona?.nombre_completo || 'Sin titular asignado'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {t.manzana?.barrio ? `${t.manzana.barrio} • ` : ''}
                        {t.direccion_referencia || 'Sin referencia'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          t.saldo_pendiente > 0
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {t.saldo_pendiente > 0
                          ? `Adeuda $${Number(t.saldo_pendiente).toFixed(2)}`
                          : 'Al corriente'}
                      </span>
                    </div>
                  </button>
                ))
              ) : null
            }
          />
        </div>

        {/* Cuota Base Vigente del Comité */}
        <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-xs shrink-0">
          <span className="text-slate-400">Cuota Base:</span>
          <span className="font-extrabold text-blue-600 dark:text-blue-400">
            ${cuotaBase.toFixed(2)} MXN
          </span>
          {recargoMora > 0 && (
            <span className="text-amber-600 dark:text-amber-400 text-[11px]">
              (Mora: +${recargoMora.toFixed(2)})
            </span>
          )}
        </div>
      </div>

      {/* 2. Área Principal de Cobro por Toma */}
      {tomaSeleccionada ? (
        <form
          onSubmit={handleCobrar}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Columna Izquierda: Datos de la Toma y Selección de Cuota (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Tarjeta de la Toma Seleccionada */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs relative">
              <button
                type="button"
                onClick={handleLimpiarSeleccion}
                className="absolute top-4 right-4 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cambiar toma</span>
              </button>

              <div className="flex items-start gap-3.5 mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Droplets className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">
                      {tomaSeleccionada.codigo_toma}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                      {tomaSeleccionada.tipo_toma}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                    {tomaSeleccionada.persona?.nombre_completo || 'Titular Desconocido'}
                  </p>
                </div>
              </div>

              {/* Ficha técnica de la toma */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Barrio / Sector:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {tomaSeleccionada.manzana?.barrio || 'No asignado'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Medidor:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {tomaSeleccionada.numero_medidor || 'Sin medidor'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Saldo Adeudado:</span>
                  <span
                    className={`font-black ${
                      tomaSeleccionada.saldo_pendiente > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    ${Number(tomaSeleccionada.saldo_pendiente || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modalidad de Cobro */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Seleccionar Periodos a Cobrar
              </h3>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setModoCobro('meses')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    modoCobro === 'meses'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Calendar className="w-5 h-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs block">Por Meses</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModoCobro('saldo')}
                  disabled={tomaSeleccionada.saldo_pendiente <= 0}
                  className={`p-3 rounded-xl border text-center transition-all disabled:opacity-40 ${
                    modoCobro === 'saldo'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Receipt className="w-5 h-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs block">Liquidar Adeudo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModoCobro('personalizado')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    modoCobro === 'personalizado'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Banknote className="w-5 h-5 mx-auto mb-1 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs block">Abono Libre</span>
                </button>
              </div>

              {/* Opciones según el modo */}
              {modoCobro === 'meses' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Número de meses a cobrar:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCantidadMeses(Math.max(1, cantidadMeses - 1))}
                        className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-extrabold w-8 text-center">
                        {cantidadMeses}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCantidadMeses(Math.min(24, cantidadMeses + 1))}
                        className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Atajos rápidos de meses */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">Atajos:</span>
                    {[1, 2, 3, 6, 12].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCantidadMeses(num)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          cantidadMeses === num
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {num === 1 ? '1 mes' : `${num} meses`}
                      </button>
                    ))}
                  </div>

                  {recargoMora > 0 && (
                    <div className="pt-2">
                      <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={aplicarRecargo}
                          onChange={(e) => setAplicarRecargo(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                        />
                        <span>
                          Aplicar recargo por mora (+${recargoMora.toFixed(2)} por mes)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {modoCobro === 'saldo' && (
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <span>Se liquidará el saldo pendiente total de esta toma:</span>
                  <span className="font-extrabold text-sm">
                    ${Number(tomaSeleccionada.saldo_pendiente).toFixed(2)} MXN
                  </span>
                </div>
              )}

              {modoCobro === 'personalizado' && (
                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Monto del abono libre ($ MXN)
                  </label>
                  <Input
                    type="number"
                    step="0.50"
                    min="1"
                    value={montoPersonalizado}
                    onChange={(e) => setMontoPersonalizado(e.target.value)}
                    placeholder="Monto a pagar"
                    required
                  />
                </div>
              )}
            </div>

            {/* Notas opcionales */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Observaciones o Notas (Opcional)
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: Pago de cuota anual con descuento acordado en asamblea..."
                className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Columna Derecha: Método de Pago, Calculadora de Cambio y Botón de Cobro (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 pb-3 border-b border-slate-100 dark:border-slate-800">
                Resumen y Caja
              </h3>

              {/* Selector de Método de Pago */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Forma de Pago:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                    { id: 'transferencia', label: 'Transf.', icon: CreditCard },
                    { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                  ].map((m) => {
                    const Icon = m.icon;
                    const active = metodoPago === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMetodoPago(m.id as MetodoPago)}
                        className={`py-2 px-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                          active
                            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Si es transferencia: folio de rastreo */}
              {metodoPago === 'transferencia' && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Número de Autorización / Rastreo
                  </label>
                  <Input
                    type="text"
                    value={referenciaTransferencia}
                    onChange={(e) => setReferenciaTransferencia(e.target.value)}
                    placeholder="Ej: SPEI 948271"
                  />
                </div>
              )}

              {/* Si es efectivo: Calculadora de cambio */}
              {metodoPago === 'efectivo' && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                      Efectivo Recibido ($ MXN)
                    </label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={efectivoRecibido}
                      onChange={(e) => setEfectivoRecibido(e.target.value)}
                      placeholder="¿Cuánto entrega el usuario?"
                      className="w-full px-4 py-2.5 text-lg font-black rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cambio a entregar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Cambio:
                    </span>
                    <span
                      className={`text-xl font-black ${
                        calculos.cambio > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      ${calculos.cambio.toFixed(2)} MXN
                    </span>
                  </div>
                </div>
              )}

              {/* Total a pagar en grande */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-semibold">${calculos.subtotal.toFixed(2)}</span>
                </div>
                {calculos.recargos > 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-600 dark:text-amber-400">
                    <span>Recargo por mora:</span>
                    <span className="font-semibold">+${calculos.recargos.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/60 flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Total a Cobrar:
                  </span>
                  <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                    ${calculos.total.toFixed(2)} MXN
                  </span>
                </div>
              </div>

              {/* Botón de Emisión de Cobro */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={procesando}
                className="w-full justify-center py-3.5 text-base font-bold shadow-lg shadow-blue-500/20"
                icon={<Receipt className="w-5 h-5" />}
              >
                Cobrar y Emitir Recibo
              </Button>
            </div>
          </div>
        </form>
      ) : (
        /* Estado vacío: Invita a buscar una toma */
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Ventanilla de Cobro por Toma
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Escribe en la barra superior el <strong>código de toma</strong>, número de medidor o nombre del titular para consultar su saldo y emitir el recibo.
            </p>
          </div>
        </div>
      )}

      {/* Modal de Impresión de Recibo Oficial */}
      {modalReciboOpen && ultimoPagoRegistrado && (
        <ReciboTicketModal
          pago={ultimoPagoRegistrado}
          organizacion={organizacion}
          cambioEntregado={ultimoCambio}
          efectivoRecibido={parseFloat(efectivoRecibido) || null}
          onClose={() => setModalReciboOpen(false)}
        />
      )}


    </div>
  );
}
