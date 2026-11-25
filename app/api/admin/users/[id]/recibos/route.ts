import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { obtenerMensajeError } from '@/lib/utils/errors';

function puedeConsultarUsuarios(perfil?: {
  rol?: string;
  activo?: boolean;
  permisos?: unknown;
} | null): boolean {
  if (!perfil?.activo) return false;
  if (perfil.rol === 'administrador') return true;
  if (Array.isArray(perfil.permisos)) {
    return perfil.permisos.includes('*') || perfil.permisos.includes('usuarios.gestionar');
  }
  return false;
}

interface PagoRow {
  id: string;
  folio: string;
  total: number;
  metodo_pago: string;
  fecha_pago: string;
  estado: string;
  notas?: string | null;
  created_at: string;
  persona?: unknown;
  detalles?: unknown;
}

interface CooperacionJoin {
  id: string;
  nombre: string;
  cuota_requerida: number;
}

interface PadronJoin {
  id: string;
  cooperacion_id: string;
  cooperacion?: CooperacionJoin | CooperacionJoin[] | null;
  persona?: unknown;
  toma?: unknown;
}

interface AbonoCoopRow {
  id: string;
  padron_id: string;
  folio_recibo: string;
  monto_abono: number;
  saldo_anterior: number;
  saldo_restante: number;
  metodo_pago: string;
  notas?: string | null;
  fecha_pago: string;
  created_at: string;
  item_padron?: PadronJoin | PadronJoin[] | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: targetUserId } = await params;

    // 1. Validar sesión
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    // 2. Verificar permiso de administración / gestión de usuarios activo
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, permisos, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !puedeConsultarUsuarios(perfilAdmin)) {
      return NextResponse.json(
        { error: 'Se requieren permisos para consultar la actividad de usuarios.' },
        { status: 403 }
      );
    }

    // 3. Verificar que el usuario objetivo pertenezca a la misma organización
    const { data: cajero, error: errCajero } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, email, rol, activo, ultima_conexion')
      .eq('id', targetUserId)
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .single();

    if (errCajero || !cajero) {
      return NextResponse.json(
        { error: 'Usuario no encontrado o no pertenece a tu organización.' },
        { status: 404 }
      );
    }

    // 4. Obtener TODOS los recibos de agua potable y abonos de cooperaciones emitidos por este cajero
    const [listaPagos, abonosRaw] = await Promise.all([
      fetchAllRows<PagoRow>((from, to) =>
        supabase
          .from('pagos')
          .select(`
            id,
            folio,
            total,
            metodo_pago,
            fecha_pago,
            estado,
            notas,
            created_at,
            persona:personas (
              id,
              nombre_completo,
              documento_identidad
            ),
            detalles:pago_detalles (
              id,
              monto,
              recargo,
              anio,
              mes,
              toma:tomas (
                id,
                codigo_toma
              )
            )
          `)
          .eq('cajero_id', targetUserId)
          .eq('organizacion_id', perfilAdmin.organizacion_id)
          .order('fecha_pago', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<AbonoCoopRow>((from, to) =>
        supabase
          .from('cooperacion_abonos')
          .select(`
            id,
            padron_id,
            folio_recibo,
            monto_abono,
            saldo_anterior,
            saldo_restante,
            metodo_pago,
            notas,
            fecha_pago,
            created_at,
            item_padron:cooperacion_padron (
              id,
              cooperacion_id,
              cooperacion:cooperaciones (
                id,
                nombre,
                cuota_requerida
              ),
              persona:personas (
                id,
                nombre_completo
              ),
              toma:tomas (
                id,
                codigo_toma
              )
            )
          `)
          .eq('cajero_id', targetUserId)
          .eq('organizacion_id', perfilAdmin.organizacion_id)
          .order('fecha_pago', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    // Normalizar abonos de cooperación al contrato esperado por ModalActividadCajero
    const listaCoop = abonosRaw.map((row) => {
      const padron = Array.isArray(row.item_padron)
        ? row.item_padron[0] || null
        : row.item_padron || null;
      const coopRaw = padron?.cooperacion
        ? Array.isArray(padron.cooperacion)
          ? padron.cooperacion[0] || null
          : padron.cooperacion
        : null;

      return {
        id: row.id,
        padron_id: row.padron_id,
        cooperacion_id: padron?.cooperacion_id || coopRaw?.id || '',
        folio_recibo: row.folio_recibo,
        monto: Number(row.monto_abono) || 0,
        monto_abono: Number(row.monto_abono) || 0,
        saldo_anterior: Number(row.saldo_anterior) || 0,
        saldo_restante: Number(row.saldo_restante) || 0,
        metodo_pago: row.metodo_pago,
        notas: row.notas || null,
        created_at: row.fecha_pago || row.created_at,
        cooperacion: coopRaw
          ? {
              id: coopRaw.id,
              nombre: coopRaw.nombre,
              cuota_requerida: Number(coopRaw.cuota_requerida) || 0,
              monto_sugerido: Number(coopRaw.cuota_requerida) || 0,
            }
          : undefined,
        item_padron: padron
          ? {
              id: padron.id,
              persona: Array.isArray(padron.persona) ? padron.persona[0] : padron.persona,
              toma: Array.isArray(padron.toma) ? padron.toma[0] : padron.toma,
            }
          : undefined,
      };
    });

    // 5. Calcular resúmenes y métricas de cobro
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioHoyIso = hoy.toISOString();

    let totalMontoAgua = 0;
    let recibosAnulados = 0;
    let recaudadoHoy = 0;

    for (const p of listaPagos) {
      const monto = Number(p.total) || 0;
      if (p.estado === 'anulado') {
        recibosAnulados += 1;
      } else {
        totalMontoAgua += monto;
        if (p.fecha_pago && p.fecha_pago >= inicioHoyIso) {
          recaudadoHoy += monto;
        }
      }
    }

    let totalMontoCoop = 0;
    for (const c of listaCoop) {
      const monto = Number(c.monto) || 0;
      totalMontoCoop += monto;
      if (c.created_at && c.created_at >= inicioHoyIso) {
        recaudadoHoy += monto;
      }
    }

    const totalCobrado = totalMontoAgua + totalMontoCoop;
    const totalRecibos = listaPagos.length + listaCoop.length;

    return NextResponse.json({
      cajero,
      resumen: {
        totalCobrado,
        totalRecibos,
        totalRecibosAgua: listaPagos.length,
        totalRecibosCoop: listaCoop.length,
        montoAgua: totalMontoAgua,
        montoCooperaciones: totalMontoCoop,
        recaudadoHoy,
        recibosAnulados,
      },
      recibosAgua: listaPagos,
      recibosCooperacion: listaCoop,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error al obtener los recibos del cajero.') },
      { status: 500 }
    );
  }
}
