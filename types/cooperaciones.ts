import type { Persona, Toma, Perfil } from './database';

export type TipoSujetoCooperacion = 'toma' | 'persona';
export type EstadoCooperacion = 'activa' | 'prorrogada' | 'concluida' | 'cancelada';
export type EstadoPadronCooperacion = 'pendiente' | 'parcial' | 'liquidado' | 'exento_faena';

export interface Cooperacion {
  id: string;
  organizacion_id: string;
  nombre: string;
  descripcion?: string;
  meta_financiera: number;
  cuota_requerida: number;
  tipo_sujeto: TipoSujetoCooperacion;
  fecha_inicio: string;
  fecha_limite: string;
  fecha_prorroga?: string | null;
  motivo_prorroga?: string | null;
  permite_abonos: boolean;
  permite_faena: boolean;
  valor_equivalente_faena?: number;
  estado: EstadoCooperacion;
  total_recaudado?: number;
  total_sujetos?: number;
  total_cumplidos?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CooperacionPadronItem {
  id: string;
  organizacion_id: string;
  cooperacion_id: string;
  persona_id: string;
  toma_id?: string | null;
  monto_requerido: number;
  monto_pagado: number;
  monto_pendiente: number;
  cumplio_con_faena: boolean;
  fecha_faena?: string | null;
  estado: EstadoPadronCooperacion;
  fecha_liquidacion?: string | null;
  notas?: string;
  created_at: string;
  updated_at: string;
  // Joins para UI
  persona?: Persona;
  toma?: Toma;
  abonos?: CooperacionAbono[];
}

export interface CooperacionAbono {
  id: string;
  organizacion_id: string;
  padron_id: string;
  folio_recibo: string;
  monto_abono: number;
  saldo_anterior: number;
  saldo_restante: number;
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  fecha_pago: string;
  cajero_id?: string;
  cajero?: Perfil;
  notas?: string;
}

