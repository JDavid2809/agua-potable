'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  SlidersHorizontal,
  Banknote,
  AlertCircle,
  Calendar,
  Save,
  CheckCircle2,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  FileText,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardGroup } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Organizacion, Tarifa } from '@/types/database';

export function TarifasManager() {
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
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

      // 2. Cargar historial de tarifas registradas
      if (org?.id) {
        const { data: dataTarifas, error: errTarifas } = await supabase
          .from('tarifas')
          .select('*')
          .eq('organizacion_id', org.id)
          .order('anio', { ascending: false });

        if (errTarifas) throw errTarifas;
        setTarifas(dataTarifas || []);
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

      // 1. Actualizar configuración en la organización
      const { error: errOrg } = await supabase
        .from('organizaciones')
        .update({
          config: nuevoConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizacion.id);

      if (errOrg) throw errOrg;

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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Formulario de Ajustes (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Asignar Nueva Cuota Base y Parámetros
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se aplicará automáticamente a todas las tomas en la ventanilla de cobro
              </p>
            </div>
          </div>

          <form onSubmit={handleGuardar} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Aprobada en asamblea de ejidatarios el 15 de enero para obras del pozo profundo..."
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Checkbox de Cobro Offline */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={permitirOffline}
                  onChange={(e) => setPermitirOffline(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
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

        {/* Historial de Tarifas por Año (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Historial de Tarifas</span>
              </h4>
              <span className="text-xs text-slate-400 font-semibold">
                {tarifas.length} registradas
              </span>
            </div>

            {tarifas.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <FileText className="w-8 h-8 mx-auto opacity-50" />
                <p className="text-xs">No hay tarifas anteriores en el historial.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {tarifas.map((t) => (
                  <div key={t.id || t.anio} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                          Año {t.anio}
                        </span>
                        {t.anio === new Date().getFullYear() && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                            Vigente
                          </span>
                        )}
                      </div>
                      {t.descripcion && (
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 max-w-[200px] truncate">
                          {t.descripcion}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-sm text-blue-600 dark:text-blue-400 block">
                        ${Number(t.cuota_mensual).toFixed(2)}/mes
                      </span>
                      {Number(t.recargo_mora || 0) > 0 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                          Mora: +${Number(t.recargo_mora).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
