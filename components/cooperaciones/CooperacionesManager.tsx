'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  HeartHandshake,
  Calendar,
  Users,
  Droplets,
  Banknote,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  Plus,
  RefreshCw,
  AlertTriangle,
  Receipt,
  ArrowRight,
  ArrowLeft,
  Filter,
  ChevronRight,
  Check,
  FileText,
  Building2,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { fetchAllRows, insertInBatches } from '@/lib/supabase/fetch-all';
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
import { ReciboCooperacionModal } from './ReciboCooperacionModal';
import { ModalProrroga } from './ModalProrroga';
import { ModalNuevaCooperacion, type NuevaCooperacionData } from './ModalNuevaCooperacion';
import type { Persona, Toma, Organizacion } from '@/types/database';
import type {
  Cooperacion,
  CooperacionPadronItem,
  CooperacionAbono,
  TipoSujetoCooperacion,
  EstadoPadronCooperacion,
} from '@/types/cooperaciones';
import { obtenerMensajeError } from '@/lib/utils/errors';

export function CooperacionesManager() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [usuarioActualId, setUsuarioActualId] = useState<string | null>(null);

  // Datos base del padrón general
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [tomas, setTomas] = useState<(Toma & { persona?: Persona })[]>([]);

  // Listado de proyectos reales de cooperación
  const [cooperaciones, setCooperaciones] = useState<Cooperacion[]>([]);

  // Mapa de recaudación real acumulada por cooperación: { [cooperacion_id]: number }
  const [recaudadoPorCoop, setRecaudadoPorCoop] = useState<Record<string, number>>({});

  // ID de la cooperación seleccionada (null = Vista de Catálogo Principal)
  const [coopSeleccionadaId, setCoopSeleccionadaId] = useState<string | null>(null);

  // Padrón de aportantes vinculado a la cooperación seleccionada
  const [padron, setPadron] = useState<CooperacionPadronItem[]>([]);
  const [cargandoPadron, setCargandoPadron] = useState(false);

  // Filtros del Catálogo Principal
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [filtroEstadoCatalogo, setFiltroEstadoCatalogo] = useState<string>('todos');

  // Pestaña activa dentro del DETALLE de una cooperación
  const [tabDetalle, setTabDetalle] = useState<'abonos' | 'padron' | 'asamblea'>('abonos');

  // Ventanilla de Cobro de Abono (dentro del detalle)
  const [terminoBusquedaCobro, setTerminoBusquedaCobro] = useState('');
  const [itemSeleccionado, setItemSeleccionado] = useState<CooperacionPadronItem | null>(null);
  const [tipoPagoAbono, setTipoPagoAbono] = useState<'total' | 'parcial'>('total');
  const [montoAbonoInput, setMontoAbonoInput] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [notasAbono, setNotasAbono] = useState('');

  // Filtro del padrón (dentro del detalle)
  const [filtroEstadoPadron, setFiltroEstadoPadron] = useState<string>('todos');
  const [busquedaPadron, setBusquedaPadron] = useState('');

  // Modales
  const [modalNuevaOpen, setModalNuevaOpen] = useState(false);
  const [modalProrrogaOpen, setModalProrrogaOpen] = useState(false);
  const [modalReciboOpen, setModalReciboOpen] = useState(false);
  const [ultimoAbonoEmitido, setUltimoAbonoEmitido] = useState<CooperacionAbono | null>(null);
  const [ultimoCambio, setUltimoCambio] = useState<number | null>(null);

  // Cooperación actualmente seleccionada en vista detalle
  const coopActiva = useMemo(() => {
    if (!coopSeleccionadaId) return null;
    return cooperaciones.find((c) => c.id === coopSeleccionadaId) || null;
  }, [cooperaciones, coopSeleccionadaId]);

  // Tomas que pertenecen a la misma persona seleccionada en ventanilla
  const tomasDePersonaSeleccionada = useMemo(() => {
    if (!itemSeleccionado?.persona_id) return [];
    return tomas.filter((t) => t.persona_id === itemSeleccionado.persona_id);
  }, [itemSeleccionado, tomas]);

  // Si la obra es por toma, buscar otras tomas de este mismo titular en el padrón
  const otrasTomasMismoTitular = useMemo(() => {
    if (!itemSeleccionado || coopActiva?.tipo_sujeto !== 'toma') return [];
    return padron.filter(
      (p) => p.persona_id === itemSeleccionado.persona_id && p.id !== itemSeleccionado.id
    );
  }, [itemSeleccionado, coopActiva, padron]);

  /* ─────────────────────────────────────────────────────────────
     CARGA DE DATOS 100% REALES DESDE SUPABASE
  ───────────────────────────────────────────────────────────── */
  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);

      // 1. Obtener usuario y organización de sesión
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCargando(false);
        return;
      }
      setUsuarioActualId(user.id);

      const { data: perfilData } = await supabase
        .from('perfiles')
        .select('organizacion_id, organizacion:organizaciones(*)')
        .eq('id', user.id)
        .single();

      const orgId = perfilData?.organizacion_id;
      if (!orgId) {
        setCargando(false);
        return;
      }

      const org = (Array.isArray(perfilData.organizacion)
        ? perfilData.organizacion[0]
        : perfilData.organizacion) as unknown as Organizacion;
      setOrganizacion(org);

      // 2. Cargar tomas y personas reales de la organización sin límite de 1,000 filas
      const [personasCargadas, tomasCargadas, coopsRes] = await Promise.all([
        fetchAllRows<Persona>((from, to) =>
          supabase
            .from('personas')
            .select('*')
            .eq('organizacion_id', orgId)
            .is('deleted_at', null)
            .order('nombre_completo', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<Toma & { persona?: Persona }>((from, to) =>
          supabase
            .from('tomas')
            .select('*, persona:personas(*), manzana:manzanas(*)')
            .eq('organizacion_id', orgId)
            .is('deleted_at', null)
            .order('codigo_toma', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
        supabase
          .from('cooperaciones')
          .select('*')
          .eq('organizacion_id', orgId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      setPersonas(personasCargadas);
      setTomas(tomasCargadas);

      if (coopsRes.error) {
        // Si la tabla no existe aún en la base de datos, mostramos lista vacía
        setCooperaciones([]);
      } else {
        const listaCoops = (coopsRes.data || []) as unknown as Cooperacion[];
        setCooperaciones(listaCoops);

        // 3. Cargar recaudación real de todas las cooperaciones sin límite de 1,000 filas
        if (listaCoops.length > 0) {
          const abonosData = await fetchAllRows<any>((from, to) =>
            supabase
              .from('cooperacion_abonos')
              .select('monto_abono, padron:cooperacion_padron!inner(cooperacion_id)')
              .eq('organizacion_id', orgId)
              .range(from, to)
          );

          const mapaTotales: Record<string, number> = {};
          (abonosData || []).forEach((ab: any) => {
            const coopId = ab.padron?.cooperacion_id;
            if (coopId) {
              mapaTotales[coopId] = (mapaTotales[coopId] || 0) + Number(ab.monto_abono || 0);
            }
          });
          setRecaudadoPorCoop(mapaTotales);
        }
      }
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de sincronización',
        description: obtenerMensajeError(err, 'No se pudieron consultar los datos de cooperaciones.'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  /* ─────────────────────────────────────────────────────────────
     CARGA DEL PADRÓN REAL AL ENTRAR A UNA COOPERACIÓN
  ───────────────────────────────────────────────────────────── */
  const cargarPadronDeCoop = useCallback(
    async (coop: Cooperacion) => {
      try {
        setCargandoPadron(true);
        // Cargar 100% de los aportantes del padrón real paginando sin truncamiento a 1,000
        const padronData = await fetchAllRows<CooperacionPadronItem>((from, to) =>
          supabase
            .from('cooperacion_padron')
            .select(`
              *,
              persona:personas(*),
              toma:tomas(*),
              abonos:cooperacion_abonos(*)
            `)
            .eq('cooperacion_id', coop.id)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        );

        if (padronData && padronData.length > 0) {
          // Padrón real existente en la base de datos
          setPadron(padronData);
        } else {
          // Si el padrón de esta cooperación no se ha poblado aún en la BD,
          // lo generamos a partir de las tomas o personas reales de la organización
          // con cuota requerida y $0 pagado (nada inventado)
          const itemsUniverso = coop.tipo_sujeto === 'toma' ? tomas : personas;
          const rowsParaInsertar = itemsUniverso.map((item) => {
            const esToma = 'codigo_toma' in item;
            const perId = esToma ? (item as Toma).persona_id : (item as Persona).id;
            const tomId = esToma ? (item as Toma).id : null;

            return {
              organizacion_id: coop.organizacion_id,
              cooperacion_id: coop.id,
              persona_id: perId,
              toma_id: tomId,
              monto_requerido: coop.cuota_requerida,
              monto_pagado: 0,
              monto_pendiente: coop.cuota_requerida,
              cumplio_con_faena: false,
              estado: 'pendiente' as EstadoPadronCooperacion,
            };
          });

          if (rowsParaInsertar.length > 0) {
            await insertInBatches(supabase, 'cooperacion_padron', rowsParaInsertar, 150);
            const padronRecargado = await fetchAllRows<CooperacionPadronItem>((from, to) =>
              supabase
                .from('cooperacion_padron')
                .select(`
                  *,
                  persona:personas(*),
                  toma:tomas(*),
                  abonos:cooperacion_abonos(*)
                `)
                .eq('cooperacion_id', coop.id)
                .order('created_at', { ascending: true })
                .range(from, to)
            );
            setPadron(padronRecargado);
          } else {
            setPadron([]);
          }
        }
      } catch (err: unknown) {
        console.error('Error cargando padrón:', err);
        setPadron([]);
      } finally {
        setCargandoPadron(false);
      }
    },
    [tomas, personas]
  );

  // Al seleccionar una cooperación para entrar a su vista detalle
  const handleEntrarACooperacion = (coop: Cooperacion) => {
    setCoopSeleccionadaId(coop.id);
    setTabDetalle('abonos');
    setItemSeleccionado(null);
    setTerminoBusquedaCobro('');
    cargarPadronDeCoop(coop);
  };

  const handleVolverAlCatalogo = () => {
    setCoopSeleccionadaId(null);
    setItemSeleccionado(null);
    setPadron([]);
  };

  /* ─────────────────────────────────────────────────────────────
     MÉTRICAS GLOBALES 100% REALES (CATÁLOGO PRINCIPAL)
  ───────────────────────────────────────────────────────────── */
  const metricasGlobales = useMemo(() => {
    const total = cooperaciones.length;
    const activas = cooperaciones.filter(
      (c) => c.estado === 'activa' || c.estado === 'prorrogada'
    ).length;
    const concluidas = cooperaciones.filter((c) => c.estado === 'concluida').length;

    // Presupuesto global acordado en todas las campañas
    const metaGlobal = cooperaciones.reduce((acc, c) => acc + (Number(c.meta_financiera) || 0), 0);

    // Recaudación global real (suma de abonos reales)
    const totalRecaudadoGlobal = Object.values(recaudadoPorCoop).reduce(
      (acc, val) => acc + (Number(val) || 0),
      0
    );

    const saldoPendienteGlobal = Math.max(0, metaGlobal - totalRecaudadoGlobal);
    const cumplimientoPct =
      metaGlobal > 0 ? Math.min(100, Math.round((totalRecaudadoGlobal / metaGlobal) * 100)) : 0;
    const pctConcluidas = total > 0 ? Math.round((concluidas / total) * 100) : 0;

    return {
      total,
      activas,
      concluidas,
      metaGlobal,
      totalRecaudadoGlobal,
      saldoPendienteGlobal,
      cumplimientoPct,
      pctConcluidas,
    };
  }, [cooperaciones, recaudadoPorCoop]);

  // Filtrado del Catálogo
  const cooperacionesFiltradas = useMemo(() => {
    return cooperaciones.filter((coop) => {
      const coincideBusqueda =
        coop.nombre.toLowerCase().includes(busquedaCatalogo.toLowerCase()) ||
        (coop.descripcion || '').toLowerCase().includes(busquedaCatalogo.toLowerCase());

      const coincideEstado =
        filtroEstadoCatalogo === 'todos' || coop.estado === filtroEstadoCatalogo;

      return coincideBusqueda && coincideEstado;
    });
  }, [cooperaciones, busquedaCatalogo, filtroEstadoCatalogo]);

  /* ─────────────────────────────────────────────────────────────
     MÉTRICAS ESPECÍFICAS DE LA OBRA ACTIVA (DETALLE)
  ───────────────────────────────────────────────────────────── */
  const metricasObraActiva = useMemo(() => {
    if (!coopActiva) return null;

    const totalAportantes = padron.length;
    const recaudado = padron.reduce((acc, p) => acc + (Number(p.monto_pagado) || 0), 0);
    const meta = Number(coopActiva.meta_financiera) || 0;
    const porcentajeRecaudado = meta > 0 ? Math.min(100, Math.round((recaudado / meta) * 100)) : 0;

    const liquidados = padron.filter((p) => p.estado === 'liquidado').length;
    const enAbonos = padron.filter((p) => p.estado === 'parcial').length;
    const pendientes = padron.filter((p) => p.estado === 'pendiente').length;
    const faenas = padron.filter((p) => p.cumplio_con_faena || p.estado === 'exento_faena').length;

    const porcentajeCumplimientoPadron =
      totalAportantes > 0 ? Math.round(((liquidados + faenas) / totalAportantes) * 100) : 0;

    const saldoPendienteTotal = Math.max(0, meta - recaudado);

    const fechaLimiteFin = coopActiva.fecha_prorroga || coopActiva.fecha_limite;
    const hoy = new Date();
    const fin = new Date(fechaLimiteFin);
    const diferenciaMs = fin.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));

    return {
      totalAportantes,
      recaudado,
      meta,
      porcentajeRecaudado,
      liquidados,
      enAbonos,
      pendientes,
      faenas,
      porcentajeCumplimientoPadron,
      saldoPendienteTotal,
      diasRestantes,
      fechaLimiteFin,
    };
  }, [coopActiva, padron]);

  /* ─────────────────────────────────────────────────────────────
     OPERACIONES: NUEVA COOPERACIÓN, PRÓRROGA, ABONO, FAENA
  ───────────────────────────────────────────────────────────── */
  const handleCrearCooperacion = async (datos: NuevaCooperacionData) => {
    if (!organizacion?.id) {
      sileo.error({
        title: 'Error de organización',
        description: 'No se identificó la organización activa en la sesión.',
      });
      return;
    }

    try {
      setGuardando(true);

      let nuevaCoop: Cooperacion | null = null;

      // 1. Intentar registrar a través de la RPC transaccional
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('crear_campana_cooperacion', {
        p_nombre: datos.nombre,
        p_descripcion: datos.descripcion || '',
        p_meta_financiera: datos.meta_financiera,
        p_cuota_requerida: datos.cuota_requerida,
        p_tipo_sujeto: datos.tipo_sujeto,
        p_fecha_inicio: datos.fecha_inicio,
        p_fecha_limite: datos.fecha_limite,
        p_permite_abonos: datos.permite_abonos,
        p_permite_faena: datos.permite_faena,
        p_valor_equivalente_faena: datos.cuota_requerida,
      });

      if (!rpcErr && (rpcRes as any)?.cooperacion_id) {
        const { data: cData } = await supabase
          .from('cooperaciones')
          .select('*')
          .eq('id', (rpcRes as any).cooperacion_id)
          .single();
        if (cData) {
          nuevaCoop = cData as unknown as Cooperacion;
        }
      }

      // 2. Fallback directo si la RPC aún no fue migrada en Supabase
      if (!nuevaCoop) {
        const payload = {
          organizacion_id: organizacion.id,
          nombre: datos.nombre,
          descripcion: datos.descripcion || null,
          meta_financiera: datos.meta_financiera,
          cuota_requerida: datos.cuota_requerida,
          tipo_sujeto: datos.tipo_sujeto,
          fecha_inicio: datos.fecha_inicio,
          fecha_limite: datos.fecha_limite,
          permite_abonos: datos.permite_abonos,
          permite_faena: datos.permite_faena,
          valor_equivalente_faena: datos.cuota_requerida,
          estado: 'activa',
          creado_por: usuarioActualId || null,
        };

        const { data: coopGuardada, error: errInsert } = await supabase
          .from('cooperaciones')
          .insert([payload])
          .select()
          .single();

        if (errInsert || !coopGuardada) {
          throw errInsert || new Error('No se pudo registrar la cooperación.');
        }

        nuevaCoop = coopGuardada as unknown as Cooperacion;

        // Poblar padrón: si es por toma se genera una cuota por cada toma; si es por persona una cuota por persona
        const itemsUniverso = datos.tipo_sujeto === 'toma' ? tomas : personas;
        const rowsParaInsertar = itemsUniverso.map((item) => {
          const esToma = 'codigo_toma' in item;
          return {
            organizacion_id: organizacion.id,
            cooperacion_id: nuevaCoop!.id,
            persona_id: esToma ? (item as Toma).persona_id : (item as Persona).id,
            toma_id: esToma ? (item as Toma).id : null,
            monto_requerido: datos.cuota_requerida,
            monto_pagado: 0,
            monto_pendiente: datos.cuota_requerida,
            cumplio_con_faena: false,
            estado: 'pendiente' as EstadoPadronCooperacion,
          };
        });

        if (rowsParaInsertar.length > 0) {
          await insertInBatches(supabase, 'cooperacion_padron', rowsParaInsertar, 150);
        }
      }

      setCooperaciones((prev) => [nuevaCoop!, ...prev]);
      setModalNuevaOpen(false);

      sileo.success({
        title: 'Cooperación registrada',
        description: `Se dio de alta "${nuevaCoop.nombre}" (${datos.tipo_sujeto === 'toma' ? 'por toma física' : 'por titular'}).`,
      });

      handleEntrarACooperacion(nuevaCoop);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al registrar',
        description: obtenerMensajeError(err, 'Verifica la conexión a Supabase y la migración.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleConfirmarProrroga = async (nuevaFecha: string, motivo: string) => {
    if (!coopActiva) return;
    try {
      setGuardando(true);

      const { error: errUpdate } = await supabase
        .from('cooperaciones')
        .update({
          fecha_prorroga: nuevaFecha,
          motivo_prorroga: motivo,
          estado: 'prorrogada',
          updated_at: new Date().toISOString(),
        })
        .eq('id', coopActiva.id);

      if (errUpdate) throw errUpdate;

      const actualizada: Cooperacion = {
        ...coopActiva,
        fecha_prorroga: nuevaFecha,
        motivo_prorroga: motivo,
        estado: 'prorrogada',
        updated_at: new Date().toISOString(),
      };

      setCooperaciones((prev) => prev.map((c) => (c.id === coopActiva.id ? actualizada : c)));

      sileo.success({
        title: 'Prórroga concedida',
        description: `La fecha límite fue aplazada hasta el ${new Date(nuevaFecha).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}.`,
      });

      setModalProrrogaOpen(false);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de prórroga',
        description: obtenerMensajeError(err, 'No se pudo actualizar la fecha.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleAlternarEstadoConcluida = async () => {
    if (!coopActiva) return;
    try {
      setGuardando(true);
      const nuevoEstado = coopActiva.estado === 'concluida' ? 'activa' : 'concluida';

      const { error: errUpdate } = await supabase
        .from('cooperaciones')
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', coopActiva.id);

      if (errUpdate) throw errUpdate;

      const actualizada: Cooperacion = {
        ...coopActiva,
        estado: nuevoEstado,
        updated_at: new Date().toISOString(),
      };

      setCooperaciones((prev) => prev.map((c) => (c.id === coopActiva.id ? actualizada : c)));

      sileo.success({
        title: nuevoEstado === 'concluida' ? 'Obra marcada como Concluida' : 'Obra reactivada',
        description:
          nuevoEstado === 'concluida'
            ? 'La campaña ha sido cerrada en asamblea.'
            : 'La campaña vuelve a admitir cobros en ventanilla.',
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al cambiar estado',
        description: obtenerMensajeError(err, 'No se pudo actualizar.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  // Registrar abono real en la BD
  const handleRegistrarAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSeleccionado || !coopActiva || !organizacion?.id) return;

    const montoAbonar =
      tipoPagoAbono === 'total'
        ? itemSeleccionado.monto_pendiente
        : Number(montoAbonoInput) || 0;

    if (montoAbonar <= 0) {
      sileo.warning({
        title: 'Monto inválido',
        description: 'Ingresa una cantidad mayor a cero para abonar.',
      });
      return;
    }

    if (montoAbonar > itemSeleccionado.monto_pendiente) {
      sileo.warning({
        title: 'Abono excedente',
        description: `El adeudo pendiente es de $${itemSeleccionado.monto_pendiente.toFixed(2)} MXN.`,
      });
      return;
    }

    try {
      const nuevoSaldoRestante = Math.max(0, itemSeleccionado.monto_pendiente - montoAbonar);
      const nuevoTotalPagado = itemSeleccionado.monto_pagado + montoAbonar;
      const nuevoEstado: EstadoPadronCooperacion =
        nuevoSaldoRestante <= 0 ? 'liquidado' : 'parcial';

      const folioGenerado = `COOP-${Date.now().toString().slice(-6)}`;

      // 1. Intentar registrar a través de la función RPC transaccional
      let nuevoAbono: CooperacionAbono | null = null;
      const { data: rpcAbono, error: errRpcAbono } = await supabase.rpc(
        'registrar_abono_cooperacion',
        {
          p_padron_id: itemSeleccionado.id,
          p_monto_abono: montoAbonar,
          p_metodo_pago: metodoPago,
          p_notas: notasAbono || null,
        }
      );

      if (!errRpcAbono && (rpcAbono as any)?.abono_id) {
        nuevoAbono = {
          id: (rpcAbono as any).abono_id,
          organizacion_id: organizacion.id,
          padron_id: itemSeleccionado.id,
          folio_recibo: (rpcAbono as any).folio_recibo,
          monto_abono: montoAbonar,
          saldo_anterior: itemSeleccionado.monto_pendiente,
          saldo_restante: nuevoSaldoRestante,
          metodo_pago: metodoPago,
          cajero_id: usuarioActualId || undefined,
          notas: notasAbono || undefined,
          fecha_pago: new Date().toISOString(),
        };
      } else {
        // Fallback transaccional directo por tablas
        const { data: abonoGuardado, error: errAbono } = await supabase
          .from('cooperacion_abonos')
          .insert([
            {
              organizacion_id: organizacion.id,
              padron_id: itemSeleccionado.id,
              folio_recibo: folioGenerado,
              monto_abono: montoAbonar,
              saldo_anterior: itemSeleccionado.monto_pendiente,
              saldo_restante: nuevoSaldoRestante,
              metodo_pago: metodoPago,
              cajero_id: usuarioActualId || null,
              notas: notasAbono || null,
              fecha_pago: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (errAbono || !abonoGuardado) {
          throw errAbono || new Error('Error al registrar el abono.');
        }

        // 2. Actualizar el saldo del aportante en el padrón
        await supabase
          .from('cooperacion_padron')
          .update({
            monto_pagado: nuevoTotalPagado,
            monto_pendiente: nuevoSaldoRestante,
            estado: nuevoEstado,
            fecha_liquidacion: nuevoEstado === 'liquidado' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemSeleccionado.id);

        nuevoAbono = abonoGuardado as unknown as CooperacionAbono;
      }

      // Actualizar estado local
      const padronActualizado = padron.map((p) => {
        if (p.id === itemSeleccionado.id) {
          return {
            ...p,
            monto_pagado: nuevoTotalPagado,
            monto_pendiente: nuevoSaldoRestante,
            estado: nuevoEstado,
            fecha_liquidacion: nuevoEstado === 'liquidado' ? new Date().toISOString() : null,
            abonos: [nuevoAbono, ...(p.abonos || [])],
          };
        }
        return p;
      });

      setPadron(padronActualizado);

      // Actualizar recaudación global
      setRecaudadoPorCoop((prev) => ({
        ...prev,
        [coopActiva.id]: (prev[coopActiva.id] || 0) + montoAbonar,
      }));

      // Calcular cambio si fue en efectivo
      const efRecibido = Number(efectivoRecibido) || 0;
      const cambio = efRecibido > montoAbonar ? efRecibido - montoAbonar : 0;
      setUltimoCambio(cambio);
      setUltimoAbonoEmitido(nuevoAbono);

      setMontoAbonoInput('');
      setEfectivoRecibido('');
      setNotasAbono('');
      setItemSeleccionado(null);
      setModalReciboOpen(true);

      sileo.success({
        title: nuevoEstado === 'liquidado' ? 'Aportación liquidada' : 'Abono registrado',
        description: `Folio ${folioGenerado} generado correctamente por $${montoAbonar.toFixed(2)} MXN.`,
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de cobro',
        description: obtenerMensajeError(err, 'No se pudo guardar el abono en el sistema.'),
      });
    }
  };

  // Acreditar faena comunitaria real en la BD
  const handleAcreditarFaena = async (item: CooperacionPadronItem) => {
    if (!coopActiva?.permite_faena) {
      sileo.warning({
        title: 'Faenas no admitidas',
        description: 'Esta obra no contempla acreditación por faena.',
      });
      return;
    }

    try {
      const fechaHoy = new Date().toISOString().split('T')[0];

      // 1. Intentar registrar a través de la función RPC
      const { error: errRpcFaena } = await supabase.rpc('acreditar_faena_cooperacion', {
        p_padron_id: item.id,
        p_fecha_faena: fechaHoy,
      });

      if (errRpcFaena) {
        // Fallback directo en tabla
        const { error: errFaena } = await supabase
          .from('cooperacion_padron')
          .update({
            cumplio_con_faena: true,
            fecha_faena: fechaHoy,
            monto_pendiente: 0,
            estado: 'exento_faena',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (errFaena) throw errFaena;
      }

      const padronActualizado = padron.map((p) => {
        if (p.id === item.id) {
          return {
            ...p,
            cumplio_con_faena: true,
            fecha_faena: fechaHoy,
            monto_pendiente: 0,
            estado: 'exento_faena' as EstadoPadronCooperacion,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });

      setPadron(padronActualizado);
      if (itemSeleccionado?.id === item.id) {
        setItemSeleccionado(null);
      }

      sileo.success({
        title: 'Faena comunitaria registrada',
        description: `Se acreditó el cumplimiento de faena para ${item.persona?.nombre_completo || 'el aportante'}.`,
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al registrar faena',
        description: obtenerMensajeError(err, 'No se pudo actualizar el estado del aportante.'),
      });
    }
  };

  // Búsqueda en ventanilla de cobro
  const aportantesBusquedaCobro = useMemo(() => {
    if (!terminoBusquedaCobro.trim()) return [];
    const q = terminoBusquedaCobro.toLowerCase();
    return padron.filter((item) => {
      const nombre = (item.persona?.nombre_completo || '').toLowerCase();
      const codigoToma = (item.toma?.codigo_toma || '').toLowerCase();
      const direccion = (item.toma?.direccion_referencia || '').toLowerCase();
      return nombre.includes(q) || codigoToma.includes(q) || direccion.includes(q);
    });
  }, [padron, terminoBusquedaCobro]);

  // Filtrado de la tabla del padrón
  const padronFiltrado = useMemo(() => {
    return padron.filter((item) => {
      const cumpleFiltroEstado =
        filtroEstadoPadron === 'todos'
          ? true
          : filtroEstadoPadron === 'liquidados'
          ? item.estado === 'liquidado'
          : filtroEstadoPadron === 'abonos'
          ? item.estado === 'parcial'
          : filtroEstadoPadron === 'pendientes'
          ? item.estado === 'pendiente'
          : filtroEstadoPadron === 'faena'
          ? item.cumplio_con_faena || item.estado === 'exento_faena'
          : true;

      const q = busquedaPadron.toLowerCase();
      const coincideBusqueda =
        !q ||
        (item.persona?.nombre_completo || '').toLowerCase().includes(q) ||
        (item.toma?.codigo_toma || '').toLowerCase().includes(q) ||
        (item.toma?.direccion_referencia || '').toLowerCase().includes(q);

      return cumpleFiltroEstado && coincideBusqueda;
    });
  }, [padron, filtroEstadoPadron, busquedaPadron]);

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-[#2F6BFF] dark:text-[#6C97FF]" />
        <p className="text-sm font-medium">Cargando cooperaciones y obras comunitarias...</p>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     VISTA 1: CATÁLOGO PRINCIPAL (LISTADO Y TARJETAS DE OBRAS)
  ═════════════════════════════════════════════════════════════════ */
  if (!coopActiva) {
    return (
      <div className="w-full space-y-8 animate-in fade-in duration-300">
        {/* Cabecera Principal */}
        <PageHeader
          icon={<HeartHandshake />}
          tone="blue"
          title="Cooperaciones y Obras Comunitarias"
          subtitle="Administración de aportaciones extraordinarias acordadas por asamblea, recaudación de cuotas y obras del pueblo."
          status={`${metricasGlobales.total} obras registradas`}
          statusTone="blue"
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setModalNuevaOpen(true)}
            >
              Nueva Cooperación
            </Button>
          }
        />

        {/* Círculos Métricos Globales (100% Reales) */}
        <CardGroup>
          <Card
            tone="blue"
            value={metricasGlobales.total}
            label="Cooperaciones registradas"
            hint={`${metricasGlobales.activas} activas, ${metricasGlobales.concluidas} concluidas`}
            progress={metricasGlobales.pctConcluidas}
          />

          <Card
            tone="purple"
            value={`$${metricasGlobales.metaGlobal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            label="Presupuesto meta global"
            hint="Suma de fondos fijados en asamblea"
            progress={100}
          />

          <Card
            tone="green"
            value={`$${metricasGlobales.totalRecaudadoGlobal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            label="Recaudado en caja"
            hint={`Saldo pendiente: $${metricasGlobales.saldoPendienteGlobal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}
            progress={metricasGlobales.cumplimientoPct}
          />

          <Card
            tone="cyan"
            value={`${metricasGlobales.cumplimientoPct}%`}
            label="Cumplimiento financiero"
            hint="Avance general de recaudación"
            progress={metricasGlobales.cumplimientoPct}
          />
        </CardGroup>

        {/* Barra de Búsqueda y Filtros de Catálogo */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-dashed border-slate-300 dark:border-[#26345C]">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busquedaCatalogo}
              onChange={(e) => setBusquedaCatalogo(e.target.value)}
              placeholder="Buscar obra por nombre o descripción..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'todos', label: 'Todas las obras' },
              { id: 'activa', label: 'Activas' },
              { id: 'prorrogada', label: 'Con Prórroga' },
              { id: 'concluida', label: 'Concluidas' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroEstadoCatalogo(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroEstadoCatalogo === f.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tarjetas de Cooperaciones (Grid espacioso y pulcro) */}
        {cooperacionesFiltradas.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-300 dark:border-[#26345C] rounded-2xl bg-white/40 dark:bg-slate-900/40">
            <HeartHandshake className="w-12 h-12 text-slate-400 mx-auto mb-3 stroke-[1.5]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              No hay campañas de cooperación registradas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              Crea tu primera obra comunitaria aprobada por asamblea para iniciar la recaudación.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setModalNuevaOpen(true)}
            >
              Registrar Primera Cooperación
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cooperacionesFiltradas.map((coop) => {
              const meta = Number(coop.meta_financiera) || 0;
              const recaudado = recaudadoPorCoop[coop.id] || 0;
              const porcentaje = meta > 0 ? Math.min(100, Math.round((recaudado / meta) * 100)) : 0;
              const fechaLimiteFin = coop.fecha_prorroga || coop.fecha_limite;

              return (
                <div
                  key={coop.id}
                  onClick={() => handleEntrarACooperacion(coop)}
                  className="group relative flex flex-col justify-between p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-blue-500/60 dark:hover:border-blue-500/50 hover:shadow-lg transition-all duration-200 cursor-pointer"
                >
                  <div className="space-y-4">
                    {/* Fila Superior: Estatus y Fechas */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                          coop.estado === 'concluida'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            : coop.estado === 'prorrogada'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {coop.estado === 'concluida'
                          ? 'Concluida'
                          : coop.estado === 'prorrogada'
                          ? 'Con Prórroga'
                          : 'Activa'}
                      </span>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          Vence:{' '}
                          {new Date(fechaLimiteFin).toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Título y Descripción */}
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                        {coop.nombre}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {coop.descripcion || 'Sin descripción adicional registrada.'}
                      </p>
                    </div>

                    {/* Modalidad de Cuota */}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1.5">
                        {coop.tipo_sujeto === 'toma' ? (
                          <Droplets className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span>
                          Cuota: <strong>${coop.cuota_requerida.toFixed(2)}</strong> por {coop.tipo_sujeto}
                        </span>
                      </div>
                    </div>

                    {/* Barra de Progreso de Recaudación */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500 dark:text-slate-400">Recaudado</span>
                        <span className="text-slate-900 dark:text-white font-mono">
                          ${recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} / $
                          {meta.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            coop.estado === 'concluida'
                              ? 'bg-blue-600'
                              : coop.estado === 'prorrogada'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>{porcentaje}% de la meta</span>
                        <span>{coop.permite_faena ? 'Admite faena' : 'Solo efectivo'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pie de Tarjeta con Botón de Entrada */}
                  <div className="pt-5 mt-4 border-t border-dashed border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                      Ver aportaciones y cobros
                    </span>
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Creación */}
        <ModalNuevaCooperacion
          isOpen={modalNuevaOpen}
          onClose={() => setModalNuevaOpen(false)}
          onCrear={handleCrearCooperacion}
          guardando={guardando}
          tomas={tomas}
          personas={personas}
        />
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     VISTA 2: DETALLE DE LA COOPERACIÓN SELECCIONADA
  ═════════════════════════════════════════════════════════════════ */
  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      {/* Botón de Retorno al Catálogo Principal */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleVolverAlCatalogo}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Catálogo de Cooperaciones</span>
        </button>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Clock className="w-3.5 h-3.5 text-purple-500" />}
            onClick={() => setModalProrrogaOpen(true)}
          >
            Aplazar Fecha / Prórroga
          </Button>

          <Button
            type="button"
            variant={coopActiva.estado === 'concluida' ? 'outline' : 'secondary'}
            size="sm"
            onClick={handleAlternarEstadoConcluida}
            disabled={guardando}
          >
            {coopActiva.estado === 'concluida' ? 'Reabrir Obra' : 'Concluir Obra'}
          </Button>
        </div>
      </div>

      {/* Cabecera del Proyecto Seleccionado */}
      <PageHeader
        icon={<HeartHandshake />}
        tone={coopActiva.estado === 'prorrogada' ? 'amber' : 'blue'}
        title={coopActiva.nombre}
        subtitle={coopActiva.descripcion || 'Aportación comunitaria acordada por asamblea'}
        status={
          coopActiva.estado === 'concluida'
            ? 'Campaña Concluida'
            : coopActiva.estado === 'prorrogada'
            ? 'Con Prórroga Vigente'
            : 'Campaña en Recaudación'
        }
        statusTone={
          coopActiva.estado === 'concluida'
            ? 'blue'
            : coopActiva.estado === 'prorrogada'
            ? 'amber'
            : 'green'
        }
        action={
          <PageTabs
            value={tabDetalle}
            onChange={(val) => setTabDetalle(val as 'abonos' | 'padron' | 'asamblea')}
            items={[
              { value: 'abonos', label: 'Ventanilla de Cobro', icon: <Receipt className="w-4 h-4" /> },
              { value: 'padron', label: 'Padrón de Contribuyentes', icon: <Users className="w-4 h-4" /> },
              { value: 'asamblea', label: 'Corte y Asamblea', icon: <FileText className="w-4 h-4" /> },
            ]}
          />
        }
      />

      {/* Círculos Métricos Específicos de ESTA Obra */}
      {metricasObraActiva && (
        <CardGroup>
          <Card
            tone="green"
            value={`$${metricasObraActiva.recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            label="Recaudado en esta obra"
            hint={`Meta fijada: $${metricasObraActiva.meta.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}
            progress={metricasObraActiva.porcentajeRecaudado}
          />

          <Card
            tone="blue"
            value={`${metricasObraActiva.porcentajeCumplimientoPadron}%`}
            label="Padrón al corriente"
            hint={`${metricasObraActiva.liquidados} liquidados de ${metricasObraActiva.totalAportantes}`}
            progress={metricasObraActiva.porcentajeCumplimientoPadron}
          />

          <Card
            tone="amber"
            value={`$${metricasObraActiva.saldoPendienteTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            label="Saldo por cobrar"
            hint={`${metricasObraActiva.enAbonos} en abonos, ${metricasObraActiva.pendientes} pendientes`}
            progress={Math.max(0, 100 - metricasObraActiva.porcentajeRecaudado)}
          />

          <Card
            tone={metricasObraActiva.diasRestantes <= 5 ? 'red' : 'purple'}
            value={
              metricasObraActiva.diasRestantes > 0
                ? `${metricasObraActiva.diasRestantes} días`
                : 'Plazo cumplido'
            }
            label={coopActiva.estado === 'prorrogada' ? 'Vencimiento con prórroga' : 'Plazo límite'}
            hint={`Vence el ${new Date(metricasObraActiva.fechaLimiteFin).toLocaleDateString('es-MX')}`}
            progress={Math.max(0, Math.min(100, metricasObraActiva.diasRestantes * 3))}
          />
        </CardGroup>
      )}

      {/* ─────────────────────────────────────────────────────────────
         PESTAÑA 1: VENTANILLA DE COBRO DE ABONOS DE ESTA OBRA
      ───────────────────────────────────────────────────────────── */}
      {tabDetalle === 'abonos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-dashed border-slate-300 dark:border-[#26345C]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Ventanilla de Cobro — {coopActiva.nombre}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Busca al ciudadano o número de toma para registrar su abono o liquidación total
              </p>
            </div>
            <div className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
              Cuota: ${coopActiva.cuota_requerida.toFixed(2)} por {coopActiva.tipo_sujeto}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Columna Izquierda: Búsqueda y Selección (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Buscar Cooperador / Toma de Agua *
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={terminoBusquedaCobro}
                    onChange={(e) => setTerminoBusquedaCobro(e.target.value)}
                    placeholder="Escribe el nombre del vecino o número de toma..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                </div>
              </div>

              {/* Lista predictiva de resultados */}
              {terminoBusquedaCobro.trim() && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm max-h-72 overflow-y-auto divide-y divide-dashed divide-slate-200 dark:divide-slate-800">
                  {aportantesBusquedaCobro.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No se encontraron aportantes coincidentes en el padrón de esta obra.
                    </div>
                  ) : (
                    aportantesBusquedaCobro.map((item) => {
                      const liquidado = item.estado === 'liquidado';
                      const faena = item.cumplio_con_faena || item.estado === 'exento_faena';

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setItemSeleccionado(item);
                            setTipoPagoAbono(item.monto_pendiente > 0 ? 'total' : 'parcial');
                            setMontoAbonoInput('');
                          }}
                          className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            itemSeleccionado?.id === item.id
                              ? 'bg-blue-500/10 dark:bg-blue-500/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-white block truncate">
                              {item.persona?.nombre_completo || 'Titular sin nombre'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                              {item.toma?.codigo_toma
                                ? `Toma ${item.toma.codigo_toma} — ${item.toma.direccion_referencia || 'Sin calle'}`
                                : `Persona censo: ${item.persona?.telefono || 'Sin teléfono'}`}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            {liquidado ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Liquidado
                              </span>
                            ) : faena ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400">
                                <Check className="w-3.5 h-3.5" /> Faena Cumplida
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                                Resta: ${item.monto_pendiente.toFixed(2)} MXN
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tarjeta de Resumen del Aportante Seleccionado */}
              {itemSeleccionado ? (
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Cooperador Seleccionado
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {itemSeleccionado.persona?.nombre_completo}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {itemSeleccionado.toma?.codigo_toma
                          ? `Toma: ${itemSeleccionado.toma.codigo_toma} — ${itemSeleccionado.toma.direccion_referencia || ''}`
                          : 'Aportante titular en censo'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Estado Actual
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          itemSeleccionado.estado === 'liquidado'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : itemSeleccionado.estado === 'exento_faena'
                            ? 'bg-purple-500/10 text-purple-600'
                            : itemSeleccionado.estado === 'parcial'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {itemSeleccionado.estado === 'liquidado'
                          ? 'Liquidado'
                          : itemSeleccionado.estado === 'exento_faena'
                          ? 'Faena'
                          : itemSeleccionado.estado === 'parcial'
                          ? 'En Abonos'
                          : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* Información de tomas del titular según la modalidad */}
                  {coopActiva.tipo_sujeto === 'toma' && tomasDePersonaSeleccionada.length > 1 && (
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Titular con {tomasDePersonaSeleccionada.length} tomas registradas en el sistema</span>
                      </div>
                      <p className="text-[11px] opacity-90">
                        Esta cooperación se fijó <strong>por toma física</strong> ($
                        {coopActiva.cuota_requerida.toFixed(2)} por toma). El titular cuenta con{' '}
                        {tomasDePersonaSeleccionada.length} tomas registradas a su nombre. Puedes alternar entre ellas para registrar los cobros correspondientes:
                      </p>
                      {/* Accesos directos a las otras tomas del mismo titular */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {otrasTomasMismoTitular.map((otra) => (
                          <button
                            key={otra.id}
                            type="button"
                            onClick={() => {
                              setItemSeleccionado(otra);
                              setTipoPagoAbono(otra.monto_pendiente > 0 ? 'total' : 'parcial');
                              setMontoAbonoInput('');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs hover:border-blue-500 transition-colors flex items-center gap-1.5"
                          >
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {otra.toma?.codigo_toma}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                otra.monto_pendiente <= 0 ? 'text-emerald-500' : 'text-amber-500'
                              }`}
                            >
                              {otra.monto_pendiente <= 0
                                ? 'Liquidada'
                                : `Resta $${otra.monto_pendiente.toFixed(2)}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {coopActiva.tipo_sujeto === 'persona' && tomasDePersonaSeleccionada.length > 0 && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Modalidad por Titular / Ciudadano</span>
                      </div>
                      <p className="text-[11px] opacity-90">
                        Esta cuota única de ${coopActiva.cuota_requerida.toFixed(2)} cubre a{' '}
                        <strong>{itemSeleccionado.persona?.nombre_completo}</strong>, quien tiene{' '}
                        <strong>{tomasDePersonaSeleccionada.length} tomas</strong> a su nombre (
                        {tomasDePersonaSeleccionada.map((t) => t.codigo_toma).join(', ')}).
                      </p>
                    </div>
                  )}

                  {/* Desglose Financiero */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[11px] text-slate-400 block">Cuota Acordada</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        ${itemSeleccionado.monto_requerido.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      <span className="text-[11px] block">Abonado a la Fecha</span>
                      <span className="text-sm font-bold font-mono">
                        ${itemSeleccionado.monto_pagado.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <span className="text-[11px] block">Resta por Pagar</span>
                      <span className="text-sm font-bold font-mono">
                        ${itemSeleccionado.monto_pendiente.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Opción de Acreditar por Faena */}
                  {coopActiva.permite_faena && itemSeleccionado.monto_pendiente > 0 && (
                    <div className="pt-2 flex items-center justify-between bg-purple-500/5 p-3 rounded-xl border border-dashed border-purple-500/20">
                      <div className="text-xs text-purple-900 dark:text-purple-300">
                        <span className="font-bold block">¿Cumplió con faena comunitaria?</span>
                        <span>Se exime la cuota monetaria por mano de obra vecinal.</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAcreditarFaena(itemSeleccionado)}
                      >
                        Acreditar Faena
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center border border-dashed border-slate-300 dark:border-[#26345C] rounded-2xl bg-white/40 dark:bg-slate-900/40">
                  <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Utiliza el buscador superior para seleccionar al cooperador que va a realizar su pago.
                  </p>
                </div>
              )}
            </div>

            {/* Columna Derecha: Formulario de Cobro (5 cols) */}
            <div className="lg:col-span-5">
              <form
                onSubmit={handleRegistrarAbono}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
                  Caja y Registro de Pago
                </h4>

                {/* Modalidad de pago: Total vs Parcial */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Tipo de Pago
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!itemSeleccionado || itemSeleccionado.monto_pendiente <= 0}
                      onClick={() => setTipoPagoAbono('total')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                        tipoPagoAbono === 'total'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Liquidación Total (${(itemSeleccionado?.monto_pendiente || 0).toFixed(2)})
                    </button>

                    <button
                      type="button"
                      disabled={
                        !itemSeleccionado ||
                        !coopActiva.permite_abonos ||
                        itemSeleccionado.monto_pendiente <= 0
                      }
                      onClick={() => setTipoPagoAbono('parcial')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                        tipoPagoAbono === 'parcial'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Abono Parcial
                    </button>
                  </div>
                </div>

                {/* Monto a Cobrar */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Monto a Ingresar ($ MXN) *
                  </label>
                  <Input
                    type="number"
                    step="0.50"
                    min="1"
                    max={itemSeleccionado?.monto_pendiente || 999999}
                    value={
                      tipoPagoAbono === 'total'
                        ? itemSeleccionado?.monto_pendiente.toFixed(2) || ''
                        : montoAbonoInput
                    }
                    readOnly={tipoPagoAbono === 'total'}
                    onChange={(e) => setMontoAbonoInput(e.target.value)}
                    placeholder="Cantidad a cobrar..."
                    required
                  />
                </div>

                {/* Método de Pago */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Forma de Pago
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPago('efectivo')}
                      className={`py-1.5 px-3 rounded-xl text-xs font-medium border ${
                        metodoPago === 'efectivo'
                          ? 'border-blue-600 bg-blue-500/10 text-blue-600 font-bold'
                          : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Efectivo en Ventanilla
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago('transferencia')}
                      className={`py-1.5 px-3 rounded-xl text-xs font-medium border ${
                        metodoPago === 'transferencia'
                          ? 'border-blue-600 bg-blue-500/10 text-blue-600 font-bold'
                          : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Transferencia / Banco
                    </button>
                  </div>
                </div>

                {/* Calculadora de Efectivo y Cambio */}
                {metodoPago === 'efectivo' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Efectivo Recibido:
                      </span>
                      <input
                        type="number"
                        step="0.50"
                        value={efectivoRecibido}
                        onChange={(e) => setEfectivoRecibido(e.target.value)}
                        placeholder="$0.00"
                        className="w-28 text-right px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>

                    {Number(efectivoRecibido) > 0 && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500">Cambio a entregar:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          $
                          {Math.max(
                            0,
                            Number(efectivoRecibido) -
                              (tipoPagoAbono === 'total'
                                ? itemSeleccionado?.monto_pendiente || 0
                                : Number(montoAbonoInput) || 0)
                          ).toFixed(2)}{' '}
                          MXN
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notas */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Observaciones en Recibo
                  </label>
                  <input
                    type="text"
                    value={notasAbono}
                    onChange={(e) => setNotasAbono(e.target.value)}
                    placeholder="Ej: Aportación entregada por familiar..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-transparent border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                </div>

                {/* Botón de Confirmación */}
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full mt-2"
                  disabled={!itemSeleccionado || itemSeleccionado.monto_pendiente <= 0}
                  icon={<Printer className="w-4 h-4" />}
                >
                  Cobrar y Generar Recibo
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         PESTAÑA 2: PADRÓN COMPLETO DE ESTA OBRA
      ───────────────────────────────────────────────────────────── */}
      {tabDetalle === 'padron' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Padrón de Contribuyentes — {coopActiva.nombre}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoría individual de aportantes asignados ({padron.length} registros reales)
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busquedaPadron}
                  onChange={(e) => setBusquedaPadron(e.target.value)}
                  placeholder="Buscar aportante..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              <select
                value={filtroEstadoPadron}
                onChange={(e) => setFiltroEstadoPadron(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="todos">Todos los estados</option>
                <option value="liquidados">Liquidados</option>
                <option value="abonos">En Abonos</option>
                <option value="pendientes">Pendientes</option>
                <option value="faena">Faena Comunitaria</option>
              </select>
            </div>
          </div>

          {cargandoPadron ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              <span>Cargando padrón real de aportantes...</span>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aportante / Titular</TableHead>
                    <TableHead>Identificador / Toma</TableHead>
                    <TableHead className="text-right">Cuota Requerida</TableHead>
                    <TableHead className="text-right">Abonado</TableHead>
                    <TableHead className="text-right">Resta por Pagar</TableHead>
                    <TableHead className="text-center">Cumplimiento</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {padronFiltrado.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-400">
                        No se encontraron aportantes con los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    padronFiltrado.map((item) => {
                      const liquidado = item.estado === 'liquidado';
                      const faena = item.cumplio_con_faena || item.estado === 'exento_faena';
                      const pct =
                        item.monto_requerido > 0
                          ? Math.min(
                              100,
                              Math.round((item.monto_pagado / item.monto_requerido) * 100)
                            )
                          : 0;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {item.persona?.nombre_completo || 'Sin nombre'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {item.persona?.telefono || 'Sin teléfono'}
                            </span>
                          </TableCell>

                          <TableCell>
                            {item.toma?.codigo_toma ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-mono font-bold">
                                <Droplets className="w-3 h-3" />
                                {item.toma.codigo_toma}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">Titular en censo</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-mono font-medium">
                            ${item.monto_requerido.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ${item.monto_pagado.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                            ${item.monto_pendiente.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-center">
                            {liquidado ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Liquidado
                              </span>
                            ) : faena ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                <Check className="w-3 h-3" /> Faena
                              </span>
                            ) : item.estado === 'parcial' ? (
                              <div className="w-24 mx-auto space-y-1">
                                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-amber-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  {pct}% cubierto
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                                Pendiente
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setItemSeleccionado(item);
                                setTabDetalle('abonos');
                              }}
                            >
                              Cobrar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         PESTAÑA 3: CORTE Y RENDICIÓN DE CUENTAS EN ASAMBLEA
      ───────────────────────────────────────────────────────────── */}
      {tabDetalle === 'asamblea' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-dashed border-slate-300 dark:border-[#26345C]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Cédula Oficial de Asamblea Comunitaria
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Documento formal de rendición de cuentas para firmas de la Mesa Directiva
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Imprimir Cédula
            </Button>
          </div>

          {/* Cédula Imprimible */}
          <div
            id="cedula-asamblea"
            className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-8"
          >
            {/* Membrete Oficial */}
            <div className="text-center space-y-1 pb-6 border-b border-dashed border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                {organizacion?.nombre || 'Comité de Agua Potable y Saneamiento Comunitario'}
              </h2>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                CÉDULA FINANCIERA DE RENDICIÓN DE CUENTAS PARA ASAMBLEA GENERAL
              </p>
              <p className="text-[11px] text-slate-400">
                Obra auditada: <strong>{coopActiva.nombre}</strong> — Expedido el{' '}
                {new Date().toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>

            {/* Resumen Ejecutivo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="text-[11px] text-slate-500 block uppercase font-bold">
                  Presupuesto Meta
                </span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                  ${Number(coopActiva.meta_financiera).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block uppercase font-bold">
                  Ingreso en Caja
                </span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  ${metricasObraActiva?.recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <span className="text-[11px] text-amber-700 dark:text-amber-400 block uppercase font-bold">
                  Saldo Restante
                </span>
                <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                  ${metricasObraActiva?.saldoPendienteTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <span className="text-[11px] text-blue-700 dark:text-blue-400 block uppercase font-bold">
                  Cumplimiento
                </span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                  {metricasObraActiva?.porcentajeRecaudado}%
                </span>
              </div>
            </div>

            {/* Bloques de Firmas Oficiales de la Mesa Directiva */}
            <div className="pt-12 space-y-8">
              <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                Mesa Directiva del Comité de Administración
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                <div className="pt-12 border-t border-slate-400 dark:border-slate-600 space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Presidente
                  </span>
                  <span className="text-[10px] text-slate-400 block">Firma y Sello</span>
                </div>

                <div className="pt-12 border-t border-slate-400 dark:border-slate-600 space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Secretario
                  </span>
                  <span className="text-[10px] text-slate-400 block">Firma y Sello</span>
                </div>

                <div className="pt-12 border-t border-slate-400 dark:border-slate-600 space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Tesorero
                  </span>
                  <span className="text-[10px] text-slate-400 block">Firma y Sello</span>
                </div>

                <div className="pt-12 border-t border-slate-400 dark:border-slate-600 space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Consejo de Vigilancia
                  </span>
                  <span className="text-[10px] text-slate-400 block">Firma y Sello</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ticket / Recibo Foliado */}
      {modalReciboOpen && (
        <ReciboCooperacionModal
          isOpen={modalReciboOpen}
          abono={ultimoAbonoEmitido}
          item={itemSeleccionado}
          cooperacion={coopActiva}
          organizacion={organizacion}
          onClose={() => setModalReciboOpen(false)}
          cambioEntregado={ultimoCambio}
        />
      )}

      {/* Modal de Prórroga / Aplazar Fecha */}
      {modalProrrogaOpen && (
        <ModalProrroga
          isOpen={modalProrrogaOpen}
          cooperacion={coopActiva}
          onClose={() => setModalProrrogaOpen(false)}
          onConfirmar={handleConfirmarProrroga}
          guardando={guardando}
        />
      )}
    </div>
  );
}
