import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PermisoSistema, RolUsuario } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

const ROLES_PERMITIDOS: RolUsuario[] = ['administrador', 'cajero', 'lector'];

const PERMISOS_PERMITIDOS: PermisoSistema[] = [
  'usuarios.gestionar',
  'organizacion.editar',
  'cobros.crear',
  'cobros.anular',
  'tomas.ver',
  'tomas.gestionar',
  'personas.ver',
  'personas.gestionar',
  'tarifas.gestionar',
  'reportes.ver',
];

/**
 * GET /api/admin/users
 * Lista todos los usuarios pertenecientes a la organización del administrador en sesión.
 * Utiliza la columna 'email' indexada directamente en perfiles (Solución C6).
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Validar sesión
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Obtener perfil y verificar rol administrador activo
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Se requieren permisos de administrador activo' },
        { status: 403 }
      );
    }

    // 3. Obtener perfiles de la organización directamente desde la base de datos
    const { data: usuarios, error: listError } = await supabase
      .from('perfiles')
      .select('id, email, nombre_completo, rol, permisos, telefono, activo, ultima_conexion, created_at, updated_at')
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .order('created_at', { ascending: false });

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    return NextResponse.json({
      usuarios: usuarios || [],
      organizacionId: perfilAdmin.organizacion_id,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error interno del servidor') },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Da de alta un nuevo usuario dentro de la organización del administrador.
 * Envía credenciales y privilegios en 'app_metadata' validando lista blanca de permisos.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Validar sesión del administrador
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Verificar que el usuario sea administrador activo y obtener su organizacion_id
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Solo los administradores activos pueden crear nuevos usuarios.' },
        { status: 403 }
      );
    }

    // 3. Validar datos del formulario
    const body = await request.json();
    const { email, password, nombre_completo, rol, permisos, telefono } = body;

    if (!email || !password || !nombre_completo || !rol) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: email, password, nombre_completo y rol son requeridos.' },
        { status: 400 }
      );
    }

    const emailLimpio = String(email).trim().toLowerCase();
    const partesArroba = emailLimpio.split('@');
    const dominio = partesArroba[1] || '';
    const esEmailValido =
      emailLimpio.length <= 254 &&
      !emailLimpio.includes(' ') &&
      partesArroba.length === 2 &&
      partesArroba[0].length > 0 &&
      dominio.includes('.') &&
      !dominio.startsWith('.') &&
      !dominio.endsWith('.');

    if (!esEmailValido) {
      return NextResponse.json(
        { error: 'El formato de correo electrónico no es válido.' },
        { status: 400 }
      );
    }

    if (!ROLES_PERMITIDOS.includes(rol)) {
      return NextResponse.json(
        { error: `Rol no válido. Los roles permitidos son: ${ROLES_PERMITIDOS.join(', ')}.` },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    // Lista blanca estricta de permisos (impide inyectar '*' en roles no administradores)
    const permisosValidados = Array.isArray(permisos)
      ? Array.from(
          new Set(
            permisos.filter(
              (p): p is PermisoSistema =>
                typeof p === 'string' && PERMISOS_PERMITIDOS.includes(p as PermisoSistema)
            )
          )
        )
      : [];

    const permisosFinales = rol === 'administrador' ? ['*'] : permisosValidados;

    // 4. Crear el usuario mediante Supabase Admin API
    const adminSupabase = createAdminClient();

    const { data: newUserAuth, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email: emailLimpio,
        password: password,
        email_confirm: true,
        app_metadata: {
          organizacion_id: perfilAdmin.organizacion_id,
          rol,
          permisos: permisosFinales,
        },
        user_metadata: {
          nombre_completo: String(nombre_completo).trim(),
          telefono: telefono ? String(telefono).trim() : null,
        },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mensaje: `Usuario ${nombre_completo} creado con éxito.`,
      user: {
        id: newUserAuth.user.id,
        email: newUserAuth.user.email,
        nombre_completo: String(nombre_completo).trim(),
        rol,
        organizacion_id: perfilAdmin.organizacion_id,
        permisos: permisosFinales,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error interno al procesar el alta de usuario') },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users
 * Permite al administrador activar/suspender un usuario de su misma organización.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Solo los administradores activos pueden modificar usuarios.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userId = body.userId || body.id;
    const { activo } = body;

    if (!userId || typeof activo !== 'boolean') {
      return NextResponse.json(
        { error: 'Se requiere userId y el estado activo (booleano).' },
        { status: 400 }
      );
    }

    if (userId === user.id && !activo) {
      return NextResponse.json(
        { error: 'No puedes suspender tu propia cuenta de administrador.' },
        { status: 400 }
      );
    }

    // Verificar que el usuario objetivo pertenezca a la misma organización
    const { data: usuarioObjetivo, error: errTarget } = await supabase
      .from('perfiles')
      .select('id, organizacion_id, nombre_completo')
      .eq('id', userId)
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .single();

    if (errTarget || !usuarioObjetivo) {
      return NextResponse.json(
        { error: 'El usuario no existe o no pertenece a tu organización.' },
        { status: 404 }
      );
    }

    const { error: updateErr } = await supabase
      .from('perfiles')
      .update({
        activo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('organizacion_id', perfilAdmin.organizacion_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mensaje: `Cuenta de ${usuarioObjetivo.nombre_completo} ${activo ? 'reactivada' : 'suspendida'} correctamente.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error interno al actualizar usuario') },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users
 * Actualiza los datos de un usuario existente (nombre, rol, permisos, teléfono, contraseña opcional).
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Solo los administradores activos pueden modificar usuarios.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userId = body.userId || body.id;
    const { nombre_completo, rol, permisos, telefono, password } = body;

    if (!userId || !nombre_completo || !rol) {
      return NextResponse.json(
        { error: 'userId, nombre_completo y rol son requeridos.' },
        { status: 400 }
      );
    }

    if (!ROLES_PERMITIDOS.includes(rol)) {
      return NextResponse.json(
        { error: `Rol no válido. Permitidos: ${ROLES_PERMITIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    // Verificar que el usuario objetivo pertenezca a la misma organización
    const { data: usuarioObjetivo, error: errTarget } = await supabase
      .from('perfiles')
      .select('id, organizacion_id, nombre_completo, rol')
      .eq('id', userId)
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .single();

    if (errTarget || !usuarioObjetivo) {
      return NextResponse.json(
        { error: 'El usuario no existe o no pertenece a tu organización.' },
        { status: 404 }
      );
    }

    // Si se modifica el propio usuario admin, evitar que se degrade a un rol inferior
    if (userId === user.id && rol !== 'administrador') {
      return NextResponse.json(
        { error: 'No puedes cambiar tu propio rol de administrador.' },
        { status: 400 }
      );
    }

    let permisosFinales: PermisoSistema[] = [];
    if (rol === 'administrador') {
      permisosFinales = ['*'] as unknown as PermisoSistema[];
    } else if (Array.isArray(permisos)) {
      permisosFinales = permisos.filter((p: PermisoSistema) =>
        PERMISOS_PERMITIDOS.includes(p)
      );
    }

    // Si se ingresó una nueva contraseña, actualizarla mediante Supabase Admin API
    if (password && typeof password === 'string' && password.trim().length >= 6) {
      const supabaseAdmin = createAdminClient();
      const { error: passErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password.trim(),
      });
      if (passErr) {
        return NextResponse.json(
          { error: `Error al actualizar la contraseña: ${passErr.message}` },
          { status: 500 }
        );
      }
    }

    // Actualizar perfil en PostgreSQL
    const { error: updateErr } = await supabase
      .from('perfiles')
      .update({
        nombre_completo: String(nombre_completo).trim(),
        rol,
        permisos: permisosFinales,
        telefono: telefono ? String(telefono).trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('organizacion_id', perfilAdmin.organizacion_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mensaje: `Datos de ${nombre_completo} actualizados con éxito.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error interno al actualizar el usuario.') },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users
 * Elimina la cuenta de usuario de Supabase Auth y su perfil asociado.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id, activo')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfilAdmin?.activo || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Solo los administradores activos pueden eliminar usuarios.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro userId para eliminar.' },
        { status: 400 }
      );
    }

    if (userId === user.id) {
      return NextResponse.json(
        { error: 'No puedes eliminar tu propia cuenta de administrador en sesión.' },
        { status: 400 }
      );
    }

    // Verificar que el usuario pertenezca a la misma organización
    const { data: usuarioObjetivo, error: errTarget } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, organizacion_id')
      .eq('id', userId)
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .single();

    if (errTarget || !usuarioObjetivo) {
      return NextResponse.json(
        { error: 'El usuario no existe o no pertenece a tu organización.' },
        { status: 404 }
      );
    }

    // Eliminar el usuario en Supabase Auth mediante Admin API (hace cascade a perfiles)
    const supabaseAdmin = createAdminClient();
    const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthErr) {
      // Fallback: eliminar directamente de perfiles si Auth ya no existía
      const { error: deletePerfilErr } = await supabase
        .from('perfiles')
        .delete()
        .eq('id', userId)
        .eq('organizacion_id', perfilAdmin.organizacion_id);

      if (deletePerfilErr) {
        return NextResponse.json(
          { error: `No se pudo eliminar el usuario: ${deleteAuthErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `El usuario ${usuarioObjetivo.nombre_completo} ha sido eliminado permanentemente del sistema.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: obtenerMensajeError(err, 'Error interno al eliminar usuario.') },
      { status: 500 }
    );
  }
}
