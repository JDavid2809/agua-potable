'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Droplets,
  Search,
  Plus,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Gauge,
  Edit2,
  Trash2,
  X,
  CreditCard,
  ArrowLeft,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardGroup } from '@/components/ui/Card';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import type { Toma, Persona, Manzana, TipoToma, EstadoToma } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

export interface TomaDetallada extends Toma {
  persona?: Persona;
  manzana?: Manzana;
}

const ESTADOS: { value: EstadoToma; label: string; color: string }[] = [
  { value: 'activa', label: 'Activa', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'suspendida', label: 'Suspendida', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'cortada', label: 'Cortada', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'inactiva', label: 'Inactiva', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' },
];

const TIPOS: { value: TipoToma; label: string }[] = [
  { value: 'domestica', label: 'Doméstica' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'comunal', label: 'Comunal' },
  { value: 'lote_baldio', label: 'Lote Baldío' },
];

interface TomasManagerProps {
  onVistaChange?: (vista: 'lista' | 'formulario') => void;
}

export function TomasManager({ onVistaChange }: TomasManagerProps = {}) {
  const [tomas, setTomas] = useState<TomaDetallada[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [manzanas, setManzanas] = useState<Manzana[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroBarrio, setFiltroBarrio] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Vista Crear / Editar (pantalla completa, no modal)
  const [vista, setVistaState] = useState<'lista' | 'formulario'>('lista');
  const setVista = (v: 'lista' | 'formulario') => {
    setVistaState(v);
    onVistaChange?.(v);
  };
  const [tomaEnEdicion, setTomaEnEdicion] = useState<TomaDetallada | null>(null);

  // Formulario
  const [personaId, setPersonaId] = useState('');
  const [barrioSeleccionado, setBarrioSeleccionado] = useState('');
  const [manzanaId, setManzanaId] = useState('');
  const [codigoToma, setCodigoToma] = useState('');
  const [tipoToma, setTipoToma] = useState<TipoToma>('domestica');
  const [estadoToma, setEstadoToma] = useState<EstadoToma>('activa');
  const [direccionReferencia, setDireccionReferencia] = useState('');
  const [numeroMedidor, setNumeroMedidor] = useState('');

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Cargar tomas con persona y manzana
      const { data: dataTomas, error: errTomas } = await supabase
        .from('tomas')
        .select(`
          *,
          persona:personas(id, nombre_completo, documento_identidad, telefono),
          manzana:manzanas(id, barrio, seccion, numero_manzana, cuadra)
        `)
        .is('deleted_at', null)
        .order('codigo_toma', { ascending: true });

      if (errTomas) throw errTomas;
      setTomas(dataTomas || []);

      // 2. Cargar personas para selector
      const { data: dataPersonas, error: errPersonas } = await supabase
        .from('personas')
        .select('*')
        .is('deleted_at', null)
        .order('nombre_completo', { ascending: true });

      if (errPersonas) throw errPersonas;
      setPersonas(dataPersonas || []);

      // 3. Cargar manzanas para selector
      const { data: dataManzanas, error: errManzanas } = await supabase
        .from('manzanas')
        .select('*')
        .is('deleted_at', null)
        .order('barrio', { ascending: true })
        .order('numero_manzana', { ascending: true });

      if (errManzanas) throw errManzanas;
      setManzanas(dataManzanas || []);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudieron cargar las tomas.'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const barriosDisponibles = useMemo(() => {
    const set = new Set<string>();
    manzanas.forEach((m) => {
      if (m.barrio?.trim()) set.add(m.barrio.trim());
    });
    return Array.from(set).sort();
  }, [manzanas]);

  const manzanasFiltradasPorBarrio = useMemo(() => {
    if (!barrioSeleccionado) return manzanas;
    return manzanas.filter((m) => m.barrio === barrioSeleccionado);
  }, [manzanas, barrioSeleccionado]);

  const tomasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tomas.filter((t) => {
      if (filtroEstado !== 'todos' && t.estado !== filtroEstado) return false;
      if (filtroBarrio !== 'todos' && t.manzana?.barrio.toLowerCase() !== filtroBarrio.toLowerCase()) return false;

      if (!q) return true;
      const coincideCodigo = t.codigo_toma.toLowerCase().includes(q);
      const coincidePersona = t.persona?.nombre_completo.toLowerCase().includes(q);
      const coincideBarrio = t.manzana?.barrio.toLowerCase().includes(q);
      const coincideManzana = t.manzana?.numero_manzana.toLowerCase().includes(q);
      const coincideRef = t.direccion_referencia.toLowerCase().includes(q);
      const coincideMedidor = t.numero_medidor?.toLowerCase().includes(q);

      return coincideCodigo || coincidePersona || coincideBarrio || coincideManzana || coincideRef || coincideMedidor;
    });
  }, [tomas, busqueda, filtroBarrio, filtroEstado]);

  const handleAbrirCrear = () => {
    setTomaEnEdicion(null);
    setPersonaId(personas[0]?.id || '');
    const primerBarrio = barriosDisponibles[0] || '';
    setBarrioSeleccionado(primerBarrio);
    const primerMz = manzanas.find((m) => m.barrio === primerBarrio) || manzanas[0];
    setManzanaId(primerMz?.id || '');
    setCodigoToma(`TOMA-${String(tomas.length + 1).padStart(4, '0')}`);
    setTipoToma('domestica');
    setEstadoToma('activa');
    setDireccionReferencia('');
    setNumeroMedidor('');
    setVista('formulario');
  };

  const handleAbrirEditar = (t: TomaDetallada) => {
    setTomaEnEdicion(t);
    setPersonaId(t.persona_id);
    setBarrioSeleccionado(t.manzana?.barrio || barriosDisponibles[0] || '');
    setManzanaId(t.manzana_id || '');
    setCodigoToma(t.codigo_toma);
    setTipoToma(t.tipo_toma);
    setEstadoToma(t.estado);
    setDireccionReferencia(t.direccion_referencia);
    setNumeroMedidor(t.numero_medidor || '');
    setVista('formulario');
  };

  const handleVolverALista = () => {
    setVista('lista');
    setTomaEnEdicion(null);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!personaId) {
      sileo.warning({ title: 'Titular requerido', description: 'Selecciona la persona titular de la toma.' });
      return;
    }
    if (!manzanaId) {
      sileo.warning({ title: 'Manzana requerida', description: 'Selecciona la manzana y cuadra.' });
      return;
    }
    if (!codigoToma.trim()) {
      sileo.warning({ title: 'Código requerido', description: 'Ingresa un código para la toma.' });
      return;
    }
    if (!direccionReferencia.trim()) {
      sileo.warning({ title: 'Referencia requerida', description: 'Ingresa la referencia del domicilio.' });
      return;
    }

    setGuardando(true);
    try {
      if (tomaEnEdicion) {
        const { error } = await supabase
          .from('tomas')
          .update({
            persona_id: personaId,
            manzana_id: manzanaId,
            codigo_toma: codigoToma.trim().toUpperCase(),
            tipo_toma: tipoToma,
            estado: estadoToma,
            direccion_referencia: direccionReferencia.trim(),
            numero_medidor: numeroMedidor.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tomaEnEdicion.id);

        if (error) throw error;
        sileo.success({ title: 'Toma actualizada', description: `Se actualizaron los datos de ${codigoToma}.` });
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuario no autenticado.');

        const { data: perfil } = await supabase
          .from('perfiles')
          .select('organizacion_id')
          .eq('id', user.id)
          .single();

        if (!perfil?.organizacion_id) throw new Error('Organización no detectada.');

        const { error } = await supabase.from('tomas').insert({
          organizacion_id: perfil.organizacion_id,
          persona_id: personaId,
          manzana_id: manzanaId,
          codigo_toma: codigoToma.trim().toUpperCase(),
          tipo_toma: tipoToma,
          estado: estadoToma,
          direccion_referencia: direccionReferencia.trim(),
          numero_medidor: numeroMedidor.trim() || null,
          saldo_pendiente: 0.0,
        });

        if (error) throw error;
        sileo.success({ title: 'Toma registrada', description: `La toma ${codigoToma} fue creada exitosamente.` });
      }

      setVista('lista');
      setTomaEnEdicion(null);
      await cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al guardar',
        description: obtenerMensajeError(err, 'No se pudo guardar la toma.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (t: TomaDetallada) => {
    if (Number(t.saldo_pendiente || 0) > 0) {
      sileo.warning({
        title: 'Toma con saldo pendiente',
        description: `Esta toma tiene un adeudo de $${Number(t.saldo_pendiente).toFixed(2)} MXN. Debe liquidarse antes de darla de baja.`,
      });
      return;
    }

    const confirmar = window.confirm(`¿Estás seguro de dar de baja la toma ${t.codigo_toma}?`);
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('tomas')
        .update({ deleted_at: new Date().toISOString(), estado: 'inactiva' })
        .eq('id', t.id);

      if (error) throw error;
      sileo.success({ title: 'Toma dada de baja', description: `La toma ${t.codigo_toma} fue removida.` });
      cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al eliminar',
        description: obtenerMensajeError(err, 'No se pudo dar de baja la toma.'),
      });
    }
  };

  // =========================================================================
  // VISTA NUEVA: FORMULARIO DE REGISTRO / EDICIÓN DE TOMA (NO MODAL, NO CONTENEDOR CARD)
  // =========================================================================
  if (vista === 'formulario') {
    return (
      <div className="w-full space-y-8 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleVolverALista}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Padrón de Tomas</span>
            </button>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <Droplets className="w-6 h-6" />
              </span>
              <span>
                {tomaEnEdicion ? `Editar Toma: ${tomaEnEdicion.codigo_toma}` : 'Registrar Nueva Toma de Agua'}
              </span>
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {tomaEnEdicion
                ? 'Actualiza los datos técnicos y de ubicación de la conexión en el padrón.'
                : 'Vincula la nueva conexión a un titular del padrón y su ubicación territorial.'}
            </p>
          </div>
        </div>

        {/* Formulario a lo ancho completo (EJE X) sin contenedor Card ni modal */}
        <form onSubmit={handleGuardar} className="w-full space-y-8">
          {/* Bloque 1: Titular y Ubicación */}
          <div className="space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Titular y Ubicación Territorial</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Titular / Contribuyente *
                </label>
                <select
                  value={personaId}
                  onChange={(e) => setPersonaId(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                >
                  <option value="" disabled>
                    Selecciona un titular...
                  </option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_completo}{' '}
                      {p.documento_identidad ? `(${p.documento_identidad})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Barrio o Sector *
                </label>
                <select
                  value={barrioSeleccionado}
                  onChange={(e) => {
                    const b = e.target.value;
                    setBarrioSeleccionado(b);
                    const primerMz = manzanas.find((m) => m.barrio === b);
                    setManzanaId(primerMz?.id || '');
                  }}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  {barriosDisponibles.map((b) => (
                    <option key={b} value={b}>
                      Barrio {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Manzana y Cuadra *
                </label>
                <select
                  value={manzanaId}
                  onChange={(e) => setManzanaId(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                >
                  {manzanasFiltradasPorBarrio.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.numero_manzana}
                      {m.cuadra ? ` (${m.cuadra})` : ''} - Sec. {m.seccion}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Bloque 2: Datos Técnicos de la Conexión */}
          <div className="space-y-4 pt-2">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-500" />
                <span>Detalles Técnicos de la Toma</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <Input
                label="Código de Toma *"
                value={codigoToma}
                onChange={(e) => setCodigoToma(e.target.value)}
                placeholder="Ej. TOMA-0001"
                required
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Tipo de Toma *
                </label>
                <select
                  value={tipoToma}
                  onChange={(e) => setTipoToma(e.target.value as TipoToma)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  {TIPOS.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Estado de Conexión *
                </label>
                <select
                  value={estadoToma}
                  onChange={(e) => setEstadoToma(e.target.value as EstadoToma)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  {ESTADOS.map((est) => (
                    <option key={est.value} value={est.value}>
                      {est.label}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Número de Medidor (Opcional)"
                value={numeroMedidor}
                onChange={(e) => setNumeroMedidor(e.target.value)}
                placeholder="Ej. MED-4921"
              />
            </div>
          </div>

          {/* Bloque 3: Referencia Física del Predio */}
          <div className="space-y-4 pt-2">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span>Ubicación y Referencia Física</span>
              </h3>
            </div>

            <div>
              <Input
                label="Dirección o Referencia Física del Predio *"
                value={direccionReferencia}
                onChange={(e) => setDireccionReferencia(e.target.value)}
                placeholder="Ej. Calle Morelos #3, zaguán blanco frente a la tienda de abarrotes"
                required
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200/80 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleVolverALista}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={guardando}
            >
              {tomaEnEdicion ? 'Guardar Cambios' : 'Registrar Toma'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* 1. Métricas */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Droplets />}
          label="Total tomas"
          value={tomas.length}
        />
        <Card
          tone="green"
          icon={<CheckCircle2 />}
          label="Tomas activas"
          value={tomas.filter((t) => t.estado === 'activa').length}
          progress={
            tomas.length > 0
              ? tomas.filter((t) => t.estado === 'activa').length / tomas.length
              : 1
          }
          hint={`De ${tomas.length} en total`}
        />
        <Card
          tone="amber"
          icon={<AlertTriangle />}
          label="Suspendidas / mora"
          value={
            tomas.filter(
              (t) => t.estado === 'suspendida' || t.estado === 'cortada'
            ).length
          }
          progress={
            tomas.length > 0
              ? tomas.filter(
                  (t) => t.estado === 'suspendida' || t.estado === 'cortada'
                ).length / tomas.length
              : 0
          }
          hint="En suspensión o corte"
        />
        <Card
          tone="purple"
          icon={<Users />}
          label="Titulares vinculados"
          value={new Set(tomas.map((t) => t.persona_id)).size}
        />
      </CardGroup>

      {/* 2. Barra de Control */}
      <FilterBar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar por código, titular, medidor, barrio o calle..."
        onRefresh={cargarDatos}
        isRefreshing={cargando}
        action={
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleAbrirCrear}
          >
            Nueva Toma
          </Button>
        }
      >
        <FilterSelect
          value={filtroBarrio}
          onChange={(e) => setFiltroBarrio(e.target.value)}
        >
          <option value="todos">Todos los barrios</option>
          {barriosDisponibles.map((b) => (
            <option key={b} value={b}>
              Barrio {b}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoToma | 'todos')}
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map((est) => (
            <option key={est.value} value={est.value}>
              {est.label}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {/* 3. Tabla de Tomas */}
      {cargando ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm font-medium">Cargando tomas de agua...</p>
        </div>
      ) : tomasFiltradas.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <Droplets className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No se encontraron tomas de agua
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {busqueda || filtroBarrio !== 'todos' || filtroEstado !== 'todos'
              ? 'Prueba modificando los filtros de búsqueda.'
              : 'Registra la primera toma de agua vinculándola a un contribuyente y a una manzana.'}
          </p>
          {!busqueda && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleAbrirCrear}
            >
              Registrar Primera Toma
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Código / Tipo</TableHead>
              <TableHead>Titular / Contribuyente</TableHead>
              <TableHead>Ubicación (Barrio / Mz / Cuadra)</TableHead>
              <TableHead>Medidor y Saldo</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {tomasFiltradas.map((toma) => {
              const est = ESTADOS.find((e) => e.value === toma.estado);

              return (
                <TableRow key={toma.id}>
                  {/* Código y Tipo */}
                  <TableCell>
                    <div className="font-extrabold text-blue-600 dark:text-blue-400">
                      {toma.codigo_toma}
                    </div>
                    <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {toma.tipo_toma}
                    </span>
                  </TableCell>

                  {/* Titular */}
                  <TableCell>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {toma.persona?.nombre_completo || 'Sin asignar'}
                    </div>
                    {toma.persona?.documento_identidad && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Doc: {toma.persona.documento_identidad}
                      </p>
                    )}
                  </TableCell>

                  {/* Ubicación */}
                  <TableCell>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>
                        Barrio <strong>{toma.manzana?.barrio || 'S/N'}</strong> —{' '}
                        <strong>{toma.manzana?.numero_manzana || 'S/N'}</strong>
                        {toma.manzana?.cuadra ? ` (${toma.manzana.cuadra})` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                      {toma.direccion_referencia}
                    </p>
                  </TableCell>

                  {/* Medidor y Saldo */}
                  <TableCell>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {toma.numero_medidor ? (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-slate-400" />
                          {toma.numero_medidor}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sin medidor</span>
                      )}
                    </div>
                    <div className="text-xs font-bold mt-0.5">
                      {Number(toma.saldo_pendiente || 0) > 0 ? (
                        <span className="text-red-600 dark:text-red-400">
                          Adeudo: ${Number(toma.saldo_pendiente).toFixed(2)} MXN
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Al corriente ($0.00)</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Estado */}
                  <TableCell className="text-center">
                    <span
                      className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        est?.color || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {est?.label || toma.estado}
                    </span>
                  </TableCell>

                  {/* Acciones */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAbrirEditar(toma)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Editar toma"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminar(toma)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Dar de baja toma"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

    </div>
  );
}
