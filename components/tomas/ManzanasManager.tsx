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
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import type { Manzana } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

interface ManzanaConConteo extends Manzana {
  tomas_count?: number;
}

export function ManzanasManager() {
  const [manzanas, setManzanas] = useState<ManzanaConConteo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
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

  // Abrir modal de creación
  const handleAbrirCrear = () => {
    setManzanaEnEdicion(null);
    setBarrio(barriosUnicos[0] || 'Centro');
    setSeccion('1');
    setNumeroManzana('');
    setCuadra('');
    setDescripcion('');
    setActivo(true);
    setModalAbierto(true);
  };

  // Abrir modal de edición
  const handleAbrirEditar = (m: Manzana) => {
    setManzanaEnEdicion(m);
    setBarrio(m.barrio || 'Centro');
    setSeccion(m.seccion || '1');
    setNumeroManzana(m.numero_manzana || '');
    setCuadra(m.cuadra || '');
    setDescripcion(m.descripcion || '');
    setActivo(m.activo);
    setModalAbierto(true);
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

      setModalAbierto(false);
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

  return (
    <div className="space-y-6">
      {/* 1. Tarjetas de métricas de ubicación */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4 p-5">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Manzanas
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {manzanas.length}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 p-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Barrios / Sectores
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {barriosUnicos.length}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 p-5">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Manzanas Activas
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {manzanas.filter((m) => m.activo).length}
            </p>
          </div>
        </Card>
      </div>

      {/* 2. Barra de búsqueda, filtro y botón nueva manzana */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {/* Input de búsqueda */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar manzana, barrio o calle..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filtro por barrio */}
          {barriosUnicos.length > 0 && (
            <select
              value={filtroBarrio}
              onChange={(e) => setFiltroBarrio(e.target.value)}
              className="px-3.5 py-2 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los barrios</option>
              {barriosUnicos.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          {/* Botón refrescar */}
          <button
            type="button"
            onClick={cargarManzanas}
            disabled={cargando}
            title="Actualizar lista"
            className="p-2 rounded-xl border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Botón Nueva Manzana */}
        <Button
          variant="primary"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={handleAbrirCrear}
        >
          Nueva Manzana
        </Button>
      </div>

      {/* 3. Tabla de Manzanas */}
      <Card className="p-0 overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Barrio / Sector</th>
                  <th className="px-5 py-3.5">Sección</th>
                  <th className="px-5 py-3.5">Manzana</th>
                  <th className="px-5 py-3.5">Cuadra / Detalle</th>
                  <th className="px-5 py-3.5 text-center">Tomas</th>
                  <th className="px-5 py-3.5 text-center">Estado</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {manzanasFiltradas.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                      {m.barrio}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300 font-medium">
                      Secc. {m.seccion}
                    </td>
                    <td className="px-5 py-4 font-extrabold text-blue-600 dark:text-blue-400">
                      {m.numero_manzana}
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                      {m.cuadra ? `Cuadra ${m.cuadra}` : m.descripcion || '—'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {m.tomas_count || 0} tomas
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
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
                    </td>
                    <td className="px-5 py-4 text-right">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4. Modal para Crear / Editar Manzana */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {manzanaEnEdicion ? 'Editar Manzana' : 'Registrar Nueva Manzana'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardar} className="p-6 space-y-4">
              {/* Barrio y Sección */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Barrio o Sector *
                  </label>
                  <Input
                    required
                    value={barrio}
                    onChange={(e) => setBarrio(e.target.value)}
                    placeholder="Ej: Centro, San Juan..."
                    list="lista-barrios"
                  />
                  <datalist id="lista-barrios">
                    {barriosUnicos.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Sección *
                  </label>
                  <Input
                    required
                    value={seccion}
                    onChange={(e) => setSeccion(e.target.value)}
                    placeholder="Ej: 1, 2, Norte..."
                  />
                </div>
              </div>

              {/* Número de Manzana y Cuadra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Número de Manzana *
                  </label>
                  <Input
                    required
                    value={numeroManzana}
                    onChange={(e) => setNumeroManzana(e.target.value)}
                    placeholder="Ej: Manzana 4 o Mz 12"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Cuadra (Opcional)
                  </label>
                  <Input
                    value={cuadra}
                    onChange={(e) => setCuadra(e.target.value)}
                    placeholder="Ej: Cuadra 2"
                  />
                </div>
              </div>

              {/* Descripción / Referencias */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Descripción o Referencia (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Entre la calle Morelos y la avenida principal..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              {/* Estado Activo / Inactivo */}
              {manzanaEnEdicion && (
                <div className="pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Manzana activa para asignación de nuevas tomas
                    </span>
                  </label>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setModalAbierto(false)}
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
                  {manzanaEnEdicion ? 'Guardar Cambios' : 'Registrar Manzana'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
