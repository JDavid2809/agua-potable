'use client';

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  ArrowLeft,
  Download,
  Users,
  Droplets,
  Layers,
  Check,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  UserCheck,
  Eye,
  Table2,
  HelpCircle,
  AlertCircle,
  Hash,
  FileText,
  CreditCard,
  Gauge,
  Building2,
  Ban,
  Wand2,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
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

export type CampoDestinoKey =
  | 'ignorar'
  | 'nombre_completo'
  | 'telefono'
  | 'direccion'
  | 'cantidad_tomas'
  | 'barrio'
  | 'numero_manzana'
  | 'codigo_toma'
  | 'documento_identidad'
  | 'tipo_toma'
  | 'numero_medidor'
  | 'saldo_pendiente'
  | 'notas';

interface DefinicionCampo {
  key: Exclude<CampoDestinoKey, 'ignorar'>;
  label: string;
  shortLabel: string;
  obligatorio?: boolean;
  permiteMultiples?: boolean;
  ayuda: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  colorBadge: string;
  icon: React.ReactNode;
}

const DEFINICION_CAMPOS: DefinicionCampo[] = [
  {
    key: 'nombre_completo',
    label: 'Nombre Completo / Apellidos',
    shortLabel: '👤 Nombre / Apellidos',
    obligatorio: true,
    permiteMultiples: true,
    ayuda: 'Si el nombre y apellidos vienen en columnas separadas, selecciona ambas con esta opción y se unirán automáticamente.',
    colorBg: 'bg-blue-50/70 dark:bg-blue-950/30',
    colorBorder: 'border-blue-400 dark:border-blue-600',
    colorText: 'text-blue-700 dark:text-blue-300',
    colorBadge: 'bg-blue-600 text-white',
    icon: <UserCheck className="w-4 h-4" />,
  },
  {
    key: 'telefono',
    label: 'Teléfono / Celular',
    shortLabel: '📞 Teléfono',
    ayuda: 'Número telefónico o WhatsApp del contribuyente.',
    colorBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    colorBorder: 'border-emerald-400 dark:border-emerald-600',
    colorText: 'text-emerald-700 dark:text-emerald-300',
    colorBadge: 'bg-emerald-600 text-white',
    icon: <Phone className="w-4 h-4" />,
  },
  {
    key: 'direccion',
    label: 'Dirección / Calle / Número',
    shortLabel: '📍 Dirección / Calle',
    permiteMultiples: true,
    ayuda: 'Calle, número o referencia domiciliaria. Puedes marcar varias columnas si calle y número vienen separados.',
    colorBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    colorBorder: 'border-amber-400 dark:border-amber-600',
    colorText: 'text-amber-700 dark:text-amber-300',
    colorBadge: 'bg-amber-600 text-white',
    icon: <MapPin className="w-4 h-4" />,
  },
  {
    key: 'cantidad_tomas',
    label: 'Cantidad de Tomas (Núm.)',
    shortLabel: '💧 Cant. de Tomas',
    ayuda: 'Cuántas tomas tiene la persona (1, 2, 3...). Si no existe esta columna, se asignará 1 por defecto.',
    colorBg: 'bg-cyan-50/70 dark:bg-cyan-950/30',
    colorBorder: 'border-cyan-400 dark:border-cyan-600',
    colorText: 'text-cyan-700 dark:text-cyan-300',
    colorBadge: 'bg-cyan-600 text-white',
    icon: <Droplets className="w-4 h-4" />,
  },
  {
    key: 'barrio',
    label: 'Barrio / Colonia / Sector',
    shortLabel: '🗺️ Barrio / Sector',
    ayuda: 'Nombre del barrio, colonia o sección territorial.',
    colorBg: 'bg-purple-50/70 dark:bg-purple-950/30',
    colorBorder: 'border-purple-400 dark:border-purple-600',
    colorText: 'text-purple-700 dark:text-purple-300',
    colorBadge: 'bg-purple-600 text-white',
    icon: <Building2 className="w-4 h-4" />,
  },
  {
    key: 'numero_manzana',
    label: 'Manzana / Cuadra',
    shortLabel: '🧱 Manzana',
    ayuda: 'Número o nombre de manzana (ej. Mz 1, Manzana 4).',
    colorBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',
    colorBorder: 'border-indigo-400 dark:border-indigo-600',
    colorText: 'text-indigo-700 dark:text-indigo-300',
    colorBadge: 'bg-indigo-600 text-white',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    key: 'codigo_toma',
    label: 'Código / Folio de Toma',
    shortLabel: '🏷️ Folio Toma',
    ayuda: 'Opcional. Si el censo ya tiene número de contrato o toma (ej. TOMA-0015).',
    colorBg: 'bg-teal-50/70 dark:bg-teal-950/30',
    colorBorder: 'border-teal-400 dark:border-teal-600',
    colorText: 'text-teal-700 dark:text-teal-300',
    colorBadge: 'bg-teal-600 text-white',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'documento_identidad',
    label: 'CURP / INE / Identificación',
    shortLabel: '🪪 CURP / INE',
    ayuda: 'Opcional. Clave electoral o CURP del titular.',
    colorBg: 'bg-slate-100 dark:bg-slate-800/70',
    colorBorder: 'border-slate-400 dark:border-slate-600',
    colorText: 'text-slate-700 dark:text-slate-300',
    colorBadge: 'bg-slate-700 text-white',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    key: 'tipo_toma',
    label: 'Tipo de Toma',
    shortLabel: '🔧 Tipo de Toma',
    ayuda: 'Opcional. Doméstica, Comercial, Comunal o Lote Baldío.',
    colorBg: 'bg-sky-50/70 dark:bg-sky-950/30',
    colorBorder: 'border-sky-400 dark:border-sky-600',
    colorText: 'text-sky-700 dark:text-sky-300',
    colorBadge: 'bg-sky-600 text-white',
    icon: <Droplets className="w-4 h-4" />,
  },
  {
    key: 'numero_medidor',
    label: 'Número de Medidor',
    shortLabel: '⏲️ Medidor',
    ayuda: 'Opcional. Serie del medidor físico si cuenta con uno.',
    colorBg: 'bg-violet-50/70 dark:bg-violet-950/30',
    colorBorder: 'border-violet-400 dark:border-violet-600',
    colorText: 'text-violet-700 dark:text-violet-300',
    colorBadge: 'bg-violet-600 text-white',
    icon: <Gauge className="w-4 h-4" />,
  },
  {
    key: 'saldo_pendiente',
    label: 'Saldo / Adeudo Inicial ($)',
    shortLabel: '💲 Adeudo Inicial',
    ayuda: 'Opcional. Monto de adeudo previo en pesos.',
    colorBg: 'bg-rose-50/70 dark:bg-rose-950/30',
    colorBorder: 'border-rose-400 dark:border-rose-600',
    colorText: 'text-rose-700 dark:text-rose-300',
    colorBadge: 'bg-rose-600 text-white',
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    key: 'notas',
    label: 'Notas / Observaciones',
    shortLabel: '📝 Observaciones',
    ayuda: 'Opcional. Comentarios adicionales capturados en el censo.',
    colorBg: 'bg-orange-50/70 dark:bg-orange-950/30',
    colorBorder: 'border-orange-400 dark:border-orange-600',
    colorText: 'text-orange-700 dark:text-orange-300',
    colorBadge: 'bg-orange-600 text-white',
    icon: <FileText className="w-4 h-4" />,
  },
];

