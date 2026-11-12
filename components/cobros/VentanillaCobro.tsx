'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Droplets,
  CreditCard,
  Banknote,
  Calendar,
  Receipt,
  Plus,
  Minus,
  ArrowLeft,
  MapPin,
  Gauge,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { registrarPagoLocal } from '@/lib/sync/sync-engine';
import { obtenerMensajeError } from '@/lib/utils/errors';
import { useRegistrosPorPagina } from '@/hooks/use-registros-por-pagina';
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
  cargando?: boolean;
  onRefresh?: () => void;
  initialCodigoToma?: string | null;
  onPagoCompletado: () => void;
  onCuotaActualizada?: (nuevaCuota: number, nuevoRecargo: number) => void;
}

export function VentanillaCobro({
  personas,
  tomas,
  organizacion,
  cajeroId,
  cajeroNombre,
  cargando = false,
  onRefresh,
  initialCodigoToma,
  onPagoCompletado,
  onCuotaActualizada,
}: VentanillaCobroProps) {
  void personas;
  void onCuotaActualizada;

  // Estado de búsqueda, filtros y paginación en la tabla
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroBarrio, setFiltroBarrio] = useState('todos');
  const [filtroAdeudo, setFiltroAdeudo] = useState<'todos' | 'con_adeudo' | 'al_corriente'>('todos');
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = useRegistrosPorPagina();

  // Toma seleccionada para cobrar (null = vista tabla, objeto = vista pago)
  const [tomaSeleccionada, setTomaSeleccionada] = useState<(Toma & { persona?: Persona; manzana?: any }) | null>(null);
  const codigoPreseleccionadoRef = useRef<string | null>(null);

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
  const [ultimoEfectivoRecibido, setUltimoEfectivoRecibido] = useState<number | null>(null);

  // Pre-seleccionar toma si viene por parámetro de URL (?toma=TOMA-XXXX)
  useEffect(() => {
    if (!initialCodigoToma || tomas.length === 0) return;
    if (codigoPreseleccionadoRef.current === initialCodigoToma) return;

    const match = tomas.find(
      (t) => t.codigo_toma?.toLowerCase() === initialCodigoToma.trim().toLowerCase()
    );
    if (match) {
      codigoPreseleccionadoRef.current = initialCodigoToma;
      setTomaSeleccionada(match);
      if (match.saldo_pendiente > cuotaBase) {
        setAplicarRecargo(recargoMora > 0);
      }
    }
  }, [initialCodigoToma, tomas, cuotaBase, recargoMora]);

  // Barrios disponibles para filtrar la tabla
  const barriosDisponibles = useMemo(() => {
    const setBarrios = new Set<string>();
    tomas.forEach((t) => {
      if (t.manzana?.barrio) {
        setBarrios.add(t.manzana.barrio);
      }
    });
    return Array.from(setBarrios).sort((a, b) => a.localeCompare(b, 'es'));
  }, [tomas]);

  // Filtrado de tomas y contribuyentes para la tabla
  const tomasFiltradas = useMemo(() => {
    const q = terminoBusqueda.trim().toLowerCase();

    return tomas.filter((t) => {
      if (filtroBarrio !== 'todos') {
        const barrio = (t.manzana?.barrio || '').toLowerCase();
        if (barrio !== filtroBarrio.toLowerCase()) return false;
      }

      const adeudo = Number(t.saldo_pendiente || 0);
      if (filtroAdeudo === 'con_adeudo' && adeudo <= 0) return false;
      if (filtroAdeudo === 'al_corriente' && adeudo > 0) return false;

      if (!q) return true;

      const matchCodigo = t.codigo_toma?.toLowerCase().includes(q);
      const matchMedidor = t.numero_medidor?.toLowerCase().includes(q);
      const matchTitular = t.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchIdentidad = t.persona?.documento_identidad?.toLowerCase().includes(q);
      const matchTelefono = t.persona?.telefono?.toLowerCase().includes(q);
      const matchDireccion = t.direccion_referencia?.toLowerCase().includes(q);
      const matchBarrio = t.manzana?.barrio?.toLowerCase().includes(q);

      return (
        matchCodigo ||
        matchMedidor ||
        matchTitular ||
        matchIdentidad ||
        matchTelefono ||
        matchDireccion ||
        matchBarrio
      );
    });
  }, [tomas, terminoBusqueda, filtroBarrio, filtroAdeudo]);

  // Paginación de la tabla
  const totalPaginas = Math.max(1, Math.ceil(tomasFiltradas.length / itemsPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const indiceInicio = (paginaSegura - 1) * itemsPorPagina;
  const indiceFin = Math.min(indiceInicio + itemsPorPagina, tomasFiltradas.length);

  const tomasPaginadas = useMemo(() => {
    return tomasFiltradas.slice(indiceInicio, indiceInicio + itemsPorPagina);
  }, [tomasFiltradas, indiceInicio, itemsPorPagina]);

  // Entrar a la vista de cobro de una toma
  const handleSeleccionarToma = (t: Toma & { persona?: Persona; manzana?: any }) => {
    setTomaSeleccionada(t);
    setModoCobro('meses');
    setCantidadMeses(1);
    setMontoPersonalizado(cuotaBase.toString());
    setAplicarRecargo(t.saldo_pendiente > cuotaBase && recargoMora > 0);
    setMetodoPago('efectivo');
    setEfectivoRecibido('');
    setReferenciaTransferencia('');
    setNotas('');
  };

  // Volver a la tabla de contribuyentes
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
      subtotal = Number.parseFloat(montoPersonalizado) || 0;
    }

    const total = subtotal + recargos;
    const efectivoNum = Number.parseFloat(efectivoRecibido) || 0;
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

    if (!tomaSeleccionada) {
      sileo.error({
        title: 'Selecciona una toma',
        description: 'Debes seleccionar la toma que se va a cobrar.',
      });
      return;
    }

    if (!tomaSeleccionada.persona_id) {
      sileo.error({
        title: 'Toma sin titular asignado',
        description: 'Esta toma no tiene un titular asignado. Asigna un contribuyente en el Padrón de Tomas antes de cobrar.',
      });
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !navigator.onLine &&
      organizacion?.config?.permitir_cobro_offline === false
    ) {
      sileo.error({
        title: 'Cobro sin conexión deshabilitado',
        description: 'El comité ha desactivado el cobro en modo offline. Conéctate a internet para emitir recibos.',
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

      let notasFinales = notas.trim();
      if (referenciaTransferencia.trim()) {
        notasFinales = `Ref: ${referenciaTransferencia.trim()}${notasFinales ? ` | ${notasFinales}` : ''}`;
      }

      const pagoObj: Pago = {
        id: pagoId,
        organizacion_id: orgId,
        folio: '',
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

      const res = await registrarPagoLocal(pagoObj, detalles);
      pagoObj.folio = res.folio;

      sileo.success({
        title: res.guardadoEnNube ? '¡Cobro guardado en la nube!' : 'Cobro guardado en modo sin conexión',
        description: `Recibo ${res.folio} emitido por $${calculos.total.toFixed(2)} MXN.`,
      });

      setUltimoPagoRegistrado(pagoObj);
      setUltimoCambio(calculos.cambio);
      setUltimoEfectivoRecibido(
        metodoPago === 'efectivo' && calculos.efectivoNum > 0 ? calculos.efectivoNum : null
      );
      setModalReciboOpen(true);

      handleLimpiarSeleccion();
      onPagoCompletado();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al procesar cobro',
        description: obtenerMensajeError(err, 'No se pudo registrar el pago en Supabase.'),
      });
    } finally {
      setProcesando(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     VISTA 2: VENTANILLA DE PAGO PARA LA TOMA SELECCIONADA
  ───────────────────────────────────────────────────────────── */
  if (tomaSeleccionada) {
    const adeudoActual = Number(tomaSeleccionada.saldo_pendiente || 0);

    return (
      <div className="w-full space-y-6 animate-in fade-in duration-200">
        {/* Cabecera de navegación para volver a la tabla */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLimpiarSeleccion}
              aria-label="Volver a la lista de contribuyentes"
              title="Volver a la lista de contribuyentes"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {tomaSeleccionada.persona?.nombre_completo || 'Toma sin titular asignado'}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {tomaSeleccionada.codigo_toma}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {tomaSeleccionada.tipo_toma}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tomaSeleccionada.manzana?.barrio
                  ? `Barrio ${tomaSeleccionada.manzana.barrio}`
                  : 'Sin barrio'}
                {tomaSeleccionada.numero_medidor ? ` • Medidor: ${tomaSeleccionada.numero_medidor}` : ''}
                {tomaSeleccionada.direccion_referencia ? ` • ${tomaSeleccionada.direccion_referencia}` : ''}
              </p>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs self-start sm:self-auto shrink-0">
            <span className="text-slate-500 dark:text-slate-400 mr-1.5">Adeudo actual:</span>
            <span
              className={`font-black ${
                adeudoActual > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              ${adeudoActual.toFixed(2)} MXN
            </span>
          </div>
        </div>

        {/* Formulario de Cobro */}
        <form onSubmit={handleCobrar} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Periodos y Notas (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Modalidad de Cobro */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Concepto y Periodos a Cobrar</span>
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Cuota base: <strong className="text-slate-800 dark:text-slate-200">${cuotaBase.toFixed(2)}/mes</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setModoCobro('meses')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    modoCobro === 'meses'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Calendar className="w-5 h-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs block">Por Meses</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModoCobro('saldo')}
                  disabled={adeudoActual <= 0}
                  className={`p-3 rounded-xl border text-center transition-all disabled:opacity-40 ${
                    modoCobro === 'saldo'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
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
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Banknote className="w-5 h-5 mx-auto mb-1 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs block">Abono Libre</span>
                </button>
              </div>

              {modoCobro === 'meses' && (
                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Número de meses a cobrar:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Restar un mes"
                        onClick={() => setCantidadMeses(Math.max(1, cantidadMeses - 1))}
                        className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-extrabold w-8 text-center">
                        {cantidadMeses}
                      </span>
                      <button
                        type="button"
                        aria-label="Sumar un mes"
                        onClick={() => setCantidadMeses(Math.min(24, cantidadMeses + 1))}
                        className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Atajos rápidos de meses */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">Atajos:</span>
                    {[1, 2, 3, 6, 12].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCantidadMeses(num)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          cantidadMeses === num
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {num === 1 ? '1 mes' : `${num} meses`}
                      </button>
                    ))}
                  </div>

                  {recargoMora > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                      <label
                        htmlFor="ventanilla-aplicar-recargo"
                        className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                      >
                        <input
                          id="ventanilla-aplicar-recargo"
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
                <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <span>Se liquidará el saldo pendiente total de esta toma:</span>
                  <span className="font-extrabold text-sm">
                    ${adeudoActual.toFixed(2)} MXN
                  </span>
                </div>
              )}

              {modoCobro === 'personalizado' && (
                <div className="space-y-1.5 pt-1">
                  <label
                    htmlFor="ventanilla-monto-personalizado"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Monto del abono libre ($ MXN)
                  </label>
                  <Input
                    id="ventanilla-monto-personalizado"
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
            <div className="space-y-2">
              <label
                htmlFor="ventanilla-notas"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Observaciones o Notas (Opcional)
              </label>
              <Input
                id="ventanilla-notas"
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: Pago de cuota anual con descuento acordado en asamblea..."
              />
            </div>
          </div>

          {/* Columna Derecha: Método de Pago, Calculadora y Emisión (5 cols) */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-3 border-b border-slate-100 dark:border-slate-800">
                Método de Pago y Total
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
                  <label
                    htmlFor="ventanilla-referencia-transferencia"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Número de Autorización / Rastreo
                  </label>
                  <Input
                    id="ventanilla-referencia-transferencia"
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
                    <label
                      htmlFor="ventanilla-efectivo-recibido"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Efectivo Recibido ($ MXN)
                    </label>
                    <input
                      id="ventanilla-efectivo-recibido"
                      type="number"
                      step="0.50"
                      min="0"
                      value={efectivoRecibido}
                      onChange={(e) => setEfectivoRecibido(e.target.value)}
                      placeholder="¿Cuánto entrega el contribuyente?"
                      className="w-full px-3.5 py-2 text-base font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Cambio:
                    </span>
                    <span
                      className={`text-lg font-black ${
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

              {/* Total a pagar */}
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

              {/* Botones de acción */}
              <div className="space-y-2 pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={procesando}
                  className="w-full justify-center"
                  icon={<Receipt className="w-4 h-4" />}
                >
                  Cobrar y Emitir Recibo
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={procesando}
                  onClick={handleLimpiarSeleccion}
                  className="w-full justify-center"
                >
                  Cancelar y Volver
                </Button>
              </div>
            </div>
          </div>
        </form>

        {/* Modal de Impresión de Recibo Oficial */}
        {modalReciboOpen && ultimoPagoRegistrado && (
          <ReciboTicketModal
            pago={ultimoPagoRegistrado}
            organizacion={organizacion}
            cambioEntregado={ultimoCambio}
            efectivoRecibido={ultimoEfectivoRecibido}
            onClose={() => setModalReciboOpen(false)}
          />
        )}
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     VISTA 1: BUSCADOR + TABLA DE PERSONAS / TOMAS PARA COBRAR
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="w-full space-y-6">
      {/* 1. Barra de Búsqueda, Filtros y Cuota Base */}
      <FilterBar
        searchValue={terminoBusqueda}
        onSearchChange={(val) => {
          setTerminoBusqueda(val);
          setPaginaActual(1);
        }}
        searchPlaceholder="Buscar titular, código de toma (TOMA-01), medidor o barrio..."
        onRefresh={onRefresh}
        isRefreshing={cargando}
        action={
          <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 shrink-0">
            <span className="text-slate-400">Cuota Base:</span>
            <span className="font-extrabold text-blue-600 dark:text-blue-400">
              ${cuotaBase.toFixed(2)} MXN
            </span>
            {recargoMora > 0 && (
              <span className="text-amber-600 dark:text-amber-400 text-[11px]">
                (+${recargoMora.toFixed(2)} mora)
              </span>
            )}
          </div>
        }
      >
        <FilterSelect
          value={filtroBarrio}
          onChange={(e) => {
            setFiltroBarrio(e.target.value);
            setPaginaActual(1);
          }}
        >
          <option value="todos">Todos los barrios</option>
          {barriosDisponibles.map((b) => (
            <option key={b} value={b}>
              Barrio {b}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          value={filtroAdeudo}
          onChange={(e) => {
            setFiltroAdeudo(e.target.value as 'todos' | 'con_adeudo' | 'al_corriente');
            setPaginaActual(1);
          }}
        >
          <option value="todos">Todos los saldos</option>
          <option value="con_adeudo">Con adeudo</option>
          <option value="al_corriente">Al corriente</option>
        </FilterSelect>
      </FilterBar>

      {/* 2. Tabla de Personas y Tomas por Cobrar */}
      {cargando && tomas.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm font-medium">Cargando padrón de cobros...</p>
        </div>
      ) : tomasFiltradas.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <Droplets className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No se encontraron tomas para cobrar
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {terminoBusqueda || filtroBarrio !== 'todos' || filtroAdeudo !== 'todos'
              ? 'Prueba ajustando el texto de búsqueda o los filtros.'
              : 'Aún no hay tomas de agua registradas en el padrón.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Titular / Contribuyente</TableHead>
                <TableHead>Código / Toma</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Saldo / Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {tomasPaginadas.map((toma) => {
                const adeudo = Number(toma.saldo_pendiente || 0);

                return (
                  <TableRow
                    key={toma.id}
                    onClick={() => handleSeleccionarToma(toma)}
                    className="!cursor-pointer"
                  >
                    {/* Titular */}
                    <TableCell>
                      <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {toma.persona?.nombre_completo || (
                          <span className="text-amber-600 dark:text-amber-400 italic">
                            Sin titular asignado
                          </span>
                        )}
                      </div>
                      {(toma.persona?.documento_identidad || toma.persona?.telefono) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          {toma.persona?.documento_identidad && (
                            <span>Doc: {toma.persona.documento_identidad}</span>
                          )}
                          {toma.persona?.telefono && (
                            <span>Tel: {toma.persona.telefono}</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Código y Medidor */}
                    <TableCell>
                      <div className="font-extrabold text-blue-600 dark:text-blue-400 font-mono text-xs">
                        {toma.codigo_toma}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {toma.tipo_toma}
                        </span>
                        {toma.numero_medidor && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                            <Gauge className="w-3 h-3 text-slate-400" />
                            {toma.numero_medidor}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Ubicación */}
                    <TableCell>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>
                          {toma.manzana?.barrio ? `Barrio ${toma.manzana.barrio}` : 'Sin barrio'}
                          {toma.manzana?.numero_manzana ? ` — ${toma.manzana.numero_manzana}` : ''}
                        </span>
                      </div>
                      {toma.direccion_referencia && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                          {toma.direccion_referencia}
                        </p>
                      )}
                    </TableCell>

                    {/* Saldo / Estado */}
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {adeudo > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Adeuda ${adeudo.toFixed(2)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            Al corriente
                          </span>
                        )}
                        {toma.estado !== 'activa' && (
                          <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">
                            Toma {toma.estado}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Acciones */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeleccionarToma(toma);
                          }}
                          className="p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                          title="Cobrar y emitir recibo a esta toma"
                          aria-label={`Cobrar toma ${toma.codigo_toma}`}
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Barra de Paginación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-dashed border-slate-300 dark:border-[#26345C] text-xs text-slate-500 dark:text-slate-400">
            <div>
              Mostrando{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {indiceInicio + 1}–{indiceFin}
              </span>{' '}
              de{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {tomasFiltradas.length}
              </span>{' '}
              tomas ({itemsPorPagina} por página)
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaSegura <= 1}
                  onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                  icon={<ChevronLeft className="w-3.5 h-3.5" />}
                >
                  Anterior
                </Button>

                <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                  Página {paginaSegura} de {totalPaginas}
                </span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaSegura >= totalPaginas}
                  onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                >
                  <span className="flex items-center gap-1">
                    Siguiente
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Impresión de Recibo Oficial (tras regresar a la lista) */}
      {modalReciboOpen && ultimoPagoRegistrado && (
        <ReciboTicketModal
          pago={ultimoPagoRegistrado}
          organizacion={organizacion}
          cambioEntregado={ultimoCambio}
          efectivoRecibido={ultimoEfectivoRecibido}
          onClose={() => setModalReciboOpen(false)}
        />
      )}
    </div>
  );
}
