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
  const [tabActiva, setTabActiva] = useState<'tarifas' | 'vistas' | 'cargos' | 'mantenimiento'>('tarifas');
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
        .select('*, autor:perfiles!creado_por(id, nombre_completo)')
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

    const cuotaNum = Number.parseFloat(cuotaBase);
    const recargoNum = Number.parseFloat(recargoMora);
    const anioNum = Number.parseInt(anioVigencia, 10);
    const registrosNum = normalizarRegistrosPorPagina(registrosPorPagina);

    if (Number.isNaN(cuotaNum) || cuotaNum <= 0) {
      sileo.error({
        title: 'Cuota inválida',
        description: 'La cuota base debe ser un número mayor a cero.',
      });
      return;
    }

    if (Number.isNaN(recargoNum) || recargoNum < 0) {
      sileo.error({
        title: 'Recargo inválido',
        description: 'El recargo por mora debe ser cero o positivo.',
      });
      return;
    }

    if (Number.isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
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

  // Guardar exclusivamente las Preferencias de Vista y Paginación
  const handleGuardarVistas = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!organizacion?.id) return;

    try {
      setGuardando(true);
      const registrosNum = normalizarRegistrosPorPagina(registrosPorPagina);
      guardarRegistrosPorPagina(registrosNum);
      setRegistrosPorPagina(registrosNum);

      const nuevoConfig = {
        ...(organizacion.config || {}),
        registros_por_pagina: registrosNum,
      };

      const { error } = await supabase
        .from('organizaciones')
        .update({
          config: nuevoConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizacion.id);

      if (error) throw error;

      setOrganizacion({
        ...organizacion,
        config: nuevoConfig,
      });

      sileo.success({
        title: 'Preferencias guardadas',
        description: `Se configuró la visualización a ${registrosNum} filas por página.`,
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al guardar preferencia',
        description: obtenerMensajeError(err, 'No se pudo guardar la configuración de vista.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  // Aplicar cargo mensual o extraordinario a las tomas activas
  const handleAplicarCargo = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNum = Number.parseFloat(montoCargo);
    if (Number.isNaN(montoNum) || montoNum <= 0) {
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
              setTabActiva(val as 'tarifas' | 'vistas' | 'cargos' | 'mantenimiento')
            }
            items={[
              {
                value: 'tarifas',
                label: 'Tarifas y Cuotas',
                icon: <Banknote />,
              },
              {
                value: 'vistas',
                label: 'Preferencias de Vista',
                icon: <ListFilter />,
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
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* 2A. Medidores Radiales de Tarifas Actuales */}
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
              tone="cyan"
              icon={<Calendar />}
              label="Año de Vigencia"
              value={anioVigencia}
              hint="Ejercicio fiscal activo"
            />
            <Card
              tone={permitirOffline ? 'green' : 'neutral'}
              icon={permitirOffline ? <Wifi /> : <WifiOff />}
              label="Cobro Offline"
              value={permitirOffline ? 'Activo' : 'Inactivo'}
              progress={permitirOffline ? 1 : 0}
              hint="Permite cobrar sin internet"
            />
          </CardGroup>

          {/* 3A. Formulario de Tarifas a lo ancho completo (Eje X) */}
          <form onSubmit={handleGuardar} className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Asignar Cuota Base y Tarifas Comunitarias
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configura las tarifas comunitarias de agua potable y el ejercicio fiscal
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

            {/* Bloque 1: Tarifas y Cuotas Comunitarias */}
            <div className="space-y-4">
              <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-blue-500" />
                  <span>Tarifas y Cuotas de Cobro</span>
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="tarifa-cuota-base"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Cuota Base Mensual ($) *
                  </label>
                  <Input
                    id="tarifa-cuota-base"
                    type="number"
                    step="0.50"
                    min="1"
                    value={cuotaBase}
                    onChange={(e) => setCuotaBase(e.target.value)}
                    placeholder="Ej: 50.00"
                    required
                  />
                  <p className="text-[11px] text-slate-400">Monto base por toma al mes.</p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="tarifa-recargo-mora"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Recargo por Mora Mensual ($)
                  </label>
                  <Input
                    id="tarifa-recargo-mora"
                    type="number"
                    step="0.50"
                    min="0"
                    value={recargoMora}
                    onChange={(e) => setRecargoMora(e.target.value)}
                    placeholder="Ej: 10.00"
                  />
                  <p className="text-[11px] text-slate-400">Por mes vencido (0 si no aplica).</p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="tarifa-anio-vigencia"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Año de Vigencia *
                  </label>
                  <Input
                    id="tarifa-anio-vigencia"
                    type="number"
                    min="2020"
                    max="2050"
                    value={anioVigencia}
                    onChange={(e) => setAnioVigencia(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-400">Ejercicio fiscal correspondiente.</p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="tarifa-moneda"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Moneda *
                  </label>
                  <Input
                    id="tarifa-moneda"
                    type="text"
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                    placeholder="MXN"
                    required
                  />
                  <p className="text-[11px] text-slate-400">Código de divisa local.</p>
                </div>
              </div>
            </div>

            {/* Bloque 2: Modalidad Operativa y Justificación */}
            <div className="space-y-4">
              <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                  <span>Modalidad Operativa y Justificación</span>
                </h4>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8 space-y-1.5">
                  <label
                    htmlFor="tarifa-descripcion"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Acuerdo de Asamblea / Justificación (Opcional)
                  </label>
                  <textarea
                    id="tarifa-descripcion"
                    rows={2}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Aprobada en asamblea de ejidatarios el 15 de enero para obras del pozo profundo..."
                    className="w-full px-4 py-2 text-sm rounded-xl bg-transparent border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="lg:col-span-4 pt-6">
                  <label
                    htmlFor="tarifa-permitir-offline"
                    className="flex items-start gap-3 cursor-pointer select-none"
                  >
                    <input
                      id="tarifa-permitir-offline"
                      type="checkbox"
                      checked={permitirOffline}
                      onChange={(e) => setPermitirOffline(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                        Permitir cobro sin conexión (Offline)
                      </span>
                      <span className="text-xs text-slate-400 block">
                        Habilita cobrar en campo o durante fallas de internet.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Botón de Guardado de Tarifas */}
            <div className="pt-4 border-t border-dashed border-slate-300 dark:border-[#26345C] flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={guardando}
                icon={<Save className="w-4 h-4" />}
              >
                Guardar Tarifas y Cuotas
              </Button>
            </div>
          </form>
        </div>
      )}

      {tabActiva === 'vistas' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* 2. Medidores Radiales de Paginación y Vista (Círculos del Sistema) */}
          <CardGroup>
            <Card
              tone="purple"
              icon={<ListFilter />}
              label="Límite por Página"
              value={registrosPorPagina}
              unit="filas"
              progress={registrosPorPagina / 50}
              hint="Registros activos por tabla"
            />
            <Card
              tone="blue"
              icon={<Layers />}
              label="Escala de Densidad"
              value={`${Math.round((registrosPorPagina / 50) * 100)}%`}
              progress={registrosPorPagina / 50}
              hint="Del límite máx. (50 filas)"
            />
            <Card
              tone="cyan"
              icon={<Users />}
              label="Módulos Vinculados"
              value={4}
              unit="tablas"
              progress={1}
              hint="Padrón, Tomas, Barrios, Censo"
            />
            <Card
              tone="green"
              icon={<CheckCircle2 />}
              label="Persistencia"
              value="Activa"
              progress={1}
              hint="Sincronizado en tu cuenta"
            />
          </CardGroup>

          {/* 3. Panel de Configuración de Vista (Sin cajas genéricas) */}
          <div className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Preferencias de Vista y Paginación de Tablas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Define cuántos registros se cargan por pantalla en todas las listas del sistema para optimizar rendimiento y navegación
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

            {/* Selector Rápido en Círculos (En lugar de rectángulos) */}
            <div className="space-y-4">
              <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-purple-500" />
                  <span>Selección Rápida de Registros por Página</span>
                </h4>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Elige uno de los círculos de densidad o ajusta el deslizador inferior:
                </p>

                {/* Fila de Círculos Numéricos */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1">
                  {[5, 10, 15, 20, 25, 30, 40, 50].map((num) => {
                    const activo = registrosPorPagina === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setRegistrosPorPagina(num);
                          guardarRegistrosPorPagina(num);
                        }}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 transition-all duration-200 ${
                          activo
                            ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold shadow-sm scale-105 ring-4 ring-blue-500/20'
                            : 'border-dashed border-slate-300 dark:border-[#26345C] hover:border-blue-400 text-slate-700 dark:text-slate-300 hover:scale-102 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <span className="font-mono text-base sm:text-xl font-black tracking-tight leading-none">
                          {num}
                        </span>
                        <span
                          className={`text-[9px] sm:text-[10px] tracking-wider uppercase font-semibold mt-0.5 ${
                            activo
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-400 group-hover:text-slate-500'
                          }`}
                        >
                          filas
                        </span>
                        {activo && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xs">
                            <CheckCircle2 className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Ajuste Deslizador y Numérico Exacto */}
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-[#26345C]">
                <div className="sm:col-span-8 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label
                      htmlFor="tarifa-registros-rango"
                      className="text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]"
                    >
                      Ajuste gradual por barra:
                    </label>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                      {registrosPorPagina} registros por vista
                    </span>
                  </div>
                  <input
                    id="tarifa-registros-rango"
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={registrosPorPagina}
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      setRegistrosPorPagina(val);
                      guardarRegistrosPorPagina(val);
                    }}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>5 (mínimo)</span>
                    <span>25</span>
                    <span>50 (máximo)</span>
                  </div>
                </div>

                <div className="sm:col-span-4 space-y-1.5">
                  <label
                    htmlFor="tarifa-registros-manual"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Límite manual exacto
                  </label>
                  <Input
                    id="tarifa-registros-manual"
                    type="number"
                    min={5}
                    max={50}
                    value={registrosPorPagina}
                    onChange={(e) => {
                      const val = Math.min(50, Math.max(5, Number.parseInt(e.target.value, 10) || 5));
                      setRegistrosPorPagina(val);
                      guardarRegistrosPorPagina(val);
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Impacto en Módulos Vinculados */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" />
                  <span>Módulos que Utilizan Esta Preferencia</span>
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span>Padrón de Personas</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Carga lotes de <strong className="text-blue-600 dark:text-blue-400">{registrosPorPagina}</strong> contribuyentes con búsqueda rápida.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Droplets className="w-4 h-4 text-cyan-500" />
                    <span>Padrón de Tomas</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Muestra <strong className="text-cyan-600 dark:text-cyan-400">{registrosPorPagina}</strong> contratos con filtrado por barrio y estado.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <MapPin className="w-4 h-4 text-purple-500" />
                    <span>Barrios y Manzanas</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Listados territoriales compactos de <strong className="text-purple-600 dark:text-purple-400">{registrosPorPagina}</strong> filas.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26345C] space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Database className="w-4 h-4 text-emerald-500" />
                    <span>Censo Excel</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Previsualiza bloques de <strong className="text-emerald-600 dark:text-emerald-400">{registrosPorPagina}</strong> filas sin saturar la memoria.
                  </p>
                </div>
              </div>
            </div>

            {/* Simulación Dinámica de Paginación */}
            <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-[#26345C] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Simulación de Paginación (Padrón de 100 registros)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Con tu configuración actual se distribuirán en {Math.ceil(100 / registrosPorPagina)} páginas navegables.
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: Math.min(6, Math.ceil(100 / registrosPorPagina)) }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-7 h-7 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-all ${
                      idx === 0
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'border border-dashed border-slate-300 dark:border-[#26345C] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                ))}
                {Math.ceil(100 / registrosPorPagina) > 6 && (
                  <span className="text-xs text-slate-400 px-1 font-mono">...</span>
                )}
              </div>
            </div>

            {/* Botón de Guardado de Vistas */}
            <div className="pt-4 border-t border-dashed border-slate-300 dark:border-[#26345C] flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="md"
                isLoading={guardando}
                onClick={handleGuardarVistas}
                icon={<Save className="w-4 h-4" />}
              >
                Guardar Preferencias de Vista
              </Button>
            </div>
          </div>
        </div>
      )}

      {tabActiva === 'cargos' && (
        <div className="space-y-8 animate-in fade-in duration-200">
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
              value={`$${(tomasActivasCount * (Number.parseFloat(montoCargo) || cuotaActualNum)).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}
              unit={monedaActual}
              hint={`${tomasActivasCount} tomas × $${(Number.parseFloat(montoCargo) || cuotaActualNum).toFixed(0)}`}
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

          {/* 3B. Formulario de Emisión a Ancho Completo (Eje X en Laptop/PC/Web) */}
          <div className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Emisión de Corte Mensual y Cargos al Padrón</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Genera la cuota ordinaria de agua potable del periodo o aplica cargos extraordinarios a todas las tomas activas
                </p>
              </div>
            </div>

            <form onSubmit={handleAplicarCargo} className="w-full space-y-6">
              {/* Sección 1: Modalidad Operativa (Tarjetas Horizontales con Identidad en Círculo) */}
              <div className="space-y-3">
                <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span>1. Modalidad del Cargo</span>
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleCambiarTipoCargo('mensual')}
                    className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                      tipoCargo === 'mensual'
                        ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-dashed border-slate-300 dark:border-[#26345C] text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center shrink-0 ${
                        tipoCargo === 'mensual'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-600 dark:text-blue-400'
                          : 'border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold uppercase tracking-wide">Corte Mensual Ordinario</span>
                        {tipoCargo === 'mensual' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-xs opacity-75 font-normal block mt-0.5 leading-relaxed">
                        Cuota base periódica (1 corte por mes). Exenta automáticamente a tomas con pagos adelantados.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCambiarTipoCargo('extraordinario')}
                    className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                      tipoCargo === 'extraordinario'
                        ? 'border-purple-600 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-dashed border-slate-300 dark:border-[#26345C] text-slate-600 dark:text-slate-400 hover:border-purple-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center shrink-0 ${
                        tipoCargo === 'extraordinario'
                          ? 'border-purple-500 bg-purple-500/20 text-purple-600 dark:text-purple-400'
                          : 'border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold uppercase tracking-wide">Cargo Extraordinario</span>
                        {tipoCargo === 'extraordinario' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-xs opacity-75 font-normal block mt-0.5 leading-relaxed">
                        Cooperación de asamblea, faena o reparación urgente. Se suma al saldo de todas las tomas activas.
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Sección 2: Parámetros del Cargo a lo Ancho Completo (Desktop: 1 fila) */}
              <div className="space-y-3">
                <div className="border-b border-dashed border-slate-300 dark:border-[#26345C] pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-blue-500" />
                    <span>2. Parámetros de Facturación y Vigencia</span>
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 items-end">
                  {/* Mes del Periodo */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label
                      htmlFor="cargo-mes-periodo"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Mes del Periodo *
                    </label>
                    <select
                      id="cargo-mes-periodo"
                      value={mesCargo}
                      onChange={(e) => handleCambiarMesCargo(Number.parseInt(e.target.value, 10))}
                      className="w-full text-sm bg-transparent border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    >
                      {MESES.map((nombre, idx) => (
                        <option
                          key={nombre}
                          value={idx + 1}
                          className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Año */}
                  <div className="lg:col-span-2 space-y-1.5">
                    <label
                      htmlFor="cargo-anio-periodo"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Año *
                    </label>
                    <Input
                      id="cargo-anio-periodo"
                      type="number"
                      min="2020"
                      max="2050"
                      value={anioCargo}
                      onChange={(e) =>
                        handleCambiarAnioCargo(Number.parseInt(e.target.value, 10) || anioActualNum)
                      }
                      required
                    />
                  </div>

                  {/* Monto Unitario */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label
                      htmlFor="cargo-monto-unitario"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Monto a Cargar ($ {monedaActual}) *
                    </label>
                    <Input
                      id="cargo-monto-unitario"
                      type="number"
                      step="0.50"
                      min="1"
                      value={montoCargo}
                      onChange={(e) => setMontoCargo(e.target.value)}
                      placeholder="Ej: 50.00"
                      required
                    />
                  </div>

                  {/* Botón Aplicar en la misma fila en Desktop */}
                  <div className="lg:col-span-4">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={aplicandoCargo}
                      disabled={!!corteSeleccionadoExistente || tomasActivasCount === 0}
                      className="w-full justify-center h-[42px]"
                      icon={<CheckCircle2 className="w-4 h-4" />}
                    >
                      {corteSeleccionadoExistente
                        ? `Corte de ${MESES[mesCargo - 1]} Ya Aplicado`
                        : tipoCargo === 'mensual'
                          ? `Aplicar Corte de ${MESES[mesCargo - 1]} ${anioCargo}`
                          : 'Aplicar Cargo Extraordinario'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sección 3: Concepto y Resumen de Proyección */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8 space-y-1.5">
                  <label
                    htmlFor="cargo-concepto"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Concepto / Referencia del Cargo *
                  </label>
                  <Input
                    id="cargo-concepto"
                    type="text"
                    value={conceptoCargo}
                    onChange={(e) => setConceptoCargo(e.target.value)}
                    placeholder="Ej: Cuota mensual ordinaria o cooperación para bomba sumergible..."
                    required
                  />
                  <p className="text-[11px] text-slate-400">
                    {tipoCargo === 'mensual'
                      ? 'Las tomas que ya cubrieron este periodo por adelantado quedarán exentas automáticamente.'
                      : 'Se sumará íntegramente este monto al saldo de todas las tomas activas.'}
                  </p>
                </div>

                <div className="lg:col-span-4 p-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-[#26345C] space-y-1.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Tomas sujetas al cargo:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">
                      {tomasActivasCount} activas
                    </strong>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-dashed border-slate-200 dark:border-[#26345C] pt-1.5">
                    <span>Emisión proyectada:</span>
                    <strong className="text-blue-600 dark:text-blue-400 font-mono text-sm font-black">
                      ${(tomasActivasCount * (Number.parseFloat(montoCargo) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {monedaActual}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Notificación si el corte mensual ya existe */}
              {corteSeleccionadoExistente && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-bold text-sm block">
                      El corte mensual de {MESES[mesCargo - 1]} {anioCargo} ya fue emitido
                    </span>
                    <span className="text-xs opacity-90 block mt-0.5 leading-relaxed">
                      Registrado el{' '}
                      {new Date(corteSeleccionadoExistente.created_at).toLocaleDateString(
                        'es-MX',
                        { day: '2-digit', month: 'short', year: 'numeric' }
                      )}{' '}
                      ({corteSeleccionadoExistente.tomas_afectadas} tomas cargadas). Para evitar duplicidad de cobros y proteger el saldo de los contribuyentes, el sistema no permite re-aplicar un corte mensual sobre un mes ya cerrado.
                    </span>
                  </div>
                </div>
              )}
            </form>

            {/* Bitácora de Cortes a Ancho Completo */}
            <div className="space-y-4 pt-6 border-t border-dashed border-slate-300 dark:border-[#26345C]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Bitácora de Cortes y Cargos Aplicados ({cargosHistorial.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Historial auditable de emisiones de deuda aplicadas al padrón en tiempo real
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
                <div className="py-16 text-center text-slate-500 space-y-2">
                  <Clock className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Aún no se han aplicado cortes mensuales ni cargos masivos
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Usa el formulario superior para cargar la cuota base a las tomas activas al inicio de cada mes.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periodo</TableHead>
                      <TableHead>Concepto / Tipo</TableHead>
                      <TableHead>Tomas Afectadas</TableHead>
                      <TableHead>Registrado Por</TableHead>
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

                      const autorNombre = (c as unknown as { autor?: { nombre_completo?: string } }).autor?.nombre_completo || 'Sistema';

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

                          <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                            <span className="font-medium text-slate-800 dark:text-slate-200 block">
                              {autorNombre}
                            </span>
                          </TableCell>

                          <TableCell className="text-right font-extrabold text-sm text-blue-600 dark:text-blue-400 whitespace-nowrap font-mono">
                            ${Number(c.total_generado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
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

          {/* 3C. Panel de Acciones de Depuración y Vaciado de Datos (Sin cajas genéricas) */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Módulos de Depuración y Vaciado de Datos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Operaciones auditadas para eliminar registros por módulo o reiniciar el sistema operativo
                </p>
              </div>
            </div>

            <div className="divide-y divide-dashed divide-slate-300 dark:divide-[#26345C] border-b border-dashed border-slate-300 dark:border-[#26345C]">
              {/* 1. Vaciar Contribuyentes y Tomas */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-blue-400/60 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Padrón de Contribuyentes
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {totalPersonasCount} registrados
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Elimina de manera permanente todos los contribuyentes registrados junto con sus tomas y recibos asociados. Conserva barrios y tarifas configuradas.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    className="hover:border-rose-400 hover:text-rose-600"
                  >
                    Vaciar Contribuyentes
                  </Button>
                </div>
              </div>

              {/* 2. Vaciar Solo Tomas de Agua */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-cyan-400/60 dark:border-cyan-500/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                    <Droplets className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Padrón de Tomas de Agua
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {totalTomasCount} conexiones
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Elimina permanentemente todas las tomas de agua y sus recibos, pero conserva intactos a los contribuyentes (quedan con 0 tomas) y la estructura barrial.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    className="hover:border-rose-400 hover:text-rose-600"
                  >
                    Vaciar Tomas
                  </Button>
                </div>
              </div>

              {/* 3. Vaciar Barrios, Secciones y Manzanas */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-purple-400/60 dark:border-purple-500/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Catálogo de Barrios y Manzanas
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {totalManzanasCount} zonas
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Elimina los barrios, secciones y manzanas registrados, desvinculando las tomas existentes sin borrarlas ni generar errores.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    className="hover:border-rose-400 hover:text-rose-600"
                  >
                    Vaciar Barrios
                  </Button>
                </div>
              </div>

              {/* 4. Vaciar Historial de Cobros, Recibos y Cortes */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-amber-400/60 dark:border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Historial de Cobros, Recibos y Cortes
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {totalPagosCount} recibos
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Elimina permanentemente todos los recibos emitidos, la bitácora de cortes mensuales y reinicia en $0.00 el saldo pendiente de las tomas activas.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    className="hover:border-rose-400 hover:text-rose-600"
                  >
                    Vaciar Cobros
                  </Button>
                </div>
              </div>

              {/* 5. Vaciar Caché Offline de este Dispositivo */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-slate-400/60 dark:border-slate-500/40 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Memoria Offline Local (IndexedDB)
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Dispositivo Local
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      Limpia únicamente la base de datos local guardada en este navegador sin borrar ningún dato de la nube en Supabase.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                  >
                    Limpiar Caché
                  </Button>
                </div>
              </div>

              {/* 6. Restablecimiento Total del Sistema */}
              <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-rose-500/5 dark:bg-rose-500/10 -mx-4 px-4 rounded-xl">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full border border-dashed border-rose-500 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-sm font-bold text-rose-700 dark:text-rose-300">
                        Vaciar Todo el Sistema Operativo
                      </h4>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                        Reinicio Total
                      </span>
                    </div>
                    <p className="text-xs text-rose-700/80 dark:text-rose-300/80 max-w-2xl leading-relaxed">
                      Elimina de manera permanente contribuyentes, tomas, barrios, manzanas, recibos y cortes para iniciar el sistema completamente desde cero.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-15 md:pl-0">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
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
                    className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white"
                  >
                    Vaciar Todo el Sistema
                  </Button>
                </div>
              </div>
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
