'use client';

import React, { useMemo } from 'react';
import {
  Banknote,
  CreditCard,
  Receipt,
  Calendar,
  Printer,
  TrendingUp,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card, CardGroup } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import type { Pago, Organizacion } from '@/types/database';

export interface CorteCajaDiarioProps {
  pagos: Pago[];
  organizacion: Organizacion | null;
  cajeroNombre?: string;
}

export function CorteCajaDiario({
  pagos,
  organizacion,
  cajeroNombre,
}: CorteCajaDiarioProps) {
  const hoyStr = new Date().toISOString().split('T')[0];

  // Filtrar pagos que correspondan al día de hoy
  const pagosHoy = useMemo(() => {
    return pagos.filter((p) => {
      const fechaPagoStr = (p.fecha_pago || p.created_at).split('T')[0];
      return fechaPagoStr === hoyStr;
    });
  }, [pagos, hoyStr]);

  // Cálculos de recaudación del día
  const totales = useMemo(() => {
    let totalGeneral = 0;
    let totalEfectivo = 0;
    let totalTransferencia = 0;
    let totalTarjeta = 0;

    pagosHoy.forEach((p) => {
      const monto = Number(p.total || 0);
      totalGeneral += monto;

      if (p.metodo_pago === 'efectivo') {
        totalEfectivo += monto;
      } else if (p.metodo_pago === 'transferencia') {
        totalTransferencia += monto;
      } else if (p.metodo_pago === 'tarjeta') {
        totalTarjeta += monto;
      }
    });

    const totalDigital = totalTransferencia + totalTarjeta;

    return {
      totalGeneral,
      totalEfectivo,
      totalTransferencia,
      totalTarjeta,
      totalDigital,
      cantidadRecibos: pagosHoy.length,
    };
  }, [pagosHoy]);

  const fechaHoyFormateada = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="w-full space-y-6">
      {/* 1. Medidores Radiales del Corte de Hoy */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Banknote />}
          label="Recaudado Hoy"
          value={`$${totales.totalGeneral.toFixed(0)}`}
          unit="MXN"
          hint="Total ingresado en caja"
        />
        <Card
          tone="green"
          icon={<Banknote />}
          label="Efectivo en Caja"
          value={`$${totales.totalEfectivo.toFixed(0)}`}
          unit="MXN"
          progress={totales.totalGeneral > 0 ? totales.totalEfectivo / totales.totalGeneral : 1}
          hint="Físico para resguardo"
        />
        <Card
          tone="purple"
          icon={<CreditCard />}
          label="Pagos Digitales"
          value={`$${totales.totalDigital.toFixed(0)}`}
          unit="MXN"
          progress={totales.totalGeneral > 0 ? totales.totalDigital / totales.totalGeneral : 0}
          hint="Banco y transferencias"
        />
        <Card
          tone="amber"
          icon={<Receipt />}
          label="Recibos Emitidos"
          value={totales.cantidadRecibos}
          hint={`Cierre al ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
        />
      </CardGroup>

      {/* 2. Ficha de Cierre y Botón de Impresión de Arqueo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Arqueo y Cierre de Turno
          </span>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white capitalize mt-0.5">
            {fechaHoyFormateada}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Comité: <strong>{organizacion?.nombre || 'Agua Potable'}</strong> • Cajero:{' '}
            <strong>{cajeroNombre || 'Operador'}</strong>
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="md"
          icon={<Printer className="w-4 h-4" />}
          onClick={() => window.print()}
        >
          Imprimir Corte de Caja
        </Button>
      </div>

      {/* 3. Desglose de Movimientos del Día */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Movimientos Registrados Hoy ({pagosHoy.length})
        </h4>

        {pagosHoy.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <Clock className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-60" />
            <p className="text-sm font-semibold">Aún no se han registrado cobros el día de hoy.</p>
            <p className="text-xs text-slate-400 mt-1">Los cobros realizados en ventanilla aparecerán aquí automáticamente.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Contribuyente / Toma</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto ($ MXN)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagosHoy.map((p) => {
                  const hora = new Date(p.fecha_pago || p.created_at).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                        {p.folio}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                        {hora}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-slate-900 dark:text-white block text-sm">
                          {p.persona?.nombre_completo || 'Usuario de padrón'}
                        </span>
                        {p.detalles && p.detalles.length > 0 && p.detalles[0].toma && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            Toma: {p.detalles[0].toma.codigo_toma}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-xs font-semibold">
                        {p.metodo_pago}
                      </TableCell>
                      <TableCell className="text-right font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        ${Number(p.total).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
