'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Droplets,
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Wallet,
  CheckCircle2,
  Receipt,
  PieChart as PieIcon,
  BarChart3,
  SlidersHorizontal,
  RefreshCw,
  Building2,
  Home,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardGroup } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Toma, Persona, Pago, Organizacion, Perfil } from '@/types/database';

export interface DashboardOverviewProps {
  tomas: Toma[];
  totalTomasCount: number;
  totalPersonasCount: number;
  totalUsuariosCount: number;
  pagos: Pago[];
  organizacion: Organizacion | null;
  perfil: Perfil | null;
  esAdmin: boolean;
}

const METODO_COLORS: Record<string, string> = {
  efectivo: '#0284C7', // Azul cian
  transferencia: '#10B981', // Esmeralda
  tarjeta: '#8B5CF6', // Púrpura
  otro: '#F59E0B', // Ámbar
};

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta bancaria',
  otro: 'Otro método',
};

export function DashboardOverview({
  tomas,
  totalTomasCount,
  totalPersonasCount,
  totalUsuariosCount,
  pagos,
  organizacion,
  perfil,
  esAdmin,
}: DashboardOverviewProps) {
  const [mounted, setMounted] = useState(false);
  const [periodoVista, setPeriodoVista] = useState<'6m' | 'anio'>('6m');

  useEffect(() => {
    setMounted(true);
  }, []);

  const moneda = organizacion?.config?.moneda || 'MXN';
  const cuotaBaseVigente = Number(organizacion?.config?.cuota_base || 50);

  // Filtrar únicamente pagos vigentes (no anulados) para métricas y gráficas financieras
  const pagosVigentes = useMemo(
    () => pagos.filter((p) => p.estado !== 'anulado'),
    [pagos]
  );

  // 1. Estadísticas de recaudación
  const statsRecaudacion = useMemo(() => {
    const ahora = new Date();
    const anioActual = ahora.getFullYear();
    const mesActual = ahora.getMonth(); // 0-11

    let recaudadoMesActual = 0;
    let recaudadoAnioActual = 0;
    let recaudadoHistorico = 0;
    let pagosMesActualCount = 0;

    pagosVigentes.forEach((p) => {
      const monto = Number(p.total || 0);
      recaudadoHistorico += monto;

      const f = new Date(p.fecha_pago || p.created_at);
      if (f.getFullYear() === anioActual) {
        recaudadoAnioActual += monto;
        if (f.getMonth() === mesActual) {
          recaudadoMesActual += monto;
          pagosMesActualCount += 1;
        }
      }
    });

    return {
      recaudadoMesActual,
      recaudadoAnioActual,
      recaudadoHistorico,
      pagosMesActualCount,
    };
  }, [pagosVigentes]);

  // 2. Estadísticas del Padrón de Tomas
  const statsTomas = useMemo(() => {
    let activas = 0;
    let suspendidas = 0;
    let cortadas = 0;
    let inactivas = 0;
    let conSaldoPendiente = 0;
    let totalDeuda = 0;

    const porTipo: Record<string, number> = {
      domestica: 0,
      comercial: 0,
      comunal: 0,
      lote_baldio: 0,
    };

    tomas.forEach((t) => {
      if (t.estado === 'activa') activas++;
      else if (t.estado === 'suspendida') suspendidas++;
      else if (t.estado === 'cortada') cortadas++;
      else inactivas++;

      if (porTipo[t.tipo_toma] !== undefined) {
        porTipo[t.tipo_toma]++;
      }

      const saldo = Number(t.saldo_pendiente || 0);
      if (saldo > 0) {
        conSaldoPendiente++;
        totalDeuda += saldo;
      }
    });

    const totalCalculado = tomas.length || totalTomasCount || 1;
    const porcentajeAlCorriente = Math.round(((totalCalculado - conSaldoPendiente) / totalCalculado) * 100);

    return {
      activas,
      suspendidas,
      cortadas,
      inactivas,
      conSaldoPendiente,
      totalDeuda,
      porTipo,
      porcentajeAlCorriente: Math.max(0, Math.min(100, porcentajeAlCorriente)),
    };
  }, [tomas, totalTomasCount]);

  // 3. Datos para la Gráfica de Tendencia de Ingresos Mensuales
  const datosGraficaIngresos = useMemo(() => {
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const ahora = new Date();
    const resultado: {
      key: string;
      mes: string;
      anio: number;
      total: number;
      cuotas: number;
      mora: number;
      recibos: number;
    }[] = [];

    const cantidadMeses = periodoVista === '6m' ? 6 : 12;

    for (let i = cantidadMeses - 1; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      resultado.push({
        key,
        mes: `${mesesNombres[m]} ${y !== ahora.getFullYear() ? `'${String(y).slice(-2)}` : ''}`,
        anio: y,
        total: 0,
        cuotas: 0,
        mora: 0,
        recibos: 0,
      });
    }

    pagosVigentes.forEach((p) => {
      const f = new Date(p.fecha_pago || p.created_at);
      const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
      const item = resultado.find((r) => r.key === key);
      if (item) {
        const totalPago = Number(p.total || 0);
        item.total += totalPago;
        item.recibos += 1;

        // Desglose cuotas vs mora si existen detalles
        if (p.detalles && Array.isArray(p.detalles)) {
          let recargoTotal = 0;
          p.detalles.forEach((d) => {
            recargoTotal += Number(d.recargo || 0);
          });
          item.mora += recargoTotal;
          item.cuotas += Math.max(0, totalPago - recargoTotal);
        } else {
          item.cuotas += totalPago;
        }
      }
    });

    return resultado;
  }, [pagosVigentes, periodoVista]);

  // 4. Datos para la Gráfica de Métodos de Pago
  const datosMetodosPago = useMemo(() => {
    const metodos: Record<string, { total: number; count: number }> = {
      efectivo: { total: 0, count: 0 },
      transferencia: { total: 0, count: 0 },
      tarjeta: { total: 0, count: 0 },
      otro: { total: 0, count: 0 },
    };

    pagosVigentes.forEach((p) => {
      const m = p.metodo_pago || 'efectivo';
      const monto = Number(p.total || 0);
      if (!metodos[m]) {
        metodos[m] = { total: 0, count: 0 };
      }
      metodos[m].total += monto;
      metodos[m].count += 1;
    });

    const sumaTotal = Object.values(metodos).reduce((acc, curr) => acc + curr.total, 0) || 1;

    return Object.entries(metodos)
      .map(([key, val]) => ({
        name: METODO_LABELS[key] || key,
        rawKey: key,
        value: val.total,
        count: val.count,
        porcentaje: Math.round((val.total / sumaTotal) * 100),
        color: METODO_COLORS[key] || '#94A3B8',
      }))
      .filter((item) => item.value > 0 || item.count > 0);
  }, [pagosVigentes]);

  // 5. Tomas con mayor deuda (Top Cartera Vencida)
  const tomasConAdeudo = useMemo(() => {
    return tomas
      .filter((t) => Number(t.saldo_pendiente || 0) > 0)
      .sort((a, b) => Number(b.saldo_pendiente || 0) - Number(a.saldo_pendiente || 0))
      .slice(0, 5);
  }, [tomas]);

  // 6. Últimos Pagos Registrados
  const ultimosPagos = useMemo(() => {
    return pagosVigentes.slice(0, 6);
  }, [pagosVigentes]);

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      {/* 1. Cabecera Principal con Accesos Rápidos */}
      <PageHeader
        icon={<Droplets />}
        tone="blue"
        title="Panel General de Control"
        subtitle={
          <>
            Bienvenido al centro de administración de{' '}
            <strong className="text-slate-900 dark:text-white">
              {organizacion?.nombre || 'Comité de Agua Potable'}
            </strong>
            . Monitorea la recaudación en tiempo real, el estado del padrón y la solvencia del comité.
          </>
        }
        status="Sistema Comunitario Activo"
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/cobros">
              <Button variant="primary" size="md" icon={<CreditCard className="w-4 h-4" />}>
                Ventanilla de Cobro
              </Button>
            </Link>
            <Link href="/tomas">
              <Button variant="outline" size="md" icon={<Droplets className="w-4 h-4" />}>
                Padrón de Tomas
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. Círculos Radiales de Alto Nivel (CardGroup con escala adaptativa) */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Wallet />}
          label="Recaudación del Mes"
          value={`$${statsRecaudacion.recaudadoMesActual.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}
          unit={moneda}
          hint={`${statsRecaudacion.pagosMesActualCount} recibos emitidos`}
        />
        <Card
          tone="cyan"
          icon={<Droplets />}
          label="Padrón de Tomas"
          value={totalTomasCount || tomas.length}
          hint={`${statsTomas.activas} tomas con servicio activo`}
        />
        <Card
          tone="purple"
          icon={<Users />}
          label="Contribuyentes"
          value={totalPersonasCount}
          hint="Titulares de toma registrados"
        />
        <Card
          tone={statsTomas.porcentajeAlCorriente >= 80 ? 'green' : statsTomas.porcentajeAlCorriente >= 50 ? 'amber' : 'red'}
          icon={<CheckCircle2 />}
          label="Tomas al Corriente"
          value={`${statsTomas.porcentajeAlCorriente}%`}
          progress={statsTomas.porcentajeAlCorriente / 100}
          hint={
            statsTomas.conSaldoPendiente > 0
              ? `${statsTomas.conSaldoPendiente} tomas con adeudo`
              : 'Padrón 100% al corriente'
          }
        />
      </CardGroup>

      {/* 3. Bloque Principal de Gráficas: Evolución Financiera */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Gráfica 1: Área de Tendencia de Ingresos (8 columnas) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tendencia de Recaudación y Cobranza
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ingresos acumulados por mes registrados en ventanilla y caja
              </p>
            </div>

            {/* Selector de Rango */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPeriodoVista('6m')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodoVista === '6m'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Últimos 6 Meses
              </button>
              <button
                type="button"
                onClick={() => setPeriodoVista('anio')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodoVista === 'anio'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Año Completo
              </button>
            </div>
          </div>

          {/* Gráfica Recharts */}
          <div className="h-72 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={datosGraficaIngresos} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIngreso" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.25} />
                  <XAxis
                    dataKey="mes"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94A3B8', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94A3B8', fontSize: 12 }}
                    tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs space-y-1 text-white">
                            <p className="font-bold text-slate-300 uppercase tracking-wider">{label}</p>
                            <p className="text-base font-extrabold text-blue-400">
                              ${Number(data.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {moneda}
                            </p>
                            <div className="pt-1.5 border-t border-slate-800 space-y-0.5 text-[11px] text-slate-400">
                              <p className="flex justify-between gap-4">
                                <span>Cuotas Ordinarias:</span>
                                <span className="font-semibold text-slate-200">${Number(data.cuotas).toFixed(2)}</span>
                              </p>
                              {data.mora > 0 && (
                                <p className="flex justify-between gap-4 text-amber-400">
                                  <span>Recargos mora:</span>
                                  <span className="font-semibold">+${Number(data.mora).toFixed(2)}</span>
                                </p>
                              )}
                              <p className="flex justify-between gap-4 text-slate-400">
                                <span>Recibos cobrados:</span>
                                <span className="font-semibold text-white">{data.recibos}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#0284C7"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorIngreso)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                Cargando gráfica...
              </div>
            )}
          </div>

          {/* Resumen rápido de la gráfica */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                Total Recaudado (Año)
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                ${statsRecaudacion.recaudadoAnioActual.toLocaleString('es-MX')} {moneda}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                Total Histórico
              </span>
              <span className="text-sm sm:text-base font-bold text-blue-600 dark:text-blue-400">
                ${statsRecaudacion.recaudadoHistorico.toLocaleString('es-MX')} {moneda}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                Cuota Mensual Base
              </span>
              <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
                ${cuotaBaseVigente.toFixed(2)} {moneda}
              </span>
            </div>
          </div>
        </div>

        {/* Gráfica 2: Métodos de Pago (Donut Recharts - 4 columnas) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <PieIcon className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Métodos de Pago
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribución en ventanilla
                </p>
              </div>
            </div>
          </div>

          <div className="h-52 w-full relative flex items-center justify-center">
            {mounted && datosMetodosPago.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosMetodosPago}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {datosMetodosPago.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl p-2.5 text-xs text-white shadow-xl">
                            <span className="font-bold">{item.name}</span>: ${Number(item.value).toFixed(2)} ({item.porcentaje}%)
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-slate-400 text-xs py-10">
                <CreditCard className="w-8 h-8 mx-auto opacity-40 mb-2" />
                <p>Sin transacciones registradas aún</p>
              </div>
            )}
          </div>

          {/* Leyenda de Métodos */}
          <div className="space-y-2.5">
            {datosMetodosPago.map((m) => (
              <div key={m.rawKey} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{m.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ${Number(m.value).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[11px] text-slate-400">({m.porcentaje}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bloque Inferior: Cartera Vencida & Últimos Cobros Emitidos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Tomas con Mayor Rezago / Alertas (5 columnas) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tomas con Mayor Rezago
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monitoreo de cartera vencida
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              {statsTomas.conSaldoPendiente} pendientes
            </span>
          </div>

          {tomasConAdeudo.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                ¡Padrón al corriente!
              </p>
              <p className="text-xs text-slate-400">
                No hay tomas con saldo pendiente registrado en el sistema.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {tomasConAdeudo.map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {t.codigo_toma}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                        {t.tipo_toma}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 truncate text-[11px] mt-0.5">
                      {t.persona?.nombre_completo || 'Titular sin asignar'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <span className="font-extrabold text-red-600 dark:text-red-400 block">
                        -${Number(t.saldo_pendiente).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400">adeudo</span>
                    </div>
                    <Link href={`/cobros?toma=${encodeURIComponent(t.codigo_toma)}`}>
                      <button
                        type="button"
                        title="Cobrar en ventanilla"
                        className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tomasConAdeudo.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <Link href="/tomas">
                <Button variant="ghost" size="sm" className="w-full justify-center text-xs gap-1.5">
                  <span>Ver todas las tomas en el padrón</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Últimos Pagos Registrados en Ventanilla (7 columnas) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <Receipt className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Últimos Cobros Registrados
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Actividad reciente en ventanilla de caja
                </p>
              </div>
            </div>
            <Link href="/cobros">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Historial completo</span>
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          {ultimosPagos.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <CreditCard className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm font-medium">Aún no hay cobros registrados en caja.</p>
              <Link href="/cobros">
                <Button variant="outline" size="sm" className="mt-2">
                  Realizar primer cobro
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {ultimosPagos.map((p) => {
                const fecha = new Date(p.fecha_pago || p.created_at);
                const fechaFormateada = fecha.toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                const horaFormateada = fecha.toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {p.folio}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            backgroundColor: `${METODO_COLORS[p.metodo_pago] || '#64748B'}20`,
                            color: METODO_COLORS[p.metodo_pago] || '#64748B',
                          }}
                        >
                          {METODO_LABELS[p.metodo_pago] || p.metodo_pago}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 truncate text-[11px] mt-0.5">
                        {p.persona?.nombre_completo || 'Contribuyente anónimo'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 block">
                        +${Number(p.total).toFixed(2)} {moneda}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {fechaFormateada} · {horaFormateada}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Módulos y Accesos Rápidos del Sistema */}
      <div className="space-y-4 pt-2">
        <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Módulos y Gestión Comunitaria</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Tarjeta Caja */}
          <Link href="/cobros" className="group">
            <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <CreditCard className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Caja y Recaudación
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Cobro de mensualidades con folio, corte de caja y reimpresión de tickets.
              </p>
            </div>
          </Link>

          {/* Tarjeta Tomas */}
          <Link href="/tomas" className="group">
            <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-cyan-500/60 dark:hover:border-cyan-500/60 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Droplets className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                Padrón de Tomas
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Control de contratos domiciliarios, manzanas, medidores y estados de servicio.
              </p>
            </div>
          </Link>

          {/* Tarjeta Personas */}
          <Link href="/personas" className="group">
            <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-purple-500/60 dark:hover:border-purple-500/60 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                Directorio de Contribuyentes
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Padrón de familias, titulares, números de contacto y documentos oficiales.
              </p>
            </div>
          </Link>

          {/* Tarjeta Tarifas y Ajustes */}
          <Link href="/configuracion" className="group">
            <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-emerald-500/60 dark:hover:border-emerald-500/60 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Tarifas y Parámetros
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Cuota base mensual, recargos por mora y modo sin conexión (offline).
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
