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
import { StatusMark } from '@/components/ui/StatusMark';
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

type TomaExtendida = Toma & { persona?: Persona; manzana?: any };

interface ContribuyenteConTomas {
  key: string;
  persona?: Persona;
  tomas: TomaExtendida[];
  adeudoTotal: number;
  barrios: string[];
  ubicaciones: string[];
}

interface ConfigTomaPago {
  seleccionada: boolean;
  meses: number;
  montoLibre: string;
}

export interface VentanillaCobroProps {
  personas: Persona[];
  tomas: TomaExtendida[];
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
  void onCuotaActualizada;

  // Estado de búsqueda, filtros y paginación en la tabla
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroBarrio, setFiltroBarrio] = useState('todos');
  const [filtroAdeudo, setFiltroAdeudo] = useState<'todos' | 'con_adeudo' | 'al_corriente'>('todos');
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = useRegistrosPorPagina();

  // Contribuyente seleccionado para cobrar (agrupa todas sus tomas)
  const [contribuyenteSeleccionado, setContribuyenteSeleccionado] =
    useState<ContribuyenteConTomas | null>(null);
  const [configPorToma, setConfigPorToma] = useState<Record<string, ConfigTomaPago>>({});
  const codigoPreseleccionadoRef = useRef<string | null>(null);

  // Configuración de cuotas
  const cuotaBase = Number(organizacion?.config?.cuota_base || 50);
  const recargoMora = Number(organizacion?.config?.recargo_mora || 0);

  // Opciones de cobro
  const [modoCobro, setModoCobro] = useState<'meses' | 'saldo' | 'personalizado'>('meses');
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

  // Agrupar tomas por contribuyente/titular igual que en Contratos y Personas
  const contribuyentesConTomas = useMemo<ContribuyenteConTomas[]>(() => {
    const mapaPersonas = new Map(personas.map((p) => [p.id, p]));
    const grupos = new Map<
      string,
      { persona?: Persona; tomas: TomaExtendida[] }
    >();

    for (const toma of tomas) {
      const personaObj = toma.persona || (toma.persona_id ? mapaPersonas.get(toma.persona_id) : undefined);
      const key = toma.persona_id || `sin-titular-${toma.id}`;
      const existente = grupos.get(key);
      if (existente) {
        existente.tomas.push(toma);
        if (!existente.persona && personaObj) existente.persona = personaObj;
      } else {
        grupos.set(key, { persona: personaObj, tomas: [toma] });
      }
    }

    const lista: ContribuyenteConTomas[] = [];
    grupos.forEach((grupo, key) => {
      const tomasOrdenadas = [...grupo.tomas].sort((a, b) =>
        (a.codigo_toma || '').localeCompare(b.codigo_toma || '', 'es')
      );
      const adeudoTotal = tomasOrdenadas.reduce(
        (acc, t) => acc + Number(t.saldo_pendiente || 0),
        0
      );
      const barrios = Array.from(
        new Set(
          tomasOrdenadas
            .map((t) => t.manzana?.barrio)
            .filter((b): b is string => Boolean(b))
        )
      );
      const ubicaciones = Array.from(
        new Set(
          tomasOrdenadas
            .map((t) => {
              if (!t.manzana?.barrio) return null;
              return `Barrio ${t.manzana.barrio}${
                t.manzana.numero_manzana ? ` — ${t.manzana.numero_manzana}` : ''
              }`;
            })
            .filter((u): u is string => Boolean(u))
        )
      );

      lista.push({
        key,
        persona: grupo.persona,
        tomas: tomasOrdenadas,
        adeudoTotal,
        barrios,
        ubicaciones,
      });
    });

    return lista.sort((a, b) => {
      const nomA = a.persona?.nombre_completo || '';
      const nomB = b.persona?.nombre_completo || '';
      if (!nomA && nomB) return 1;
      if (nomA && !nomB) return -1;
      return nomA.localeCompare(nomB, 'es');
    });
  }, [tomas, personas]);

  // Inicializar selección de tomas al abrir un contribuyente
  const inicializarSeleccionContribuyente = (
    grupo: ContribuyenteConTomas,
    soloTomaId?: string
  ) => {
    setContribuyenteSeleccionado(grupo);
    setModoCobro('meses');
    setAplicarRecargo(
      grupo.tomas.some((t) => Number(t.saldo_pendiente || 0) > cuotaBase) && recargoMora > 0
    );

    const hayElegiblePorDefecto = grupo.tomas.some(
      (t) => t.estado === 'activa' || Number(t.saldo_pendiente || 0) > 0
    );

    const nextConfig: Record<string, ConfigTomaPago> = {};
    for (const t of grupo.tomas) {
      const seleccionada = soloTomaId
        ? t.id === soloTomaId
        : hayElegiblePorDefecto
          ? t.estado === 'activa' || Number(t.saldo_pendiente || 0) > 0
          : true;

      nextConfig[t.id] = {
        seleccionada,
        meses: 1,
        montoLibre: cuotaBase.toString(),
      };
    }
    setConfigPorToma(nextConfig);
    setMetodoPago('efectivo');
    setEfectivoRecibido('');
    setReferenciaTransferencia('');
    setNotas('');
  };

  // Pre-seleccionar contribuyente y toma si viene por parámetro de URL (?toma=TOMA-XXXX)
  useEffect(() => {
    if (!initialCodigoToma || contribuyentesConTomas.length === 0) return;
    if (codigoPreseleccionadoRef.current === initialCodigoToma) return;

    const codigoNormalizado = initialCodigoToma.trim().toLowerCase();
    for (const grupo of contribuyentesConTomas) {
      const match = grupo.tomas.find(
        (t) => t.codigo_toma?.toLowerCase() === codigoNormalizado
      );
      if (match) {
        codigoPreseleccionadoRef.current = initialCodigoToma;
        inicializarSeleccionContribuyente(grupo, match.id);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCodigoToma, contribuyentesConTomas]);

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

  // Filtrado de contribuyentes y sus tomas para la tabla
  const contribuyentesFiltrados = useMemo(() => {
    const q = terminoBusqueda.trim().toLowerCase();

    return contribuyentesConTomas.filter((grupo) => {
      if (filtroBarrio !== 'todos') {
        const matchBarrioFiltro = grupo.barrios.some(
          (b) => b.toLowerCase() === filtroBarrio.toLowerCase()
        );
        if (!matchBarrioFiltro) return false;
      }

      if (filtroAdeudo === 'con_adeudo' && grupo.adeudoTotal <= 0) return false;
      if (filtroAdeudo === 'al_corriente' && grupo.adeudoTotal > 0) return false;

      if (!q) return true;

      const matchTitular = grupo.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchIdentidad = grupo.persona?.documento_identidad?.toLowerCase().includes(q);
      const matchTelefono = grupo.persona?.telefono?.toLowerCase().includes(q);
      const matchTomas = grupo.tomas.some(
        (t) =>
          t.codigo_toma?.toLowerCase().includes(q) ||
          t.numero_medidor?.toLowerCase().includes(q) ||
          t.direccion_referencia?.toLowerCase().includes(q) ||
          t.manzana?.barrio?.toLowerCase().includes(q)
      );

      return Boolean(matchTitular || matchIdentidad || matchTelefono || matchTomas);
    });
  }, [contribuyentesConTomas, terminoBusqueda, filtroBarrio, filtroAdeudo]);

  // Paginación de la tabla
  const totalPaginas = Math.max(1, Math.ceil(contribuyentesFiltrados.length / itemsPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const indiceInicio = (paginaSegura - 1) * itemsPorPagina;
  const indiceFin = Math.min(indiceInicio + itemsPorPagina, contribuyentesFiltrados.length);

  const contribuyentesPaginados = useMemo(() => {
    return contribuyentesFiltrados.slice(indiceInicio, indiceInicio + itemsPorPagina);
  }, [contribuyentesFiltrados, indiceInicio, itemsPorPagina]);

  // Volver a la tabla de contribuyentes
  const handleLimpiarSeleccion = () => {
    setContribuyenteSeleccionado(null);
    setConfigPorToma({});
    setEfectivoRecibido('');
    setReferenciaTransferencia('');
    setNotas('');
  };

  // Helpers de actualización por toma
  const toggleTomaSeleccionada = (tomaId: string) => {
    setConfigPorToma((prev) => {
      const actual = prev[tomaId] || { seleccionada: false, meses: 1, montoLibre: cuotaBase.toString() };
      return {
        ...prev,
        [tomaId]: { ...actual, seleccionada: !actual.seleccionada },
      };
    });
  };

  const cambiarMesesToma = (tomaId: string, meses: number) => {
    const clamped = Math.max(1, Math.min(24, meses));
    setConfigPorToma((prev) => {
      const actual = prev[tomaId] || { seleccionada: true, meses: 1, montoLibre: cuotaBase.toString() };
      return {
        ...prev,
        [tomaId]: { ...actual, meses: clamped },
      };
    });
  };

  const cambiarMontoLibreToma = (tomaId: string, montoLibre: string) => {
    setConfigPorToma((prev) => {
      const actual = prev[tomaId] || { seleccionada: true, meses: 1, montoLibre: cuotaBase.toString() };
      return {
        ...prev,
        [tomaId]: { ...actual, montoLibre },
      };
    });
  };

  const aplicarMesesATodasSeleccionadas = (meses: number) => {
    const clamped = Math.max(1, Math.min(24, meses));
    setConfigPorToma((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (next[id].seleccionada) {
          next[id] = { ...next[id], meses: clamped };
        }
      });
      return next;
    });
  };

  const seleccionarTomasModo = (modo: 'todas' | 'ninguna' | 'con_adeudo') => {
    if (!contribuyenteSeleccionado) return;
    setConfigPorToma((prev) => {
      const next = { ...prev };
      for (const t of contribuyenteSeleccionado.tomas) {
        const cur = next[t.id] || { seleccionada: false, meses: 1, montoLibre: cuotaBase.toString() };
        const sel =
          modo === 'todas'
            ? true
            : modo === 'ninguna'
              ? false
              : Number(t.saldo_pendiente || 0) > 0;
        next[t.id] = { ...cur, seleccionada: sel };
      }
      return next;
    });
  };

  const handleCambiarModoCobro = (nuevoModo: 'meses' | 'saldo' | 'personalizado') => {
    setModoCobro(nuevoModo);
    if (nuevoModo === 'saldo' && contribuyenteSeleccionado) {
      const tomasConAdeudo = contribuyenteSeleccionado.tomas.filter(
        (t) => Number(t.saldo_pendiente || 0) > 0
      );
      if (tomasConAdeudo.length > 0) {
        setConfigPorToma((prev) => {
          const next = { ...prev };
          for (const t of contribuyenteSeleccionado.tomas) {
            const cur = next[t.id] || { seleccionada: false, meses: 1, montoLibre: cuotaBase.toString() };
            next[t.id] = { ...cur, seleccionada: Number(t.saldo_pendiente || 0) > 0 };
          }
          return next;
        });
      }
    }
  };

  // Cálculo de totales a pagar considerando tomas seleccionadas y meses de cada una
  const calculos = useMemo(() => {
    const tomasLista = contribuyenteSeleccionado?.tomas || [];
    const desglose = tomasLista.map((t) => {
      const cfg = configPorToma[t.id] || {
        seleccionada: false,
        meses: 1,
        montoLibre: cuotaBase.toString(),
      };
      if (!cfg.seleccionada) {
        return { toma: t, seleccionada: false, meses: cfg.meses, subtotal: 0, recargos: 0, total: 0 };
      }

      let subtotalToma = 0;
      let recargosToma = 0;

      if (modoCobro === 'meses') {
        subtotalToma = cuotaBase * cfg.meses;
        if (aplicarRecargo && recargoMora > 0) {
          recargosToma = recargoMora * cfg.meses;
        }
      } else if (modoCobro === 'saldo') {
        subtotalToma = Math.max(0, Number(t.saldo_pendiente || 0));
      } else {
        subtotalToma = Math.max(0, Number.parseFloat(cfg.montoLibre) || 0);
      }

      return {
        toma: t,
        seleccionada: true,
        meses: cfg.meses,
        subtotal: subtotalToma,
        recargos: recargosToma,
        total: subtotalToma + recargosToma,
      };
    });

    const seleccionadas = desglose.filter((d) => d.seleccionada);
    const cobrables = seleccionadas.filter((d) => d.total > 0);
    const subtotal = cobrables.reduce((acc, d) => acc + d.subtotal, 0);
    const recargos = cobrables.reduce((acc, d) => acc + d.recargos, 0);
    const total = subtotal + recargos;
    const totalMeses =
      modoCobro === 'meses' ? cobrables.reduce((acc, d) => acc + d.meses, 0) : 0;

    const efectivoNum = Number.parseFloat(efectivoRecibido) || 0;
    const cambio = metodoPago === 'efectivo' && efectivoNum >= total ? efectivoNum - total : 0;

    // Detectar si todas las seleccionadas comparten el mismo número de meses
    const mesesUnicos = Array.from(new Set(seleccionadas.map((d) => d.meses)));
    const mesesComun = mesesUnicos.length === 1 ? mesesUnicos[0] : null;

    return {
      desglose,
      seleccionadas,
      cobrables,
      totalTomasSeleccionadas: seleccionadas.length,
      totalMeses,
      mesesComun,
      subtotal,
      recargos,
      total,
      efectivoNum,
      cambio,
      esEfectivoSuficiente: metodoPago !== 'efectivo' || efectivoNum >= total,
    };
  }, [
    contribuyenteSeleccionado,
    configPorToma,
    modoCobro,
    cuotaBase,
    aplicarRecargo,
    recargoMora,
    metodoPago,
    efectivoRecibido,
  ]);

  // Registrar cobro (soporta 1 o múltiples tomas en un mismo recibo)
  const handleCobrar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contribuyenteSeleccionado || calculos.totalTomasSeleccionadas === 0) {
      sileo.error({
        title: 'Selecciona al menos una toma',
        description: 'Marca las tomas que el contribuyente va a pagar.',
      });
      return;
    }

    if (calculos.cobrables.length === 0 || calculos.total <= 0) {
      sileo.error({
        title: 'Monto inválido',
        description: 'El total a cobrar debe ser mayor a cero en al menos una toma seleccionada.',
      });
      return;
    }

    const personaId =
      contribuyenteSeleccionado.persona?.id || calculos.cobrables[0].toma.persona_id;

    if (!personaId) {
      sileo.error({
        title: 'Toma sin titular asignado',
        description:
          'Asigna un contribuyente en el Padrón de Tomas antes de emitir el recibo.',
      });
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !navigator.onLine &&
      organizacion?.config?.permitir_cobro_offline === false
    ) {
      sileo.error({
        title: 'Se requiere internet',
        description: 'Conéctate a internet para emitir recibos.',
      });
      return;
    }

    if (metodoPago === 'efectivo' && !calculos.esEfectivoSuficiente) {
      sileo.error({
        title: 'Efectivo insuficiente',
        description: `El efectivo recibido ($${calculos.efectivoNum.toFixed(2)}) es menor al total a pagar ($${calculos.total.toFixed(2)}).`,
      });
      return;
    }

    try {
      setProcesando(true);
      const pagoId = crypto.randomUUID();
      const orgId = organizacion?.id || calculos.cobrables[0].toma.organizacion_id;
      const ahora = new Date();
      const anioActual = ahora.getFullYear();
      const mesActual = ahora.getMonth() + 1;
      const timestamp = ahora.toISOString();

      const detalles: PagoDetalle[] = [];

      for (const item of calculos.cobrables) {
        if (modoCobro === 'meses') {
          const recargoPorMes = aplicarRecargo ? recargoMora : 0;

          for (let i = 0; i < item.meses; i++) {
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
              toma_id: item.toma.id,
              anio: anioCalculado,
              mes: mesCalculado,
              monto: cuotaBase,
              recargo: recargoPorMes,
              created_at: timestamp,
              updated_at: timestamp,
              toma: item.toma,
            });
          }
        } else {
          detalles.push({
            id: crypto.randomUUID(),
            organizacion_id: orgId,
            pago_id: pagoId,
            toma_id: item.toma.id,
            anio: anioActual,
            mes: mesActual,
            monto: item.subtotal,
            recargo: item.recargos,
            created_at: timestamp,
            updated_at: timestamp,
            toma: item.toma,
          });
        }
      }

      let notasFinales = notas.trim();
      if (referenciaTransferencia.trim()) {
        notasFinales = `Ref: ${referenciaTransferencia.trim()}${
          notasFinales ? ` | ${notasFinales}` : ''
        }`;
      }

      const pagoObj: Pago = {
        id: pagoId,
        organizacion_id: orgId,
        folio: '',
        persona_id: personaId,
        cajero_id: cajeroId,
        total: calculos.total,
        metodo_pago: metodoPago,
        fecha_pago: timestamp,
        notas: notasFinales || undefined,
        created_at: timestamp,
        updated_at: timestamp,
        persona: contribuyenteSeleccionado.persona,
        cajero: cajeroNombre ? ({ nombre_completo: cajeroNombre } as any) : undefined,
        detalles,
      };

      const res = await registrarPagoLocal(pagoObj, detalles);
      pagoObj.folio = res.folio;

      sileo.success({
        title: res.guardadoEnNube ? '¡Cobro registrado!' : 'Cobro guardado sin internet',
        description: `Recibo ${res.folio} por $${calculos.total.toFixed(2)} MXN (${calculos.cobrables.length} ${
          calculos.cobrables.length === 1 ? 'toma' : 'tomas'
        }).`,
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
        description: obtenerMensajeError(err, 'No se pudo registrar el pago. Intenta de nuevo.'),
      });
    } finally {
      setProcesando(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     VISTA 2: VENTANILLA DE PAGO PARA EL CONTRIBUYENTE Y SUS TOMAS
  ───────────────────────────────────────────────────────────── */
  if (contribuyenteSeleccionado) {
    const totalTomasTitular = contribuyenteSeleccionado.tomas.length;
    const hayTomasConAdeudo = contribuyenteSeleccionado.adeudoTotal > 0;
    const multiplesTomas = totalTomasTitular > 1;

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
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {contribuyenteSeleccionado.persona?.nombre_completo || 'Toma sin titular asignado'}
                </h2>
                <StatusMark
                  mode="rail"
                  tone="brand"
                  icon={<Droplets className="w-3.5 h-3.5" />}
                >
                  {totalTomasTitular} {totalTomasTitular === 1 ? 'toma' : 'tomas'}
                </StatusMark>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {contribuyenteSeleccionado.ubicaciones.length > 0
                  ? contribuyenteSeleccionado.ubicaciones.join(' · ')
                  : 'Sin barrio asignado'}
                {contribuyenteSeleccionado.persona?.documento_identidad
                  ? ` • Doc: ${contribuyenteSeleccionado.persona.documento_identidad}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="text-xs self-start sm:self-auto shrink-0 flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">Adeudo total:</span>
            <span
              className={`font-black text-sm tabular-nums ${
                hayTomasConAdeudo
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              ${contribuyenteSeleccionado.adeudoTotal.toFixed(2)} MXN
            </span>
          </div>
        </div>

        {/* Formulario de Cobro */}
        <form onSubmit={handleCobrar} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Tomas del Titular, Meses y Notas (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Modalidad de Cobro */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Concepto y Tomas a Cobrar</span>
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Cuota base:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    ${cuotaBase.toFixed(2)}/mes
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCambiarModoCobro('meses')}
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
                  onClick={() => handleCambiarModoCobro('saldo')}
                  disabled={!hayTomasConAdeudo}
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
                  onClick={() => handleCambiarModoCobro('personalizado')}
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

              {/* Barra superior de control de tomas y atajos de meses */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    Pagando {calculos.totalTomasSeleccionadas} de {totalTomasTitular}{' '}
                    {totalTomasTitular === 1 ? 'toma' : 'tomas'}
                  </span>
                  {multiplesTomas && (
                    <div className="flex items-center gap-2.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => seleccionarTomasModo('todas')}
                        className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer"
                      >
                        Todas
                      </button>
                      {hayTomasConAdeudo && (
                        <button
                          type="button"
                          onClick={() => seleccionarTomasModo('con_adeudo')}
                          className="text-amber-600 dark:text-amber-400 hover:underline underline-offset-4 cursor-pointer"
                        >
                          Solo adeudo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => seleccionarTomasModo('ninguna')}
                        className="text-slate-500 dark:text-slate-400 hover:underline underline-offset-4 cursor-pointer"
                      >
                        Ninguna
                      </button>
                    </div>
                  )}
                </div>

                {modoCobro === 'meses' && calculos.totalTomasSeleccionadas > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-0.5">
                      {multiplesTomas ? 'Meses (todas):' : 'Atajos:'}
                    </span>
                    {[1, 2, 3, 6, 12].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => aplicarMesesATodasSeleccionadas(num)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                          calculos.mesesComun === num
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {num === 1 ? '1 mes' : `${num}m`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de tomas del contribuyente */}
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-b border-slate-200/80 dark:border-slate-800">
                {contribuyenteSeleccionado.tomas.map((t) => {
                  const cfg = configPorToma[t.id] || {
                    seleccionada: false,
                    meses: 1,
                    montoLibre: cuotaBase.toString(),
                  };
                  const adeudoToma = Number(t.saldo_pendiente || 0);
                  const subtotalToma = !cfg.seleccionada
                    ? 0
                    : modoCobro === 'meses'
                      ? (cuotaBase + (aplicarRecargo ? recargoMora : 0)) * cfg.meses
                      : modoCobro === 'saldo'
                        ? adeudoToma
                        : Math.max(0, Number.parseFloat(cfg.montoLibre) || 0);

                  return (
                    <div
                      key={t.id}
                      className={`py-3.5 px-2 transition-opacity flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        cfg.seleccionada ? 'opacity-100' : 'opacity-55'
                      }`}
                    >
                      {/* Checkbox + Info de la toma */}
                      <label
                        htmlFor={`toma-check-${t.id}`}
                        className="flex items-start gap-3 cursor-pointer flex-1 min-w-0"
                      >
                        <input
                          id={`toma-check-${t.id}`}
                          type="checkbox"
                          checked={cfg.seleccionada}
                          onChange={() => toggleTomaSeleccionada(t.id)}
                          className="mt-1 w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                              {t.codigo_toma}
                            </span>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t.tipo_toma}
                            </span>
                            {t.estado !== 'activa' && (
                              <StatusMark mode="inline" tone="rose" className="text-[11px]">
                                Toma {t.estado}
                              </StatusMark>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <span>
                              {t.manzana?.barrio ? `Barrio ${t.manzana.barrio}` : 'Sin barrio'}
                              {t.manzana?.numero_manzana ? ` — ${t.manzana.numero_manzana}` : ''}
                            </span>
                            {t.numero_medidor && (
                              <span className="inline-flex items-center gap-1">
                                <Gauge className="w-3 h-3" />
                                {t.numero_medidor}
                              </span>
                            )}
                            {adeudoToma > 0 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                Adeuda ${adeudoToma.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Al corriente
                              </span>
                            )}
                          </div>

                          {t.direccion_referencia && (
                            <p className="text-[11px] text-slate-400 truncate max-w-md">
                              {t.direccion_referencia}
                            </p>
                          )}
                        </div>
                      </label>

                      {/* Control por toma según modalidad */}
                      {cfg.seleccionada && (
                        <div className="flex items-center justify-between sm:justify-end gap-4 pl-7 sm:pl-0 shrink-0">
                          {modoCobro === 'meses' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`Restar un mes a ${t.codigo_toma}`}
                                onClick={() => cambiarMesesToma(t.id, cfg.meses - 1)}
                                className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-extrabold min-w-[52px] text-center tabular-nums text-slate-800 dark:text-slate-100">
                                {cfg.meses} {cfg.meses === 1 ? 'mes' : 'meses'}
                              </span>
                              <button
                                type="button"
                                aria-label={`Sumar un mes a ${t.codigo_toma}`}
                                onClick={() => cambiarMesesToma(t.id, cfg.meses + 1)}
                                className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {modoCobro === 'saldo' && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {adeudoToma > 0 ? 'Saldo total' : 'Sin adeudo'}
                            </span>
                          )}

                          {modoCobro === 'personalizado' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-400">$</span>
                              <input
                                type="number"
                                step="0.50"
                                min="0"
                                aria-label={`Abono para ${t.codigo_toma}`}
                                value={cfg.montoLibre}
                                onChange={(e) => cambiarMontoLibreToma(t.id, e.target.value)}
                                className="w-24 px-2.5 py-1 text-sm font-bold text-right rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                              />
                            </div>
                          )}

                          <span className="text-sm font-black text-slate-900 dark:text-white min-w-[74px] text-right tabular-nums">
                            ${subtotalToma.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {modoCobro === 'meses' && recargoMora > 0 && (
                <div className="pt-1">
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
                      Aplicar recargo por mora (+${recargoMora.toFixed(2)} por cada mes cobrado)
                    </span>
                  </label>
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
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Método de Pago y Total
                </h3>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  {calculos.cobrables.length} de {totalTomasTitular}{' '}
                  {totalTomasTitular === 1 ? 'toma' : 'tomas'}
                </span>
              </div>

              {/* Resumen por toma seleccionada */}
              {calculos.cobrables.length > 0 && (
                <div className="space-y-1.5 text-xs border-b border-dashed border-slate-200 dark:border-slate-800 pb-3">
                  {calculos.cobrables.map((item) => (
                    <div key={item.toma.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        <strong className="font-mono text-slate-800 dark:text-slate-100">
                          {item.toma.codigo_toma}
                        </strong>
                        {modoCobro === 'meses'
                          ? ` · ${item.meses} ${item.meses === 1 ? 'mes' : 'meses'}`
                          : modoCobro === 'saldo'
                            ? ' · Liquidación'
                            : ' · Abono'}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                        ${item.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

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
                      className={`text-lg font-black tabular-nums ${
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
                  <span>
                    Subtotal
                    {modoCobro === 'meses' && calculos.totalMeses > 0
                      ? ` (${calculos.totalMeses} ${calculos.totalMeses === 1 ? 'mes' : 'meses'} en total)`
                      : ''}
                    :
                  </span>
                  <span className="font-semibold tabular-nums">${calculos.subtotal.toFixed(2)}</span>
                </div>
                {calculos.recargos > 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-600 dark:text-amber-400">
                    <span>Recargo por mora:</span>
                    <span className="font-semibold tabular-nums">+${calculos.recargos.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/60 flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Total a Cobrar:
                  </span>
                  <span className="text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
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
                  disabled={calculos.cobrables.length === 0 || calculos.total <= 0}
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
     VISTA 1: BUSCADOR + TABLA DE CONTRIBUYENTES (CON SUS TOMAS AGRUPADAS)
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

      {/* 2. Tabla de Contribuyentes y Tomas por Cobrar */}
      {cargando && tomas.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm font-medium">Cargando padrón de cobros...</p>
        </div>
      ) : contribuyentesFiltrados.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <Droplets className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No se encontraron contribuyentes ni tomas para cobrar
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
                <TableHead>Tomas de Agua</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Saldo / Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {contribuyentesPaginados.map((grupo) => {
                const tomasCount = grupo.tomas.length;
                const tomasInactivas = grupo.tomas.filter((t) => t.estado !== 'activa');
                const primeraDireccion = grupo.tomas.find((t) => t.direccion_referencia)?.direccion_referencia;
                const medidores = grupo.tomas
                  .map((t) => t.numero_medidor)
                  .filter((m): m is string => Boolean(m));

                return (
                  <TableRow
                    key={grupo.key}
                    onClick={() => inicializarSeleccionContribuyente(grupo)}
                    className="!cursor-pointer"
                  >
                    {/* Titular */}
                    <TableCell>
                      <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {grupo.persona?.nombre_completo || (
                          <span className="text-amber-600 dark:text-amber-400 italic">
                            Sin titular asignado
                          </span>
                        )}
                      </div>
                      {(grupo.persona?.documento_identidad || grupo.persona?.telefono) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          {grupo.persona?.documento_identidad && (
                            <span>Doc: {grupo.persona.documento_identidad}</span>
                          )}
                          {grupo.persona?.telefono && (
                            <span>Tel: {grupo.persona.telefono}</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Tomas agrupadas */}
                    <TableCell>
                      <div className="space-y-1">
                        <StatusMark
                          mode="rail"
                          tone="brand"
                          icon={<Droplets className="w-3.5 h-3.5" />}
                        >
                          {tomasCount} {tomasCount === 1 ? 'toma' : 'tomas'}
                        </StatusMark>
                        <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-semibold">
                          {grupo.tomas.map((t) => t.codigo_toma).join(', ')}
                        </div>
                        {medidores.length > 0 && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                            <Gauge className="w-3 h-3 text-slate-400" />
                            <span>{medidores.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Ubicación */}
                    <TableCell>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>
                          {grupo.ubicaciones.length > 0
                            ? grupo.ubicaciones.slice(0, 2).join(', ')
                            : 'Sin barrio'}
                          {grupo.ubicaciones.length > 2
                            ? ` (+${grupo.ubicaciones.length - 2} más)`
                            : ''}
                        </span>
                      </div>
                      {primeraDireccion && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                          {primeraDireccion}
                        </p>
                      )}
                    </TableCell>

                    {/* Saldo / Estado */}
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {grupo.adeudoTotal > 0 ? (
                          <StatusMark mode="inline" tone="amber">
                            Adeuda ${grupo.adeudoTotal.toFixed(2)}
                          </StatusMark>
                        ) : (
                          <StatusMark mode="inline" tone="emerald">
                            Al corriente
                          </StatusMark>
                        )}
                        {tomasInactivas.length > 0 && (
                          <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">
                            {tomasInactivas.length === tomasCount && tomasCount === 1
                              ? `Toma ${tomasInactivas[0].estado}`
                              : `${tomasInactivas.length} ${
                                  tomasInactivas.length === 1 ? 'toma no activa' : 'tomas no activas'
                                }`}
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
                            inicializarSeleccionContribuyente(grupo);
                          }}
                          className="p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                          title="Cobrar y emitir recibo"
                          aria-label={`Cobrar a ${grupo.persona?.nombre_completo || 'contribuyente'}`}
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
                {contribuyentesFiltrados.length}
              </span>{' '}
              contribuyentes ({itemsPorPagina} por página)
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
