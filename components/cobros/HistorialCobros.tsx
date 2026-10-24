'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  Calendar,
  CreditCard,
  Banknote,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { ReciboTicketModal } from './ReciboTicketModal';
import type { Pago, Organizacion } from '@/types/database';

export interface HistorialCobrosProps {
  pagos: Pago[];
  organizacion: Organizacion | null;
  cargando: boolean;
  onRefresh: () => void;
}

export function HistorialCobros({
  pagos,
  organizacion,
  cargando,
  onRefresh,
}: HistorialCobrosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<'todos' | 'efectivo' | 'transferencia' | 'tarjeta'>('todos');
  const [reciboSeleccionado, setReciboSeleccionado] = useState<Pago | null>(null);

  // Filtrado reactivo de pagos
  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      const matchFolio = p.folio?.toLowerCase().includes(busqueda.toLowerCase());
      const matchNombre = p.persona?.nombre_completo?.toLowerCase().includes(busqueda.toLowerCase());
      const matchMetodo = filtroMetodo === 'todos' || p.metodo_pago === filtroMetodo;

      return (matchFolio || matchNombre) && matchMetodo;
    });
  }, [pagos, busqueda, filtroMetodo]);

  return (
    <div className="w-full space-y-6">
      {/* Barra de Filtros */}
      <FilterBar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar por folio (REC-2026-...) o nombre..."
        onRefresh={onRefresh}
        isRefreshing={cargando}
      >
        <FilterSelect
          label="Método:"
          value={filtroMetodo}
          onChange={(e) => setFiltroMetodo(e.target.value as any)}
        >
          <option value="todos">Todos los métodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </FilterSelect>
      </FilterBar>

      {/* Tabla de Cobros */}
      {cargando && pagos.length === 0 ? (
        <div className="py-20 text-center text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
          <p className="text-sm font-medium">Cargando recibos del comité...</p>
        </div>
      ) : pagosFiltrados.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-semibold">No se encontraron pagos registrados con ese filtro.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Contribuyente / Toma</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Total ($ MXN)</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagosFiltrados.map((p) => {
                const fecha = new Date(p.fecha_pago || p.created_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const codigoToma = p.detalles && p.detalles.length > 0 ? p.detalles[0].toma?.codigo_toma : null;

                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                      {p.folio}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {fecha}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-white block text-sm">
                          {p.persona?.nombre_completo || 'Titular de padrón'}
                        </span>
                        {codigoToma && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            Toma: {codigoToma}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {p.metodo_pago === 'efectivo' && <Banknote className="w-3.5 h-3.5" />}
                        {p.metodo_pago === 'transferencia' && <CreditCard className="w-3.5 h-3.5" />}
                        {p.metodo_pago === 'tarjeta' && <CreditCard className="w-3.5 h-3.5" />}
                        {p.metodo_pago}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      ${Number(p.total).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                      {p.cajero?.nombre_completo || 'Cajero'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        icon={<Printer className="w-3.5 h-3.5" />}
                        onClick={() => setReciboSeleccionado(p)}
                        title="Ver y reimprimir recibo"
                      >
                        Recibo
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal para ver / reimprimir recibo */}
      {reciboSeleccionado && (
        <ReciboTicketModal
          pago={reciboSeleccionado}
          organizacion={organizacion}
          onClose={() => setReciboSeleccionado(null)}
        />
      )}
    </div>
  );
}