const MAPA_DEFINICION_CAMPO = new Map<string, DefinicionCampo>(
  DEFINICION_CAMPOS.map((c) => [c.key, c])
);

interface FilaMatrizExcel {
  numeroFilaExcel: number; // 1-based row number in Excel
  celdas: string[];
}

interface ColumnaInfoExcel {
  colIndex: number; // Index inside FilaMatrizExcel.celdas
  letraExcel: string; // 'A', 'B', 'C'...
  tituloEncabezado: string;
  ejemplos: string[];
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

function normalizarTexto(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarTipoToma(valor: string): TipoToma {
  const norm = normalizarTexto(valor);
  if (norm.includes('comerc') || norm.includes('negoc') || norm.includes('tienda')) {
    return 'comercial';
  }
  if (
    norm.includes('comun') ||
    norm.includes('public') ||
    norm.includes('escuela') ||
    norm.includes('iglesia')
  ) {
    return 'comunal';
  }
  if (norm.includes('baldio') || norm.includes('lote') || norm.includes('terreno')) {
    return 'lote_baldio';
  }
  return 'domestica';
}

/**
 * Extrae las celdas reales de la hoja de Excel sin deformar números (evita comas en teléfonos,
 * evita decimales artificiales como "1.00" en tomas, y evita "__EMPTY" cuando hay títulos arriba).
 */
function extraerMatrizDeHoja(worksheet: XLSX.WorkSheet): {
  filas: FilaMatrizExcel[];
  letrasColumnas: string[];
} {
  const ref = worksheet['!ref'];
  if (!ref) return { filas: [], letrasColumnas: [] };

  const rango = XLSX.utils.decode_range(ref);
  const maxRows = Math.min(rango.e.r, rango.s.r + 5000);
  const maxCols = Math.min(rango.e.c, rango.s.c + 50);

  // Detectar qué columnas tienen al menos un valor en toda la hoja
  const columnasConDatos: number[] = [];
  for (let c = rango.s.c; c <= maxCols; c++) {
    let tieneAlgo = false;
    for (let r = rango.s.r; r <= maxRows; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
        tieneAlgo = true;
        break;
      }
    }
    if (tieneAlgo) {
      columnasConDatos.push(c);
    }
  }

  if (columnasConDatos.length === 0) {
    return { filas: [], letrasColumnas: [] };
  }

  const letrasColumnas = columnasConDatos.map((c) => XLSX.utils.encode_col(c));
  const filas: FilaMatrizExcel[] = [];

  for (let r = rango.s.r; r <= maxRows; r++) {
    let filaNoVacia = false;
    const celdas: string[] = columnasConDatos.map((c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (!cell || cell.v === undefined || cell.v === null) return '';

      let texto = '';
      if (cell.t === 'n') {
        // Si es número puro, usar su valor exacto sin comas de miles ni notación científica
        const num = Number(cell.v);
        if (Number.isInteger(num)) {
          texto = String(num);
        } else {
          texto = String(Math.round(num * 100) / 100);
        }
      } else if (cell.t === 'b') {
        texto = cell.v ? 'Sí' : 'No';
      } else {
        texto = String(cell.v ?? cell.w ?? '').trim();
      }

      if (texto !== '') filaNoVacia = true;
      return texto;
    });

    if (filaNoVacia) {
      filas.push({
        numeroFilaExcel: r + 1,
        celdas,
      });
    }
  }

  return { filas, letrasColumnas };
}

/**
 * Detecta automáticamente cuál fila de la matriz es la fila de encabezados (títulos de columna),
 * ignorando filas superiores que solo tienen el título del documento, fechas o logos.
 */
function detectarIndiceFilaEncabezado(filas: FilaMatrizExcel[]): number {
  if (filas.length === 0) return 0;

  const palabrasClaveEncabezado = [
    'nombre',
    'apellido',
    'paterno',
    'materno',
    'titular',
    'contribuyente',
    'ciudadano',
    'jefe',
    'usuario',
    'persona',
    'telefono',
    'celular',
    'tel',
    'cel',
    'whatsapp',
    'direccion',
    'domicilio',
    'calle',
    'ubicacion',
    'referencia',
    'toma',
    'tomas',
    'agua',
    'contrato',
    'barrio',
    'colonia',
    'sector',
    'localidad',
    'manzana',
    'mz',
    'cuadra',
    'seccion',
    'curp',
    'ine',
    'identificacion',
    'medidor',
    'saldo',
    'adeudo',
    'deuda',
    'nota',
    'observacion',
    'comentario',
    'folio',
  ];

  let mejorIndice = 0;
  let mejorPuntaje = -1;
  const limiteBusqueda = Math.min(filas.length, 20);

  for (let i = 0; i < limiteBusqueda; i++) {
    const celdas = filas[i].celdas;
    const noVacias = celdas.filter((c) => c.trim() !== '');
    if (noVacias.length <= 1 && filas.length > 1) {
      // Una fila con 1 sola celda llena suele ser un título general como "CENSO COMUNITARIO 2026"
      continue;
    }

    let puntaje = noVacias.length * 2;

    for (const celda of noVacias) {
      const norm = normalizarTexto(celda);
      // Si la celda es puramente un número largo (ej. teléfono) o número simple, resta puntos de ser encabezado
      if (/^\d+$/.test(celda.trim())) {
        puntaje -= 3;
        continue;
      }
      for (const kw of palabrasClaveEncabezado) {
        if (norm === kw || norm.split(' ').includes(kw) || norm.includes(kw)) {
          puntaje += 10;
          break;
        }
      }
    }

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorIndice = i;
    }
  }

