'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal,
  Banknote,
  AlertCircle,
  Calendar,
  Save,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Sparkles,
  Droplets,
  Layers,
  Clock,
  Trash2,
  AlertTriangle,
  Users,
  MapPin,
  Receipt,
  Database,
  ListFilter,
  X,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { dbLocal } from '@/lib/db/offline-db';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
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
import {
  guardarRegistrosPorPagina,
  normalizarRegistrosPorPagina,
  obtenerRegistrosPorPaginaActual,
} from '@/hooks/use-registros-por-pagina';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Organizacion, CargoCiclo, TipoCargoCiclo } from '@/types/database';
import {
  ConfirmarVaciadoModal,
  type ConfiguracionModuloVaciado,
} from './ConfirmarVaciadoModal';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function TarifasManager() {
  const [tabActiva, setTabActiva] = useState<'tarifas' | 'cargos' | 'mantenimiento'>('tarifas');
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Formulario de Tarifas y Preferencias de Vista
  const [cuotaBase, setCuotaBase] = useState('50.00');
  const [recargoMora, setRecargoMora] = useState('0.00');
  const [moneda, setMoneda] = useState('MXN');
  const [permitirOffline, setPermitirOffline] = useState(true);
  const [registrosPorPagina, setRegistrosPorPagina] = useState<number>(50);
  const [anioVigencia, setAnioVigencia] = useState(new Date().getFullYear().toString());
  const [descripcion, setDescripcion] = useState('');

  // Conteos globales del sistema (para cortes y vaciado de datos)
  const [tomasActivasCount, setTomasActivasCount] = useState(0);
  const [totalTomasCount, setTotalTomasCount] = useState(0);
  const [totalPersonasCount, setTotalPersonasCount] = useState(0);
  const [totalManzanasCount, setTotalManzanasCount] = useState(0);
  const [totalPagosCount, setTotalPagosCount] = useState(0);

  // Estado de Ciclo de Cargos Mensuales / Extraordinarios
  const mesActualIndex = new Date().getMonth() + 1;
  const anioActualNum = new Date().getFullYear();

  const [cargosHistorial, setCargosHistorial] = useState<CargoCiclo[]>([]);
  const [tipoCargo, setTipoCargo] = useState<TipoCargoCiclo>('mensual');
  const [mesCargo, setMesCargo] = useState<number>(mesActualIndex);
  const [anioCargo, setAnioCargo] = useState<number>(anioActualNum);
  const [montoCargo, setMontoCargo] = useState<string>('50.00');
  const [conceptoCargo, setConceptoCargo] = useState<string>(
    `Cuota mensual de agua potable — ${MESES[mesActualIndex - 1]} ${anioActualNum}`
  );
  const [aplicandoCargo, setAplicandoCargo] = useState(false);

  // Estado de Vaciado Permanente de Datos (Modal)
  const [moduloEnConfirmacion, setModuloEnConfirmacion] =
    useState<ConfiguracionModuloVaciado | null>(null);
  const [palabraConfirmacion, setPalabraConfirmacion] = useState('');
  const [ejecutandoVaciado, setEjecutandoVaciado] = useState(false);

  // Carga inicial de datos
  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setRegistrosPorPagina(obtenerRegistrosPorPaginaActual());

      // 1. Obtener organización del usuario actual
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData, error: errPerfil } = await supabase
        .from('perfiles')
        .select('organizacion_id, organizacion:organizaciones(*)')
        .eq('id', user.id)
        .single();

      if (errPerfil) throw errPerfil;

      let cuotaConfig = 50;
      if (perfilData?.organizacion) {
        const org = (Array.isArray(perfilData.organizacion)
          ? perfilData.organizacion[0]
          : perfilData.organizacion) as unknown as Organizacion;

        setOrganizacion(org);
        if (org.config) {
          cuotaConfig = Number(org.config.cuota_base || 50);
          setCuotaBase(cuotaConfig.toFixed(2));
          setRecargoMora(Number(org.config.recargo_mora || 0).toFixed(2));
          setMoneda(org.config.moneda || 'MXN');
          setPermitirOffline(org.config.permitir_cobro_offline ?? true);
          setMontoCargo(cuotaConfig.toFixed(2));

          if (org.config.registros_por_pagina) {
            const normalizado = guardarRegistrosPorPagina(org.config.registros_por_pagina);
            setRegistrosPorPagina(normalizado);
          }
        }
      }

      // 2. Contar registros almacenados en cada tabla del sistema
      const [
        { count: activasCount },
        { count: tomasCount },
        { count: personasCount },
        { count: manzanasCount },
        { count: pagosCount },
      ] = await Promise.all([
        supabase
          .from('tomas')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('estado', 'activa'),
        supabase.from('tomas').select('id', { count: 'exact', head: true }),
        supabase.from('personas').select('id', { count: 'exact', head: true }),
        supabase.from('manzanas').select('id', { count: 'exact', head: true }),
        supabase.from('pagos').select('id', { count: 'exact', head: true }),
      ]);

      setTomasActivasCount(activasCount || 0);
      setTotalTomasCount(tomasCount || 0);
      setTotalPersonasCount(personasCount || 0);
      setTotalManzanasCount(manzanasCount || 0);
      setTotalPagosCount(pagosCount || 0);

      // 3. Cargar historial de cortes/cargos aplicados
      const { data: dataCargos, error: errCargos } = await supabase
        .from('cargos_ciclo')
        .select('*, autor:perfiles(id, nombre_completo)')
        .order('created_at', { ascending: false })
        .limit(36);

      if (!errCargos && dataCargos) {
        setCargosHistorial(dataCargos as unknown as CargoCiclo[]);
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

  // Actualizar concepto y monto sugerido al cambiar tipo, mes o año de cargo
  const handleCambiarTipoCargo = (nuevoTipo: TipoCargoCiclo) => {
    setTipoCargo(nuevoTipo);
    const cuotaVigente = Number(organizacion?.config?.cuota_base || cuotaBase || 50);
    if (nuevoTipo === 'mensual') {
      setMontoCargo(cuotaVigente.toFixed(2));
      setConceptoCargo(`Cuota mensual de agua potable — ${MESES[mesCargo - 1]} ${anioCargo}`);
    } else {
      setConceptoCargo('');
    }
  };

  const handleCambiarMesCargo = (nuevoMes: number) => {
    setMesCargo(nuevoMes);
    if (tipoCargo === 'mensual') {
      setConceptoCargo(`Cuota mensual de agua potable — ${MESES[nuevoMes - 1]} ${anioCargo}`);
    }
  };

  const handleCambiarAnioCargo = (nuevoAnio: number) => {
    setAnioCargo(nuevoAnio);
    if (tipoCargo === 'mensual') {
      setConceptoCargo(`Cuota mensual de agua potable — ${MESES[mesCargo - 1]} ${nuevoAnio}`);
    }
  };

  // Verificar si el corte mensual seleccionado ya fue aplicado
  const corteSeleccionadoExistente = useMemo(() => {
    if (tipoCargo !== 'mensual') return null;
    return (
      cargosHistorial.find(
        (c) => c.tipo === 'mensual' && c.anio === anioCargo && c.mes === mesCargo
      ) || null
    );
  }, [cargosHistorial, tipoCargo, anioCargo, mesCargo]);

  const corteMesActualAplicado = useMemo(() => {
    return cargosHistorial.some(
      (c) => c.tipo === 'mensual' && c.anio === anioActualNum && c.mes === mesActualIndex
    );
  }, [cargosHistorial, anioActualNum, mesActualIndex]);

  const cortesAnioActualCount = useMemo(() => {
    return cargosHistorial.filter(
      (c) => c.tipo === 'mensual' && c.anio === anioActualNum
    ).length;
  }, [cargosHistorial, anioActualNum]);

  // Guardar nueva configuración de tarifas y preferencia de registros por página
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    const cuotaNum = parseFloat(cuotaBase);
    const recargoNum = parseFloat(recargoMora);
    const anioNum = parseInt(anioVigencia, 10);
    const registrosNum = normalizarRegistrosPorPagina(registrosPorPagina);

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
        registros_por_pagina: registrosNum,
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
        throw (
          errOrg ||
          new Error('No tienes permisos de administrador para modificar los ajustes de la organización.')
        );
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

      // 3. Guardar preferencia local inmediata
      guardarRegistrosPorPagina(registrosNum);
      setRegistrosPorPagina(registrosNum);

      sileo.success({
        title: '¡Ajustes actualizados!',
        description: `Cuota base en $${cuotaNum.toFixed(2)} ${moneda} y vista de ${registrosNum} usuarios por página.`,
      });

      setOrganizacion({
        ...organizacion,
        config: nuevoConfig,
      });

      if (tipoCargo === 'mensual') {
        setMontoCargo(cuotaNum.toFixed(2));
      }

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

  // Aplicar cargo mensual o extraordinario a las tomas activas
  const handleAplicarCargo = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNum = parseFloat(montoCargo);
    if (isNaN(montoNum) || montoNum <= 0) {
      sileo.warning({
        title: 'Monto inválido',
        description: 'El monto a cargar por toma debe ser mayor a cero.',
      });
      return;
    }

    if (!conceptoCargo.trim()) {
      sileo.warning({
        title: 'Concepto requerido',
        description: 'Escribe el concepto o acuerdo del cargo.',
      });
      return;
    }

    if (tipoCargo === 'mensual' && corteSeleccionadoExistente) {
      sileo.warning({
        title: 'Corte ya aplicado',
        description: `El corte mensual de ${MESES[mesCargo - 1]} ${anioCargo} ya fue aplicado anteriormente.`,
      });
      return;
    }

    const etiquetaPeriodo = `${MESES[mesCargo - 1]} ${anioCargo}`;
    const confirmar = window.confirm(
      tipoCargo === 'mensual'
        ? `¿Confirmas aplicar el Corte Mensual de ${etiquetaPeriodo} por $${montoNum.toFixed(2)} ${moneda} a las tomas activas?\n\nNota: Las tomas que ya pagaron este mes por adelantado quedarán exentas automáticamente.`
        : `¿Confirmas aplicar el Cargo Extraordinario "${conceptoCargo.trim()}" por $${montoNum.toFixed(2)} ${moneda} a todas las tomas activas (${tomasActivasCount})?`
    );

    if (!confirmar) return;

    try {
      setAplicandoCargo(true);

      const { data, error } = await supabase.rpc('aplicar_cargo_ciclo', {
        p_anio: anioCargo,
        p_mes: mesCargo,
        p_tipo: tipoCargo,
        p_monto: montoNum,
        p_concepto: conceptoCargo.trim(),
      });

      if (error) throw error;

      const afectadas = Number(data?.tomas_afectadas ?? 0);
      const exentas = Number(data?.tomas_exentas_adelanto ?? 0);
      const totalGen = Number(data?.total_generado ?? afectadas * montoNum);

      sileo.success({
        title: tipoCargo === 'mensual' ? '¡Corte mensual aplicado!' : '¡Cargo extraordinario aplicado!',
        description: `Se cargaron $${montoNum.toFixed(2)} a ${afectadas} tomas activas ($${totalGen.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda}).${
          exentas > 0 ? ` ${exentas} toma(s) exentas por pago adelantado.` : ''
        }`,
      });

      await cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'No se pudo aplicar el cargo',
        description: obtenerMensajeError(
          err,
          'Verifica que hayas ejecutado la migración SQL de cargos_ciclo en Supabase.'
        ),
      });
    } finally {
      setAplicandoCargo(false);
    }
  };

  // Ejecutar Vaciado Permanente de Datos
  const handleConfirmarVaciado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduloEnConfirmacion) return;

    if (palabraConfirmacion.trim().toUpperCase() !== 'VACIAR') {
      sileo.warning({
        title: 'Confirmación requerida',
        description: 'Debes escribir la palabra VACIAR para confirmar la eliminación permanente.',
      });
      return;
    }

    const modulo = moduloEnConfirmacion.id;
    const orgId = organizacion?.id;

    try {
      setEjecutandoVaciado(true);

      if (modulo === 'cache_local') {
        await Promise.all([
          dbLocal.pagos.clear(),
          dbLocal.pago_detalles.clear(),
          dbLocal.tomas.clear(),
          dbLocal.personas.clear(),
          dbLocal.manzanas.clear(),
          dbLocal.cola_sync.clear(),
          dbLocal.config_sync.delete('ultima_sincronizacion'),
        ]);

        sileo.success({
          title: 'Caché local vaciada',
          description: 'Se eliminaron los datos locales almacenados en este dispositivo.',
        });

        setModuloEnConfirmacion(null);
        setPalabraConfirmacion('');
        return;
      }

      if (!orgId) {
        throw new Error('No se detectó la organización activa.');
      }

      // Intentar primero vía RPC atómica en Supabase
      const { error: rpcError } = await supabase.rpc('vaciar_datos_organizacion', {
        p_modulo: modulo,
      });

      if (rpcError) {
        // Fallback directo por tablas respetando el orden de llaves foráneas
        if (modulo === 'pagos') {
          await supabase.from('pago_detalles').delete().eq('organizacion_id', orgId);
          const { error: errP } = await supabase
            .from('pagos')
            .delete()
            .eq('organizacion_id', orgId);
          if (errP) throw errP;
          await supabase.from('cargos_ciclo').delete().eq('organizacion_id', orgId);
          await supabase
            .from('tomas')
            .update({ saldo_pendiente: 0 })
            .eq('organizacion_id', orgId);
        } else if (modulo === 'tomas') {
          await supabase.from('pago_detalles').delete().eq('organizacion_id', orgId);
          await supabase.from('pagos').delete().eq('organizacion_id', orgId);
          await supabase.from('cargos_ciclo').delete().eq('organizacion_id', orgId);
          const { error: errT } = await supabase
            .from('tomas')
            .delete()
            .eq('organizacion_id', orgId);
          if (errT) throw errT;
        } else if (modulo === 'personas') {
          await supabase.from('pago_detalles').delete().eq('organizacion_id', orgId);
          await supabase.from('pagos').delete().eq('organizacion_id', orgId);
          await supabase.from('cargos_ciclo').delete().eq('organizacion_id', orgId);
          await supabase.from('tomas').delete().eq('organizacion_id', orgId);
          const { error: errPer } = await supabase
            .from('personas')
            .delete()
            .eq('organizacion_id', orgId);
          if (errPer) throw errPer;
        } else if (modulo === 'manzanas') {
          await supabase
            .from('tomas')
            .update({ manzana_id: null })
            .eq('organizacion_id', orgId);
          const { error: errM } = await supabase
            .from('manzanas')
            .delete()
            .eq('organizacion_id', orgId);
          if (errM) throw errM;
        } else if (modulo === 'todo') {
          await supabase.from('pago_detalles').delete().eq('organizacion_id', orgId);
          await supabase.from('pagos').delete().eq('organizacion_id', orgId);
          await supabase.from('cargos_ciclo').delete().eq('organizacion_id', orgId);
          await supabase.from('tomas').delete().eq('organizacion_id', orgId);
          await supabase.from('personas').delete().eq('organizacion_id', orgId);
          const { error: errTodo } = await supabase
            .from('manzanas')
            .delete()
            .eq('organizacion_id', orgId);
          if (errTodo) throw errTodo;
        }
      }

      // Limpiar también la base de datos local Dexie para evitar que la caché restaure datos borrados
      try {
        if (modulo === 'pagos') {
          await Promise.all([dbLocal.pago_detalles.clear(), dbLocal.pagos.clear()]);
        } else if (modulo === 'tomas') {
          await Promise.all([
            dbLocal.pago_detalles.clear(),
            dbLocal.pagos.clear(),
            dbLocal.tomas.clear(),
          ]);
        } else if (modulo === 'personas') {
          await Promise.all([
            dbLocal.pago_detalles.clear(),
            dbLocal.pagos.clear(),
            dbLocal.tomas.clear(),
            dbLocal.personas.clear(),
          ]);
        } else if (modulo === 'manzanas') {
          await dbLocal.manzanas.clear();
        } else if (modulo === 'todo') {
          await Promise.all([
            dbLocal.pago_detalles.clear(),
            dbLocal.pagos.clear(),
            dbLocal.tomas.clear(),
            dbLocal.personas.clear(),
            dbLocal.manzanas.clear(),
            dbLocal.cola_sync.clear(),
          ]);
        }
      } catch {
        // Ignorar error de limpieza local
      }

      sileo.success({
        title: 'Datos vaciados permanentemente',
        description: `Se completó el vaciado de: ${moduloEnConfirmacion.titulo}.`,
      });

      setModuloEnConfirmacion(null);
      setPalabraConfirmacion('');
      await cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al vaciar datos',
        description: obtenerMensajeError(
          err,
          'No se pudieron eliminar los datos. Ejecuta el script SQL de vaciado_datos en Supabase.'
        ),
      });
    } finally {
      setEjecutandoVaciado(false);
    }
  };

  const cuotaActualNum = Number(organizacion?.config?.cuota_base || 50);
  const recargoActualNum = Number(organizacion?.config?.recargo_mora || 0);
  const monedaActual = organizacion?.config?.moneda || 'MXN';

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      {/* 1. Cabecera Principal con Identidad en Anillo y Pestañas */}
      <PageHeader
        icon={<SlidersHorizontal />}
        tone="blue"
        title="Tarifas, Cortes y Ajustes"
        subtitle="Administración de la cuota base mensual, preferencias de visualización, cortes al padrón y vaciado de datos."
        status={
          corteMesActualAplicado
            ? `Corte de ${MESES[mesActualIndex - 1]} aplicado`
            : `Corte de ${MESES[mesActualIndex - 1]} pendiente de aplicar`
        }
        statusTone={corteMesActualAplicado ? 'green' : 'amber'}
        action={
          <PageTabs
            value={tabActiva}
            onChange={(val) =>
              setTabActiva(val as 'tarifas' | 'cargos' | 'mantenimiento')
            }
            items={[
              {
                value: 'tarifas',
                label: 'Tarifas y Vistas',
                icon: <SlidersHorizontal />,
              },
              {
                value: 'cargos',
                label: 'Corte Mensual y Cargos',
                icon: <Calendar />,
              },
              {
                value: 'mantenimiento',
                label: 'Vaciar Datos',
                icon: <Database />,
              },
            ]}
          />
        }
      />

      {tabActiva === 'tarifas' && (
        <>
          {/* 2A. Medidores Radiales de Tarifas y Vista Actual */}
          <CardGroup>
            <Card
              tone="blue"
              icon={<Banknote />}
              label="Cuota Base Mensual"
              value={`$${cuotaActualNum.toFixed(0)}`}
              unit={monedaActual}
              hint="Tarifa por toma al mes"
            />
            <Card
              tone="amber"
              icon={<AlertCircle />}
              label="Recargo por Mora"
              value={`$${recargoActualNum.toFixed(0)}`}
              unit={monedaActual}
              hint="Por cada mes vencido"
            />
            <Card
              tone="purple"
              icon={<ListFilter />}
              label="Usuarios por Vista"
              value={registrosPorPagina}
              progress={registrosPorPagina / 50}
              hint="Máximo 50 por página"
            />
            <Card
              tone="neutral"
              icon={permitirOffline ? <WifiOff /> : <Wifi />}
              label="Cobro Offline"
              value={permitirOffline ? 'Activo' : 'Inactivo'}
              hint="Permite cobrar sin internet"
            />
          </CardGroup>

          {/* 3A. Formulario para Asignar / Modificar Cuota y Paginación */}
          <div className="max-w-3xl mx-auto w-full">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Asignar Cuota Base y Preferencias de Vista
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      Configura las tarifas de cobro y cuántos registros deseas ver por página
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />}
                  onClick={cargarDatos}
                  disabled={cargando}
                >
                  Actualizar
                </Button>
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

                {/* Sección: Cuántos Usuarios / Registros Ver por Vista (Máximo 50) */}
                <div className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                        Paginación del Sistema
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        ¿Cuántos usuarios y registros prefieres ver por página?
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Se aplica en Contribuyentes, Padrón de Tomas, Barrios y Previsualización de Excel (máximo 50).
                      </p>
                    </div>

                    <div className="w-28 shrink-0">
                      <Input
                        type="number"
                        min={5}
                        max={50}
                        value={registrosPorPagina}
                        onChange={(e) => {
                          const val = Math.min(50, Math.max(5, parseInt(e.target.value, 10) || 5));
                          setRegistrosPorPagina(val);
                          guardarRegistrosPorPagina(val);
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* Botones rápidos de cantidad por vista */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">
                      Selección rápida:
                    </span>
                    {[10, 15, 20, 25, 30, 40, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setRegistrosPorPagina(num);
                          guardarRegistrosPorPagina(num);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-xl border transition-all ${
                          registrosPorPagina === num
                            ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                        }`}
                      >
                        {num} por página
                      </button>
                    ))}
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
                    Guardar Ajustes y Preferencias
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {tabActiva === 'cargos' && (
        <>
          {/* 2B. Medidores Radiales de Ciclo de Deuda y Facturación */}
          <CardGroup>
            <Card
              tone="blue"
              icon={<Droplets />}
              label="Tomas Activas"
              value={tomasActivasCount}
              hint="Sujetas al corte mensual"
            />
            <Card
              tone={corteMesActualAplicado ? 'green' : 'amber'}
              icon={<CheckCircle2 />}
              label={`Corte ${MESES[mesActualIndex - 1]}`}
              value={corteMesActualAplicado ? 'Aplicado' : 'Pendiente'}
              progress={corteMesActualAplicado ? 1 : 0.25}
              hint={
                corteMesActualAplicado
                  ? 'Cargo del mes ya generado'
                  : 'Listo para generar cargo'
              }
            />
            <Card
              tone="cyan"
              icon={<Banknote />}
              label="Emisión Estimada"
              value={`$${(tomasActivasCount * (parseFloat(montoCargo) || cuotaActualNum)).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}
              unit={monedaActual}
              hint={`${tomasActivasCount} tomas × $${(parseFloat(montoCargo) || cuotaActualNum).toFixed(0)}`}
            />
            <Card
              tone="purple"
              icon={<Layers />}
              label={`Cortes en ${anioActualNum}`}
              value={`${cortesAnioActualCount}/12`}
              progress={Math.min(1, cortesAnioActualCount / 12)}
              hint="Meses ordinarios emitidos"
            />
          </CardGroup>

          {/* 3B. Panel de Aplicación de Corte Mensual o Cargo Extraordinario */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Columna Izquierda: Formulario de Emisión de Cargo (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Generar Cargo al Padrón
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Incrementa el saldo pendiente de las tomas activas
                  </p>
                </div>
              </div>

              <form onSubmit={handleAplicarCargo} className="space-y-5">
                {/* Selector de Tipo de Cargo */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Modalidad del Cargo
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCambiarTipoCargo('mensual')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        tipoCargo === 'mensual'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <Calendar className="w-4 h-4 mb-1 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs block font-bold">Corte Mensual</span>
                      <span className="text-[10px] opacity-75 font-normal block mt-0.5">
                        Cuota ordinaria (1 por mes)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCambiarTipoCargo('extraordinario')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        tipoCargo === 'extraordinario'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 mb-1 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs block font-bold">Extraordinario</span>
                      <span className="text-[10px] opacity-75 font-normal block mt-0.5">
                        Cooperación o acuerdo de asamblea
                      </span>
                    </button>
                  </div>
                </div>

                {/* Selección de Mes y Año */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Mes del Periodo
                    </label>
                    <select
                      value={mesCargo}
                      onChange={(e) => handleCambiarMesCargo(parseInt(e.target.value, 10))}
                      className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    >
                      {MESES.map((nombre, idx) => (
                        <option key={nombre} value={idx + 1}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Año
                    </label>
                    <Input
                      type="number"
                      min="2020"
                      max="2050"
                      value={anioCargo}
                      onChange={(e) =>
                        handleCambiarAnioCargo(parseInt(e.target.value, 10) || anioActualNum)
                      }
                      required
                    />
                  </div>
                </div>

                {/* Monto Unitario por Toma */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Monto a Cargar por Toma ($ {monedaActual})
                  </label>
                  <Input
                    type="number"
                    step="0.50"
                    min="1"
                    value={montoCargo}
                    onChange={(e) => setMontoCargo(e.target.value)}
                    placeholder="Ej: 50.00"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {tipoCargo === 'mensual'
                      ? 'Las tomas que ya pagaron este mes por adelantado quedan exentas automáticamente.'
                      : 'Se sumará este monto al saldo pendiente de todas las tomas activas.'}
                  </p>
                </div>

                {/* Concepto */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Concepto / Referencia del Cargo *
                  </label>
                  <Input
                    type="text"
                    value={conceptoCargo}
                    onChange={(e) => setConceptoCargo(e.target.value)}
                    placeholder="Ej: Cooperación para reparación de bomba sumergible..."
                    required
                  />
                </div>

                {/* Estado si el corte mensual ya fue aplicado */}
                {corteSeleccionadoExistente && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="font-bold block">
                        El corte mensual de {MESES[mesCargo - 1]} {anioCargo} ya fue aplicado
                      </span>
                      <span className="text-[11px] opacity-90">
                        Registrado el{' '}
                        {new Date(corteSeleccionadoExistente.created_at).toLocaleDateString(
                          'es-MX',
                          { day: '2-digit', month: 'short', year: 'numeric' }
                        )}{' '}
                        ({corteSeleccionadoExistente.tomas_afectadas} tomas cargadas).
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={aplicandoCargo}
                    disabled={!!corteSeleccionadoExistente || tomasActivasCount === 0}
                    className="w-full justify-center"
                    icon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    {corteSeleccionadoExistente
                      ? `Corte de ${MESES[mesCargo - 1]} Ya Aplicado`
                      : tipoCargo === 'mensual'
                        ? `Aplicar Corte de ${MESES[mesCargo - 1]} ${anioCargo}`
                        : 'Aplicar Cargo Extraordinario'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Columna Derecha: Historial de Cortes y Cargos Aplicados (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Bitácora de Cortes y Cargos Aplicados ({cargosHistorial.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Registro histórico auditable de emisiones de deuda sobre el padrón
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />}
                  onClick={cargarDatos}
                  disabled={cargando}
                >
                  Actualizar
                </Button>
              </div>

              {cargosHistorial.length === 0 ? (
                <div className="py-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
                  <Clock className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Aún no se han aplicado cortes mensuales ni cargos masivos
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Usa el panel izquierdo al inicio de cada mes para cargar la cuota base a las tomas activas.
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Periodo</TableHead>
                        <TableHead>Concepto / Tipo</TableHead>
                        <TableHead>Tomas</TableHead>
                        <TableHead className="text-right">Total Emitido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cargosHistorial.map((c) => {
                        const fechaStr = new Date(c.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });

                        return (
                          <TableRow key={c.id}>
                            <TableCell className="whitespace-nowrap">
                              <span className="font-bold text-slate-900 dark:text-white block text-xs">
                                {MESES[c.mes - 1] || `Mes ${c.mes}`} {c.anio}
                              </span>
                              <span className="text-[11px] text-slate-400">{fechaStr}</span>
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    c.tipo === 'mensual'
                                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                      : 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                  }`}
                                >
                                  {c.tipo === 'mensual' ? 'Mensual' : 'Extraordinario'}
                                </span>
                                <span className="text-xs font-mono font-semibold text-slate-500">
                                  ${Number(c.monto_unitario).toFixed(2)} c/u
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium line-clamp-1">
                                {c.concepto}
                              </p>
                            </TableCell>

                            <TableCell className="text-xs">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                {c.tomas_afectadas} cargadas
                              </span>
                              {c.tomas_exentas_adelanto > 0 && (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                  {c.tomas_exentas_adelanto} exenta(s) por adelanto
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="text-right font-extrabold text-sm text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              ${Number(c.total_generado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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
        </>
      )}

      {tabActiva === 'mantenimiento' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* 2C. Medidores Radiales de Datos Almacenados */}
          <CardGroup>
            <Card
              tone="blue"
              icon={<Users />}
              label="Contribuyentes"
              value={totalPersonasCount}
              hint="Titulares en la BD"
            />
            <Card
              tone="cyan"
              icon={<Droplets />}
              label="Tomas de Agua"
              value={totalTomasCount}
              hint="Contratos almacenados"
            />
            <Card
              tone="purple"
              icon={<MapPin />}
              label="Barrios y Manzanas"
              value={totalManzanasCount}
              hint="Zonas territoriales"
            />
            <Card
              tone="amber"
              icon={<Receipt />}
              label="Recibos Emitidos"
              value={totalPagosCount}
              hint="Cobros en el historial"
            />
          </CardGroup>

          {/* 3C. Tarjetas de Vaciado Permanente por Módulo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. Vaciar Contribuyentes y Tomas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Users className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {totalPersonasCount} registros
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Vaciar Padrón de Contribuyentes
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Elimina de manera permanente todos los contribuyentes registrados junto con sus tomas y recibos asociados. Conserva los barrios y tarifas.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'personas',
                    titulo: 'Padrón de Contribuyentes',
                    descripcion: `Se eliminarán permanentemente ${totalPersonasCount} contribuyentes de tu organización junto con sus contratos y cobros vinculados.`,
                    eliminara: [
                      `${totalPersonasCount} contribuyentes registrados`,
                      `${totalTomasCount} tomas de agua vinculadas`,
                      `${totalPagosCount} recibos y cortes de deuda`,
                    ],
                    conservara: [
                      `${totalManzanasCount} barrios y manzanas`,
                      'Tarifas, cuotas y usuarios del sistema',
                    ],
                    notaRelacion:
                      'Como cada toma y recibo pertenece obligatoriamente a un titular, el sistema limpia primero cobros y tomas en cascada para no generar errores de llave foránea.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-900 dark:hover:bg-rose-950/30"
              >
                Vaciar Contribuyentes
              </Button>
            </div>

            {/* 2. Vaciar Solo Tomas de Agua */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                    <Droplets className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {totalTomasCount} tomas
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Vaciar Padrón de Tomas
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Elimina permanentemente todas las tomas de agua y sus cobros, pero conserva intactos a los contribuyentes y barrios.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'tomas',
                    titulo: 'Padrón de Tomas de Agua',
                    descripcion: `Se eliminarán permanentemente las ${totalTomasCount} tomas de agua y su historial de cobros.`,
                    eliminara: [
                      `${totalTomasCount} tomas de agua`,
                      `${totalPagosCount} recibos y cortes ligados a las tomas`,
                    ],
                    conservara: [
                      `${totalPersonasCount} contribuyentes (quedarán con 0 tomas)`,
                      `${totalManzanasCount} barrios y manzanas`,
                    ],
                    notaRelacion:
                      'Tus contribuyentes NO se borran ni dan error: simplemente quedan registrados como ciudadanos con 0 tomas para que puedas asignarles nuevas tomas después.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-900 dark:hover:bg-rose-950/30"
              >
                Vaciar Tomas de Agua
              </Button>
            </div>

            {/* 3. Vaciar Barrios, Secciones y Manzanas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                    <MapPin className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {totalManzanasCount} ubicaciones
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Vaciar Barrios y Manzanas
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Elimina permanentemente todos los barrios, secciones y manzanas registrados, desvinculándolos de las tomas existentes.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'manzanas',
                    titulo: 'Catálogo de Barrios y Manzanas',
                    descripcion: `Se eliminarán permanentemente las ${totalManzanasCount} manzanas y barrios almacenados en el sistema.`,
                    eliminara: [
                      `${totalManzanasCount} barrios, secciones y manzanas`,
                    ],
                    conservara: [
                      `${totalPersonasCount} contribuyentes`,
                      `${totalTomasCount} tomas de agua`,
                      `${totalPagosCount} recibos emitidos`,
                    ],
                    notaRelacion:
                      'El sistema desvincula automáticamente las tomas existentes (manzana_id = NULL) antes de borrar los barrios. Ningún contribuyente ni toma se pierde ni marca error.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-900 dark:hover:bg-rose-950/30"
              >
                Vaciar Barrios y Manzanas
              </Button>
            </div>

            {/* 4. Vaciar Historial de Cobros, Recibos y Cortes */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    <Receipt className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {totalPagosCount} recibos
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Vaciar Historial de Cobros y Cortes
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Elimina permanentemente todos los recibos emitidos, la bitácora de cortes mensuales y reinicia en $0.00 el saldo pendiente de las tomas.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'pagos',
                    titulo: 'Historial de Cobros, Recibos y Cortes',
                    descripcion: `Se eliminarán permanentemente ${totalPagosCount} recibos y los cortes mensuales, dejando el saldo pendiente de las tomas en $0.00.`,
                    eliminara: [
                      `${totalPagosCount} recibos y desgloses de pago`,
                      'Historial de cortes mensuales y extraordinarios',
                    ],
                    conservara: [
                      `${totalPersonasCount} contribuyentes`,
                      `${totalTomasCount} tomas de agua (con saldo en $0.00)`,
                      `${totalManzanasCount} barrios y manzanas`,
                    ],
                    notaRelacion:
                      'Se borran primero los detalles de pago y después los recibos, reiniciando los saldos de todas las tomas en $0.00 sin afectar el padrón.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-900 dark:hover:bg-rose-950/30"
              >
                Vaciar Cobros y Recibos
              </Button>
            </div>

            {/* 5. Vaciar Caché Offline de este Dispositivo */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Database className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    IndexedDB Local
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Vaciar Memoria Offline Local
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Limpia únicamente la base de datos local (IndexedDB) guardada en este navegador sin borrar ningún dato de la nube en Supabase.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'cache_local',
                    titulo: 'Memoria Offline Local de este Dispositivo',
                    descripcion:
                      'Se vaciará la caché local (IndexedDB) y la cola offline en este navegador.',
                    eliminara: [
                      'Caché local IndexedDB en este navegador',
                      'Cola de sincronización offline local',
                    ],
                    conservara: [
                      'Todos los datos en la nube (Supabase)',
                      'Contribuyentes, tomas, barrios y recibos sincronizados',
                    ],
                    notaRelacion:
                      'Esta operación solo limpia el almacenamiento local de tu navegador actual y vuelve a descargar datos limpios desde Supabase.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center"
              >
                Limpiar Caché Local
              </Button>
            </div>

            {/* 6. Restablecimiento Total del Sistema */}
            <div className="bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                    Reinicio Total
                  </span>
                </div>
                <h4 className="text-base font-bold text-rose-950 dark:text-rose-200">
                  Vaciar Todo el Sistema Operativo
                </h4>
                <p className="text-xs text-rose-800/80 dark:text-rose-300/80 leading-relaxed">
                  Elimina de manera permanente contribuyentes, tomas, barrios, manzanas, recibos y cortes para iniciar el sistema completamente desde cero.
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setModuloEnConfirmacion({
                    id: 'todo',
                    titulo: 'Todo el Sistema Operativo',
                    descripcion:
                      'Se eliminarán de forma permanente absolutamente todos los contribuyentes, tomas de agua, barrios, manzanas, recibos y cortes de tu organización.',
                    eliminara: [
                      `${totalPersonasCount} contribuyentes`,
                      `${totalTomasCount} tomas de agua`,
                      `${totalManzanasCount} barrios y manzanas`,
                      `${totalPagosCount} recibos y cortes de deuda`,
                    ],
                    conservara: [
                      'Datos de tu organización y logotipo',
                      'Configuración de tarifas y usuarios/cajeros',
                    ],
                    notaRelacion:
                      'El vaciado se ejecuta en el orden jerárquico exacto (detalles -> recibos -> cortes -> tomas -> contribuyentes -> manzanas) sin conflictos.',
                  });
                  setPalabraConfirmacion('');
                }}
                className="w-full justify-center bg-rose-600 hover:bg-rose-700 border-rose-600 text-white"
              >
                Vaciar Todo el Sistema
              </Button>
            </div>
          </div>

          {/* Modal de Confirmación de Vaciado Permanente */}
          <ConfirmarVaciadoModal
            modulo={moduloEnConfirmacion}
            palabraConfirmacion={palabraConfirmacion}
            onPalabraChange={setPalabraConfirmacion}
            ejecutando={ejecutandoVaciado}
            onConfirmar={handleConfirmarVaciado}
            onCerrar={() => {
              if (!ejecutandoVaciado) {
                setModuloEnConfirmacion(null);
                setPalabraConfirmacion('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
