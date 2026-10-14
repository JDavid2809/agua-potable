export type RolUsuario = 'administrador' | 'cajero' | 'lector';
export type EstadoToma = 'activa' | 'suspendida' | 'cortada' | 'inactiva';
export type TipoToma = 'domestica' | 'comercial' | 'comunal' | 'lote_baldio';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

export interface Perfil {
  id: string;
  nombre_completo: string;
  rol: RolUsuario;
  telefono?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Manzana {
  id: string;
  barrio: string;
  seccion: string;
  numero_manzana: string;
  cuadra?: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Persona {
  id: string;
  nombre_completo: string;
  documento_identidad?: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Toma {
  id: string;
  codigo_toma: string;
  persona_id: string;
  manzana_id?: string;
  direccion_referencia: string;
  tipo_toma: TipoToma;
  estado: EstadoToma;
  numero_medidor?: string;
  saldo_pendiente: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  // Campos poblados para UI
  persona?: Persona;
  manzana?: Manzana;
}

export interface Tarifa {
  id: string;
  anio: number;
  cuota_mensual: number;
  recargo_mora: number;
  descripcion?: string;
  created_at: string;
  updated_at: string;
}

export interface Pago {
  id: string;
  folio: string;
  persona_id: string;
  cajero_id?: string;
  total: number;
  metodo_pago: MetodoPago;
  fecha_pago: string;
  notas?: string;
  dispositivo_offline_id?: string;
  sincronizado_en?: string;
  created_at: string;
  updated_at: string;
  // UI joins
  persona?: Persona;
  detalles?: PagoDetalle[];
}

export interface PagoDetalle {
  id: string;
  pago_id: string;
  toma_id: string;
  anio: number;
  mes: number;
  monto: number;
  recargo: number;
  created_at: string;
  updated_at: string;
  toma?: Toma;
}

/** Objeto en la cola de sincronización para enviar a Supabase cuando vuelva internet */
export interface ElementoColaSync {
  id?: number; // Autoincremental en IndexedDB
  tabla: 'personas' | 'tomas' | 'pagos' | 'pago_detalles' | 'manzanas';
  accion: 'INSERT' | 'UPDATE' | 'DELETE';
  registro_id: string;
  datos: any;
  creado_en: string;
  intentos: number;
  ultimo_error?: string;
}
