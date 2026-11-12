import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { obtenerMensajeError } from '@/lib/utils/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: targetUserId } = await params;

    // 1. Validar sesión del administrador
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    // 2. Verificar rol administrador activo
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Se requieren permisos de administrador activo.' },
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

    // 4. Obtener recibos de agua potable emitidos por este cajero
    const { data: recibosAgua, error: errPagos } = await supabase
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
      .order('fecha_pago', { ascending: false });

    if (errPagos) {
      throw errPagos;
    }

    // 5. Obtener recibos de cooperaciones emitidos por este cajero
    const { data: abonosCoop, error: errCoop } = await supabase
      .from('cooperacion_abonos')
      .select(`
        id,
        cooperacion_id,
        folio_recibo,
        monto,
        metodo_pago,
        notas,
        created_at,
        cooperacion:cooperaciones (
          id,
          nombre,
          monto_sugerido
        ),
        item_padron:cooperacion_padron (
          id,
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
      .order('created_at', { ascending: false });

    if (errCoop) {
      throw errCoop;
    }

    // 6. Calcular resúmenes y métricas de cobro
    const listaPagos = recibosAgua || [];
    const listaCoop = abonosCoop || [];

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