  return mejorIndice;
}

/**
 * Analiza tanto los títulos de cada columna como sus datos reales de ejemplo para asignar
 * inteligentemente qué significa cada columna del Excel sin repetir ni confundir campos.
 */
function autoAsignarColumnasInteligente(
  columnas: ColumnaInfoExcel[],
  tieneEncabezados: boolean
): Record<number, CampoDestinoKey> {
  const asignacion: Record<number, CampoDestinoKey> = {};
  columnas.forEach((c) => {
    asignacion[c.colIndex] = 'ignorar';
  });

  const usadas = new Set<number>();

  // 1. Si hay encabezados, buscar coincidencias claras por nombre de encabezado
  if (tieneEncabezados) {
    const buscarYAsignar = (
      patronesExactos: string[],
      patronesParciales: string[],
      destino: CampoDestinoKey,
      permitirMultiples = false
    ) => {
      // Primero buscar coincidencia de palabra exacta
      for (const col of columnas) {
        if (usadas.has(col.colIndex)) continue;
        const norm = normalizarTexto(col.tituloEncabezado);
        if (!norm) continue;
        const palabras = norm.split(' ');

        const coincideExacto = patronesExactos.some(
          (p) => norm === p || palabras.includes(p)
        );
        if (coincideExacto) {
          asignacion[col.colIndex] = destino;
          usadas.add(col.colIndex);
          if (!permitirMultiples) return;
        }
      }

      // Si aún no se asignó este campo, buscar coincidencia parcial
      const yaTieneAsignado = Object.values(asignacion).includes(destino);
      if (yaTieneAsignado && !permitirMultiples) return;

      for (const col of columnas) {
        if (usadas.has(col.colIndex)) continue;
        const norm = normalizarTexto(col.tituloEncabezado);
        if (!norm) continue;

        const coincideParcial = patronesParciales.some((p) => norm.includes(p));
        if (coincideParcial) {
          asignacion[col.colIndex] = destino;
          usadas.add(col.colIndex);
          if (!permitirMultiples) return;
        }
      }
    };

    // Ignorar explícitamente columnas de índice consecutivo ("No.", "Núm", "ID", "#")
    for (const col of columnas) {
      const norm = normalizarTexto(col.tituloEncabezado);
      if (
        norm === 'no' ||
        norm === 'num' ||
        norm === 'numero' ||
        norm === 'id' ||
        norm === 'consecutivo' ||
        norm === '#'
      ) {
        usadas.add(col.colIndex);
      }
    }

    // Orden de prioridad para evitar colisiones (ej. "Código de toma" vs "Cantidad de tomas")
    buscarYAsignar(
      ['codigo de toma', 'folio de toma', 'clave toma', 'contrato'],
      ['codigo toma', 'folio toma', 'no contrato'],
      'codigo_toma'
    );

    buscarYAsignar(
      ['tipo de toma', 'tipo toma', 'giro', 'categoria'],
      ['tipo toma', 'uso de toma'],
      'tipo_toma'
    );

    buscarYAsignar(
      [
        'cantidad de tomas',
        'numero de tomas',
        'no de tomas',
        'num de tomas',
        'total tomas',
        'cant tomas',
        'tomas',
      ],
      ['tomas', 'no tomas', 'num tomas', 'cant tomas'],
      'cantidad_tomas'
    );

    // Nombre y Apellidos (permite múltiples por si vienen separados en Nombre | Apellido Paterno | Apellido Materno)
    buscarYAsignar(
      [
        'nombre completo',
        'nombre del titular',
        'nombre',
        'nombres',
        'apellido',
        'apellidos',
        'paterno',
        'materno',
        'titular',
        'contribuyente',
        'ciudadano',
        'jefe de familia',
      ],
      ['nombre', 'apellido', 'titular', 'contribuyente', 'jefe de familia', 'ciudadano'],
      'nombre_completo',
      true
    );

    buscarYAsignar(
      ['telefono', 'celular', 'tel', 'cel', 'whatsapp', 'movil'],
      ['telefon', 'celular', 'whatsapp', 'contacto'],
      'telefono'
    );

    buscarYAsignar(
      ['direccion', 'domicilio', 'calle', 'referencia', 'ubicacion'],
      ['direccion', 'domicilio', 'calle', 'referencia', 'ubicacion'],
      'direccion',
      true
    );

    buscarYAsignar(
      ['barrio', 'colonia', 'sector', 'localidad', 'comunidad', 'zona'],
      ['barrio', 'colonia', 'sector', 'localidad'],
      'barrio'
    );

    buscarYAsignar(
      ['manzana', 'mz', 'cuadra', 'seccion'],
      ['manzana', 'cuadra'],
      'numero_manzana'
    );

    buscarYAsignar(
      ['curp', 'ine', 'identificacion', 'ife', 'dni', 'rfc'],
      ['curp', 'identificacion', 'documento'],
      'documento_identidad'
    );

    buscarYAsignar(
      ['medidor', 'numero de medidor', 'serie medidor'],
      ['medidor'],
      'numero_medidor'
    );

    buscarYAsignar(
      ['saldo', 'adeudo', 'deuda', 'pendiente', 'rezago'],
      ['saldo', 'adeudo', 'deuda'],
      'saldo_pendiente'
    );

    buscarYAsignar(
      ['notas', 'nota', 'observaciones', 'observacion', 'comentarios'],
      ['observacion', 'comentario', 'nota'],
      'notas'
    );
  }

  // 2. Heurística por contenido real de las celdas para campos clave que no se hayan detectado
  const tieneCampo = (campo: CampoDestinoKey) =>
    Object.values(asignacion).includes(campo);

  // Detectar Teléfono por contenido (números de 7 a 12 dígitos)
  if (!tieneCampo('telefono')) {
    for (const col of columnas) {
      if (usadas.has(col.colIndex) || col.ejemplos.length === 0) continue;
      const parecenTelefonos = col.ejemplos.filter((ej) => {
        const soloDigitos = ej.replace(/\D/g, '');
        return soloDigitos.length >= 7 && soloDigitos.length <= 13;
      });
      if (parecenTelefonos.length >= Math.ceil(col.ejemplos.length * 0.6)) {
        asignacion[col.colIndex] = 'telefono';
        usadas.add(col.colIndex);
        break;
      }
    }
  }

  // Detectar Nombre por contenido (textos con letras y al menos 2 palabras sin números)
  if (!tieneCampo('nombre_completo')) {
    for (const col of columnas) {
      if (usadas.has(col.colIndex) || col.ejemplos.length === 0) continue;
      const parecenNombres = col.ejemplos.filter((ej) => {
        const limpio = ej.trim();
        return (
          limpio.length >= 5 &&
          !/\d/.test(limpio) &&
          limpio.split(/\s+/).length >= 2
        );
      });
      if (parecenNombres.length >= Math.ceil(col.ejemplos.length * 0.5)) {
        asignacion[col.colIndex] = 'nombre_completo';
        usadas.add(col.colIndex);
        break;
      }
    }
  }

  // Detectar Cantidad de Tomas por contenido (enteros pequeños entre 0 y 10, pero que NO sean 1, 2, 3 consecutivos)
  if (!tieneCampo('cantidad_tomas')) {
    for (const col of columnas) {
      if (usadas.has(col.colIndex) || col.ejemplos.length < 2) continue;
      // Verificar que no sea simplemente la columna #1, #2, #3 del índice de fila
      const esConsecutivo = col.ejemplos.every(
        (ej, idx) => parseInt(ej, 10) === idx + 1
      );
      if (esConsecutivo && col.colIndex === 0) continue;

      const parecenTomas = col.ejemplos.filter((ej) => {
        const n = Number(ej);
        return !isNaN(n) && Number.isInteger(n) && n >= 0 && n <= 6;
      });
      if (parecenTomas.length === col.ejemplos.length) {
        asignacion[col.colIndex] = 'cantidad_tomas';
        usadas.add(col.colIndex);
        break;
      }
    }
  }

  return asignacion;
}

