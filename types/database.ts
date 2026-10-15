export type RolUsuario = 'administrador' | 'cajero' | 'lector';
export type EstadoToma = 'activa' | 'suspendida' | 'cortada' | 'inactiva';
export type TipoToma = 'domestica' | 'comercial' | 'comunal' | 'lote_baldio';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

/** Permisos del sistema para control de acceso granular (RBAC) */
export type PermisoSistema =
  | '*'                     // Superacceso / Administrador total
  | 'usuarios.gestionar'    // Crear, editar y suspender usuarios
  | 'organizacion.editar'   // Modificar datos del comité / organización
  | 'cobros.crear'          // Registrar pagos y emitir recibos
  | 'cobros.anular'         // Cancelar o anular recibos emitidos
  | 'tomas.ver'             // Consultar padrón de tomas
  | 'tomas.gestionar'       // Crear, editar o suspender tomas
  | 'personas.ver'          // Consultar contribuyentes
  | 'personas.gestionar'    // Crear y actualizar datos de contribuyentes
  | 'tarifas.gestionar'     // Modificar cuotas anuales y recargos
  | 'reportes.ver';         // Visualizar cortes de caja y balance financiero

export interface OrganizacionConfig {
  cuota_base: number;
  recargo_mora: number;
  moneda: string;
  permitir_cobro_offline: boolean;
}

export interface Organizacion {
  id: string;
  nombre: string;
  slug?: string;
  estado: string;
  municipio: string;
  localidad: string;
  telefono?: string;
  rfc_registro?: string;
  logo_url?: string;
  activo: boolean;
  config: OrganizacionConfig;
  created_at: string;
  updated_at: string;
}

export interface Perfil {
  id: string;
  organizacion_id: string;
  nombre_completo: string;
  rol: RolUsuario;
  permisos: PermisoSistema[] | string[];
  telefono?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  // Joins para UI
  organizacion?: Organizacion;
}

export interface Manzana {
  id: string;
  organizacion_id: string;
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
  organizacion_id: string;
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
  organizacion_id: string;
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
  organizacion_id: string;
  anio: number;
  cuota_mensual: number;
  recargo_mora: number;
  descripcion?: string;
  created_at: string;
  updated_at: string;
}

export interface Pago {
  id: string;
  organizacion_id: string;
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
  cajero?: Perfil;
  detalles?: PagoDetalle[];
}

export interface PagoDetalle {
  id: string;
  organizacion_id: string;
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
