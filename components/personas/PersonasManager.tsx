'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Droplets,
  MapPin,
  Plus,
  Search,
  Phone,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
  Layers,
  X,
  RefreshCw,
  Home,
  Tag,
  AlertCircle,
  Gauge,
  Eye,
  ArrowLeft,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardGroup } from '@/components/ui/Card';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import type { Persona, Toma, Manzana, TipoToma, EstadoToma } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

export interface TomaConManzana extends Toma {
  manzana?: Manzana;
}

export interface PersonaConTomas extends Persona {
  tomas?: TomaConManzana[];
}

const TIPOS_TOMA: { value: TipoToma; label: string }[] = [
  { value: 'domestica', label: 'Doméstica (Hogar)' },
  { value: 'comercial', label: 'Comercial (Negocio)' },
  { value: 'comunal', label: 'Comunal / Pública' },
  { value: 'lote_baldio', label: 'Lote Baldío' },
];

const ESTADOS_TOMA: { value: EstadoToma; label: string; color: string }[] = [
  { value: 'activa', label: 'Activa', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'suspendida', label: 'Suspendida', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'cortada', label: 'Cortada', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'inactiva', label: 'Inactiva', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' },
];

export function PersonasManager() {
  const [personas, setPersonas] = useState<PersonaConTomas[]>([]);
  const [manzanas, setManzanas] = useState<Manzana[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroBarrio, setFiltroBarrio] = useState('todos');
  const [filtroTomas, setFiltroTomas] = useState<'todos' | 'con_tomas' | 'sin_tomas'>('todos');

  // Vista activa: 'lista', 'formulario' o 'asignar-toma'
  const [vista, setVista] = useState<'lista' | 'formulario' | 'asignar-toma'>('lista');
  const [modoFormulario, setModoFormulario] = useState<'crear' | 'editar'>('crear');
  const [personaEnEdicion, setPersonaEnEdicion] = useState<Persona | null>(null);

  const [personaParaToma, setPersonaParaToma] = useState<Persona | null>(null);

  const [modalVerTomasAbierto, setModalVerTomasAbierto] = useState(false);
  const [personaSeleccionadaTomas, setPersonaSeleccionadaTomas] = useState<PersonaConTomas | null>(null);

  // Formulario de Persona
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [documentoIdentidad, setDocumentoIdentidad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [activo, setActivo] = useState(true);

  // Datos de Toma Inicial (al registrar persona)
  const [incluirTomaInicial, setIncluirTomaInicial] = useState(true);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState('');
  const [manzanaIdSeleccionada, setManzanaIdSeleccionada] = useState('');
  const [codigoToma, setCodigoToma] = useState('');
  const [tipoToma, setTipoToma] = useState<TipoToma>('domestica');
  const [direccionReferencia, setDireccionReferencia] = useState('');
  const [numeroMedidor, setNumeroMedidor] = useState('');

  // Formulario para "Agregar Toma Adicional" a persona existente
  const [barrioNuevaToma, setBarrioNuevaToma] = useState('');
  const [manzanaIdNuevaToma, setManzanaIdNuevaToma] = useState('');
  const [codigoNuevaToma, setCodigoNuevaToma] = useState('');
  const [tipoNuevaToma, setTipoNuevaToma] = useState<TipoToma>('domestica');
  const [referenciaNuevaToma, setReferenciaNuevaToma] = useState('');
  const [medidorNuevaToma, setMedidorNuevaToma] = useState('');

  // 1. Cargar Manzanas y Personas
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // Cargar manzanas activas
      const { data: dataManzanas, error: errManzanas } = await supabase
        .from('manzanas')
        .select('*')
        .is('deleted_at', null)
        .order('barrio', { ascending: true })
        .order('numero_manzana', { ascending: true });

      if (errManzanas) throw errManzanas;
      setManzanas(dataManzanas || []);

      // Cargar personas con tomas y sus manzanas asociadas
      const { data: dataPersonas, error: errPersonas } = await supabase
        .from('personas')
        .select(`
          *,
          tomas:tomas (
            id,
            organizacion_id,
            codigo_toma,
            persona_id,
            manzana_id,
            direccion_referencia,
            tipo_toma,
            estado,
            numero_medidor,
            saldo_pendiente,
            created_at,
            updated_at,
            deleted_at,
            manzana:manzanas (
              id,
              barrio,
              seccion,
              numero_manzana,
              cuadra
            )
          )
        `)
        .is('deleted_at', null)
        .order('nombre_completo', { ascending: true });

      if (errPersonas) throw errPersonas;

      // Limpiar tomas con baja lógica de la vista activa
      const formateadas: PersonaConTomas[] = (dataPersonas || []).map((p: any) => ({
        ...p,
        tomas: (p.tomas || []).filter((t: any) => !t.deleted_at),
      }));

      setPersonas(formateadas);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudo cargar el listado de personas'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Lista única de barrios existentes en manzanas
  const barriosDisponibles = useMemo(() => {
    const set = new Set<string>();
    manzanas.forEach((m) => {
      if (m.barrio?.trim()) set.add(m.barrio.trim());
    });
    return Array.from(set).sort();
  }, [manzanas]);

  // Manzanas filtradas por el barrio seleccionado en modal crear persona
  const manzanasDelBarrioSeleccionado = useMemo(() => {
    if (!barrioSeleccionado) return manzanas;
    return manzanas.filter((m) => m.barrio === barrioSeleccionado);
  }, [manzanas, barrioSeleccionado]);

  // Manzanas filtradas para modal de nueva toma independiente
  const manzanasDelBarrioNuevaToma = useMemo(() => {
    if (!barrioNuevaToma) return manzanas;
    return manzanas.filter((m) => m.barrio === barrioNuevaToma);
  }, [manzanas, barrioNuevaToma]);

  // Total de tomas global en el sistema
  const totalTomasGlobal = useMemo(() => {
    return personas.reduce((acc, p) => acc + (p.tomas?.length || 0), 0);
  }, [personas]);

  // Generador de sugerencia de código de toma basado en el máximo consecutivo existente
  const generarSiguienteCodigoToma = useCallback(() => {
    let maxNum = totalTomasGlobal;
    personas.forEach((p) => {
      p.tomas?.forEach((t) => {
        const m = t.codigo_toma?.match(/(\d+)$/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (n > maxNum) maxNum = n;
      });
    });
    return `TOMA-${String(maxNum + 1).padStart(4, '0')}`;
  }, [personas, totalTomasGlobal]);

  // Filtro de lista
  const personasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personas.filter((p) => {
      // Filtro por tomas
      const cantTomas = p.tomas?.length || 0;
      if (filtroTomas === 'con_tomas' && cantTomas === 0) return false;
      if (filtroTomas === 'sin_tomas' && cantTomas > 0) return false;

      // Filtro por barrio
      if (filtroBarrio !== 'todos') {
        const tieneEnBarrio = p.tomas?.some(
          (t) => t.manzana?.barrio.toLowerCase() === filtroBarrio.toLowerCase()
        );
        if (!tieneEnBarrio) return false;
      }

      // Filtro por búsqueda de texto
      if (!q) return true;
      const coincideNombre = p.nombre_completo.toLowerCase().includes(q);
      const coincideDoc = p.documento_identidad?.toLowerCase().includes(q);
      const coincideTel = p.telefono?.toLowerCase().includes(q);
      const coincideDireccion = p.direccion?.toLowerCase().includes(q);
      const coincideToma = p.tomas?.some(
        (t) =>
          t.codigo_toma.toLowerCase().includes(q) ||
          t.direccion_referencia.toLowerCase().includes(q) ||
          t.numero_medidor?.toLowerCase().includes(q) ||
          t.manzana?.numero_manzana.toLowerCase().includes(q) ||
          t.manzana?.barrio.toLowerCase().includes(q)
      );

      return coincideNombre || coincideDoc || coincideTel || coincideDireccion || coincideToma;
    });
  }, [personas, busqueda, filtroBarrio, filtroTomas]);

  // Cambiar a vista de creación
  const handleAbrirCrear = () => {
    setPersonaEnEdicion(null);
    setModoFormulario('crear');
    setNombreCompleto('');
    setDocumentoIdentidad('');
    setTelefono('');
    setDireccion('');
    setNotas('');
    setActivo(true);

    // Toma inicial
    setIncluirTomaInicial(true);
    const primerBarrio = barriosDisponibles[0] || '';
    setBarrioSeleccionado(primerBarrio);
    const primeraManzana = manzanas.find((m) => m.barrio === primerBarrio) || manzanas[0];
    setManzanaIdSeleccionada(primeraManzana?.id || '');
    setCodigoToma(generarSiguienteCodigoToma());
    setTipoToma('domestica');
    setDireccionReferencia('');
    setNumeroMedidor('');

    setVista('formulario');
  };

  // Cambiar a vista de edición
  const handleAbrirEditar = (p: Persona) => {
    setPersonaEnEdicion(p);
    setModoFormulario('editar');
    setNombreCompleto(p.nombre_completo);
    setDocumentoIdentidad(p.documento_identidad || '');
    setTelefono(p.telefono || '');
    setDireccion(p.direccion || '');
    setNotas(p.notas || '');
    setActivo(p.activo);
    setIncluirTomaInicial(false);
    setVista('formulario');
  };

  // Regresar a la vista de lista
  const handleVolverALista = () => {
    setVista('lista');
    setPersonaEnEdicion(null);
    setPersonaParaToma(null);
  };

  // Guardar Persona (Crear o Editar)
  const handleGuardarPersona = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombreCompleto.trim()) {
      sileo.warning({ title: 'Campo requerido', description: 'Por favor ingresa el nombre completo del titular.' });
      return;
    }

    if (!personaEnEdicion && incluirTomaInicial) {
      if (!manzanaIdSeleccionada) {
        sileo.warning({
          title: 'Manzana requerida',
          description: 'Selecciona la manzana y cuadra a la que pertenece la toma.',
        });
        return;
      }
      if (!codigoToma.trim()) {
        sileo.warning({ title: 'Código requerido', description: 'Ingresa un código identificador para la toma.' });
        return;
      }
      if (!direccionReferencia.trim()) {
        sileo.warning({
          title: 'Referencia requerida',
          description: 'Ingresa la calle, número o referencia física de la toma.',
        });
        return;
      }
    }

    setGuardando(true);
    try {
      // 1. Obtener organización activa
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado.');

      const { data: perfil, error: errPerfil } = await supabase
        .from('perfiles')
        .select('organizacion_id')
        .eq('id', user.id)
        .single();

      if (errPerfil || !perfil?.organizacion_id) {
        throw new Error('No se detectó una organización activa vinculada a tu cuenta.');
      }

      const orgId = perfil.organizacion_id;

      if (personaEnEdicion) {
        // Actualizar persona
        const { error: errUpdate } = await supabase
          .from('personas')
          .update({
            nombre_completo: nombreCompleto.trim(),
            documento_identidad: documentoIdentidad.trim() || null,
            telefono: telefono.trim() || null,
            direccion: direccion.trim() || null,
            notas: notas.trim() || null,
            activo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', personaEnEdicion.id);

        if (errUpdate) throw errUpdate;

        sileo.success({
          title: 'Datos actualizados',
          description: `Se actualizaron los datos de ${nombreCompleto}.`,
        });
      } else {
        // Crear persona
        const { data: nuevaPersona, error: errPersona } = await supabase
          .from('personas')
          .insert({
            organizacion_id: orgId,
            nombre_completo: nombreCompleto.trim(),
            documento_identidad: documentoIdentidad.trim() || null,
            telefono: telefono.trim() || null,
            direccion: direccion.trim() || null,
            notas: notas.trim() || null,
            activo: true,
          })
          .select()
          .single();

        if (errPersona || !nuevaPersona) throw errPersona || new Error('Error al registrar persona.');

        // Crear toma inicial si se seleccionó
        if (incluirTomaInicial) {
          const { error: errToma } = await supabase.from('tomas').insert({
            organizacion_id: orgId,
            persona_id: nuevaPersona.id,
            manzana_id: manzanaIdSeleccionada,
            codigo_toma: codigoToma.trim().toUpperCase(),
            direccion_referencia: direccionReferencia.trim(),
            tipo_toma: tipoToma,
            estado: 'activa',
            numero_medidor: numeroMedidor.trim() || null,
            saldo_pendiente: 0.0,
          });

          if (errToma) {
            sileo.warning({
              title: 'Persona creada con advertencia',
              description: `Se creó la persona pero ocurrió un detalle con la toma: ${errToma.message}`,
            });
          } else {
            sileo.success({
              title: 'Titular y Toma registrados',
              description: `${nombreCompleto} ha sido registrado con la toma ${codigoToma}.`,
            });
          }
        } else {
          sileo.success({
            title: 'Titular registrado',
            description: `${nombreCompleto} ha sido dado de alta en el padrón.`,
          });
        }
      }

      setVista('lista');
      setPersonaEnEdicion(null);
      await cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al procesar',
        description: obtenerMensajeError(err, 'No se pudo guardar la persona.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  // Abrir Vista para Agregar una Toma a persona existente
  const handleAbrirNuevaToma = (p: Persona) => {
    setPersonaParaToma(p);
    const primerBarrio = barriosDisponibles[0] || '';
    setBarrioNuevaToma(primerBarrio);
    const primeraMz = manzanas.find((m) => m.barrio === primerBarrio) || manzanas[0];
    setManzanaIdNuevaToma(primeraMz?.id || '');
    setCodigoNuevaToma(generarSiguienteCodigoToma());
    setTipoNuevaToma('domestica');
    setReferenciaNuevaToma(p.direccion || '');
    setMedidorNuevaToma('');
    setVista('asignar-toma');
  };

  // Guardar Nueva Toma Adicional
  const handleGuardarNuevaToma = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personaParaToma) return;

    if (!manzanaIdNuevaToma) {
      sileo.warning({ title: 'Campo requerido', description: 'Por favor selecciona la manzana y cuadra.' });
      return;
    }
    if (!codigoNuevaToma.trim()) {
      sileo.warning({ title: 'Campo requerido', description: 'Ingresa un código para la toma.' });
      return;
    }
    if (!referenciaNuevaToma.trim()) {
      sileo.warning({ title: 'Campo requerido', description: 'Ingresa la referencia domiciliaria de la toma.' });
      return;
    }

    setGuardando(true);
    try {
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
        persona_id: personaParaToma.id,
        manzana_id: manzanaIdNuevaToma,
        codigo_toma: codigoNuevaToma.trim().toUpperCase(),
        direccion_referencia: referenciaNuevaToma.trim(),
        tipo_toma: tipoNuevaToma,
        estado: 'activa',
        numero_medidor: medidorNuevaToma.trim() || null,
        saldo_pendiente: 0.0,
      });

      if (error) throw error;

      sileo.success({
        title: 'Toma asignada',
        description: `Se asignó la toma ${codigoNuevaToma} a ${personaParaToma.nombre_completo}.`,
      });

      setVista('lista');
      setPersonaParaToma(null);
      await cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al agregar toma',
        description: obtenerMensajeError(err, 'No se pudo registrar la toma.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  // Baja lógica de persona
  const handleEliminarPersona = async (p: PersonaConTomas) => {
    const cantTomas = p.tomas?.length || 0;
    if (cantTomas > 0) {
      sileo.warning({
        title: 'Persona con tomas vinculadas',
        description: `${p.nombre_completo} tiene ${cantTomas} tomas registradas. Da de baja o reasigna sus tomas antes de eliminar al titular.`,
      });
      return;
    }

    const confirmar = window.confirm(
      `¿Deseas dar de baja a ${p.nombre_completo} del padrón? Esta acción es reversible por administradores.`
    );
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('personas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', p.id);

      if (error) throw error;

      sileo.success({
        title: 'Titular eliminado',
        description: `${p.nombre_completo} fue dado de baja correctamente.`,
      });

      cargarDatos();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al eliminar',
        description: obtenerMensajeError(err, 'No se pudo eliminar al titular.'),
      });
    }
  };

  // Abrir Modal de Ver Tomas de una Persona
  const handleVerTomas = (p: PersonaConTomas) => {
    setPersonaSeleccionadaTomas(p);
    setModalVerTomasAbierto(true);
  };

  // =========================================================================
  // VISTA NUEVA: FORMULARIO DE REGISTRO / EDICIÓN DE CONTRIBUYENTE (NO MODAL, NO CONTENEDOR)
  // =========================================================================
  if (vista === 'formulario') {
    return (
      <div className="w-full space-y-8 animate-in fade-in duration-200">
        {/* Cabecera con navegación de regreso */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleVolverALista}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Padrón de Contribuyentes</span>
            </button>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <Users className="w-6 h-6" />
              </span>
              <span>
                {modoFormulario === 'editar'
                  ? `Editar Contribuyente: ${personaEnEdicion?.nombre_completo}`
                  : 'Registrar Nuevo Contribuyente'}
              </span>
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {modoFormulario === 'editar'
                ? 'Actualiza los datos personales y de contacto del titular en el padrón.'
                : 'Captura los datos del titular y vincula de inmediato su toma y ubicación territorial.'}
            </p>
          </div>
        </div>

        {/* Formulario a lo ancho completo (EJE X) sin contenedor Card */}
        <form onSubmit={handleGuardarPersona} className="w-full space-y-8">
          {/* Sección A: Datos Personales */}
          <div className="space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Datos del Titular</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4">
                <Input
                  label="Nombre Completo *"
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  placeholder="Ej. Juan Pérez Sánchez"
                  required
                />
              </div>

              <div className="lg:col-span-4">
                <Input
                  label="Documento de Identidad (INE / CURP)"
                  value={documentoIdentidad}
                  onChange={(e) => setDocumentoIdentidad(e.target.value)}
                  placeholder="Ej. ABCD900101HDFR02"
                />
              </div>

              <div className="lg:col-span-4">
                <Input
                  label="Teléfono de Contacto"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 244 123 4567"
                  type="tel"
                />
              </div>

              <div className="lg:col-span-7">
                <Input
                  label="Dirección Particular / Domicilio del Titular"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. Calle 16 de Septiembre #12"
                />
              </div>

              <div className="lg:col-span-5">
                <Input
                  label="Notas u Observaciones (Opcional)"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej. Titular de la tercera edad, solicita recibo en papel"
                />
              </div>

              {modoFormulario === 'editar' && (
                <div className="lg:col-span-12 pt-1">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                    />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Contribuyente Activo en el Padrón
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Sección B: Vinculación con Toma y Ubicación (Al registrar nuevo) */}
          {modoFormulario === 'crear' && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  <span>Vincular Toma y Ubicación Geográfica</span>
                </h3>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={incluirTomaInicial}
                    onChange={(e) => setIncluirTomaInicial(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Registrar toma de agua ahora
                  </span>
                </label>
              </div>

              {incluirTomaInicial && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 pt-2">
                  {/* Barrio */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Barrio o Sector *
                    </label>
                    <select
                      value={barrioSeleccionado}
                      onChange={(e) => {
                        const b = e.target.value;
                        setBarrioSeleccionado(b);
                        const primeraMz = manzanas.find((m) => m.barrio === b);
                        setManzanaIdSeleccionada(primeraMz?.id || '');
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

                  {/* Manzana y Cuadra */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Manzana y Cuadra *
                    </label>
                    <select
                      value={manzanaIdSeleccionada}
                      onChange={(e) => setManzanaIdSeleccionada(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                      required
                    >
                      {manzanasDelBarrioSeleccionado.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.numero_manzana}
                          {m.cuadra ? ` (${m.cuadra})` : ''} - Sec. {m.seccion}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Código */}
                  <div className="lg:col-span-3">
                    <Input
                      label="Código de Toma *"
                      value={codigoToma}
                      onChange={(e) => setCodigoToma(e.target.value)}
                      placeholder="Ej. TOMA-0001"
                      required
                    />
                  </div>

                  {/* Tipo */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Tipo de Toma *
                    </label>
                    <select
                      value={tipoToma}
                      onChange={(e) => setTipoToma(e.target.value as TipoToma)}
                      className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    >
                      {TIPOS_TOMA.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Referencia física */}
                  <div className="lg:col-span-8">
                    <Input
                      label="Dirección / Referencia Física de la Toma *"
                      value={direccionReferencia}
                      onChange={(e) => setDireccionReferencia(e.target.value)}
                      placeholder="Ej. Frente a la tienda El Sol, portón café"
                      required
                    />
                  </div>

                  {/* Medidor */}
                  <div className="lg:col-span-4">
                    <Input
                      label="Número de Medidor (Opcional)"
                      value={numeroMedidor}
                      onChange={(e) => setNumeroMedidor(e.target.value)}
                      placeholder="Ej. MED-1082"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botones de acción ocupando el ancho completo */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
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
              {modoFormulario === 'editar' ? 'Guardar Cambios' : 'Registrar Contribuyente'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // VISTA NUEVA: ASIGNAR TOMA A PERSONA EXISTENTE (NO MODAL, NO CONTENEDOR CARD)
  // =========================================================================
  if (vista === 'asignar-toma' && personaParaToma) {
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
              <span>Volver al Padrón de Contribuyentes</span>
            </button>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <Droplets className="w-6 h-6" />
              </span>
              <span>Asignar Nueva Toma: {personaParaToma.nombre_completo}</span>
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Registra una toma adicional vinculada a este titular en el padrón.
            </p>
          </div>
        </div>

        {/* Formulario a lo ancho completo (EJE X) sin contenedor Card ni modal */}
        <form onSubmit={handleGuardarNuevaToma} className="w-full space-y-8">
          <div className="space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span>Ubicación y Parámetros de la Toma</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Barrio o Sector *
                </label>
                <select
                  value={barrioNuevaToma}
                  onChange={(e) => {
                    const b = e.target.value;
                    setBarrioNuevaToma(b);
                    const primerMz = manzanas.find((m) => m.barrio === b);
                    setManzanaIdNuevaToma(primerMz?.id || '');
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
                  value={manzanaIdNuevaToma}
                  onChange={(e) => setManzanaIdNuevaToma(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  required
                >
                  {manzanasDelBarrioNuevaToma.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.numero_manzana}
                      {m.cuadra ? ` (${m.cuadra})` : ''} - Sección {m.seccion}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Input
                  label="Código de Toma *"
                  value={codigoNuevaToma}
                  onChange={(e) => setCodigoNuevaToma(e.target.value)}
                  placeholder="Ej. TOMA-0002"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Tipo de Toma *
                </label>
                <select
                  value={tipoNuevaToma}
                  onChange={(e) => setTipoNuevaToma(e.target.value as TipoToma)}
                  className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  {TIPOS_TOMA.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-500" />
                <span>Referencia Física y Medidor</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8">
                <Input
                  label="Referencia Física del Predio *"
                  value={referenciaNuevaToma}
                  onChange={(e) => setReferenciaNuevaToma(e.target.value)}
                  placeholder="Ej. Casa de dos pisos frente al parque"
                  required
                />
              </div>

              <div className="lg:col-span-4">
                <Input
                  label="Número de Medidor (Opcional)"
                  value={medidorNuevaToma}
                  onChange={(e) => setMedidorNuevaToma(e.target.value)}
                  placeholder="Ej. MED-5542"
                />
              </div>
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
              Asignar Toma
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // VISTA PRINCIPAL: LISTADO Y FILTROS
  // =========================================================================
  return (
    <div className="w-full space-y-6">
      {/* Cabecera del módulo en la vista de lista */}
      <PageHeader
        icon={<Users />}
        tone="blue"
        title="Padrón de Contribuyentes y Tomas"
        subtitle="Registro de titulares, asignación geográfica (barrio, manzana, cuadra) y administración de tomas de agua."
        status={`${personas.length} contribuyentes registrados`}
      />
      {/* 1. Métricas / Resumen Superior */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Users />}
          label="Total contribuyentes"
          value={personas.length}
        />
        <Card
          tone="cyan"
          icon={<Droplets />}
          label="Tomas asignadas"
          value={totalTomasGlobal}
        />
        <Card
          tone="green"
          icon={<CheckCircle2 />}
          label="Con tomas activas"
          value={personas.filter((p) => (p.tomas?.length || 0) > 0).length}
          progress={
            personas.length > 0
              ? personas.filter((p) => (p.tomas?.length || 0) > 0).length /
                personas.length
              : 1
          }
          hint={`De ${personas.length} en total`}
        />
        <Card
          tone="purple"
          icon={<Building2 />}
          label="Barrios en cobertura"
          value={barriosDisponibles.length}
        />
      </CardGroup>

      {/* 2. Barra de Control: Búsqueda, Filtros y Botón Nuevo */}
      <FilterBar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar por nombre, INE, teléfono o código de toma..."
        onRefresh={cargarDatos}
        isRefreshing={cargando}
        action={
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleAbrirCrear}
          >
            Nuevo Contribuyente
          </Button>
        }
      >
        <FilterSelect
          label="Barrio:"
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
          value={filtroTomas}
          onChange={(e) =>
            setFiltroTomas(
              e.target.value as 'todos' | 'con_tomas' | 'sin_tomas'
            )
          }
        >
          <option value="todos">Todas las personas</option>
          <option value="con_tomas">Solo con tomas</option>
          <option value="sin_tomas">Sin tomas asignadas</option>
        </FilterSelect>
      </FilterBar>

      {/* 3. Listado Principal de Personas y Contratos */}
      {cargando ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm font-medium">Cargando padrón de personas y tomas...</p>
        </div>
      ) : personasFiltradas.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <Users className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              No se encontraron contribuyentes
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {busqueda || filtroBarrio !== 'todos' || filtroTomas !== 'todos'
                ? 'Intenta ajustar los filtros o el término de búsqueda.'
                : 'Registra al primer contribuyente del comité para comenzar a gestionar sus tomas y recibos.'}
            </p>
          </div>
          {!busqueda && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleAbrirCrear}
            >
              Registrar Primer Contribuyente
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Contribuyente / Titular</TableHead>
              <TableHead>Documento / Contacto</TableHead>
              <TableHead>Ubicación (Barrio / Manzana / Cuadra)</TableHead>
              <TableHead className="text-center">Tomas de Agua</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {personasFiltradas.map((persona) => {
              const tomasCount = persona.tomas?.length || 0;
              // Obtener lista representativa de barrios y manzanas de sus tomas
              const ubicacionesTomas = persona.tomas
                ?.map((t) => {
                  if (!t.manzana) return null;
                  return `${t.manzana.barrio} - Mz ${t.manzana.numero_manzana}${
                    t.manzana.cuadra ? ` (${t.manzana.cuadra})` : ''
                  }`;
                })
                .filter(Boolean) as string[];

              const ubicacionesUnicas = Array.from(new Set(ubicacionesTomas));

              return (
                <TableRow key={persona.id}>
                  {/* Nombre y Dirección Personal */}
                  <TableCell>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{persona.nombre_completo}</span>
                    </div>
                    {persona.direccion && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Home className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="truncate max-w-xs">{persona.direccion}</span>
                      </p>
                    )}
                    {persona.notas && (
                      <p className="text-[11px] text-slate-400 italic mt-0.5 line-clamp-1">
                        {persona.notas}
                      </p>
                    )}
                  </TableCell>

                  {/* Identificación y Teléfono */}
                  <TableCell>
                    <div className="space-y-1">
                      {persona.documento_identidad ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <FileText className="w-3 h-3 text-slate-400" />
                          {persona.documento_identidad}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sin documento</span>
                      )}

                      {persona.telefono && (
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{persona.telefono}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Ubicación de sus Tomas (Barrio, Manzana, Cuadra) */}
                  <TableCell>
                    {ubicacionesUnicas.length > 0 ? (
                      <div className="space-y-1">
                        {ubicacionesUnicas.slice(0, 2).map((ub, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg mr-1 mb-1"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{ub}</span>
                          </div>
                        ))}
                        {ubicacionesUnicas.length > 2 && (
                          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block">
                            +{ubicacionesUnicas.length - 2} ubicaciones más
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Sin tomas asignadas</span>
                      </div>
                    )}
                  </TableCell>

                  {/* Tomas Badge / Interacción */}
                  <TableCell className="text-center">
                    {tomasCount > 0 ? (
                      <div className="inline-flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleVerTomas(persona)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors"
                          title="Ver tomas asignadas"
                        >
                          <Droplets className="w-3.5 h-3.5 text-blue-500" />
                          <span>
                            {tomasCount} {tomasCount === 1 ? 'toma' : 'tomas'}
                          </span>
                          <Eye className="w-3 h-3 ml-0.5 text-blue-400" />
                        </button>
                        <span className="text-[10px] text-slate-400">
                          {persona.tomas?.map((t) => t.codigo_toma).join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        0 tomas
                      </span>
                    )}
                  </TableCell>

                  {/* Estado */}
                  <TableCell className="text-center">
                    {persona.activo ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Activo</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Inactivo</span>
                      </span>
                    )}
                  </TableCell>

                  {/* Acciones */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Botón Asignar Nueva Toma */}
                      <button
                        type="button"
                        onClick={() => handleAbrirNuevaToma(persona)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        title="Asignar nueva toma de agua"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      {/* Botón Editar Persona */}
                      <button
                        type="button"
                        onClick={() => handleAbrirEditar(persona)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Editar datos del titular"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Botón Eliminar Persona */}
                      <button
                        type="button"
                        onClick={() => handleEliminarPersona(persona)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="Eliminar titular"
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





      {/* 6. Modal: Ver Detalle de Tomas de una Persona */}
      {modalVerTomasAbierto && personaSeleccionadaTomas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Tomas de {personaSeleccionadaTomas.nombre_completo}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {personaSeleccionadaTomas.tomas?.length || 0} conexiones registradas en el padrón
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalVerTomasAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {personaSeleccionadaTomas.tomas?.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-6">
                  Esta persona no tiene tomas asignadas actualmente.
                </p>
              ) : (
                <div className="space-y-3">
                  {personaSeleccionadaTomas.tomas?.map((toma) => {
                    const estadoObj = ESTADOS_TOMA.find((e) => e.value === toma.estado);

                    return (
                      <div
                        key={toma.id}
                        className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                              {toma.codigo_toma}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                estadoObj?.color || 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {estadoObj?.label || toma.estado}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                              {toma.tipo_toma}
                            </span>
                          </div>

                          {/* Manzana y Barrio */}
                          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>
                              Barrio <strong>{toma.manzana?.barrio || 'S/N'}</strong> —{' '}
                              <strong>{toma.manzana?.numero_manzana || 'S/N'}</strong>
                              {toma.manzana?.cuadra ? ` (${toma.manzana.cuadra})` : ''}
                            </span>
                          </div>

                          {/* Dirección / Referencia */}
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {toma.direccion_referencia}
                          </p>

                          {/* Medidor y Saldo */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                            {toma.numero_medidor && (
                              <span className="flex items-center gap-1">
                                <Gauge className="w-3 h-3 text-slate-400" />
                                Medidor: {toma.numero_medidor}
                              </span>
                            )}
                            <span>Saldo: ${Number(toma.saldo_pendiente || 0).toFixed(2)} MXN</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setModalVerTomasAbierto(false);
                  handleAbrirNuevaToma(personaSeleccionadaTomas);
                }}
              >
                Agregar otra toma a esta persona
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalVerTomasAbierto(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
