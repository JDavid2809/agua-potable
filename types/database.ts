export type RolUsuario = 'administrador' | 'cajero' | 'lector';
export type EstadoToma = 'activa' | 'suspendida' | 'cortada' | 'inactiva';
export type TipoToma = 'domestica' | 'comercial' | 'comunal' | 'lote_baldio';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
export type EstadoPago = 'completado' | 'anulado';
export type TipoCargoCiclo = 'mensual' | 'extraordinario';

/** Permisos del sistema para control de acceso granular (RBAC) */
export type PermisoSistema =
  | '*'                        // Superacceso / Administrador total
  | 'usuarios.gestionar'       // Crear, editar y suspender usuarios
  | 'organizacion.editar'      // Modificar datos del comité / organización
  | 'cobros.crear'             // Registrar pagos y emitir recibos
  | 'cobros.anular'            // Cancelar o anular recibos emitidos
  | 'tomas.ver'                // Consultar padrón de tomas
  | 'tomas.gestionar'          // Crear, editar o suspender tomas
  | 'personas.ver'             // Consultar contribuyentes
  | 'personas.gestionar'       // Crear y actualizar datos de contribuyentes
  | 'cooperaciones.ver'        // Consultar campañas de cooperación y obras
  | 'cooperaciones.cobrar'     // Registrar abonos y faenas de cooperación
  | 'cooperaciones.gestionar'  // Crear campañas y otorgar prórrogas de cooperación
  | 'tarifas.gestionar'        // Modificar cuotas anuales y recargos
  | 'reportes.ver';            // Visualizar cortes de caja y balance financiero

export interface OrganizacionConfig {
  cuota_base: number;
  recargo_mora: number;
  moneda: string;
  permitir_cobro_offline: boolean;
  registros_por_pagina?: number;
  cuotas_por_tipo?: Partial<Record<TipoToma, number>>;
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
  email?: string;
  nombre_completo: string;
  rol: RolUsuario;
  permisos: PermisoSistema[] | string[];
  telefono?: string;
  activo: boolean;
  ultima_conexion?: string | null;
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
  estado?: EstadoPago;
  motivo_anulacion?: string | null;
  anulado_en?: string | null;
  anulado_por?: string | null;
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

export interface CargoCiclo {
  id: string;
  organizacion_id: string;
  tipo: TipoCargoCiclo;
  anio: number;
  mes: number;
  monto_unitario: number;
  tomas_afectadas: number;
  tomas_exentas_adelanto: number;
  total_generado: number;
  concepto: string;
  creado_por?: string | null;
  created_at: string;
  autor?: { id: string; nombre_completo: string } | null;
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

export interface TransaccionPagoData {
  pago: Pago;
  detalles: PagoDetalle[];
}

export interface TransaccionAbonoCoopData {
  abono_id: string;
  organizacion_id: string;
  padron_id: string;
  folio_recibo: string;
  monto_abono: number;
  saldo_anterior: number;
  saldo_restante: number;
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  cajero_id?: string | null;
  notas?: string | null;
  fecha_pago: string;
  nuevo_total_pagado: number;
  nuevo_estado: 'pendiente' | 'parcial' | 'liquidado' | 'exento_faena';
  fecha_liquidacion?: string | null;
}

export interface TransaccionFaenaCoopData {
  padron_id: string;
  fecha_faena: string;
}

/** Objeto en la cola de sincronización para enviar a Supabase cuando vuelva internet */
export interface ElementoColaSync {
  id?: number; // Autoincremental en IndexedDB
  tabla:
    | 'transaccion_pago'
    | 'cooperacion_abono'
    | 'cooperacion_faena'
    | 'pagos'
    | 'pago_detalles'
    | 'personas'
    | 'tomas'
    | 'manzanas';
  accion: 'INSERT' | 'UPDATE' | 'DELETE';
  registro_id: string;
  datos:
    | TransaccionPagoData
    | TransaccionAbonoCoopData
    | TransaccionFaenaCoopData
    | Pago
    | PagoDetalle
    | Persona
    | Toma
    | Manzana
    | Record<string, unknown>;
  creado_en: string;
  intentos: number;
  ultimo_error?: string;
  estado?: 'pendiente' | 'procesando' | 'error';
}
