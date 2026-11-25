'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  Banknote,
  AlertTriangle,
  HeartHandshake,
  Receipt,
  Users,
  Droplets,
  Calendar,
  RefreshCw,
  Eye,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { dbLocal } from '@/lib/db/offline-db';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { Card, CardGroup } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { StatusMark } from '@/components/ui/StatusMark';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { ModalEstadoCuenta } from '@/components/cobros/ModalEstadoCuenta';
import { exportarAExcel, exportarMultiplesHojasAExcel } from '@/lib/utils/export-excel';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Toma, Persona, Pago, Manzana, PagoDetalle } from '@/types/database';
import type { Cooperacion } from '@/types/cooperaciones';

type RangoPredefinido = 'hoy' | 'semana' | 'mes' | 'anio' | 'todo' | 'personalizado';
type TomaReporte = Toma & { persona?: Persona; manzana?: Partial<Manzana> };

export function ReportesManager() {
  const [tabActiva, setTabActiva] = useState<'ingresos' | 'deudores' | 'obras'>('ingresos');
  const [cargando, setCargando] = useState(true);

  const [tomas, setTomas] = useState<TomaReporte[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cooperaciones, setCooperaciones] = useState<Cooperacion[]>([]);
  const [recaudadoPorCoop, setRecaudadoPorCoop] = useState<Record<string, number>>({});

  // Filtros Pestaña 1: Ingresos
  const [rangoIngresos, setRangoIngresos] = useState<RangoPredefinido>('mes');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [busquedaIngresos, setBusquedaIngresos] = useState('');

  // Filtros Pestaña 2: Deudores
  const [busquedaDeudores, setBusquedaDeudores] = useState('');
  const [filtroBarrioDeudores, setFiltroBarrioDeudores] = useState('todos');

  // Modal Estado de Cuenta
  const [personaEstadoCuenta, setPersonaEstadoCuenta] = useState<{
    id: string;
    nombre: string;
    documento?: string;
    telefono?: string;
    tomas: Toma[];
  } | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);

      const [dataTomas, dataPagos, resCoops, resPadronCoop] = await Promise.all([
        fetchAllRows<TomaReporte>((from, to) =>
          supabase
            .from('tomas')
            .select(`
              *,
              persona:personas(*),
              manzana:manzanas(id, barrio, seccion, numero_manzana)
            `)
            .is('deleted_at', null)
            .order('codigo_toma', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<Pago>((from, to) =>
          supabase
            .from('pagos')
            .select(`
              *,
              persona:personas(*),
              cajero:perfiles!cajero_id(id, nombre_completo),
              detalles:pago_detalles(
                id,
                toma_id,
                anio,
                mes,
                monto,
                recargo,
                toma:tomas(codigo_toma, tipo_toma)
              )
            `)
            .order('fecha_pago', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
        ),
        supabase
          .from('cooperaciones')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('cooperacion_padron')
          .select('cooperacion_id, monto_pagado'),
      ]);

      setTomas(dataTomas || []);
      setPagos((dataPagos || []) as unknown as Pago[]);
      setCooperaciones((resCoops.data || []) as unknown as Cooperacion[]);

      const mapaRecaudado: Record<string, number> = {};
      for (const row of resPadronCoop.data || []) {
        const cid = row.cooperacion_id;
        mapaRecaudado[cid] = (mapaRecaudado[cid] || 0) + Number(row.monto_pagado || 0);
      }
      setRecaudadoPorCoop(mapaRecaudado);
    } catch (err: unknown) {
      // Fallback a Dexie si está sin conexión
      try {
        const [tomasLocal, personasLocal, manzanasLocal, pagosLocal, detallesLocal] =
          await Promise.all([
            dbLocal.tomas.toArray(),
            dbLocal.personas.toArray(),
            dbLocal.manzanas.toArray(),
            dbLocal.pagos.toArray(),
            dbLocal.pago_detalles.toArray(),
          ]);

        const mapaPersonas = new Map(personasLocal.map((p) => [p.id, p]));
        const mapaManzanas = new Map(manzanasLocal.map((m) => [m.id, m]));
        const mapaTomas = new Map(tomasLocal.map((t) => [t.id, t]));
        const detallesPorPago = new Map<string, PagoDetalle[]>();
        detallesLocal.forEach((d) => {
          const arr = detallesPorPago.get(d.pago_id) || [];
          arr.push({ ...d, toma: mapaTomas.get(d.toma_id) });
          detallesPorPago.set(d.pago_id, arr);
        });

        setTomas(
          tomasLocal.map((t) => ({
            ...t,
            persona: mapaPersonas.get(t.persona_id),
            manzana: t.manzana_id ? mapaManzanas.get(t.manzana_id) : undefined,
          }))
        );
        setPagos(
          pagosLocal.map((p) => ({
            ...p,
            persona: p.persona || mapaPersonas.get(p.persona_id),
            detalles: p.detalles || detallesPorPago.get(p.id) || [],
          }))
        );
      } catch {
        sileo.error({
          title: 'Error al cargar reportes',
          description: obtenerMensajeError(err, 'No se pudieron obtener los datos financieros.'),
        });
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void cargarDatos();
    });
    return () => {
      cancelled = true;
    };
  }, [cargarDatos]);

  // Barrios disponibles
  const barriosDisponibles = useMemo(() => {
    const setB = new Set<string>();
    for (const t of tomas) {
      if (t.manzana?.barrio) setB.add(t.manzana.barrio);
    }
    return Array.from(setB).sort((a, b) => a.localeCompare(b, 'es'));
  }, [tomas]);

  // 1. Filtrado de Pagos por Periodo e Ingresos
  const pagosPeriodo = useMemo(() => {
    const ahora = new Date();
    const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
    const semanaInicio = hoyInicio - 6 * 24 * 60 * 60 * 1000;
    const mesInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
    const anioInicio = new Date(ahora.getFullYear(), 0, 1).getTime();

    const desdeMs = fechaDesde ? new Date(`${fechaDesde}T00:00:00`).getTime() : null;
    const hastaMs = fechaHasta ? new Date(`${fechaHasta}T23:59:59`).getTime() : null;
    const q = busquedaIngresos.trim().toLowerCase();

    return pagos.filter((p) => {
      const ts = new Date(p.fecha_pago || p.created_at).getTime();

      if (rangoIngresos === 'hoy' && ts < hoyInicio) return false;
      if (rangoIngresos === 'semana' && ts < semanaInicio) return false;
      if (rangoIngresos === 'mes' && ts < mesInicio) return false;
      if (rangoIngresos === 'anio' && ts < anioInicio) return false;
      if (rangoIngresos === 'personalizado') {
        if (desdeMs !== null && ts < desdeMs) return false;
        if (hastaMs !== null && ts > hastaMs) return false;
      }

      if (filtroMetodo !== 'todos' && p.metodo_pago !== filtroMetodo) return false;

      if (!q) return true;
      const matchFolio = p.folio?.toLowerCase().includes(q);
      const matchPersona = p.persona?.nombre_completo?.toLowerCase().includes(q);
      const matchCajero = p.cajero?.nombre_completo?.toLowerCase().includes(q);
      const matchToma = (p.detalles || []).some((d) =>
        d.toma?.codigo_toma?.toLowerCase().includes(q)
      );
      return Boolean(matchFolio || matchPersona || matchCajero || matchToma);
    });
  }, [pagos, rangoIngresos, fechaDesde, fechaHasta, filtroMetodo, busquedaIngresos]);

  const metricasIngresos = useMemo(() => {
    let totalVigente = 0;
    let efectivo = 0;
    let transferenciaTarjeta = 0;
    let vigentesCount = 0;
    let anuladosCount = 0;

    const porCajero = new Map<
      string,
      { nombre: string; recibos: number; total: number }
    >();

    for (const p of pagosPeriodo) {
      if (p.estado === 'anulado') {
        anuladosCount++;
        continue;
      }
      const monto = Number(p.total || 0);
      totalVigente += monto;
      vigentesCount++;

      if (p.metodo_pago === 'efectivo') efectivo += monto;
      else transferenciaTarjeta += monto;

      const cajeroKey = p.cajero_id || 'caja-general';
      const cajeroNombre = p.cajero?.nombre_completo || 'Caja General';
      const actual = porCajero.get(cajeroKey) || {
        nombre: cajeroNombre,
        recibos: 0,
        total: 0,
      };
      actual.recibos += 1;
      actual.total += monto;
      porCajero.set(cajeroKey, actual);
    }

    return {
      totalVigente,
      efectivo,
      transferenciaTarjeta,
      vigentesCount,
      anuladosCount,
      resumenCajeros: Array.from(porCajero.values()).sort((a, b) => b.total - a.total),
    };
  }, [pagosPeriodo]);

  // 2. Agrupación de Deudores / Morosidad
  const deudoresAgrupados = useMemo(() => {
    const mapa = new Map<
      string,
      {
        key: string;
        persona?: Persona;
        tomasConDeuda: TomaReporte[];
        todasLasTomas: Toma[];
        adeudoTotal: number;
        barrios: string[];
      }
    >();

    for (const t of tomas) {
      const key = t.persona_id || `sin-titular-${t.id}`;
      const existente = mapa.get(key) || {
        key,
        persona: t.persona,
        tomasConDeuda: [],
        todasLasTomas: [],
        adeudoTotal: 0,
        barrios: [],
      };
      existente.todasLasTomas.push(t);
      const saldo = Number(t.saldo_pendiente || 0);
      if (saldo > 0) {
        existente.tomasConDeuda.push(t);
        existente.adeudoTotal += saldo;
      }
      if (t.manzana?.barrio && !existente.barrios.includes(t.manzana.barrio)) {
        existente.barrios.push(t.manzana.barrio);
      }
      mapa.set(key, existente);
    }

    const q = busquedaDeudores.trim().toLowerCase();

    return Array.from(mapa.values())
      .filter((item) => {
        if (item.adeudoTotal <= 0) return false;
        if (
          filtroBarrioDeudores !== 'todos' &&
          !item.barrios.some((b) => b.toLowerCase() === filtroBarrioDeudores.toLowerCase())
        ) {
          return false;
        }
        if (!q) return true;
        const matchNombre = item.persona?.nombre_completo?.toLowerCase().includes(q);
        const matchDoc = item.persona?.documento_identidad?.toLowerCase().includes(q);
        const matchToma = item.tomasConDeuda.some((t) =>
          t.codigo_toma?.toLowerCase().includes(q)
        );
        return Boolean(matchNombre || matchDoc || matchToma);
      })
      .sort((a, b) => b.adeudoTotal - a.adeudoTotal);
  }, [tomas, busquedaDeudores, filtroBarrioDeudores]);

  const metricasDeudores = useMemo(() => {
    const deudaTotal = deudoresAgrupados.reduce((acc, d) => acc + d.adeudoTotal, 0);
    const tomasMorosas = deudoresAgrupados.reduce(
      (acc, d) => acc + d.tomasConDeuda.length,
      0
    );
    return {
      deudaTotal,
      contribuyentesMorosos: deudoresAgrupados.length,
      tomasMorosas,
    };
  }, [deudoresAgrupados]);

  // Exportaciones a Excel
  const handleExportarIngresosExcel = () => {
    const filasRecibos = pagosPeriodo.map((p) => {
      const codigos = Array.from(
        new Set(
          (p.detalles || [])
            .map((d) => d.toma?.codigo_toma)
            .filter((c): c is string => Boolean(c))
        )
      ).join(', ');
      return {
        Folio: p.folio,
        Fecha: new Date(p.fecha_pago || p.created_at).toLocaleString('es-MX'),
        Contribuyente: p.persona?.nombre_completo || 'Titular de padrón',
        Tomas: codigos || '—',
        'Método de Pago': p.metodo_pago,
        Estado: p.estado === 'anulado' ? 'Anulado' : 'Vigente',
        'Monto ($ MXN)': Number(p.total || 0),
        Cajero: p.cajero?.nombre_completo || 'Caja General',
        Notas: p.notas || '',
      };
    });

    const filasCajeros = metricasIngresos.resumenCajeros.map((c) => ({
      'Cajero / Operador': c.nombre,
      'Recibos Vigentes': c.recibos,
      'Total Recaudado ($ MXN)': Number(c.total.toFixed(2)),
    }));

    exportarMultiplesHojasAExcel(
      [
        {
          nombre: 'Recibos del Periodo',
          filas:
            filasRecibos.length > 0
              ? filasRecibos
              : [{ Mensaje: 'Sin recibos en el periodo seleccionado' }],
        },
        {
          nombre: 'Corte por Cajero',
          filas:
            filasCajeros.length > 0
              ? filasCajeros
              : [{ Mensaje: 'Sin cobros vigentes en el periodo seleccionado' }],
        },
      ],
      `reporte_ingresos_${rangoIngresos}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    sileo.success({
      title: 'Reporte de ingresos exportado',
      description: 'Se descargó el archivo Excel con los recibos y el corte por cajero.',
    });
  };

  const handleExportarDeudoresExcel = () => {
    const filas = deudoresAgrupados.map((d) => ({
      Contribuyente: d.persona?.nombre_completo || 'Sin titular asignado',
      Documento: d.persona?.documento_identidad || '—',
      Teléfono: d.persona?.telefono || '—',
      'Cantidad Tomas con Adeudo': d.tomasConDeuda.length,
      'Códigos de Toma': d.tomasConDeuda.map((t) => t.codigo_toma).join(', '),
      'Barrio(s)': d.barrios.join(', ') || 'Sin barrio',
      Dirección:
        d.tomasConDeuda.find((t) => t.direccion_referencia)?.direccion_referencia || '—',
      'Adeudo Total ($ MXN)': Number(d.adeudoTotal.toFixed(2)),
    }));

    exportarAExcel(
      filas.length > 0 ? filas : [{ Mensaje: 'No hay contribuyentes con adeudo pendiente' }],
      'Padrón de Deudores',
      `padron_deudores_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    sileo.success({
      title: 'Padrón de deudores exportado',
      description: 'Se descargó la lista de morosidad en formato Excel.',
    });
  };

  const handleExportarObrasExcel = () => {
    const filas = cooperaciones.map((c) => {
      const meta = Number(c.meta_financiera || 0);
      const recaudado = Number(recaudadoPorCoop[c.id] || 0);
      const pendiente = Math.max(0, meta - recaudado);
      const avance = meta > 0 ? Math.min(100, Math.round((recaudado / meta) * 100)) : 0;
      return {
        'Obra / Campaña': c.nombre,
        Descripción: c.descripcion || '—',
        Modalidad: `Por ${c.tipo_sujeto}`,
        'Cuota Requerida ($)': Number(c.cuota_requerida || 0),
        'Meta Financiera ($)': meta,
        'Total Recaudado ($)': recaudado,
        'Faltante ($)': pendiente,
        'Avance (%)': `${avance}%`,
        Estado: c.estado,
        'Fecha Límite': c.fecha_prorroga || c.fecha_limite,
      };
    });

    exportarAExcel(
      filas.length > 0 ? filas : [{ Mensaje: 'No hay campañas de cooperación registradas' }],
      'Cooperaciones y Obras',
      `reporte_cooperaciones_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    sileo.success({
      title: 'Reporte de obras exportado',
      description: 'Se descargó el resumen financiero de cooperaciones en Excel.',
    });
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        icon={<BarChart3 />}
        tone="blue"
        title="Reportes, Ingresos y Morosidad"
        subtitle="Consulta financiera por periodo, padrón de deudores para asamblea y exportación contable a Excel."
        action={
          <>
            <PageTabs
              value={tabActiva}
              onChange={(v) => setTabActiva(v as 'ingresos' | 'deudores' | 'obras')}
              items={[
                { value: 'ingresos', label: 'Ingresos por Periodo', icon: <Banknote /> },
                { value: 'deudores', label: 'Padrón de Deudores', icon: <AlertTriangle /> },
                { value: 'obras', label: 'Cooperaciones y Obras', icon: <HeartHandshake /> },
              ]}
            />
            {tabActiva === 'obras' && (
              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                onClick={handleExportarObrasExcel}
              >
                Exportar Excel
              </Button>
            )}
          </>
        }
      />

      {/* PESTAÑA 1: INGRESOS POR PERIODO */}
      {tabActiva === 'ingresos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <CardGroup>
            <Card
              tone="blue"
              icon={<Banknote />}
              label="Total Recaudado"
              value={`$${metricasIngresos.totalVigente.toLocaleString('es-MX', {
                minimumFractionDigits: 2,
              })}`}
              unit="MXN"
              hint={`${metricasIngresos.vigentesCount} recibos vigentes`}
            />
            <Card
              tone="green"
              icon={<Receipt />}
              label="Cobrado en Efectivo"
              value={`$${metricasIngresos.efectivo.toLocaleString('es-MX', {
                minimumFractionDigits: 2,
              })}`}
              unit="MXN"
              hint="En ventanilla / caja"
            />
            <Card
              tone="cyan"
              icon={<Calendar />}
              label="Transf. y Tarjeta"
              value={`$${metricasIngresos.transferenciaTarjeta.toLocaleString('es-MX', {
                minimumFractionDigits: 2,
              })}`}
              unit="MXN"
              hint="Medios electrónicos"
            />
            <Card
              tone="amber"
              icon={<Ban />}
              label="Recibos Anulados"
              value={metricasIngresos.anuladosCount}
              hint="No suman a recaudación"
            />
          </CardGroup>

          {/* Selector de rango de fechas + barra de búsqueda */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-dashed border-slate-300 dark:border-[#26345C]">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: 'Últimos 7 días' },
                { id: 'mes', label: 'Este mes' },
                { id: 'anio', label: 'Este año' },
                { id: 'todo', label: 'Todo el historial' },
                { id: 'personalizado', label: 'Por fechas' },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setRangoIngresos(op.id as RangoPredefinido)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    rangoIngresos === op.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {rangoIngresos === 'personalizado' && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>Desde:</span>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span>Hasta:</span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </label>
              </div>
            )}
          </div>

          <FilterBar
            searchValue={busquedaIngresos}
            onSearchChange={setBusquedaIngresos}
            searchPlaceholder="Buscar por folio, contribuyente, código de toma o cajero..."
            onRefresh={cargarDatos}
            isRefreshing={cargando}
            action={
              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                onClick={handleExportarIngresosExcel}
              >
                Exportar Excel
              </Button>
            }
          >
            <FilterSelect
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
            >
              <option value="todos">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </FilterSelect>
          </FilterBar>

          {/* Resumen por Cajero */}
          {metricasIngresos.resumenCajeros.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recaudación por Cajero / Operador en el Periodo
              </h3>
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Cajero / Operador</TableHead>
                    <TableHead className="text-center">Recibos Emitidos</TableHead>
                    <TableHead className="text-right">Total Recaudado</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {metricasIngresos.resumenCajeros.map((c, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-bold text-slate-900 dark:text-white">
                        {c.nombre}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {c.recibos}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${c.total.toFixed(2)} MXN
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Lista de recibos del periodo */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Detalle de Recibos ({pagosPeriodo.length})
            </h3>
            {cargando ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                <p className="text-xs">Cargando recibos...</p>
              </div>
            ) : pagosPeriodo.length === 0 ? (
              <div className="p-12 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-sm font-semibold">
                  No se encontraron recibos en el periodo seleccionado.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Folio</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Contribuyente / Tomas</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Cajero</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {pagosPeriodo.slice(0, 100).map((p) => {
                    const esAnulado = p.estado === 'anulado';
                    const codigos = Array.from(
                      new Set(
                        (p.detalles || [])
                          .map((d) => d.toma?.codigo_toma)
                          .filter((c): c is string => Boolean(c))
                      )
                    ).join(', ');

                    return (
                      <TableRow key={p.id} className={esAnulado ? 'opacity-60' : ''}>
                        <TableCell className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          {p.folio}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(p.fecha_pago || p.created_at).toLocaleString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-white text-xs">
                            {p.persona?.nombre_completo || 'Titular de padrón'}
                          </div>
                          {codigos && (
                            <div className="text-[11px] font-mono text-slate-400">
                              {codigos}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="capitalize text-xs">
                          {p.metodo_pago}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                          {p.cajero?.nombre_completo || 'Caja'}
                        </TableCell>
                        <TableCell>
                          {esAnulado ? (
                            <StatusMark
                              mode="inline"
                              tone="rose"
                              icon={<Ban className="w-3 h-3" />}
                            >
                              Anulado
                            </StatusMark>
                          ) : (
                            <StatusMark
                              mode="inline"
                              tone="emerald"
                              icon={<CheckCircle2 className="w-3 h-3" />}
                            >
                              Vigente
                            </StatusMark>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">
                          ${Number(p.total || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: PADRÓN DE DEUDORES / MOROSIDAD */}
      {tabActiva === 'deudores' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <CardGroup>
            <Card
              tone="amber"
              icon={<AlertTriangle />}
              label="Cartera Vencida Total"
              value={`$${metricasDeudores.deudaTotal.toLocaleString('es-MX', {
                minimumFractionDigits: 2,
              })}`}
              unit="MXN"
              hint="Saldo pendiente acumulado"
            />
            <Card
              tone="blue"
              icon={<Users />}
              label="Contribuyentes con Adeudo"
              value={metricasDeudores.contribuyentesMorosos}
              hint="Titulares con saldo > $0"
            />
            <Card
              tone="cyan"
              icon={<Droplets />}
              label="Tomas con Adeudo"
              value={metricasDeudores.tomasMorosas}
              hint="Conexiones con rezago"
            />
            <Card
              tone="purple"
              icon={<Banknote />}
              label="Promedio por Deudor"
              value={`$${(
                metricasDeudores.contribuyentesMorosos > 0
                  ? metricasDeudores.deudaTotal / metricasDeudores.contribuyentesMorosos
                  : 0
              ).toFixed(0)}`}
              unit="MXN"
              hint="Deuda media por titular"
            />
          </CardGroup>

          <FilterBar
            searchValue={busquedaDeudores}
            onSearchChange={setBusquedaDeudores}
            searchPlaceholder="Buscar deudor por nombre, INE o código de toma..."
            onRefresh={cargarDatos}
            isRefreshing={cargando}
            action={
              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                onClick={handleExportarDeudoresExcel}
              >
                Exportar Excel
              </Button>
            }
          >
            <FilterSelect
              value={filtroBarrioDeudores}
              onChange={(e) => setFiltroBarrioDeudores(e.target.value)}
            >
              <option value="todos">Todos los barrios</option>
              {barriosDisponibles.map((b) => (
                <option key={b} value={b}>
                  Barrio {b}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>

          {deudoresAgrupados.length === 0 ? (
            <div className="p-12 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-sm font-semibold">
                No hay contribuyentes con adeudo pendiente para este filtro.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Contribuyente / Titular</TableHead>
                  <TableHead>Tomas con Adeudo</TableHead>
                  <TableHead>Barrio / Ubicación</TableHead>
                  <TableHead className="text-right">Adeudo Total</TableHead>
                  <TableHead className="text-right">Estado de Cuenta</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {deudoresAgrupados.map((d) => (
                  <TableRow key={d.key}>
                    <TableCell>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {d.persona?.nombre_completo || 'Sin titular asignado'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {d.persona?.telefono ? `Tel: ${d.persona.telefono}` : 'Sin teléfono'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        {d.tomasConDeuda.map((t) => t.codigo_toma).join(', ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                      {d.barrios.length > 0 ? `Barrio ${d.barrios.join(', ')}` : 'Sin barrio'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-black text-amber-600 dark:text-amber-400">
                      ${d.adeudoTotal.toFixed(2)} MXN
                    </TableCell>
                    <TableCell className="text-right">
                      {d.persona?.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setPersonaEstadoCuenta({
                              id: d.persona!.id,
                              nombre: d.persona!.nombre_completo,
                              documento: d.persona!.documento_identidad,
                              telefono: d.persona!.telefono,
                              tomas: d.todasLasTomas,
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver historial</span>
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* PESTAÑA 3: COOPERACIONES Y OBRAS */}
      {tabActiva === 'obras' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {cooperaciones.length === 0 ? (
            <div className="p-12 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-sm font-semibold">
                No hay campañas de cooperación registradas.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Obra / Campaña</TableHead>
                  <TableHead>Modalidad / Cuota</TableHead>
                  <TableHead className="text-right">Meta Financiera</TableHead>
                  <TableHead className="text-right">Recaudado</TableHead>
                  <TableHead className="text-center">Avance</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {cooperaciones.map((c) => {
                  const meta = Number(c.meta_financiera || 0);
                  const recaudado = Number(recaudadoPorCoop[c.id] || 0);
                  const pct = meta > 0 ? Math.min(100, Math.round((recaudado / meta) * 100)) : 0;

                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {c.nombre}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {c.descripcion || 'Sin descripción'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                        ${Number(c.cuota_requerida || 0).toFixed(2)} por {c.tipo_sujeto}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${meta.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${recaudado.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold">
                        {pct}%
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusMark
                          mode="inline"
                          tone={
                            c.estado === 'concluida'
                              ? 'brand'
                              : c.estado === 'prorrogada'
                                ? 'amber'
                                : 'emerald'
                          }
                        >
                          {c.estado}
                        </StatusMark>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {personaEstadoCuenta && (
        <ModalEstadoCuenta
          personaId={personaEstadoCuenta.id}
          personaNombre={personaEstadoCuenta.nombre}
          personaDocumento={personaEstadoCuenta.documento}
          personaTelefono={personaEstadoCuenta.telefono}
          tomasIniciales={personaEstadoCuenta.tomas}
          onClose={() => setPersonaEstadoCuenta(null)}
        />
      )}
    </div>
  );
}