/**
 * Parsea de forma segura la cantidad de tomas sin confundir decimales ("1.00" -> 1, no 100).
 */
function parsearCantidadTomasSeguro(texto: string, valorPorDefecto: number): number {
  const limpio = texto.trim();
  if (!limpio) return valorPorDefecto;

  const norm = normalizarTexto(limpio);
  if (norm === 'si' || norm === 'activa' || norm === 'activo' || norm === 'con toma') {
    return 1;
  }
  if (
    norm === 'no' ||
    norm === 'ninguna' ||
    norm === 'sin toma' ||
    norm === 'inactiva' ||
    norm === '0'
  ) {
    return 0;
  }

  // Extraer el primer número entero o decimal (ej. "1.00" -> 1, "2 tomas" -> 2)
  const match = limpio.match(/(\d+(?:[.,]\d+)?)/);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(num)) {
      return Math.min(20, Math.max(0, Math.round(num)));
    }
  }

  return valorPorDefecto;
}

export function ImportadorCensoExcel({
  personasExistentes,
  manzanas,
  onVolver,
  onImportacionCompletada,
}: ImportadorCensoExcelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado del archivo Excel y su matriz cruda
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [hojasDisponibles, setHojasDisponibles] = useState<string[]>([]);
  const [hojaActiva, setHojaActiva] = useState<string>('');

  const [filasMatriz, setFilasMatriz] = useState<FilaMatrizExcel[]>([]);
  const [letrasColumnas, setLetrasColumnas] = useState<string[]>([]);
  const [indiceFilaEncabezado, setIndiceFilaEncabezado] = useState<number>(0);
  const [archivoTieneEncabezados, setArchivoTieneEncabezados] = useState<boolean>(true);

  // Mapa: índice de columna (0, 1, 2...) -> qué campo del sistema representa
  const [asignacionColumnas, setAsignacionColumnas] = useState<
    Record<number, CampoDestinoKey>
  >({});

  const [mostrarCamposOpcionales, setMostrarCamposOpcionales] = useState(false);

  // Parámetros por defecto para creación de tomas
  const [crearTomaPorDefecto, setCrearTomaPorDefecto] = useState(true);
  const [manzanaDefaultId, setManzanaDefaultId] = useState<string>(manzanas[0]?.id || '');
  const [modoDuplicados, setModoDuplicados] = useState<'vincular_tomas' | 'omitir'>(
    'vincular_tomas'
  );

  // Registros procesados y editables en la tabla final
  const [registros, setRegistros] = useState<RegistroImportar[]>([]);
  const [busquedaPreview, setBusquedaPreview] = useState('');
  const [filtroPreview, setFiltroPreview] = useState<
    'todos' | 'seleccionados' | 'nuevos' | 'existentes'
  >('todos');
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

  // Información calculada de cada columna de la hoja actual
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
      const tituloEncabezado =
        ArchivoTieneTituloValido(tituloRaw)
          ? tituloRaw
          : `Columna ${letra} (Sin título)`;

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

  function ArchivoTieneTituloValido(t: string): boolean {
    return Boolean(t && !t.startsWith('__EMPTY'));
  }

  // Construir los registros a partir de la matriz de filas y la asignación de columnas
  const reconstruirRegistros = (
    matriz: FilaMatrizExcel[],
    idxEncabezado: number,
    tieneEncabezados: boolean,
    asignacion: Record<number, CampoDestinoKey>,
    crearTomaDefault: boolean
  ) => {
    const filasDatos = tieneEncabezados ? matriz.slice(idxEncabezado + 1) : matriz;

    // Agrupar qué índices de columna alimentan a cada campo (en orden de izquierda a derecha)
    const columnasPorCampo = (campo: Exclude<CampoDestinoKey, 'ignorar'>): number[] => {
      return Object.entries(asignacion)
        .filter(([, destino]) => destino === campo)
        .map(([colIdx]) => Number(colIdx))
        .sort((a, b) => a - b);
    };

    const colsNombre = columnasPorCampo('nombre_completo');
    const colsDoc = columnasPorCampo('documento_identidad');
    const colsTel = columnasPorCampo('telefono');
    const colsDir = columnasPorCampo('direccion');
    const colsCantTomas = columnasPorCampo('cantidad_tomas');
    const colsCodigoToma = columnasPorCampo('codigo_toma');
    const colsBarrio = columnasPorCampo('barrio');
    const colsManzana = columnasPorCampo('numero_manzana');
    const colsTipoToma = columnasPorCampo('tipo_toma');
    const colsMedidor = columnasPorCampo('numero_medidor');
    const colsSaldo = columnasPorCampo('saldo_pendiente');
    const colsNotas = columnasPorCampo('notas');

    const leerUniendoColumnas = (celdas: string[], indices: number[], separador = ' '): string => {
      if (indices.length === 0) return '';
      return indices
        .map((i) => (celdas[i] || '').trim())
        .filter(Boolean)
        .join(separador)
        .replace(/\s+/g, ' ')
        .trim();
    };

    const lista: RegistroImportar[] = [];

    filasDatos.forEach((fila) => {
      const c = fila.celdas;
      const nombre = leerUniendoColumnas(c, colsNombre, ' ');
      if (!nombre) return; // Ignorar filas donde el nombre esté vacío

      // Ignorar si la fila parece ser un encabezado repetido a mitad del documento
      if (
        normalizarTexto(nombre) === 'nombre' ||
        normalizarTexto(nombre) === 'nombre completo'
      ) {
        return;
      }

      const doc = leerUniendoColumnas(c, colsDoc, ' ');
      const tel = leerUniendoColumnas(c, colsTel, ' / ');
      const dir = leerUniendoColumnas(c, colsDir, ' ');
      const notas = leerUniendoColumnas(c, colsNotas, '. ');
      const barrioTxt = leerUniendoColumnas(c, colsBarrio, ' ');
      const manzanaTxt = leerUniendoColumnas(c, colsManzana, ' ');
      const codigoExplicito = leerUniendoColumnas(c, colsCodigoToma, ', ');
      const medidorTxt = leerUniendoColumnas(c, colsMedidor, ' ');
      const tipoTxt = leerUniendoColumnas(c, colsTipoToma, ' ');

      const saldoRaw = leerUniendoColumnas(c, colsSaldo, '');
      const saldoMatch = saldoRaw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
      const saldoNum = saldoMatch ? Math.max(0, parseFloat(saldoMatch[1]) || 0) : 0;

      // Cantidad de tomas
      const cantDefault = crearTomaDefault ? 1 : 0;
      let cantTomas = cantDefault;

      if (colsCantTomas.length > 0) {
        const textoCant = leerUniendoColumnas(c, colsCantTomas, '');
        cantTomas = parsearCantidadTomasSeguro(textoCant, cantDefault);
      } else if (codigoExplicito) {
        const codigosSeparados = codigoExplicito
          .split(/[,;/]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        cantTomas = Math.max(1, codigosSeparados.length);
      }

      const idPorDoc = doc ? mapaDocumentosExistentes.get(doc.toUpperCase()) : undefined;
      const idPorNombre = mapaNombresExistentes.get(normalizarTexto(nombre));
      const personaExistenteId = idPorDoc || idPorNombre;
      const yaExiste = Boolean(personaExistenteId);

      lista.push({
        idTemporal: `ROW-${fila.numeroFilaExcel}`,
        filaOrigen: fila.numeroFilaExcel,
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
    setPaginaPreview(1);
  };

  // Procesar una hoja del Workbook cuando se sube el archivo o se cambia de pestaña
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

    reconstruirRegistros(
      filas,
      idxHeaderDetectado,
      true,
      asignacionAuto,
      crearTomaPorDefecto
    );
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
        title: 'Archivo Excel analizado',
        description: `Se leyó "${file.name}". Revisa en la tabla visual qué representa cada columna.`,
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

  // Cambiar qué campo representa una columna específica del Excel
  const handleCambiarDestinoColumna = (colIndex: number, nuevoDestino: CampoDestinoKey) => {
    const def = nuevoDestino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(nuevoDestino) : undefined;
    const nuevaAsignacion = { ...asignacionColumnas };

    // Si el campo NO permite múltiples columnas (ej. teléfono, cantidad_tomas), liberar la columna anterior que lo tenía
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
    reconstruirRegistros(
      filasMatriz,
      indiceFilaEncabezado,
      archivoTieneEncabezados,
      nuevaAsignacion,
      crearTomaPorDefecto
    );
  };

  // Cambiar desde las tarjetas resumen qué columna alimenta a un campo específico
  const handleSeleccionarColumnaParaCampo = (
    campo: Exclude<CampoDestinoKey, 'ignorar'>,
    valorSelect: string
  ) => {
    const nuevaAsignacion = { ...asignacionColumnas };

    // Limpiar asignaciones previas de este campo
    Object.keys(nuevaAsignacion).forEach((k) => {
      const idx = Number(k);
      if (nuevaAsignacion[idx] === campo) {
        nuevaAsignacion[idx] = 'ignorar';
      }
    });

    if (valorSelect !== '') {
      const colIdx = Number(valorSelect);
      if (!isNaN(colIdx)) {
        nuevaAsignacion[colIdx] = campo;
      }
    }

    setAsignacionColumnas(nuevaAsignacion);
    reconstruirRegistros(
      filasMatriz,
      indiceFilaEncabezado,
      archivoTieneEncabezados,
      nuevaAsignacion,
      crearTomaPorDefecto
    );
  };

  // Cambiar cuál fila del Excel contiene los encabezados
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
    reconstruirRegistros(
      filasMatriz,
      nuevoIdx,
      tieneTitulos,
      nuevaAsignacion,
      crearTomaPorDefecto
    );
  };

  // Descargar plantilla de ejemplo en Excel (.xlsx)
  const handleDescargarPlantilla = () => {
    const datosEjemplo = [
      {
        'Nombre Completo': 'Juan Pérez Hernández',
        Teléfono: '2441234567',
        Dirección: 'Calle Morelos #12, frente a la escuela',
        'Cantidad de Tomas': 1,
        Barrio: 'Centro',
        Manzana: 'Mz 1',
        'CURP o INE': 'PEHJ800101HPLR01',
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
        'Cantidad de Tomas': 2,
        Barrio: 'San Juan',
        Manzana: 'Mz 3',
        'CURP o INE': '',
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

  // Ejecutar la importación masiva hacia Supabase
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
      `¿Confirmas importar ${seleccionados.length} contribuyentes y ${resumen.totalTomas} tomas de agua a la base de datos?`
    );
    if (!confirmar) return;

    setImportando(true);
    setProgresoActual(0);
    setProgresoTotal(seleccionados.length);

    try {
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

          let maxConsecutivo =
            personasExistentes.reduce((max, p) => {
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
                : undefined) ||
              mapaNombresExistentes.get(normalizarTexto(item.nombre_completo));

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

  // Filas de muestra para la radiografía visual del Excel (primeras 5 filas de datos)
  const filasMuestraExcel = useMemo(() => {
    if (filasMatriz.length === 0) return [];
    const inicioDatos = archivoTieneEncabezados ? indiceFilaEncabezado + 1 : 0;
    return filasMatriz.slice(inicioDatos, inicioDatos + 5);
  }, [filasMatriz, indiceFilaEncabezado, archivoTieneEncabezados]);

  const camposPrincipales = DEFINICION_CAMPOS.slice(0, 6);
  const camposOpcionales = DEFINICION_CAMPOS.slice(6);

  const tieneColumnaNombreAsignada = useMemo(() => {
    return Object.values(asignacionColumnas).includes('nombre_completo');
  }, [asignacionColumnas]);

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
            <span>Importador Visual de Censo Excel</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-3xl">
            Sube tu archivo Excel y mira en pantalla tus columnas reales (`A`, `B`, `C`...) para elegir visualmente cuál corresponde a <strong>Nombre</strong>, <strong>Teléfono</strong>, <strong>Dirección</strong> y <strong>Tomas</strong>.
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

      {/* 2. Zona de Carga si aún no se ha seleccionado archivo */}
      {!workbook ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer group bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-10 sm:p-16 text-center transition-all space-y-5 shadow-xs"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              Haz clic aquí para abrir tu archivo Excel o arrástralo
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Acepta cualquier archivo <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong> de tu app de censos, sin importar el orden de las columnas ni si tiene títulos arriba.
            </p>
          </div>

          {/* Mini guía visual de 3 pasos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-left">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Sube tu Excel</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mostraremos tu tabla tal como viene en el archivo.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Elige las columnas</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Indica arriba de cada columna qué dato contiene.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Guarda en la BD</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Se crean todos los usuarios y sus tomas en segundos.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
              Seleccionar Archivo Excel
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

          {/* 4. PASO 1: RADIOGRAFÍA VISUAL DE LA HOJA EXCEL */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            {/* Cabecera del Paso 1 */}
            <div className="p-5 sm:p-6 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm shadow-xs">
                  1
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                      Vista Gráfica de tu Hoja Excel
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                      <Wand2 className="w-3 h-3" />
                      Columnas auto-detectadas
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Aquí ves las primeras filas de tu archivo tal como vienen. <strong>Usa el selector de color arriba de cada columna (`A`, `B`, `C`...)</strong> para indicar qué dato contiene o ignorarla.
                  </p>
                </div>
              </div>

              {/* Controles de Hoja y Fila de Encabezados */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {hojasDisponibles.length > 1 && (
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-bold text-slate-500">Hoja:</span>
                    <select
                      value={hojaActiva}
                      onChange={(e) => {
                        const nuevaHoja = e.target.value;
                        setHojaActiva(nuevaHoja);
                        if (workbook) procesarHojaWorkbook(workbook, nuevaHoja);
                      }}
                      className="text-xs font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                    >
                      {hojasDisponibles.map((h) => (
                        <option key={h} value={h} className="bg-white dark:bg-slate-900">
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Table2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Fila de títulos:
                  </span>
                  <select
                    value={archivoTieneEncabezados ? String(indiceFilaEncabezado) : 'sin_titulos'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'sin_titulos') {
                        handleCambiarFilaEncabezado(0, false);
                      } else {
                        handleCambiarFilaEncabezado(Number(val), true);
                      }
                    }}
                    className="text-xs font-bold bg-transparent text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
                  >
                    <option value="sin_titulos" className="bg-white dark:bg-slate-900">
                      Sin títulos (empieza con datos)
                    </option>
                    {filasMatriz.slice(0, 15).map((f, idx) => {
                      const previewTexto = f.celdas
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(' | ')
                        .slice(0, 38);
                      return (
                        <option key={f.numeroFilaExcel} value={String(idx)} className="bg-white dark:bg-slate-900">
                          Fila {f.numeroFilaExcel}: {previewTexto || '(Vacía)'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* Alerta si aún no se ha elegido la columna de Nombre */}
            {!tieneColumnaNombreAsignada && (
              <div className="mx-5 mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center gap-3 text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                <div className="text-xs">
                  <strong className="font-bold block">
                    ¡Falta seleccionar la columna del Nombre del Contribuyente!
                  </strong>
                  Elige <strong>«👤 Nombre / Apellidos»</strong> en la columna correspondiente de la tabla de abajo para poder leer a las personas.
                </div>
              </div>
            )}

            {/* Tabla Visual Tipo Excel (Columnas A, B, C... con selector arriba) */}
            <div className="p-5 sm:p-6 space-y-6">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    {/* Fila de Selectores de Campo por cada Columna Excel */}
                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
                      <th className="w-16 p-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 sticky left-0 z-10">
                        Fila
                      </th>
                      {infoColumnas.map((col) => {
                        const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                        const def =
                          destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;

                        return (
                          <th
                            key={col.colIndex}
                            className={`min-w-[210px] max-w-[260px] p-2.5 align-top border-r last:border-r-0 border-slate-200 dark:border-slate-700 transition-colors ${
                              def
                                ? `${def.colorBg}`
                                : 'bg-slate-50/60 dark:bg-slate-900/40 opacity-75'
                            }`}
                          >
                            {/* Etiqueta superior: Columna A, B, C + Estado */}
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                                Columna {col.letraExcel}
                              </span>
                              {def ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${def.colorBadge}`}
                                >
                                  <Check className="w-3 h-3" />
                                  Activa
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-500">
                                  <Ban className="w-2.5 h-2.5" />
                                  Ignorada
                                </span>
                              )}
                            </div>

                            {/* Selector desplegable directo en la columna */}
                            <select
                              value={destino}
                              onChange={(e) =>
                                handleCambiarDestinoColumna(
                                  col.colIndex,
                                  e.target.value as CampoDestinoKey
                                )
                              }
                              className={`w-full text-xs font-bold rounded-lg px-2.5 py-2 border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                def
                                  ? `bg-white dark:bg-slate-900 ${def.colorBorder} ${def.colorText} shadow-2xs`
                                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <option value="ignorar">🚫 Ignorar esta columna</option>
                              <optgroup label="Datos Principales del Censo">
                                {camposPrincipales.map((campo) => (
                                  <option key={campo.key} value={campo.key}>
                                    {campo.shortLabel}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Datos Opcionales / Adicionales">
                                {camposOpcionales.map((campo) => (
                                  <option key={campo.key} value={campo.key}>
                                    {campo.shortLabel}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </th>
                        );
                      })}
                    </tr>

                    {/* Fila del Encabezado Original detectado en el Excel */}
                    {archivoTieneEncabezados && filasMatriz[indiceFilaEncabezado] && (
                      <tr className="bg-slate-200/60 dark:bg-slate-800/60 border-b-2 border-slate-300 dark:border-slate-700">
                        <td className="px-2 py-2 text-center font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 border-r border-slate-200 dark:border-slate-700 bg-blue-50/60 dark:bg-slate-900 sticky left-0 z-10">
                          #{filasMatriz[indiceFilaEncabezado].numeroFilaExcel}
                          <span className="block text-[9px] uppercase tracking-tighter text-blue-500">
                            Títulos
                          </span>
                        </td>
                        {infoColumnas.map((col) => {
                          const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                          const def =
                            destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;
                          const textoTitulo =
                            filasMatriz[indiceFilaEncabezado]?.celdas[col.colIndex] || '';

                          return (
                            <td
                              key={col.colIndex}
                              className={`px-3 py-2 text-xs font-extrabold border-r last:border-r-0 border-slate-200 dark:border-slate-700 truncate max-w-[240px] ${
                                def
                                  ? 'text-slate-900 dark:text-white bg-white/50 dark:bg-slate-900/50'
                                  : 'text-slate-400 dark:text-slate-500 italic'
                              }`}
                              title={textoTitulo}
                            >
                              {textoTitulo || `(Sin encabezado)`}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </thead>

                  {/* Primeras 5 filas de datos reales del Excel */}
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                    {filasMuestraExcel.map((fila) => (
                      <tr
                        key={fila.numeroFilaExcel}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-2 py-2 text-center font-mono text-[11px] text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 sticky left-0 z-10">
                          #{fila.numeroFilaExcel}
                        </td>
                        {infoColumnas.map((col) => {
                          const destino = asignacionColumnas[col.colIndex] || 'ignorar';
                          const def =
                            destino !== 'ignorar' ? MAPA_DEFINICION_CAMPO.get(destino) : undefined;
                          const valorCelda = fila.celdas[col.colIndex] || '';

                          return (
                            <td
                              key={col.colIndex}
                              className={`px-3 py-2 border-r last:border-r-0 border-slate-200/70 dark:border-slate-800 truncate max-w-[240px] ${
                                def
                                  ? `${def.colorBg} font-semibold text-slate-800 dark:text-slate-200`
                                  : 'text-slate-400 dark:text-slate-600 line-through decoration-slate-300 dark:decoration-slate-700'
                              }`}
                              title={valorCelda}
                            >
                              {valorCelda || <span className="text-slate-300 dark:text-slate-700">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumen gráfico en Tarjetas de los Campos Principales */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Resumen de Campos que se están leyendo de tu Excel
                  </h4>
                  <button
                    type="button"
                    onClick={() => setMostrarCamposOpcionales((v) => !v)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline self-start sm:self-auto"
                  >
                    {mostrarCamposOpcionales
                      ? 'Ocultar campos opcionales (CURP, Medidor, Saldo...)'
                      : '+ Ver más campos opcionales (CURP, Medidor, Saldo, Notas...)'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(mostrarCamposOpcionales ? DEFINICION_CAMPOS : camposPrincipales).map(
                    (campo) => {
                      const colsAsignadas = infoColumnas.filter(
                        (c) => asignacionColumnas[c.colIndex] === campo.key
                      );
                      const primeraColAsignada =
                        colsAsignadas.length > 0 ? String(colsAsignadas[0].colIndex) : '';

                      // Construir ejemplos combinados si hay 1 o más columnas asignadas a este campo
                      const ejemplosReales: string[] = [];
                      if (colsAsignadas.length > 0) {
                        for (const f of filasMuestraExcel) {
                          const unido = colsAsignadas
                            .map((c) => (f.celdas[c.colIndex] || '').trim())
                            .filter(Boolean)
                            .join(' ');
                          if (unido) {
                            ejemplosReales.push(unido);
                            if (ejemplosReales.length >= 2) break;
                          }
                        }
                      }

                      const estaActivo = colsAsignadas.length > 0;

                      return (
                        <div
                          key={campo.key}
                          className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                            estaActivo
                              ? `${campo.colorBorder} ${campo.colorBg}`
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`p-1.5 rounded-lg ${
                                    estaActivo
                                      ? campo.colorBadge
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  {campo.icon}
                                </span>
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                  {campo.label}
                                  {campo.obligatorio && (
                                    <span className="text-red-500 ml-1">*</span>
                                  )}
                                </span>
                              </div>

                              {colsAsignadas.length > 1 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                  {colsAsignadas.length} cols unidas
                                </span>
                              )}
                            </div>

                            {/* Selector rápido con ejemplo incluido en cada opción */}
                            <select
                              value={primeraColAsignada}
                              onChange={(e) =>
                                handleSeleccionarColumnaParaCampo(campo.key, e.target.value)
                              }
                              className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                            >
                              <option value="">-- No importar / Sin columna --</option>
                              {infoColumnas.map((col) => {
                                const ej = col.ejemplos[0]
                                  ? ` → Ej: "${col.ejemplos[0].slice(0, 25)}"`
                                  : '';
                                return (
                                  <option key={col.colIndex} value={String(col.colIndex)}>
                                    Col {col.letraExcel}: {col.tituloEncabezado}
                                    {ej}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Muestra en vivo de lo que está leyendo el campo */}
                          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                            {estaActivo ? (
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Leyendo de{' '}
                                  {colsAsignadas
                                    .map((c) => `Columna ${c.letraExcel}`)
                                    .join(' + ')}
                                  :
                                </span>
                                {ejemplosReales.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {ejemplosReales.map((ej, i) => (
                                      <span
                                        key={i}
                                        className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 truncate max-w-full"
                                      >
                                        “{ej}”
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] italic text-amber-600 dark:text-amber-400">
                                    Columna seleccionada pero sin datos en las primeras filas
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 block leading-snug">
                                {campo.ayuda}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* Reglas por defecto cuando el Excel no trae algún dato */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={crearTomaPorDefecto}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setCrearTomaPorDefecto(val);
                          reconstruirRegistros(
                            filasMatriz,
                            indiceFilaEncabezado,
                            archivoTieneEncabezados,
                            asignacionColumnas,
                            val
                          );
                        }}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Asignar 1 toma por defecto si no se indica cantidad
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          Genera automáticamente su contrato de agua (TOMA-XXXX).
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Barrio / Manzana por defecto (si el Excel no trae)
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
                      Si el contribuyente ya existe en el sistema:
                    </label>
                    <select
                      value={modoDuplicados}
                      onChange={(e) =>
                        setModoDuplicados(e.target.value as 'vincular_tomas' | 'omitir')
                      }
                      className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white"
                    >
                      <option value="vincular_tomas">
                        Vincularle sus tomas y completar datos faltantes
                      </option>
                      <option value="omitir">
                        Omitir registro (no modificar ni agregarle tomas)
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. PASO 2: TABLA FINAL DE CONTRIBUYENTES A IMPORTAR */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm shadow-xs">
                2
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Resultado que se guardará en la Base de Datos ({resumen.totalSeleccionados}{' '}
                  personas y {resumen.totalTomas} tomas)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Puedes corregir cualquier nombre, teléfono, dirección o cantidad de tomas directamente en la tabla antes de importar.
                </p>
              </div>
            </div>

            <FilterBar
              searchValue={busquedaPreview}
              onSearchChange={(val) => {
                setBusquedaPreview(val);
                setPaginaPreview(1);
              }}
              searchPlaceholder="Buscar por nombre, calle, teléfono o barrio en la lista a importar..."
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
                    ? `Guardando (${progresoActual}/${progresoTotal})...`
                    : `Guardar ${resumen.totalSeleccionados} Usuarios y ${resumen.totalTomas} Tomas`}
                </Button>
              }
            >
              <FilterSelect
                label="Ver:"
                value={filtroPreview}
                onChange={(e) => {
                  setFiltroPreview(
                    e.target.value as 'todos' | 'seleccionados' | 'nuevos' | 'existentes'
                  );
                  setPaginaPreview(1);
                }}
              >
                <option value="todos">Todos los detectados ({registros.length})</option>
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

            {/* Tabla Interactiva de Selección y Edición en Vivo */}
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
                    <TableHead>👤 Nombre Completo / Titular</TableHead>
                    <TableHead>📞 Teléfono</TableHead>
                    <TableHead>📍 Dirección / Referencia</TableHead>
                    <TableHead>🗺️ Barrio / Manzana</TableHead>
                    <TableHead className="text-center w-28">💧 Tomas</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrosFiltrados.length === 0 ? (
                    <TableRow elevate={false}>
                      <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                        {!tieneColumnaNombreAsignada
                          ? 'Selecciona arriba cuál columna de tu Excel contiene el Nombre del Titular.'
                          : 'No hay registros que coincidan con el filtro actual.'}
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
                          {reg.barrioTexto || reg.manzanaTexto ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {reg.barrioTexto || 'Barrio'}
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

            {/* Barra de Paginación de Previsualización */}
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
