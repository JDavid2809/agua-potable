'use client';

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  CheckCircle2,
  ArrowLeft,
  Download,
  Users,
  Droplets,
  Layers,
  Table2,
  Sparkles,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card, CardGroup } from '@/components/ui/Card';
import { obtenerMensajeError } from '@/lib/utils/errors';
import { useRegistrosPorPagina } from '@/hooks/use-registros-por-pagina';
import {
  MAPA_DEFINICION_CAMPO,
  type ImportadorCensoExcelProps,
  type CampoDestinoKey,
  type FilaMatrizExcel,
  type ColumnaInfoExcel,
  type RegistroImportar,
  type ResumenImportacion,
} from './importador/types';
import {
  normalizarTexto,
  archivoTieneTituloValido,
  extraerMatrizDeHoja,
  detectarIndiceFilaEncabezado,
  autoAsignarColumnasInteligente,
  construirRegistrosDesdeMatriz,
  descargarPlantillaExcel,
} from './importador/excel-parser';
import { ZonaCargaArchivo } from './importador/ZonaCargaArchivo';
import { PasoMapeoColumnas } from './importador/PasoMapeoColumnas';
import { PasoPrevisualizacionRegistros } from './importador/PasoPrevisualizacionRegistros';

export type { ImportadorCensoExcelProps, CampoDestinoKey } from './importador/types';

