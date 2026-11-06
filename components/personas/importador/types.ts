import React from 'react';
import {
  UserCheck,
  Phone,
  MapPin,
  Droplets,
  Building2,
  Layers,
  Hash,
  FileText,
  Gauge,
  CreditCard,
} from 'lucide-react';
import type { Manzana, TipoToma } from '@/types/database';
import type { PersonaConTomas } from '../PersonasManager';

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

export interface DefinicionCampo {
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

export interface FilaMatrizExcel {
  numeroFilaExcel: number;
  celdas: string[];
}

export interface ColumnaInfoExcel {
  colIndex: number;
  letraExcel: string;
  tituloEncabezado: string;
  ejemplos: string[];
}

export interface RegistroImportar {
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

export interface ResumenImportacion {
  totalLeidos: number;
  totalSeleccionados: number;
  totalTomas: number;
  nuevos: number;
  existentes: number;
}

export const DEFINICION_CAMPOS: DefinicionCampo[] = [
  {
    key: 'nombre_completo',
    label: 'Nombre Completo / Apellidos',
    shortLabel: 'Nombre / Apellidos',
    obligatorio: true,
    permiteMultiples: true,
    ayuda: 'Si el nombre y apellidos vienen en columnas separadas, selecciona ambas con esta opción y se unirán automáticamente.',
    colorBg: 'bg-blue-50/70 dark:bg-blue-950/30',
    colorBorder: 'border-blue-400 dark:border-blue-600',
    colorText: 'text-blue-700 dark:text-blue-300',
    colorBadge: 'bg-blue-600 text-white',
    icon: React.createElement(UserCheck, { className: 'w-4 h-4' }),
  },
  {
    key: 'telefono',
    label: 'Teléfono / Celular',
    shortLabel: 'Teléfono',
    ayuda: 'Número telefónico o WhatsApp del contribuyente.',
    colorBg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    colorBorder: 'border-emerald-400 dark:border-emerald-600',
    colorText: 'text-emerald-700 dark:text-emerald-300',
    colorBadge: 'bg-emerald-600 text-white',
    icon: React.createElement(Phone, { className: 'w-4 h-4' }),
  },
  {
    key: 'direccion',
    label: 'Dirección / Calle / Número',
    shortLabel: 'Dirección / Calle',
    permiteMultiples: true,
    ayuda: 'Calle, número o referencia domiciliaria. Puedes marcar varias columnas si calle y número vienen separados.',
    colorBg: 'bg-amber-50/70 dark:bg-amber-950/30',
    colorBorder: 'border-amber-400 dark:border-amber-600',
    colorText: 'text-amber-700 dark:text-amber-300',
    colorBadge: 'bg-amber-600 text-white',
    icon: React.createElement(MapPin, { className: 'w-4 h-4' }),
  },
  {
    key: 'cantidad_tomas',
    label: 'Cantidad de Tomas (Núm.)',
    shortLabel: 'Tomas asignadas',
    ayuda: 'Cuántas tomas tiene la persona (0, 1, 2...). Si no tiene toma, se registra con 0.',
    colorBg: 'bg-cyan-50/70 dark:bg-cyan-950/30',
    colorBorder: 'border-cyan-400 dark:border-cyan-600',
    colorText: 'text-cyan-700 dark:text-cyan-300',
    colorBadge: 'bg-cyan-600 text-white',
    icon: React.createElement(Droplets, { className: 'w-4 h-4' }),
  },
  {
    key: 'barrio',
    label: 'Barrio / Colonia / Sector',
    shortLabel: 'Barrio / Sector',
    ayuda: 'Nombre del barrio, colonia o sección territorial.',
    colorBg: 'bg-purple-50/70 dark:bg-purple-950/30',
    colorBorder: 'border-purple-400 dark:border-purple-600',
    colorText: 'text-purple-700 dark:text-purple-300',
    colorBadge: 'bg-purple-600 text-white',
    icon: React.createElement(Building2, { className: 'w-4 h-4' }),
  },
  {
    key: 'numero_manzana',
    label: 'Manzana / Cuadra',
    shortLabel: 'Manzana',
    ayuda: 'Número o nombre de manzana (ej. Mz 1, Manzana 4).',
    colorBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',
    colorBorder: 'border-indigo-400 dark:border-indigo-600',
    colorText: 'text-indigo-700 dark:text-indigo-300',
    colorBadge: 'bg-indigo-600 text-white',
    icon: React.createElement(Layers, { className: 'w-4 h-4' }),
  },
  {
    key: 'codigo_toma',
    label: 'Código / Folio de Toma',
    shortLabel: 'Folio Toma',
    ayuda: 'Opcional. Si el censo ya tiene número de contrato o toma (ej. TOMA-0015).',
    colorBg: 'bg-teal-50/70 dark:bg-teal-950/30',
    colorBorder: 'border-teal-400 dark:border-teal-600',
    colorText: 'text-teal-700 dark:text-teal-300',
    colorBadge: 'bg-teal-600 text-white',
    icon: React.createElement(Hash, { className: 'w-4 h-4' }),
  },
  {
    key: 'documento_identidad',
    label: 'CURP / INE / Identificación',
    shortLabel: 'CURP / INE',
    ayuda: 'Opcional. Clave electoral o CURP del titular.',
    colorBg: 'bg-slate-100 dark:bg-slate-800/70',
    colorBorder: 'border-slate-400 dark:border-slate-600',
    colorText: 'text-slate-700 dark:text-slate-300',
    colorBadge: 'bg-slate-700 text-white',
    icon: React.createElement(FileText, { className: 'w-4 h-4' }),
  },
  {
    key: 'tipo_toma',
    label: 'Tipo de Toma',
    shortLabel: 'Tipo de Toma',
    ayuda: 'Opcional. Doméstica, Comercial, Comunal o Lote Baldío.',
    colorBg: 'bg-sky-50/70 dark:bg-sky-950/30',
    colorBorder: 'border-sky-400 dark:border-sky-600',
    colorText: 'text-sky-700 dark:text-sky-300',
    colorBadge: 'bg-sky-600 text-white',
    icon: React.createElement(Droplets, { className: 'w-4 h-4' }),
  },
  {
    key: 'numero_medidor',
    label: 'Número de Medidor',
    shortLabel: 'Medidor',
    ayuda: 'Opcional. Serie del medidor físico si cuenta con uno.',
    colorBg: 'bg-violet-50/70 dark:bg-violet-950/30',
    colorBorder: 'border-violet-400 dark:border-violet-600',
    colorText: 'text-violet-700 dark:text-violet-300',
    colorBadge: 'bg-violet-600 text-white',
    icon: React.createElement(Gauge, { className: 'w-4 h-4' }),
  },
  {
    key: 'saldo_pendiente',
    label: 'Saldo / Adeudo Inicial ($)',
    shortLabel: 'Adeudo Inicial',
    ayuda: 'Opcional. Monto de adeudo previo en pesos.',
    colorBg: 'bg-rose-50/70 dark:bg-rose-950/30',
    colorBorder: 'border-rose-400 dark:border-rose-600',
    colorText: 'text-rose-700 dark:text-rose-300',
    colorBadge: 'bg-rose-600 text-white',
    icon: React.createElement(CreditCard, { className: 'w-4 h-4' }),
  },
  {
    key: 'notas',
    label: 'Notas / Observaciones',
    shortLabel: 'Observaciones',
    ayuda: 'Opcional. Comentarios adicionales capturados en el censo.',
    colorBg: 'bg-orange-50/70 dark:bg-orange-950/30',
    colorBorder: 'border-orange-400 dark:border-orange-600',
    colorText: 'text-orange-700 dark:text-orange-300',
    colorBadge: 'bg-orange-600 text-white',
    icon: React.createElement(FileText, { className: 'w-4 h-4' }),
  },
];

export const MAPA_DEFINICION_CAMPO = new Map<string, DefinicionCampo>(
  DEFINICION_CAMPOS.map((c) => [c.key, c])
);

