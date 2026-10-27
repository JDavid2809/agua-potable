'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  SlidersHorizontal,
  Banknote,
  AlertCircle,
  Calendar,
  Save,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardGroup } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Organizacion } from '@/types/database';

export function TarifasManager() {
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Formulario
  const [cuotaBase, setCuotaBase] = useState('50.00');
  const [recargoMora, setRecargoMora] = useState('0.00');
  const [moneda, setMoneda] = useState('MXN');
  const [permitirOffline, setPermitirOffline] = useState(true);
  const [anioVigencia, setAnioVigencia] = useState(new Date().getFullYear().toString());
  const [descripcion, setDescripcion] = useState('');

  // Carga inicial de datos
  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);

      // 1. Obtener organización del usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData, error: errPerfil } = await supabase
        .from('perfiles')
        .select('organizacion_id, organizacion:organizaciones(*)')
        .eq('id', user.id)
        .single();

      if (errPerfil) throw errPerfil;

      let org: Organizacion | null = null;
      if (perfilData?.organizacion) {
        org = (Array.isArray(perfilData.organizacion)
          ? perfilData.organizacion[0]
          : perfilData.organizacion) as unknown as Organizacion;

        setOrganizacion(org);
        if (org.config) {
          setCuotaBase(Number(org.config.cuota_base || 50).toFixed(2));
          setRecargoMora(Number(org.config.recargo_mora || 0).toFixed(2));
          setMoneda(org.config.moneda || 'MXN');
          setPermitirOffline(org.config.permitir_cobro_offline ?? true);
        }
      }
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudieron cargar las tarifas del comité.'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Guardar nueva configuración de tarifas
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    const cuotaNum = parseFloat(cuotaBase);
    const recargoNum = parseFloat(recargoMora);
    const anioNum = parseInt(anioVigencia, 10);

    if (isNaN(cuotaNum) || cuotaNum <= 0) {
      sileo.error({
        title: 'Cuota inválida',
        description: 'La cuota base debe ser un número mayor a cero.',
      });
      return;
    }

    if (isNaN(recargoNum) || recargoNum < 0) {
      sileo.error({
        title: 'Recargo inválido',
        description: 'El recargo por mora debe ser cero o positivo.',
      });
      return;
    }

    if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
      sileo.error({
        title: 'Año inválido',
        description: 'Ingresa un año fiscal válido.',
      });
      return;
    }

    if (!organizacion?.id) {
      sileo.error({
        title: 'Error de organización',
        description: 'No se detectó la organización activa.',
      });
      return;
    }

    try {
      setGuardando(true);

      const nuevoConfig = {
        ...(organizacion.config || {}),
        cuota_base: cuotaNum,
        recargo_mora: recargoNum,
        moneda: moneda.trim() || 'MXN',
        permitir_cobro_offline: permitirOffline,
      };

      // 1. Actualizar configuración en la organización (verificando que RLS permita actualizar la fila)
      const { data: orgActualizada, error: errOrg } = await supabase
        .from('organizaciones')
        .update({
          config: nuevoConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizacion.id)
        .select('id')
        .single();

      if (errOrg || !orgActualizada) {
        throw errOrg || new Error('No tienes permisos de administrador para modificar los ajustes de la organización.');
      }

      // 2. Registrar en la tabla de tarifas anuales
      const { error: errTarifa } = await supabase
        .from('tarifas')
        .upsert(
          {
            organizacion_id: organizacion.id,
            anio: anioNum,
            cuota_mensual: cuotaNum,
            recargo_mora: recargoNum,
            descripcion: descripcion.trim() || `Tarifa fijada para el año ${anioNum}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organizacion_id, anio' }
        );

      if (errTarifa) throw errTarifa;

      sileo.success({
        title: '¡Tarifas actualizadas!',
        description: `Cuota base mensual fijada en $${cuotaNum.toFixed(2)} ${moneda}.`,
      });

      setOrganizacion({
        ...organizacion,
        config: nuevoConfig,
      });

      cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al guardar',
        description: obtenerMensajeError(err, 'No se pudo guardar la tarifa.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const cuotaActualNum = Number(organizacion?.config?.cuota_base || 50);
  const recargoActualNum = Number(organizacion?.config?.recargo_mora || 0);

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      {/* 1. Cabecera Principal con Identidad en Anillo */}
      <PageHeader
        icon={<SlidersHorizontal />}
        tone="blue"
        title="Tarifas y Ajustes"
        subtitle="Administración de la cuota base mensual, recargos por mora y parámetros de cobro del comité."
        status="Tarifas vigentes"
        action={
          <Button
            type="button"
            variant="outline"
            size="md"
            icon={<RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />}
            onClick={cargarDatos}
            disabled={cargando}
          >
            Actualizar
          </Button>
        }
      />

      {/* 2. Medidores Radiales de Tarifas Actuales */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Banknote />}
          label="Cuota Base Mensual"
          value={`$${cuotaActualNum.toFixed(0)}`}
          unit={organizacion?.config?.moneda || 'MXN'}
          hint="Tarifa por toma al mes"
        />
        <Card
          tone="amber"
          icon={<AlertCircle />}
          label="Recargo por Mora"
          value={`$${recargoActualNum.toFixed(0)}`}
          unit={organizacion?.config?.moneda || 'MXN'}
          hint="Por cada mes vencido"
        />
        <Card
          tone="green"
          icon={<Calendar />}
          label="Año Fiscal Activo"
          value={new Date().getFullYear()}
          hint="Ciclo en curso"
        />
        <Card
          tone="neutral"
          icon={permitirOffline ? <WifiOff /> : <Wifi />}
          label="Cobro Offline"
          value={permitirOffline ? 'Activo' : 'Inactivo'}
          hint="Permite cobrar sin internet"
        />
      </CardGroup>

      {/* 3. Formulario para Asignar / Modificar Cuota */}
      <div className="max-w-3xl mx-auto w-full">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Asignar Nueva Cuota Base y Parámetros
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Se aplicará automáticamente a todas las tomas en la ventanilla de cobro
              </p>
            </div>
          </div>

          <form onSubmit={handleGuardar} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Cuota Base Mensual ($)
                </label>
                <Input
                  type="number"
                  step="0.50"
                  min="1"
                  value={cuotaBase}
                  onChange={(e) => setCuotaBase(e.target.value)}
                  placeholder="Ej: 50.00"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Monto mensual base por contrato de agua potable.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Recargo por Mora Mensual ($)
                </label>
                <Input
                  type="number"
                  step="0.50"
                  min="0"
                  value={recargoMora}
                  onChange={(e) => setRecargoMora(e.target.value)}
                  placeholder="Ej: 10.00 (0 si no aplica)"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Monto extra por retraso de cada mes no pagado.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Año de Vigencia
                </label>
                <Input
                  type="number"
                  min="2020"
                  max="2050"
                  value={anioVigencia}
                  onChange={(e) => setAnioVigencia(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Moneda
                </label>
                <Input
                  type="text"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  placeholder="MXN"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Acuerdo de Asamblea / Justificación (Opcional)
              </label>
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Aprobada en asamblea de ejidatarios el 15 de enero para obras del pozo profundo..."
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Checkbox de Cobro Offline */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={permitirOffline}
                  onChange={(e) => setPermitirOffline(e.target.checked)}
                  className="mt-0.5 sm:mt-0 w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                    Permitir cobro en modo sin conexión (Offline)
                  </span>
                  <span className="text-xs text-slate-400 block">
                    Habilita a los cajeros para cobrar en campo o durante fallas de luz e internet.
                  </span>
                </div>
              </label>
            </div>

            {/* Botón de Guardado */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={guardando}
                icon={<Save className="w-4 h-4" />}
              >
                Guardar Ajustes de Tarifa
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
