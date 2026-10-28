'use client';

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Download,
  Users,
  Droplets,
  Layers,
  Check,
  RefreshCw,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  ChevronLeft,
  ChevronRight,
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
import { obtenerMensajeError } from '@/lib/utils/errors';
import { useRegistrosPorPagina } from '@/hooks/use-registros-por-pagina';
import type { Manzana, TipoToma } from '@/types/database';
import type { PersonaConTomas } from './PersonasManager';

export interface ImportadorCensoExcelProps {
  personasExistentes: PersonaConTomas[];
  manzanas: Manzana[];
  onVolver: () => void;
  onImportacionCompletada: () => void;
}

interface MapeoColumnas {
  nombre_completo: string;
  documento_identidad: string;
  telefono: string;
  direccion: string;
  cantidad_tomas: string;
  codigo_toma: string;
  barrio: string;
  numero_manzana: string;
  tipo_toma: string;
  numero_medidor: string;
  saldo_pendiente: string;
  notas: string;
}

interface TomaImportarItem {
  codigo_toma: string;
  tipo_toma: TipoToma;
  estado: 'activa';
  direccion_referencia: string;
  numero_medidor: string;
  saldo_pendiente: number;
  manzana_id: string | null;
  barrio: string;
  numero_manzana: string;
}

interface RegistroImportar {
  idTemporal: string;
  filaOrigen: number;
  seleccionado: boolean;
  nombre_completo: string;
  documento_identidad: string;
  telefono: string;
  direccion: string;
  notas: string;
  cantidadTomas: number;
  barrioTexto: string;
  manzanaTexto: string;
  codigoTomaExplicito: string;
  medidorTexto: string;
  saldoInicial: number;
  tipoToma: TipoToma;
  yaExisteEnPadron: boolean;
  personaExistenteId?: string;
}

const CAMPOS_SISTEMA: {
  key: keyof MapeoColumnas;
  label: string;
  obligatorio?: boolean;
  ayuda: string;
}[] = [
  {
    key: 'nombre_completo',
    label: 'Nombre Completo / Titular *',
    obligatorio: true,
    ayuda: 'Columna con el nombre del ciudadano o jefe de familia',
  },
  {
    key: 'telefono',
    label: 'Teléfono / Celular',
    ayuda: 'Número telefónico de contacto',
  },
  {
    key: 'direccion',
    label: 'Dirección / Calle / Referencia',
    ayuda: 'Domicilio del contribuyente y referencia de su toma',
  },
  {
    key: 'cantidad_tomas',
    label: 'Cantidad de Tomas (Núm.)',
    ayuda: 'Ej: 1, 2, 3 tomas por vivienda (o 0 si no tiene)',
  },
  {
    key: 'codigo_toma',
    label: 'Código(s) de Toma (Opcional)',
    ayuda: 'Si el censo ya asignó folio (ej. TOMA-0012)',
  },
  {
    key: 'documento_identidad',
    label: 'CURP / INE / Identificación',
    ayuda: 'Clave electoral o CURP para evitar duplicados',
  },
  {
    key: 'barrio',
    label: 'Barrio / Sector / Colonia',
    ayuda: 'Nombre del barrio o sector territorial',
  },
  {
    key: 'numero_manzana',
    label: 'Manzana / Sección',
    ayuda: 'Número o nombre de manzana (ej. Mz 1)',
  },
  {
    key: 'tipo_toma',
    label: 'Tipo de Toma',
    ayuda: 'Doméstica, Comercial, Comunal o Lote Baldío',
  },
  {
    key: 'numero_medidor',
    label: 'Número de Medidor',
    ayuda: 'Serie del medidor físico si cuenta con uno',
  },
  {
    key: 'saldo_pendiente',
    label: 'Saldo / Adeudo Inicial ($)',
    ayuda: 'Adeudo acumulado previo al sistema ($ MXN)',
  },
  {
    key: 'notas',
    label: 'Notas / Observaciones del Censo',
    ayuda: 'Comentarios adicionales capturados en el censo',
  },
];

