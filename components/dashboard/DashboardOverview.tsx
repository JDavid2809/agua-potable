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
  Wallet,
  CheckCircle2,
  Receipt,
  PieChart as PieIcon,
  ShieldAlert,
  Clock,
  ChevronRight,
  SlidersHorizontal,
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
import { CardGroup, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Toma, Pago, Organizacion, Perfil } from '@/types/database';

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

const METODO_COLORES: Record<string, { label: string; color: string }> = {
  efectivo: { label: 'Efectivo', color: '#2F6BFF' },
  transferencia: { label: 'Transferencia', color: '#10B981' },
  tarjeta: { label: 'Tarjeta', color: '#8B5CF6' },
  otro: { label: 'Otro', color: '#F59E0B' },
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
  const [tipoGrafica, setTipoGrafica] = useState<'area' | 'barras'>('area');

  useEffect(() => {
    setMounted(true);
  }, []);

  const moneda = organizacion?.config?.moneda || 'MXN';

  // Filtrar únicamente pagos vigentes (no anulados)
  const pagosVigentes = useMemo(
    () => pagos.filter((p) => p.estado !== 'anulado'),
    [pagos]
  );

  // 1. Estadísticas de recaudación
  const statsRecaudacion = useMemo(() => {
    const ahora = new Date();
    const anioActual = ahora.getFullYear();
    const mesActual = ahora.getMonth();

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

    tomas.forEach((t) => {
      if (t.estado === 'activa') activas++;
      else if (t.estado === 'suspendida') suspendidas++;
      else if (t.estado === 'cortada') cortadas++;
      else inactivas++;

      const saldo = Number(t.saldo_pendiente || 0);
      if (saldo > 0) {
        conSaldoPendiente++;
        totalDeuda += saldo;
      }
    });

    const totalCalculado = tomas.length || totalTomasCount || 1;
    const porcentajeAlCorriente = Math.round(
      ((totalCalculado - conSaldoPendiente) / totalCalculado) * 100
    );

    return {
      activas,
      suspendidas,
      cortadas,
      inactivas,
      conSaldoPendiente,
      totalDeuda,
      porcentajeAlCorriente: Math.max(0, Math.min(100, porcentajeAlCorriente)),
    };
  }, [tomas, totalTomasCount]);

  // 3. Datos para la Gráfica de Recaudación Mensual
  const datosGraficaIngresos = useMemo(() => {
    const mesesNombres = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    const ahora = new Date();
    const resultado: {
      key: string;
      mes: string;
      mesCompleto: string;
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
        mes: `${mesesNombres[m]}${y !== ahora.getFullYear() ? ` '${String(y).slice(-2)}` : ''}`,
        mesCompleto: `${mesesNombres[m]} ${y}`,
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

  // 4. Datos de Métodos de Pago
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
        name: METODO_COLORES[key]?.label || key,
        rawKey: key,
        value: val.total,
        count: val.count,
        porcentaje: Math.round((val.total / sumaTotal) * 100),
        color: METODO_COLORES[key]?.color || '#64748B',
      }))
      .filter((item) => item.value > 0 || item.count > 0);
  }, [pagosVigentes]);

  // 5. Tomas con mayor deuda
  const tomasConAdeudo = useMemo(() => {
    return tomas
      .filter((t) => Number(t.saldo_pendiente || 0) > 0)
      .sort((a, b) => Number(b.saldo_pendiente || 0) - Number(a.saldo_pendiente || 0))
      .slice(0, 6);
  }, [tomas]);

  // 6. Últimos Pagos Registrados
  const ultimosPagos = useMemo(() => {
    return pagosVigentes.slice(0, 6);
  }, [pagosVigentes]);

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-200">
      {/* 1. Cabecera Principal */}
      <PageHeader
        icon={<Droplets />}
        tone="blue"
        title="Panel General de Control"
        subtitle={
          <>
            Administración de{' '}
            <strong className="text-slate-900 dark:text-white font-bold">
              {organizacion?.nombre || 'Comité de Agua Potable'}
            </strong>
            . Monitorea la recaudación mensual, el padrón y la cobranza comunitaria.
          </>
        }
        status="Sistema Activo"
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

      {/* 2. CÍRCULOS DEL SISTEMA (CardGroup con medidores radiales idénticos a los demás apartados) */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Wallet />}
          label="Recaudado este mes"
          value={`$${statsRecaudacion.recaudadoMesActual.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}
          unit={moneda}
          hint={`${statsRecaudacion.pagosMesActualCount} recibos emitidos`}
        />
        <Card
          tone="cyan"
          icon={<Droplets />}
          label="Total tomas"
          value={totalTomasCount || tomas.length}
          hint={`${statsTomas.activas} tomas activas`}
        />
        <Card
          tone="purple"
          icon={<Users />}
          label="Contribuyentes"
          value={totalPersonasCount}
          hint="Titulares registrados"
        />
        <Card
          tone={statsTomas.porcentajeAlCorriente >= 80 ? 'green' : 'amber'}
          icon={<CheckCircle2 />}
          label="Tomas al corriente"
          value={`${statsTomas.porcentajeAlCorriente}%`}
          progress={statsTomas.porcentajeAlCorriente / 100}
          hint={
            statsTomas.conSaldoPendiente > 0
              ? `${statsTomas.conSaldoPendiente} tomas con adeudo`
              : '100% al corriente'
          }
        />
      </CardGroup>

      {/* 3. SECCIÓN DE GRÁFICAS (Fluida, sin cajas pesadas encimadas) */}
      <div className="space-y-6 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Gráfica 1: Evolución de Recaudación (8 columnas) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Evolución de Recaudación Mensual
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ingresos acumulados registrados en ventanilla y caja
                  </p>
                </div>
              </div>

              {/* Controles discretos */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTipoGrafica('area')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      tipoGrafica === 'area'
                        ? 'bg-blue-600 text-white font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Curva
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoGrafica('barras')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      tipoGrafica === 'barras'
                        ? 'bg-blue-600 text-white font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Barras
                  </button>
                </div>

                <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPeriodoVista('6m')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      periodoVista === '6m'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    6M
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodoVista('anio')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      periodoVista === 'anio'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    12M
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas de Recharts sin caja externa pesada */}
            <div className="h-72 w-full pt-2">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  {tipoGrafica === 'area' ? (
                    <AreaChart
                      data={datosGraficaIngresos}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="degradadoFluvib" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2F6BFF" stopOpacity={0.35} />
                          <stop offset="90%" stopColor="#2F6BFF" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="2 4"
                        vertical={false}
                        stroke="#94A3B8"
                        opacity={0.18}
                      />
                      <XAxis
                        dataKey="mes"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val) =>
                          `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        }
                      />
                      <Tooltip
                        cursor={{ stroke: '#2F6BFF', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs space-y-1.5 text-white min-w-[190px]">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                                    {data.mesCompleto || label}
                                  </span>
                                  <span className="text-[10px] text-blue-400 font-semibold">
                                    {data.recibos} recibos
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase">
                                    Total Recaudado
                                  </span>
                                  <p className="font-mono text-base font-extrabold text-blue-400">
                                    ${Number(data.total).toLocaleString('es-MX', {
                                      minimumFractionDigits: 2,
                                    })}{' '}
                                    <span className="text-xs font-normal text-slate-300">
                                      {moneda}
                                    </span>
                                  </p>
                                </div>
                                <div className="pt-1.5 border-t border-slate-800 text-[11px] space-y-0.5">
                                  <div className="flex justify-between text-slate-300">
                                    <span>Cuotas:</span>
                                    <span className="font-mono">${Number(data.cuotas).toFixed(2)}</span>
                                  </div>
                                  {data.mora > 0 && (
                                    <div className="flex justify-between text-amber-400">
                                      <span>Recargos mora:</span>
                                      <span className="font-mono">+${Number(data.mora).toFixed(2)}</span>
                                    </div>
                                  )}
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
                        stroke="#2F6BFF"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#degradadoFluvib)"
                        dot={{ r: 3, fill: '#2F6BFF', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                        activeDot={{ r: 5, fill: '#2F6BFF', stroke: '#FFFFFF', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  ) : (
                    <BarChart
                      data={datosGraficaIngresos}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="2 4"
                        vertical={false}
                        stroke="#94A3B8"
                        opacity={0.18}
                      />
                      <XAxis
                        dataKey="mes"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val) =>
                          `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'currentColor', opacity: 0.04 }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs space-y-1 text-white min-w-[180px]">
                                <p className="font-bold text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
                                  {data.mesCompleto || label}
                                </p>
                                <div className="flex justify-between items-center text-blue-400">
                                  <span>Cuotas:</span>
                                  <span className="font-mono font-bold">
                                    ${Number(data.cuotas).toFixed(2)}
                                  </span>
                                </div>
                                {data.mora > 0 && (
                                  <div className="flex justify-between items-center text-amber-400">
                                    <span>Recargos:</span>
                                    <span className="font-mono font-bold">
                                      +${Number(data.mora).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                <div className="pt-1 border-t border-slate-800 flex justify-between font-extrabold text-white">
                                  <span>Total:</span>
                                  <span className="font-mono">
                                    ${Number(data.total).toFixed(2)} {moneda}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey="cuotas"
                        stackId="a"
                        fill="#2F6BFF"
                        radius={[0, 0, 3, 3]}
                        name="Cuota Ordinaria"
                      />
                      <Bar
                        dataKey="mora"
                        stackId="a"
                        fill="#F59E0B"
                        radius={[3, 3, 0, 0]}
                        name="Recargos por Mora"
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  Cargando gráfica...
                </div>
              )}
            </div>
          </div>

          {/* Gráfica 2: Métodos de Pago (4 columnas) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <PieIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Canales de Cobro
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Distribución por método
                  </p>
                </div>
              </div>
            </div>

            <div className="h-44 w-full relative flex items-center justify-center">
              {mounted && datosMetodosPago.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosMetodosPago}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
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
                              <span className="font-bold">{item.name}</span>: $
                              {Number(item.value).toFixed(2)} ({item.porcentaje}%)
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-400 text-xs py-8">
                  <CreditCard className="w-6 h-6 mx-auto opacity-40 mb-1" />
                  <p>Sin cobros registrados aún</p>
                </div>
              )}
            </div>

            {/* Barra segmentada limpia */}
            {datosMetodosPago.length > 0 && (
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                {datosMetodosPago.map((m) => (
                  <div
                    key={m.rawKey}
                    style={{
                      width: `${m.porcentaje}%`,
                      backgroundColor: m.color,
                    }}
                    title={`${m.name}: ${m.porcentaje}%`}
                    className="h-full transition-all duration-300"
                  />
                ))}
              </div>
            )}

            {/* Lista abierta de desglose (sin cajitas encerradas) */}
            <div className="divide-y divide-dashed divide-slate-200 dark:divide-[#26345C] pt-1">
              {datosMetodosPago.map((m) => (
                <div key={m.rawKey} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({m.count})
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ${Number(m.value).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1.5 font-medium">
                      {m.porcentaje}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. BLOQUE INFERIOR: CARTERA VENCIDA & ACTIVIDAD DE COBRO (Listas abiertas sin cajas pesadas) */}
      <div className="space-y-6 pt-4 border-t border-dashed border-slate-300 dark:border-[#26345C]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Izquierda: Tomas con Mayor Rezago (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Tomas con Mayor Rezago
                </h4>
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                {statsTomas.conSaldoPendiente} pendientes
              </span>
            </div>

            {tomasConAdeudo.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Padrón 100% al corriente
                </p>
                <p className="text-[11px] text-slate-400">
                  No existen tomas con saldo pendiente.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-dashed divide-slate-200 dark:divide-[#26345C]">
                {tomasConAdeudo.map((t) => (
                  <div
                    key={t.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {t.codigo_toma}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          {t.tipo_toma}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">
                        {t.persona?.nombre_completo || 'Titular sin asignar'}
                      </p>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-2.5">
                      <div>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400 block">
                          -${Number(t.saldo_pendiente).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400">adeudo</span>
                      </div>

                      <Link href={`/cobros?toma=${encodeURIComponent(t.codigo_toma)}`}>
                        <button
                          type="button"
                          title="Cobrar en ventanilla"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Columna Derecha: Últimos Cobros Registrados (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Receipt className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Últimos Cobros en Caja
                </h4>
              </div>

              <Link
                href="/cobros"
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Historial completo</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {ultimosPagos.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <Clock className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-xs font-semibold">Sin cobros registrados en caja.</p>
              </div>
            ) : (
              <div className="divide-y divide-dashed divide-slate-200 dark:divide-[#26345C]">
                {ultimosPagos.map((p) => {
                  const fecha = new Date(p.fecha_pago || p.created_at);
                  const fechaFormateada = fecha.toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'short',
                  });
                  const horaFormateada = fecha.toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={p.id}
                      className="py-2.5 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {p.folio}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-medium text-slate-600 dark:text-slate-300 capitalize">
                            {p.metodo_pago}
                          </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">
                          {p.persona?.nombre_completo || 'Contribuyente anónimo'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                          +${Number(p.total).toFixed(2)} {moneda}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
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
      </div>
    </div>
  );
}