export function ImportadorCensoExcel({
  personasExistentes,
  manzanas,
  onVolver,
  onImportacionCompletada,
}: ImportadorCensoExcelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [hojasDisponibles, setHojasDisponibles] = useState<string[]>([]);
  const [hojaActiva, setHojaActiva] = useState<string>('');
  const [pasoActivo, setPasoActivo] = useState<'mapeo' | 'previsualizacion'>('mapeo');

  const [filasMatriz, setFilasMatriz] = useState<FilaMatrizExcel[]>([]);
  const [letrasColumnas, setLetrasColumnas] = useState<string[]>([]);
  const [indiceFilaEncabezado, setIndiceFilaEncabezado] = useState<number>(0);
  const [archivoTieneEncabezados, setArchivoTieneEncabezados] = useState<boolean>(true);
  const [asignacionColumnas, setAsignacionColumnas] = useState<
    Record<number, CampoDestinoKey>
  >({});

  const [registros, setRegistros] = useState<RegistroImportar[]>([]);
  const [busquedaPreview, setBusquedaPreview] = useState('');
  const [filtroPreview, setFiltroPreview] = useState<
    'todos' | 'seleccionados' | 'nuevos' | 'existentes'
  >('todos');
  const [paginaPreview, setPaginaPreview] = useState(1);
  const itemsPorPagina = useRegistrosPorPagina();

  const [importando, setImportando] = useState(false);
  const [progresoActual, setProgresoActual] = useState(0);
  const [progresoTotal, setProgresoTotal] = useState(0);

  const mapaNombresExistentes = useMemo(() => {
    const map = new Map<string, string>();
    personasExistentes.forEach((p) => {
      map.set(normalizarTexto(p.nombre_completo), p.id);
    });
    return map;
  }, [personasExistentes]);

  const mapaDocumentosExistentes = useMemo(() => {
    const map = new Map<string, string>();
    personasExistentes.forEach((p) => {
      if (p.documento_identidad?.trim()) {
        map.set(p.documento_identidad.trim().toUpperCase(), p.id);
      }
    });
    return map;
  }, [personasExistentes]);

  const infoColumnas = useMemo<ColumnaInfoExcel[]>(() => {
    if (filasMatriz.length === 0 || letrasColumnas.length === 0) return [];

    const filaTitulos = archivoTieneEncabezados
      ? filasMatriz[indiceFilaEncabezado]?.celdas || []
      : [];
    const filasDatos = archivoTieneEncabezados
      ? filasMatriz.slice(indiceFilaEncabezado + 1)
      : filasMatriz;

    return letrasColumnas.map((letra, colIdx) => {
      const tituloRaw = (filaTitulos[colIdx] || '').trim();
      const tituloEncabezado = archivoTieneTituloValido(tituloRaw)
        ? tituloRaw
        : `Columna ${letra}`;

      const ejemplos: string[] = [];
      for (const f of filasDatos) {
        const val = (f.celdas[colIdx] || '').trim();
        if (val !== '') {
          ejemplos.push(val);
          if (ejemplos.length >= 4) break;
        }
      }

      return {
        colIndex: colIdx,
        letraExcel: letra,
        tituloEncabezado,
        ejemplos,
      };
    });
  }, [filasMatriz, letrasColumnas, indiceFilaEncabezado, archivoTieneEncabezados]);

  const actualizarRegistros = (
    matriz: FilaMatrizExcel[],
    idxEncabezado: number,
    tieneEncabezados: boolean,
    asignacion: Record<number, CampoDestinoKey>
  ) => {
    const lista = construirRegistrosDesdeMatriz(
      matriz,
      idxEncabezado,
      tieneEncabezados,
      asignacion,
      mapaDocumentosExistentes,
      mapaNombresExistentes
    );
    setRegistros(lista);
    setPaginaPreview(1);
  };

  const procesarHojaWorkbook = (wb: XLSX.WorkBook, nombreHoja: string) => {
    const worksheet = wb.Sheets[nombreHoja];
    if (!worksheet) return;

    const { filas, letrasColumnas: letras } = extraerMatrizDeHoja(worksheet);

    if (filas.length === 0 || letras.length === 0) {
      sileo.warning({
        title: 'Hoja vacía',
        description: `La hoja "${nombreHoja}" no contiene celdas con datos.`,
      });
      setFilasMatriz([]);
      setLetrasColumnas([]);
      setAsignacionColumnas({});
      setRegistros([]);
      return;
    }

    const idxHeaderDetectado = detectarIndiceFilaEncabezado(filas);
    const filaTitulos = filas[idxHeaderDetectado]?.celdas || [];
    const filasDatos = filas.slice(idxHeaderDetectado + 1);

    const colsTemp: ColumnaInfoExcel[] = letras.map((letra, colIdx) => {
      const tituloRaw = (filaTitulos[colIdx] || '').trim();
      const ejemplos: string[] = [];
      for (const f of filasDatos) {
        const val = (f.celdas[colIdx] || '').trim();
        if (val !== '') {
          ejemplos.push(val);
          if (ejemplos.length >= 4) break;
        }
      }
      return {
        colIndex: colIdx,
        letraExcel: letra,
        tituloEncabezado: tituloRaw || `Columna ${letra}`,
        ejemplos,
      };
    });

    const asignacionAuto = autoAsignarColumnasInteligente(colsTemp, true);

    setFilasMatriz(filas);
    setLetrasColumnas(letras);
    setIndiceFilaEncabezado(idxHeaderDetectado);
    setArchivoTieneEncabezados(true);
    setAsignacionColumnas(asignacionAuto);
    setPasoActivo('mapeo');

    actualizarRegistros(filas, idxHeaderDetectado, true, asignacionAuto);
  };

  const handleLeerArchivo = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        sileo.error({
          title: 'Archivo inválido',
          description: 'No se encontraron hojas de cálculo dentro del archivo.',
        });
        return;
      }

      const primeraHoja = wb.SheetNames[0];
      setNombreArchivo(file.name);
      setWorkbook(wb);
      setHojasDisponibles(wb.SheetNames);
      setHojaActiva(primeraHoja);
      procesarHojaWorkbook(wb, primeraHoja);

      sileo.success({
        title: 'Archivo Excel analizado',
        description: `Se leyó "${file.name}". Revisa las columnas asignadas o continúa al padrón.`,
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al leer el archivo Excel',
        description: obtenerMensajeError(
          err,
          'Asegúrate de subir un archivo .xlsx, .xls o .csv válido.'
        ),
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleLeerArchivo(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleLeerArchivo(file);
    }
  };

  const handleCambiarDestinoColumna = (colIndex: number, nuevoDestino: CampoDestinoKey) => {
    const def = nuevoDestino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(nuevoDestino) : undefined;
    const nuevaAsignacion = { ...asignacionColumnas };

    if (nuevoDestino !== 'ignorar' && !def?.permiteMultiples) {
      Object.keys(nuevaAsignacion).forEach((k) => {
        const idx = Number(k);
        if (nuevaAsignacion[idx] === nuevoDestino) {
          nuevaAsignacion[idx] = 'ignorar';
        }
      });
    }

    nuevaAsignacion[colIndex] = nuevoDestino;
    setAsignacionColumnas(nuevaAsignacion);
    actualizarRegistros(
      filasMatriz,
      indiceFilaEncabezado,
      archivoTieneEncabezados,
      nuevaAsignacion
    );
  };

  const handleCambiarFilaEncabezado = (nuevoIdx: number, tieneTitulos: boolean) => {
    setIndiceFilaEncabezado(nuevoIdx);
    setArchivoTieneEncabezados(tieneTitulos);

    const filaTitulos = tieneTitulos ? filasMatriz[nuevoIdx]?.celdas || [] : [];
    const filasDatos = tieneTitulos ? filasMatriz.slice(nuevoIdx + 1) : filasMatriz;

    const colsTemp: ColumnaInfoExcel[] = letrasColumnas.map((letra, colIdx) => {
      const tituloRaw = (filaTitulos[colIdx] || '').trim();
      const ejemplos: string[] = [];
      for (const f of filasDatos) {
        const val = (f.celdas[colIdx] || '').trim();
        if (val !== '') {
          ejemplos.push(val);
          if (ejemplos.length >= 4) break;
        }
      }
      return {
        colIndex: colIdx,
        letraExcel: letra,
        tituloEncabezado: tituloRaw || `Columna ${letra}`,
        ejemplos,
      };
    });

    const nuevaAsignacion = autoAsignarColumnasInteligente(colsTemp, tieneTitulos);
    setAsignacionColumnas(nuevaAsignacion);
    actualizarRegistros(filasMatriz, nuevoIdx, tieneTitulos, nuevaAsignacion);
  };

  const registrosFiltrados = useMemo(() => {
    const q = busquedaPreview.trim().toLowerCase();
    return registros.filter((r) => {
      if (filtroPreview === 'seleccionados' && !r.seleccionado) return false;
      if (filtroPreview === 'nuevos' && r.yaExisteEnPadron) return false;
      if (filtroPreview === 'existentes' && !r.yaExisteEnPadron) return false;

      if (!q) return true;
      return (
        r.nombre_completo.toLowerCase().includes(q) ||
        r.direccion.toLowerCase().includes(q) ||
        r.telefono.toLowerCase().includes(q) ||
        r.barrioTexto.toLowerCase().includes(q) ||
        r.documento_identidad.toLowerCase().includes(q)
      );
    });
  }, [registros, busquedaPreview, filtroPreview]);

  const totalPaginasPreview = Math.max(
    1,
    Math.ceil(registrosFiltrados.length / itemsPorPagina)
  );
  const paginaSeguraPreview = Math.min(paginaPreview, totalPaginasPreview);
  const indiceInicioPreview = (paginaSeguraPreview - 1) * itemsPorPagina;
  const indiceFinPreview = Math.min(
    indiceInicioPreview + itemsPorPagina,
    registrosFiltrados.length
  );

  const registrosPaginados = useMemo(() => {
    return registrosFiltrados.slice(
      indiceInicioPreview,
      indiceInicioPreview + itemsPorPagina
    );
  }, [registrosFiltrados, indiceInicioPreview, itemsPorPagina]);

  const resumen = useMemo<ResumenImportacion>(() => {
    const seleccionados = registros.filter((r) => r.seleccionado);
    const totalTomas = seleccionados.reduce((acc, r) => acc + (r.cantidadTomas || 0), 0);
    const nuevos = seleccionados.filter((r) => !r.yaExisteEnPadron).length;
    const existentes = seleccionados.filter((r) => r.yaExisteEnPadron).length;

    return {
      totalLeidos: registros.length,
      totalSeleccionados: seleccionados.length,
      totalTomas,
      nuevos,
      existentes,
    };
  }, [registros]);

  const todosVisiblesSeleccionados =
    registrosFiltrados.length > 0 && registrosFiltrados.every((r) => r.seleccionado);

  const handleToggleTodosVisibles = () => {
    const idsVisibles = new Set(registrosFiltrados.map((r) => r.idTemporal));
    const nuevoValor = !todosVisiblesSeleccionados;
    setRegistros((prev) =>
      prev.map((r) => (idsVisibles.has(r.idTemporal) ? { ...r, seleccionado: nuevoValor } : r))
    );
  };

  const handleActualizarFila = <K extends keyof RegistroImportar>(
    idTemporal: string,
    campo: K,
    valor: RegistroImportar[K]
  ) => {
    setRegistros((prev) =>
      prev.map((r) => (r.idTemporal === idTemporal ? { ...r, [campo]: valor } : r))
    );
  };

  const handleEjecutarImportacion = async () => {
    const seleccionados = registros.filter(
      (r) => r.seleccionado && r.nombre_completo.trim()
    );

    if (seleccionados.length === 0) {
      sileo.warning({
        title: 'Sin registros seleccionados',
        description: 'Marca al menos un contribuyente en la tabla para importar.',
      });
      return;
    }

    const confirmar = window.confirm(
      `¿Confirmas importar ${seleccionados.length} contribuyentes a la base de datos?`
    );
    if (!confirmar) return;

    setImportando(true);
    setProgresoActual(0);
    setProgresoTotal(seleccionados.length);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Sesión de usuario no válida o expirada.');
      }

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('organizacion_id')
        .eq('id', user.id)
        .single();

      if (!perfil?.organizacion_id) {
        throw new Error('No se encontró una organización activa asignada al usuario.');
      }

      const orgId = perfil.organizacion_id;

      const mapaManzanas = new Map<string, string>();
      manzanas.forEach((m) => {
        const clave = `${m.barrio.trim().toLowerCase()}|${m.numero_manzana.trim().toLowerCase()}`;
        mapaManzanas.set(clave, m.id);
      });

      let maxConsecutivo = 0;
      const { data: tomasExistentes } = await supabase
        .from('tomas')
        .select('codigo_toma')
        .eq('organizacion_id', orgId)
        .is('deleted_at', null);

      tomasExistentes?.forEach((t) => {
        const cod = t.codigo_toma || '';
        let idx = cod.length - 1;
        while (idx >= 0 && cod.charCodeAt(idx) >= 48 && cod.charCodeAt(idx) <= 57) {
          idx--;
        }
        const sufijoDigitos = cod.slice(idx + 1);
        if (sufijoDigitos) {
          const num = Number.parseInt(sufijoDigitos, 10);
          if (num > maxConsecutivo) maxConsecutivo = num;
        }
      });

      const TAMANIO_LOTE = 150;
      let totalPersonasCreadas = 0;
      let totalPersonasVinculadas = 0;
      let totalTomasCreadas = 0;

      for (let offset = 0; offset < seleccionados.length; offset += TAMANIO_LOTE) {
        const lote = seleccionados.slice(offset, offset + TAMANIO_LOTE);

        const registrosNuevos: { indexEnLote: number; payload: any }[] = [];
        const personaIdPorIndex = new Map<number, string>();

        lote.forEach((r, idx) => {
          if (r.personaExistenteId) {
            personaIdPorIndex.set(idx, r.personaExistenteId);
            totalPersonasVinculadas += 1;
          } else {
            registrosNuevos.push({
              indexEnLote: idx,
              payload: {
                organizacion_id: orgId,
                nombre_completo: r.nombre_completo.trim(),
                documento_identidad: r.documento_identidad.trim() || null,
                telefono: r.telefono.trim() || null,
                direccion: r.direccion.trim() || null,
                notas: r.notas.trim() || null,
                activo: true,
              },
            });
          }
        });

        if (registrosNuevos.length > 0) {
          const { data: personasGuardadas, error: errP } = await supabase
            .from('personas')
            .insert(registrosNuevos.map((rn) => rn.payload))
            .select('id');

          if (errP || !personasGuardadas) {
            throw errP || new Error('Error al registrar bloque de contribuyentes.');
          }

          personasGuardadas.forEach((p, i) => {
            const indexOriginal = registrosNuevos[i].indexEnLote;
            personaIdPorIndex.set(indexOriginal, p.id);
          });

          totalPersonasCreadas += personasGuardadas.length;
        }

        const tomasPayload: any[] = [];
        lote.forEach((r, idx) => {
          const personaId = personaIdPorIndex.get(idx);
          if (!personaId) return;

          const cantTomas = r.cantidadTomas || 0;
          if (cantTomas <= 0) return;

          const codigosExplicitos = r.codigoTomaExplicito
            ? r.codigoTomaExplicito.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean)
            : [];

          let mId: string | null = null;
          if (r.barrioTexto.trim()) {
            const clave = `${r.barrioTexto.trim().toLowerCase()}|${(r.manzanaTexto.trim() || 'Mz 1').toLowerCase()}`;
            mId = mapaManzanas.get(clave) || null;
          }

          for (let i = 0; i < cantTomas; i++) {
            maxConsecutivo += 1;
            const codigo =
              codigosExplicitos[i] || `TOMA-${String(maxConsecutivo).padStart(4, '0')}`;

            tomasPayload.push({
              organizacion_id: orgId,
              persona_id: personaId,
              manzana_id: mId,
              codigo_toma: codigo,
              direccion_referencia:
                r.direccion.trim() || 'Domicilio registrado en censo comunitario',
              tipo_toma: r.tipoToma || 'domestica',
              estado: 'activa',
              numero_medidor: i === 0 && r.medidorTexto.trim() ? r.medidorTexto.trim() : null,
              saldo_pendiente: i === 0 ? (r.saldoInicial || 0) : 0,
            });
          }
        });

        if (tomasPayload.length > 0) {
          const { error: errT } = await supabase.from('tomas').insert(tomasPayload);
          if (errT) throw errT;
          totalTomasCreadas += tomasPayload.length;
        }

        setProgresoActual(Math.min(seleccionados.length, offset + lote.length));
      }

      sileo.success({
        title: 'Censo importado con éxito',
        description: `Se registraron ${totalPersonasCreadas} contribuyentes nuevos${
          totalPersonasVinculadas > 0 ? `, se vincularon ${totalPersonasVinculadas} existentes` : ''
        } y se crearon ${totalTomasCreadas} tomas de agua.`,
      });

      await Promise.resolve(onImportacionCompletada());
    } catch (err: unknown) {
      sileo.error({
        title: 'Error durante la importación',
        description: obtenerMensajeError(err, 'Ocurrió un error inesperado al registrar el censo.'),
      });
    } finally {
      setImportando(false);
    }
  };

  const filasMuestraExcel = useMemo(() => {
    if (filasMatriz.length === 0) return [];
    const inicioDatos = archivoTieneEncabezados ? indiceFilaEncabezado + 1 : 0;
    return filasMatriz.slice(inicioDatos, inicioDatos + 5);
  }, [filasMatriz, indiceFilaEncabezado, archivoTieneEncabezados]);

  const tieneColumnaNombreAsignada = Object.values(asignacionColumnas).includes(
    'nombre_completo'
  );

  return (
    <div className="w-full space-y-6">
      {/* Cabecera Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Padrón de Contribuyentes
          </button>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Importador de Censo desde Excel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="md"
            icon={<Download className="w-4 h-4" />}
            onClick={descargarPlantillaExcel}
          >
            Descargar Plantilla Ejemplo
          </Button>

          {workbook && (
            <Button
              type="button"
              variant="outline"
              size="md"
              icon={<Upload className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Subir Otro Archivo
            </Button>
          )}
        </div>
      </div>

      {/* Input oculto de archivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {!workbook ? (
        <ZonaCargaArchivo
          onSeleccionarClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
        />
      ) : (
        <>
          {/* Medidores Radiales del Censo Cargado */}
          <CardGroup>
            <Card
              tone="blue"
              icon={<Users />}
              label="Personas Leídas"
              value={resumen.totalLeidos}
              hint={`Archivo: ${nombreArchivo}`}
            />
            <Card
              tone="green"
              icon={<CheckCircle2 />}
              label="Seleccionados"
              value={resumen.totalSeleccionados}
              progress={
                resumen.totalLeidos > 0 ? resumen.totalSeleccionados / resumen.totalLeidos : 0
              }
              hint="Listos para importar"
            />
            <Card
              tone="cyan"
              icon={<Droplets />}
              label="Tomas Detectadas"
              value={resumen.totalTomas}
              hint="Según columna de tomas"
            />
            <Card
              tone={resumen.existentes > 0 ? 'amber' : 'purple'}
              icon={<Layers />}
              label="Nuevos Titulares"
              value={resumen.nuevos}
              hint={
                resumen.existentes > 0
                  ? `${resumen.existentes} ya existen en el padrón`
                  : '100% registros nuevos'
              }
            />
          </CardGroup>

          {/* Barra de Navegación por Pasos (evita amontonar ambas tablas) */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setPasoActivo('mapeo')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                pasoActivo === 'mapeo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/50'
              }`}
            >
              <Table2 className="w-4 h-4" />
              1. Asignación de Columnas
            </button>

            <button
              type="button"
              disabled={!tieneColumnaNombreAsignada}
              onClick={() => setPasoActivo('previsualizacion')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                pasoActivo === 'previsualizacion'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              2. Padrón a Guardar ({resumen.totalSeleccionados})
            </button>
          </div>

          {/* Vista del Paso Activo */}
          {pasoActivo === 'mapeo' ? (
            <PasoMapeoColumnas
              hojasDisponibles={hojasDisponibles}
              hojaActiva={hojaActiva}
              onCambiarHoja={(nuevaHoja) => {
                setHojaActiva(nuevaHoja);
                if (workbook) procesarHojaWorkbook(workbook, nuevaHoja);
              }}
              archivoTieneEncabezados={archivoTieneEncabezados}
              indiceFilaEncabezado={indiceFilaEncabezado}
              filasMatriz={filasMatriz}
              onCambiarFilaEncabezado={handleCambiarFilaEncabezado}
              tieneColumnaNombreAsignada={tieneColumnaNombreAsignada}
              infoColumnas={infoColumnas}
              asignacionColumnas={asignacionColumnas}
              onCambiarDestinoColumna={handleCambiarDestinoColumna}
              filasMuestraExcel={filasMuestraExcel}
              onContinuarPrevisualizacion={() => setPasoActivo('previsualizacion')}
            />
          ) : (
            <PasoPrevisualizacionRegistros
              registros={registros}
              registrosFiltrados={registrosFiltrados}
              registrosPaginados={registrosPaginados}
              resumen={resumen}
              busquedaPreview={busquedaPreview}
              onCambiarBusqueda={(val) => {
                setBusquedaPreview(val);
                setPaginaPreview(1);
              }}
              filtroPreview={filtroPreview}
              onCambiarFiltro={(val) => {
                setFiltroPreview(val);
                setPaginaPreview(1);
              }}
              todosVisiblesSeleccionados={todosVisiblesSeleccionados}
              onToggleTodosVisibles={handleToggleTodosVisibles}
              onActualizarFila={handleActualizarFila}
              tieneColumnaNombreAsignada={tieneColumnaNombreAsignada}
              paginaSeguraPreview={paginaSeguraPreview}
              totalPaginasPreview={totalPaginasPreview}
              indiceInicioPreview={indiceInicioPreview}
              indiceFinPreview={indiceFinPreview}
              itemsPorPagina={itemsPorPagina}
              onCambiarPagina={setPaginaPreview}
              importando={importando}
              progresoActual={progresoActual}
              progresoTotal={progresoTotal}
              onEjecutarImportacion={handleEjecutarImportacion}
              onVolverAMapeo={() => setPasoActivo('mapeo')}
            />
          )}
        </>
      )}
    </div>
  );
}
