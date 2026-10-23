'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
  Layers,
  X,
  RefreshCw,
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
import type { Manzana } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

interface ManzanaConConteo extends Manzana {
  tomas_count?: number;
}

interface ManzanasManagerProps {
  onVistaChange?: (vista: 'lista' | 'formulario') => void;
}

export function ManzanasManager({ onVistaChange }: ManzanasManagerProps = {}) {
  const [manzanas, setManzanas] = useState<ManzanaConConteo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVistaState] = useState<'lista' | 'formulario'>('lista');

  const setVista = (v: 'lista' | 'formulario') => {
    setVistaState(v);
    onVistaChange?.(v);
  };
  const [modoFormulario, setModoFormulario] = useState<'crear' | 'editar'>('crear');
  const [guardando, setGuardando] = useState(false);
  const [manzanaEnEdicion, setManzanaEnEdicion] = useState<Manzana | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroBarrio, setFiltroBarrio] = useState('todos');

  // Formulario
  const [barrio, setBarrio] = useState('Centro');
  const [seccion, setSeccion] = useState('1');
  const [numeroManzana, setNumeroManzana] = useState('');
  const [cuadra, setCuadra] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);

  // Cargar lista de manzanas
  const cargarManzanas = useCallback(async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('manzanas')
        .select('*, tomas:tomas(count)')
        .is('deleted_at', null)
        .order('barrio', { ascending: true })
        .order('numero_manzana', { ascending: true });

      if (error) throw error;

      const formateadas: ManzanaConConteo[] = (data || []).map((item: any) => ({
        ...item,
        tomas_count: item.tomas?.[0]?.count || 0,
      }));

      setManzanas(formateadas);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudieron cargar las manzanas'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarManzanas();
  }, [cargarManzanas]);

  // Lista única de barrios para autocompletar / filtrar
  const barriosUnicos = useMemo(() => {
    const set = new Set<string>();
    manzanas.forEach((m) => {
      if (m.barrio?.trim()) set.add(m.barrio.trim());
    });
    return Array.from(set).sort();
  }, [manzanas]);

  // Filtrado de elementos
  const manzanasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return manzanas.filter((m) => {
      const coincideBarrio =
        filtroBarrio === 'todos' || m.barrio.toLowerCase() === filtroBarrio.toLowerCase();
      const coincideTexto =
        !q ||
        m.numero_manzana.toLowerCase().includes(q) ||
        m.barrio.toLowerCase().includes(q) ||
        m.seccion.toLowerCase().includes(q) ||
        (m.cuadra && m.cuadra.toLowerCase().includes(q)) ||
        (m.descripcion && m.descripcion.toLowerCase().includes(q));

      return coincideBarrio && coincideTexto;
    });
  }, [manzanas, busqueda, filtroBarrio]);

  // Cambiar a la vista de creación
  const handleAbrirCrear = () => {
    setManzanaEnEdicion(null);
    setModoFormulario('crear');
    setBarrio(barriosUnicos[0] || 'Centro');
    setSeccion('1');
    setNumeroManzana('');
    setCuadra('');
    setDescripcion('');
    setActivo(true);
    setVista('formulario');
  };

  // Cambiar a la vista de edición
  const handleAbrirEditar = (m: Manzana) => {
    setManzanaEnEdicion(m);
    setModoFormulario('editar');
    setBarrio(m.barrio || 'Centro');
    setSeccion(m.seccion || '1');
    setNumeroManzana(m.numero_manzana || '');
    setCuadra(m.cuadra || '');
    setDescripcion(m.descripcion || '');
    setActivo(m.activo);
    setVista('formulario');
  };

  // Regresar a la vista de lista
  const handleVolverALista = () => {
    setVista('lista');
    setManzanaEnEdicion(null);
  };

  // Guardar (Crear o Editar)
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!barrio.trim()) {
      sileo.warning({ title: 'Campo requerido', description: 'Por favor indica el barrio o sector.' });
      return;
    }
    if (!numeroManzana.trim()) {
      sileo.warning({ title: 'Campo requerido', description: 'Por favor indica el número o nombre de la manzana.' });
      return;
    }

    setGuardando(true);
    try {
      if (manzanaEnEdicion) {
        // Editar
        const { error } = await supabase
          .from('manzanas')
          .update({
            barrio: barrio.trim(),
            seccion: seccion.trim() || '1',
            numero_manzana: numeroManzana.trim(),
            cuadra: cuadra.trim() || null,
            descripcion: descripcion.trim() || null,
            activo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', manzanaEnEdicion.id);

        if (error) throw error;

        sileo.success({
          title: 'Manzana actualizada',
          description: `Se guardaron los cambios de ${numeroManzana}.`,
        });
      } else {
        // Crear: Obtener la organización del usuario autenticado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuario no autenticado.');

        const { data: perfil, error: errPerfil } = await supabase
          .from('perfiles')
          .select('organizacion_id')
          .eq('id', user.id)
          .single();

        if (errPerfil || !perfil?.organizacion_id) {
          throw new Error('No se detectó una organización activa vinculada a tu cuenta.');
        }

        const { error } = await supabase.from('manzanas').insert({
          organizacion_id: perfil.organizacion_id,
          barrio: barrio.trim(),
          seccion: seccion.trim() || '1',
          numero_manzana: numeroManzana.trim(),
          cuadra: cuadra.trim() || null,
          descripcion: descripcion.trim() || null,
          activo: true,
        });

        if (error) throw error;

        sileo.success({
          title: 'Manzana registrada',
          description: `La ${numeroManzana} fue agregada exitosamente al padrón.`,
        });
      }

      setVista('lista');
      setManzanaEnEdicion(null);
      cargarManzanas();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al guardar',
        description: obtenerMensajeError(err, 'No se pudo guardar la manzana.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  // Eliminar (soft delete)
  const handleEliminar = async (m: ManzanaConConteo) => {
    if (m.tomas_count && m.tomas_count > 0) {
      sileo.warning({
        title: 'Manzana con tomas activas',
        description: `Esta manzana tiene ${m.tomas_count} tomas registradas. Reasigna o desactiva las tomas antes de eliminarla.`,
      });
      return;
    }

    const confirmar = window.confirm(
      `¿Estás seguro de eliminar la ${m.numero_manzana} de ${m.barrio}? Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('manzanas')
        .update({
          deleted_at: new Date().toISOString(),
          activo: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id);

      if (error) throw error;

      sileo.success({
        title: 'Manzana eliminada',
        description: `La ${m.numero_manzana} fue retirada del padrón.`,
      });
      cargarManzanas();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al eliminar',
        description: obtenerMensajeError(err, 'No se pudo eliminar la manzana.'),
      });
    }
  };

  // =========================================================================
  // VISTA NUEVA: FORMULARIO DE REGISTRO / EDICIÓN DE MANZANA (NO MODAL)
  // =========================================================================
  if (vista === 'formulario') {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Cabecera con navegación de regreso */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleVolverALista}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Padrón de Manzanas</span>
            </button>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <MapPin className="w-6 h-6" />
              </span>
              <span>
                {modoFormulario === 'editar'
                  ? `Editar Manzana: ${manzanaEnEdicion?.numero_manzana}`
                  : 'Registrar Nueva Manzana'}
              </span>
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {modoFormulario === 'editar'
                ? 'Actualiza los datos de ubicación territorial de esta manzana en el padrón.'
                : 'Define el barrio, sección, manzana y cuadra para estructurar las tomas de agua y contratos.'}
            </p>
          </div>
        </div>

        {/* Formulario a lo ancho completo (EJE X) sin contenedor Card */}
        <form onSubmit={handleGuardar} className="w-full space-y-8">
          {/* Bloque 1: Datos de Ubicación Geográfica */}
          <div className="space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                <span>Ubicación Territorial</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Barrio */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Barrio o Sector *
                </label>
                <Input
                  required
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  placeholder="Ej: Centro, San Juan..."
                  list="lista-barrios-vista"
                />
                <datalist id="lista-barrios-vista">
                  {barriosUnicos.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-400 mt-1">
                  Escribe un nuevo barrio o selecciona existente.
                </p>
              </div>

              {/* Sección */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Sección *
                </label>
                <Input
                  required
                  value={seccion}
                  onChange={(e) => setSeccion(e.target.value)}
                  placeholder="Ej: 1, 2, Norte..."
                />
              </div>

              {/* Número de Manzana */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Número o Nombre de Manzana *
                </label>
                <Input
                  required
                  value={numeroManzana}
                  onChange={(e) => setNumeroManzana(e.target.value)}
                  placeholder="Ej: Manzana 4, Mz 12..."
                />
              </div>

              {/* Cuadra */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Cuadra o Tramo (Opcional)
                </label>
                <Input
                  value={cuadra}
                  onChange={(e) => setCuadra(e.target.value)}
                  placeholder="Ej: Cuadra 2, Entre calles..."
                />
              </div>
            </div>
          </div>

          {/* Bloque 2: Referencias y Observaciones */}
          <div className="space-y-4 pt-2">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span>Referencias y Notas</span>
              </h3>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Descripción o Límites Físicos (Opcional)
              </label>
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Colinda con la avenida principal y el canal de riego, frente al tanque elevado comunitario..."
                className="w-full px-4 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {modoFormulario === 'editar' && (
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                  />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Manzana activa en el padrón (permite asociar tomas y contratos)
                  </span>
                </label>
              </div>
            )}
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
              {modoFormulario === 'editar' ? 'Guardar Cambios' : 'Registrar Manzana'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // VISTA PRINCIPAL: LISTADO Y MÉTRICAS
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* 1. Tarjetas de métricas de ubicación */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<MapPin />}
          label="Total manzanas"
          value={manzanas.length}
        />
        <Card
          tone="green"
          icon={<Building2 />}
          label="Barrios y sectores"
          value={barriosUnicos.length}
        />
        <Card
          tone="amber"
          icon={<Layers />}
          label="Manzanas activas"
          value={manzanas.filter((m) => m.activo).length}
          progress={
            manzanas.length > 0
              ? manzanas.filter((m) => m.activo).length / manzanas.length
              : 1
          }
          hint={`De ${manzanas.length} en total`}
        />
      </CardGroup>

      {/* 2. Barra de búsqueda, filtro y botón nueva manzana */}
      <FilterBar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar manzana, barrio o calle..."
        onRefresh={cargarManzanas}
        isRefreshing={cargando}
        action={
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleAbrirCrear}
          >
            Nueva Manzana
          </Button>
        }
      >
        {barriosUnicos.length > 0 && (
          <FilterSelect
            value={filtroBarrio}
            onChange={(e) => setFiltroBarrio(e.target.value)}
          >
            <option value="todos">Todos los barrios</option>
            {barriosUnicos.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
        )}
      </FilterBar>

      {/* 3. Tabla de Manzanas */}
      {cargando && manzanas.length === 0 ? (
        <div className="py-16 text-center text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
          <p className="text-sm font-medium">Cargando manzanas del comité...</p>
        </div>
      ) : manzanasFiltradas.length === 0 ? (
        <div className="py-16 text-center text-slate-500 space-y-2">
          <MapPin className="w-8 h-8 mx-auto text-slate-400 stroke-1" />
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">
            No se encontraron manzanas
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {busqueda
              ? 'No hay registros que coincidan con los filtros de búsqueda.'
              : 'Aún no has registrado manzanas en este comité. Haz clic en "Nueva Manzana" para comenzar.'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Barrio / Sector</TableHead>
              <TableHead>Sección</TableHead>
              <TableHead>Manzana</TableHead>
              <TableHead>Cuadra / Detalle</TableHead>
              <TableHead className="text-center">Tomas</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {manzanasFiltradas.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-bold text-slate-900 dark:text-white">
                  {m.barrio}
                </TableCell>
                <TableCell className="text-slate-600 dark:text-slate-300 font-medium">
                  Secc. {m.seccion}
                </TableCell>
                <TableCell className="font-extrabold text-blue-600 dark:text-blue-400">
                  {m.numero_manzana}
                </TableCell>
                <TableCell className="text-slate-500 dark:text-slate-400">
                  {m.cuadra ? `Cuadra ${m.cuadra}` : m.descripcion || '—'}
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {m.tomas_count || 0} tomas
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {m.activo ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Activa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      <XCircle className="w-3.5 h-3.5" />
                      Inactiva
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAbrirEditar(m)}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Editar manzana"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEliminar(m)}
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title="Eliminar manzana"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
