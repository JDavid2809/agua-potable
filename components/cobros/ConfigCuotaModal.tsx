'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, X, Save, AlertCircle } from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { obtenerMensajeError } from '@/lib/utils/errors';

export interface ConfigCuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cuotaActual: number;
  recargoActual: number;
  organizacionId: string;
  onSaved: (nuevaCuota: number, nuevoRecargo: number) => void;
}

export function ConfigCuotaModal({
  isOpen,
  onClose,
  cuotaActual,
  recargoActual,
  organizacionId,
  onSaved,
}: ConfigCuotaModalProps) {
  const [cuota, setCuota] = useState<string>(cuotaActual.toString());
  const [recargo, setRecargo] = useState<string>(recargoActual.toString());
  const [guardando, setGuardando] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cuotaNum = parseFloat(cuota);
    const recargoNum = parseFloat(recargo);

    if (isNaN(cuotaNum) || cuotaNum <= 0) {
      sileo.error({
        title: 'Valor inválido',
        description: 'La cuota base debe ser un monto numérico mayor a cero.',
      });
      return;
    }

    if (isNaN(recargoNum) || recargoNum < 0) {
      sileo.error({
        title: 'Valor inválido',
        description: 'El recargo por mora debe ser cero o un número positivo.',
      });
      return;
    }

    try {
      setGuardando(true);

      // 1. Obtener la organización para leer su config actual
      const { data: orgData, error: errGetOrg } = await supabase
        .from('organizaciones')
        .select('config')
        .eq('id', organizacionId)
        .single();

      if (errGetOrg) throw errGetOrg;

      const configActual = orgData?.config || {};
      const nuevoConfig = {
        ...configActual,
        cuota_base: cuotaNum,
        recargo_mora: recargoNum,
      };

      // 2. Actualizar configuración general del comité
      const { error: errUpdate } = await supabase
        .from('organizaciones')
        .update({
          config: nuevoConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizacionId);

      if (errUpdate) throw errUpdate;

      // 3. Registrar o actualizar en la tabla de tarifas anuales del comité
      const anioActual = new Date().getFullYear();
      await supabase.from('tarifas').upsert(
        {
          organizacion_id: organizacionId,
          anio: anioActual,
          cuota_mensual: cuotaNum,
          recargo_mora: recargoNum,
          descripcion: `Tarifa base establecida en ${anioActual}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organizacion_id, anio' }
      );

      sileo.success({
        title: 'Tarifa Actualizada',
        description: `La cuota base se fijó en $${cuotaNum.toFixed(2)} MXN / mes.`,
      });

      onSaved(cuotaNum, recargoNum);
      onClose();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al guardar',
        description: obtenerMensajeError(err, 'No se pudo actualizar la cuota base del comité.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Asignar Cuota Base
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tarifa del comité para cobro de servicio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Esta cuota base se aplicará de forma automática al calcular los meses de consumo en ventanilla para cada toma.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Cuota Base Mensual ($ MXN)
            </label>
            <Input
              type="number"
              step="0.50"
              min="1"
              value={cuota}
              onChange={(e) => setCuota(e.target.value)}
              placeholder="Ej: 50.00"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Importe que paga cada usuario por toma al mes.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Recargo por Mora Mensual ($ MXN)
            </label>
            <Input
              type="number"
              step="0.50"
              min="0"
              value={recargo}
              onChange={(e) => setRecargo(e.target.value)}
              placeholder="Ej: 10.00 (Opcional, 0 si no aplica)"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Monto adicional por cada mes vencido de retraso.
            </p>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={guardando}
              icon={<Save className="w-4 h-4" />}
            >
              Guardar Tarifa
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