function normalizarTexto(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarTipoToma(valor: string): TipoToma {
  const norm = normalizarTexto(valor);
  if (norm.includes('comerc') || norm.includes('negoc') || norm.includes('tienda')) {
    return 'comercial';
  }
  if (norm.includes('comun') || norm.includes('public') || norm.includes('escuela') || norm.includes('iglesia')) {
    return 'comunal';
  }
  if (norm.includes('baldio') || norm.includes('lote') || norm.includes('terreno')) {
    return 'lote_baldio';
  }
  return 'domestica';
}

function autoDetectarMapeo(columnas: string[]): MapeoColumnas {
  const encontrar = (patrones: string[]): string => {
    for (const patron of patrones) {
      const col = columnas.find((c) => normalizarTexto(c).includes(patron));
      if (col) return col;
    }
    return '';
  };

  return {
    nombre_completo: encontrar([
      'nombre completo',
      'nombre',
      'titular',
      'contribuyente',
      'jefe de familia',
      'ciudadano',
      'persona',
      'usuario',
    ]),
    documento_identidad: encontrar(['curp', 'ine', 'documento', 'identificacion', 'ife', 'dni']),
    telefono: encontrar(['telefono', 'celular', 'tel', 'cel', 'whatsapp', 'movil', 'contacto']),
    direccion: encontrar([
      'direccion',
      'domicilio',
      'calle',
      'referencia',
      'ubicacion',
    ]),
    cantidad_tomas: encontrar([
      'no. tomas',
      'num tomas',
      'numero de tomas',
      'cantidad de tomas',
      'cant tomas',
      'tomas',
    ]),
    codigo_toma: encontrar([
      'codigo de toma',
      'codigo toma',
      'folio toma',
      'clave toma',
      'contrato',
    ]),
    barrio: encontrar(['barrio', 'sector', 'colonia', 'localidad', 'zona']),
    numero_manzana: encontrar(['manzana', 'mz', 'cuadra']),
    tipo_toma: encontrar(['tipo de toma', 'tipo toma', 'uso', 'giro', 'categoria']),
    numero_medidor: encontrar(['medidor', 'no. medidor', 'serie medidor']),
    saldo_pendiente: encontrar(['saldo', 'adeudo', 'deuda', 'pendiente', 'mora']),
    notas: encontrar(['nota', 'observacion', 'comentario', 'detalle', 'censo']),
  };
}

export function ImportadorCensoExcel({
  personasExistentes,
  manzanas,
  onVolver,
  onImportacionCompletada,
}: ImportadorCensoExcelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado del archivo Excel cargado
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [hojasDisponibles, setHojasDisponibles] = useState<string[]>([]);
  const [hojaActiva, setHojaActiva] = useState<string>('');
  const [columnasExcel, setColumnasExcel] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);

  // Mapeo de columnas
  const [mapeo, setMapeo] = useState<MapeoColumnas>({
    nombre_completo: '',
    documento_identidad: '',
    telefono: '',
    direccion: '',
    cantidad_tomas: '',
    codigo_toma: '',
    barrio: '',
    numero_manzana: '',
    tipo_toma: '',
    numero_medidor: '',
    saldo_pendiente: '',
    notas: '',
  });
  const [mostrarMapeoColumnas, setMostrarMapeoColumnas] = useState(true);

  // Parámetros por defecto para creación de tomas
  const [crearTomaPorDefecto, setCrearTomaPorDefecto] = useState(true);
  const [manzanaDefaultId, setManzanaDefaultId] = useState<string>(manzanas[0]?.id || '');
  const [modoDuplicados, setModoDuplicados] = useState<'vincular_tomas' | 'omitir'>('vincular_tomas');

  // Registros procesados y editables en la tabla de previsualización
  const [registros, setRegistros] = useState<RegistroImportar[]>([]);
  const [busquedaPreview, setBusquedaPreview] = useState('');
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'seleccionados' | 'nuevos' | 'existentes'>('todos');
  const [paginaPreview, setPaginaPreview] = useState(1);
  const itemsPorPagina = useRegistrosPorPagina();

  // Estado de guardado por lotes
  const [importando, setImportando] = useState(false);
  const [progresoActual, setProgresoActual] = useState(0);
  const [progresoTotal, setProgresoTotal] = useState(0);

  // Mapas rápidos para detectar si una persona del Excel ya está en el padrón
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

  // Construir los registros previsualizados a partir de filasCrudas + mapeo
  const construirRegistrosDesdeMapeo = (
    filas: Record<string, unknown>[],
    mapActual: MapeoColumnas,
    crearTomaDefault: boolean
  ) => {
    const lista: RegistroImportar[] = [];

    filas.forEach((fila, index) => {
      const leerCelda = (colName: string): string => {
        if (!colName) return '';
        const val = fila[colName];
        if (val === null || val === undefined) return '';
        return String(val).trim();
      };

      const nombre = leerCelda(mapActual.nombre_completo);
      if (!nombre) return; // Ignorar renglones vacíos sin nombre

      const doc = leerCelda(mapActual.documento_identidad);
      const tel = leerCelda(mapActual.telefono);
      const dir = leerCelda(mapActual.direccion);
      const notas = leerCelda(mapActual.notas);
      const barrioTxt = leerCelda(mapActual.barrio);
      const manzanaTxt = leerCelda(mapActual.numero_manzana);
      const codigoExplicito = leerCelda(mapActual.codigo_toma);
      const medidorTxt = leerCelda(mapActual.numero_medidor);
      const tipoTxt = leerCelda(mapActual.tipo_toma);
      const saldoTxt = leerCelda(mapActual.saldo_pendiente).replace(/[^0-9.-]/g, '');
      const saldoNum = Math.max(0, parseFloat(saldoTxt) || 0);

      // Determinar cuántas tomas corresponden a este registro
      let cantTomas = crearTomaDefault ? 1 : 0;
      if (mapActual.cantidad_tomas) {
        const celdaTomas = leerCelda(mapActual.cantidad_tomas);
        const numParseado = parseInt(celdaTomas.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numParseado)) {
          cantTomas = Math.min(20, Math.max(0, numParseado));
        } else if (celdaTomas.toLowerCase() === 'si' || celdaTomas.toLowerCase() === 'sí') {
          cantTomas = 1;
        } else if (celdaTomas.toLowerCase() === 'no' || celdaTomas.toLowerCase() === 'ninguna') {
          cantTomas = 0;
        }
      } else if (codigoExplicito) {
        const codigosSeparados = codigoExplicito
          .split(/[,;/]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        cantTomas = Math.max(1, codigosSeparados.length);
      }

      // Verificar si ya existe en el padrón actual
      const idPorDoc = doc ? mapaDocumentosExistentes.get(doc.toUpperCase()) : undefined;
      const idPorNombre = mapaNombresExistentes.get(normalizarTexto(nombre));
      const personaExistenteId = idPorDoc || idPorNombre;
      const yaExiste = Boolean(personaExistenteId);

      lista.push({
        idTemporal: `ROW-${index + 2}`,
        filaOrigen: index + 2,
        seleccionado: true,
        nombre_completo: nombre,
        documento_identidad: doc,
        telefono: tel,
        direccion: dir,
        notas,
        cantidadTomas: cantTomas,
        barrioTexto: barrioTxt,
        manzanaTexto: manzanaTxt,
        codigoTomaExplicito: codigoExplicito,
        medidorTexto: medidorTxt,
        saldoInicial: saldoNum,
        tipoToma: tipoTxt ? normalizarTipoToma(tipoTxt) : 'domestica',
        yaExisteEnPadron: yaExiste,
        personaExistenteId,
      });
    });

    setRegistros(lista);
  };

  // Procesar una hoja específica del Workbook
  const procesarHojaWorkbook = (wb: XLSX.WorkBook, nombreHoja: string) => {
    const worksheet = wb.Sheets[nombreHoja];
    if (!worksheet) return;

    const jsonFilas = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
    });

    if (jsonFilas.length === 0) {
      sileo.warning({
        title: 'Hoja vacía',
        description: `La hoja "${nombreHoja}" no contiene filas con datos.`,
      });
      setColumnasExcel([]);
      setFilasCrudas([]);
      setRegistros([]);
      return;
    }

    const columnasDetectadas = Object.keys(jsonFilas[0] || {});
    const mapeoDetectado = autoDetectarMapeo(columnasDetectadas);

    // Si ninguna columna coincidió con "nombre", usar la primera columna por defecto
    if (!mapeoDetectado.nombre_completo && columnasDetectadas.length > 0) {
      mapeoDetectado.nombre_completo = columnasDetectadas[0];
    }

    setColumnasExcel(columnasDetectadas);
    setFilasCrudas(jsonFilas);
    setMapeo(mapeoDetectado);
    construirRegistrosDesdeMapeo(jsonFilas, mapeoDetectado, crearTomaPorDefecto);
  };

  // Leer el archivo subido por el usuario
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
        title: 'Archivo Excel leído',
        description: `Se cargó "${file.name}" correctamente. Verifica las columnas y selecciona los registros a importar.`,
      });
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al leer el archivo Excel',
        description: obtenerMensajeError(err, 'Asegúrate de subir un archivo .xlsx, .xls o .csv válido.'),
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLeerArchivo(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLeerArchivo(file);
    }
  };

  // Actualizar el mapeo de una columna y recalcular previsualización
  const handleCambiarMapeo = (campo: keyof MapeoColumnas, nuevaColumnaExcel: string) => {
    const nuevoMapeo = {
      ...mapeo,
      [campo]: nuevaColumnaExcel,
    };
    setMapeo(nuevoMapeo);
    construirRegistrosDesdeMapeo(filasCrudas, nuevoMapeo, crearTomaPorDefecto);
  };

  // Descargar plantilla de ejemplo en Excel (.xlsx)
  const handleDescargarPlantilla = () => {
    const datosEjemplo = [
      {
        'Nombre Completo': 'Juan Pérez Hernández',
        Teléfono: '2441234567',
        Dirección: 'Calle Morelos #12, frente a la escuela',
        'CURP o INE': 'PEHJ800101HPLR01',
        Barrio: 'Centro',
        Manzana: 'Mz 1',
        'Cantidad de Tomas': 1,
        'Tipo de Toma': 'Doméstica',
        'Código de Toma': '',
        Medidor: '',
        'Saldo Pendiente': 0,
        Observaciones: 'Censo Comunitario',
      },
      {
        'Nombre Completo': 'María López García',
        Teléfono: '2449876543',
        Dirección: 'Av. Juárez #45, portón verde',
        'CURP o INE': '',
        Barrio: 'San Juan',
        Manzana: 'Mz 3',
        'Cantidad de Tomas': 2,
        'Tipo de Toma': 'Doméstica',
        'Código de Toma': '',
        Medidor: 'MED-104',
        'Saldo Pendiente': 100,
        Observaciones: 'Cuenta con 2 tomas en el mismo predio',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(datosEjemplo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Censo_Comunidad');
    XLSX.writeFile(wb, 'Plantilla_Censo_Agua_Potable.xlsx');
  };

  // Filtrado de registros en la tabla de previsualización
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

  const totalPaginasPreview = Math.max(1, Math.ceil(registrosFiltrados.length / itemsPorPagina));
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

  // Estadísticas en vivo de la selección
  const resumen = useMemo(() => {
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

  // Alternar selección de todos los registros visibles
  const todosVisiblesSeleccionados =
    registrosFiltrados.length > 0 && registrosFiltrados.every((r) => r.seleccionado);

  const handleToggleTodosVisibles = () => {
    const idsVisibles = new Set(registrosFiltrados.map((r) => r.idTemporal));
    const nuevoValor = !todosVisiblesSeleccionados;
    setRegistros((prev) =>
      prev.map((r) => (idsVisibles.has(r.idTemporal) ? { ...r, seleccionado: nuevoValor } : r))
    );
  };

  // Actualizar un campo individual de una fila en la previsualización
  const handleActualizarFila = <K extends keyof RegistroImportar>(
    idTemporal: string,
    campo: K,
    valor: RegistroImportar[K]
  ) => {
    setRegistros((prev) =>
      prev.map((r) => (r.idTemporal === idTemporal ? { ...r, [campo]: valor } : r))
    );
  };

  // Ejecutar la importación masiva hacia Supabase en bloques seguros
  const handleEjecutarImportacion = async () => {
    const seleccionados = registros.filter((r) => r.seleccionado && r.nombre_completo.trim());

    if (seleccionados.length === 0) {
      sileo.warning({
        title: 'Sin registros seleccionados',
        description: 'Marca al menos un contribuyente en la tabla para importar.',
      });
      return;
    }

    const confirmar = window.confirm(
      `¿Confirmas importar ${seleccionados.length} contribuyentes y ${resumen.totalTomas} tomas de agua a la base de datos?`
    );
    if (!confirmar) return;

    setImportando(true);
    setProgresoActual(0);
    setProgresoTotal(seleccionados.length);

    try {
      // Construir el payload estructurado (consolidando si el mismo nombre viene repetido en el Excel)
      const mapaConsolidado = new Map<
        string,
        {
          nombre_completo: string;
          documento_identidad: string;
          telefono: string;
          direccion: string;
          notas: string;
          tomas: TomaImportarItem[];
        }
      >();

      for (const r of seleccionados) {
        const clavePersona = r.documento_identidad
          ? `DOC:${r.documento_identidad.toUpperCase()}`
          : `NOM:${normalizarTexto(r.nombre_completo)}`;

        let entrada = mapaConsolidado.get(clavePersona);
        if (!entrada) {
          entrada = {
            nombre_completo: r.nombre_completo.trim(),
            documento_identidad: r.documento_identidad.trim(),
            telefono: r.telefono.trim(),
            direccion: r.direccion.trim(),
            notas: r.notas.trim(),
            tomas: [],
          };
          mapaConsolidado.set(clavePersona, entrada);
        }

        // Generar las N tomas para este registro
        const codigosExplicitos = r.codigoTomaExplicito
          ? r.codigoTomaExplicito
              .split(/[,;/]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        for (let i = 0; i < r.cantidadTomas; i++) {
          entrada.tomas.push({
            codigo_toma: codigosExplicitos[i] || '',
            tipo_toma: r.tipoToma || 'domestica',
            estado: 'activa',
            direccion_referencia:
              r.direccion.trim() || 'Domicilio registrado en censo comunitario',
            numero_medidor: i === 0 ? r.medidorTexto.trim() : '',
            saldo_pendiente: i === 0 ? r.saldoInicial : 0,
            manzana_id: !r.barrioTexto && manzanaDefaultId ? manzanaDefaultId : null,
            barrio: r.barrioTexto.trim(),
            numero_manzana: r.manzanaTexto.trim(),
          });
        }
      }

      const listaConsolidada = Array.from(mapaConsolidado.values());
      const TAMANIO_LOTE = 150;

      let totalPersonasCreadas = 0;
      let totalPersonasVinculadas = 0;
      let totalPersonasOmitidas = 0;
      let totalTomasCreadas = 0;

      for (let offset = 0; offset < listaConsolidada.length; offset += TAMANIO_LOTE) {
        const lote = listaConsolidada.slice(offset, offset + TAMANIO_LOTE);

        const { data, error } = await supabase.rpc('importar_padron_masivo', {
          p_registros: lote,
          p_modo_duplicados: modoDuplicados,
        });

        if (error) {
          // Fallback automático vía API cliente si aún no se ha corrido el SQL de importar_padron_masivo
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw error;

          const { data: perfil } = await supabase
            .from('perfiles')
            .select('organizacion_id')
            .eq('id', user.id)
            .single();

          if (!perfil?.organizacion_id) throw error;
          const orgId = perfil.organizacion_id;

          let maxConsecutivo = personasExistentes.reduce((max, p) => {
            p.tomas?.forEach((t) => {
              const m = t.codigo_toma?.match(/(\d+)$/);
              const n = m ? parseInt(m[1], 10) : 0;
              if (n > max) max = n;
            });
            return max;
          }, 0) + totalTomasCreadas;

          for (const item of lote) {
            const idExistente =
              (item.documento_identidad
                ? mapaDocumentosExistentes.get(item.documento_identidad.toUpperCase())
                : undefined) || mapaNombresExistentes.get(normalizarTexto(item.nombre_completo));

            let personaIdFinal = idExistente;

            if (personaIdFinal) {
              if (modoDuplicados === 'omitir') {
                totalPersonasOmitidas += 1;
                continue;
              }
              totalPersonasVinculadas += 1;
            } else {
              const { data: nuevaP, error: errP } = await supabase
                .from('personas')
                .insert({
                  organizacion_id: orgId,
                  nombre_completo: item.nombre_completo,
                  documento_identidad: item.documento_identidad || null,
                  telefono: item.telefono || null,
                  direccion: item.direccion || null,
                  notas: item.notas || null,
                  activo: true,
                })
                .select('id')
                .single();

              if (errP || !nuevaP) throw errP || error;
              personaIdFinal = nuevaP.id;
              totalPersonasCreadas += 1;
            }

            if (item.tomas.length > 0 && personaIdFinal) {
              const tomasPayload = item.tomas.map((t) => {
                maxConsecutivo += 1;
                const codigo =
                  t.codigo_toma || `TOMA-${String(maxConsecutivo).padStart(4, '0')}`;
                return {
                  organizacion_id: orgId,
                  persona_id: personaIdFinal,
                  manzana_id: t.manzana_id || manzanas[0]?.id || null,
                  codigo_toma: codigo,
                  direccion_referencia: t.direccion_referencia,
                  tipo_toma: t.tipo_toma,
                  estado: 'activa' as const,
                  numero_medidor: t.numero_medidor || null,
                  saldo_pendiente: t.saldo_pendiente || 0,
                };
              });

              const { error: errT } = await supabase.from('tomas').insert(tomasPayload);
              if (!errT) {
                totalTomasCreadas += tomasPayload.length;
              }
            }
          }
        } else {
          totalPersonasCreadas += Number(data?.personas_creadas || 0);
          totalPersonasVinculadas += Number(data?.personas_existentes || 0);
          totalPersonasOmitidas += Number(data?.personas_omitidas || 0);
          totalTomasCreadas += Number(data?.tomas_creadas || 0);
        }

        setProgresoActual(Math.min(seleccionados.length, offset + lote.length));
      }

      sileo.success({
        title: '¡Censo importado con éxito!',
        description: `Se registraron ${totalPersonasCreadas} titulares nuevos, ${totalPersonasVinculadas} existentes actualizados${
          totalPersonasOmitidas > 0 ? ` (${totalPersonasOmitidas} omitidos)` : ''
        } y ${totalTomasCreadas} tomas de agua.`,
      });

      onImportacionCompletada();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error durante la importación',
        description: obtenerMensajeError(
          err,
          'Asegúrate de haber ejecutado el script SQL de importar_padron_masivo en Supabase.'
        ),
      });
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-200">
      {/* 1. Cabecera con navegación de regreso */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-dashed border-slate-300 dark:border-[#26345C] pb-5">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Padrón de Contribuyentes</span>
          </button>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <FileSpreadsheet className="w-6 h-6" />
            </span>
            <span>Importar Censo desde Excel</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-3xl">
            Carga tu archivo Excel (`.xlsx`, `.xls` o `.csv`) del censo comunitario, elige las columnas que te interesan y registra decenas o cientos de contribuyentes y sus tomas en un solo paso.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="md"
            icon={<Download className="w-4 h-4" />}
            onClick={handleDescargarPlantilla}
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
              Cambiar Archivo
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

      {/* 2. Zona de Carga si aún no se ha seleccionado archivo */}
      {!workbook ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer group bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-12 sm:p-16 text-center transition-all space-y-4 shadow-xs"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Haz clic para seleccionar tu archivo Excel o arrástralo aquí
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Soporta archivos <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong> con cualquier orden de columnas (Nombre, Teléfono, Dirección, Tomas, Barrio, etc.).
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm">
              <FileSpreadsheet className="w-4 h-4" />
              Seleccionar Archivo del Censo
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* 3. Medidores Radiales del Censo Cargado */}
          <CardGroup>
            <Card
              tone="blue"
              icon={<Users />}
              label="Filas Detectadas"
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
              hint="Se guardarán en la BD"
            />
            <Card
              tone="cyan"
              icon={<Droplets />}
              label="Tomas a Generar"
              value={resumen.totalTomas}
              hint="Contratos de agua vinculados"
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

          {/* 4. Panel de Selección de Columnas del Excel y Parámetros */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    1. Selecciona las Columnas del Excel que Importan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Asociamos automáticamente los encabezados de tu archivo; puedes ajustar cualquiera o ignorar los que no necesites.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hojasDisponibles.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Hoja:</span>
                    <select
                      value={hojaActiva}
                      onChange={(e) => {
                        const nuevaHoja = e.target.value;
                        setHojaActiva(nuevaHoja);
                        if (workbook) procesarHojaWorkbook(workbook, nuevaHoja);
                      }}
                      className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                    >
                      {hojasDisponibles.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarMapeoColumnas((v) => !v)}
                >
                  {mostrarMapeoColumnas ? 'Ocultar mapeo' : 'Configurar columnas'}
                </Button>
              </div>
            </div>

            {mostrarMapeoColumnas && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {CAMPOS_SISTEMA.map((campo) => {
                    const valorActual = mapeo[campo.key];
                    return (
                      <div
                        key={campo.key}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          valorActual
                            ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40'
                        }`}
                      >
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                          {campo.label}
                        </label>
                        <select
                          value={valorActual}
                          onChange={(e) => handleCambiarMapeo(campo.key, e.target.value)}
                          className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                        >
                          <option value="">-- Ignorar / No usar --</option>
                          {columnasExcel.map((col) => (
                            <option key={col} value={col}>
                              Columna: {col}
                            </option>
                          ))}
                        </select>
                        <span className="block text-[10px] text-slate-400 mt-1 leading-tight">
                          {campo.ayuda}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Reglas por defecto de importación */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={crearTomaPorDefecto}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setCrearTomaPorDefecto(val);
                          construirRegistrosDesdeMapeo(filasCrudas, mapeo, val);
                        }}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Asignar 1 toma por defecto si no se especifica cantidad
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          Crea automáticamente su toma con folio consecutivo (TOMA-XXXX).
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Barrio / Manzana por defecto (si el Excel no lo indica)
                    </label>
                    <select
                      value={manzanaDefaultId}
                      onChange={(e) => setManzanaDefaultId(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white"
                    >
                      {manzanas.length === 0 ? (
                        <option value="">Se creará Barrio Centro - Mz 1 automáticamente</option>
                      ) : (
                        manzanas.map((m) => (
                          <option key={m.id} value={m.id}>
                            Barrio {m.barrio} — {m.numero_manzana} (Sec. {m.seccion})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Si la persona ya existe en el padrón:
                    </label>
                    <select
                      value={modoDuplicados}
                      onChange={(e) =>
                        setModoDuplicados(e.target.value as 'vincular_tomas' | 'omitir')
                      }
                      className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white"
                    >
                      <option value="vincular_tomas">
                        Vincularle sus nuevas tomas y completar datos vacíos
                      </option>
                      <option value="omitir">
                        Omitir registro (no modificar ni agregarle tomas)
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Barra de Filtrado y Acción de Guardado Masivo */}
          <div className="space-y-4">
            <FilterBar
              searchValue={busquedaPreview}
              onSearchChange={(val) => {
                setBusquedaPreview(val);
                setPaginaPreview(1);
              }}
              searchPlaceholder="Filtrar previsualización por nombre, calle, teléfono o barrio..."
              action={
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  isLoading={importando}
                  disabled={resumen.totalSeleccionados === 0 || importando}
                  icon={<Sparkles className="w-4 h-4" />}
                  onClick={handleEjecutarImportacion}
                >
                  {importando
                    ? `Importando (${progresoActual}/${progresoTotal})...`
                    : `Importar ${resumen.totalSeleccionados} Usuarios y ${resumen.totalTomas} Tomas`}
                </Button>
              }
            >
              <FilterSelect
                label="Mostrar:"
                value={filtroPreview}
                onChange={(e) => {
                  setFiltroPreview(e.target.value as any);
                  setPaginaPreview(1);
                }}
              >
                <option value="todos">Todos los leídos ({registros.length})</option>
                <option value="seleccionados">
                  Seleccionados ({resumen.totalSeleccionados})
                </option>
                <option value="nuevos">Nuevos en padrón ({resumen.nuevos})</option>
                <option value="existentes">Ya registrados ({resumen.existentes})</option>
              </FilterSelect>
            </FilterBar>

            {/* Barra de progreso en vivo cuando se importan cientos de usuarios */}
            {importando && progresoTotal > 0 && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando contribuyentes y generando tomas en la base de datos...
                  </span>
                  <span>
                    {progresoActual} / {progresoTotal} (
                    {Math.round((progresoActual / progresoTotal) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-blue-200/70 dark:bg-blue-900 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.round((progresoActual / progresoTotal) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 6. Tabla Interactiva de Selección y Edición en Vivo */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={todosVisiblesSeleccionados}
                        onChange={handleToggleTodosVisibles}
                        title="Seleccionar o desmarcar todos los visibles"
                        className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="w-14">Fila</TableHead>
                    <TableHead>Nombre Completo / Titular</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Dirección / Referencia</TableHead>
                    <TableHead>Barrio / Manzana</TableHead>
                    <TableHead className="text-center w-28">Núm. Tomas</TableHead>
                    <TableHead className="text-center">Estado Padrón</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrosFiltrados.length === 0 ? (
                    <TableRow elevate={false}>
                      <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                        No hay registros que coincidan con el filtro actual.
                      </TableCell>
                    </TableRow>
                  ) : (
                    registrosPaginados.map((reg) => (
                      <TableRow
                        key={reg.idTemporal}
                        className={!reg.seleccionado ? 'opacity-50' : ''}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={reg.seleccionado}
                            onChange={(e) =>
                              handleActualizarFila(
                                reg.idTemporal,
                                'seleccionado',
                                e.target.checked
                              )
                            }
                            className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                          />
                        </TableCell>

                        <TableCell className="font-mono text-xs text-slate-400">
                          #{reg.filaOrigen}
                        </TableCell>

                        {/* Nombre editable en vivo */}
                        <TableCell>
                          <input
                            type="text"
                            value={reg.nombre_completo}
                            onChange={(e) =>
                              handleActualizarFila(
                                reg.idTemporal,
                                'nombre_completo',
                                e.target.value
                              )
                            }
                            className="w-full min-w-[180px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-sm font-bold text-slate-900 dark:text-white py-0.5"
                          />
                          {reg.documento_identidad && (
                            <span className="block text-[11px] font-mono text-slate-400">
                              ID: {reg.documento_identidad}
                            </span>
                          )}
                        </TableCell>

                        {/* Teléfono editable en vivo */}
                        <TableCell>
                          <input
                            type="text"
                            value={reg.telefono}
                            placeholder="Sin teléfono"
                            onChange={(e) =>
                              handleActualizarFila(reg.idTemporal, 'telefono', e.target.value)
                            }
                            className="w-full min-w-[110px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-xs text-slate-700 dark:text-slate-300 py-0.5"
                          />
                        </TableCell>

                        {/* Dirección editable en vivo */}
                        <TableCell>
                          <input
                            type="text"
                            value={reg.direccion}
                            placeholder="Domicilio conocido"
                            onChange={(e) =>
                              handleActualizarFila(reg.idTemporal, 'direccion', e.target.value)
                            }
                            className="w-full min-w-[180px] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-xs text-slate-700 dark:text-slate-300 py-0.5"
                          />
                        </TableCell>

                        {/* Barrio / Manzana */}
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                          {reg.barrioTexto ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {reg.barrioTexto}
                              {reg.manzanaTexto ? ` • ${reg.manzanaTexto}` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Por defecto</span>
                          )}
                        </TableCell>

                        {/* Cantidad de Tomas editable */}
                        <TableCell className="text-center">
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={reg.cantidadTomas}
                            onChange={(e) =>
                              handleActualizarFila(
                                reg.idTemporal,
                                'cantidadTomas',
                                Math.max(0, parseInt(e.target.value, 10) || 0)
                              )
                            }
                            className="w-16 text-center font-extrabold text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1 text-blue-600 dark:text-blue-400"
                          />
                        </TableCell>

                        {/* Estado en Padrón */}
                        <TableCell className="text-center whitespace-nowrap">
                          {reg.yaExisteEnPadron ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Ya registrado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              <Check className="w-3 h-3" />
                              Nuevo
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Barra de Paginación de Previsualización (50 por página) */}
            {registrosFiltrados.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-dashed border-slate-300 dark:border-[#26345C] text-xs text-slate-500 dark:text-slate-400">
                <div>
                  Mostrando{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {indiceInicioPreview + 1}–{indiceFinPreview}
                  </span>{' '}
                  de{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {registrosFiltrados.length}
                  </span>{' '}
                  registros ({itemsPorPagina} por página)
                </div>

                {totalPaginasPreview > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={paginaSeguraPreview <= 1}
                      onClick={() => setPaginaPreview((p) => Math.max(1, p - 1))}
                      icon={<ChevronLeft className="w-3.5 h-3.5" />}
                    >
                      Anterior
                    </Button>

                    <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                      Página {paginaSeguraPreview} de {totalPaginasPreview}
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={paginaSeguraPreview >= totalPaginasPreview}
                      onClick={() =>
                        setPaginaPreview((p) => Math.min(totalPaginasPreview, p + 1))
                      }
                    >
                      <span className="flex items-center gap-1">
                        Siguiente
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
