import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RolUsuario } from '@/types/database';

const ROLES_PERMITIDOS: RolUsuario[] = ['administrador', 'cajero', 'lector'];

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

    // 2. Obtener perfil y verificar rol administrador
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id')
      .eq('id', user.id)
      .single();

    if (perfilError || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Se requieren permisos de administrador' },
        { status: 403 }
      );
    }

    // 3. Obtener perfiles de la organización directamente desde la base de datos
    const { data: usuarios, error: listError } = await supabase
      .from('perfiles')
      .select('id, email, nombre_completo, rol, permisos, telefono, activo, created_at, updated_at')
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .order('created_at', { ascending: false });

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    return NextResponse.json({ usuarios: usuarios || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Da de alta un nuevo usuario dentro de la organización del administrador.
 * Envía credenciales y privilegios en 'app_metadata' (Solución C2 y C5).
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

    // 2. Verificar que el usuario sea administrador y obtener su organizacion_id
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, organizacion_id')
      .eq('id', user.id)
      .single();

    if (perfilError || perfilAdmin?.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Solo los administradores pueden crear nuevos usuarios.' },
        { status: 403 }
      );
    }

    // 3. Validar datos del formulario (Solución C5)
    const body = await request.json();
    const { email, password, nombre_completo, rol, permisos, telefono } = body;

    if (!email || !password || !nombre_completo || !rol) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: email, password, nombre_completo y rol son requeridos.' },
        { status: 400 }
      );
    }

    const emailLimpio = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLimpio)) {
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

    const permisosValidados = Array.isArray(permisos)
      ? permisos.filter((p) => typeof p === 'string')
      : [];

    // 4. Crear el usuario mediante Supabase Admin API
    // IMPORTANTE (C2): organizacion_id, rol y permisos se envían en app_metadata
    // para que solo puedan ser escritos por el service_role del backend.
    const adminSupabase = createAdminClient();

    const { data: newUserAuth, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email: emailLimpio,
        password: password, // No recortar con trim() para no alterar contraseñas intencionales
        email_confirm: true,
        app_metadata: {
          organizacion_id: perfilAdmin.organizacion_id,
          rol,
          permisos: rol === 'administrador' ? ['*'] : permisosValidados,
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
        nombre_completo,
        rol,
        organizacion_id: perfilAdmin.organizacion_id,
        permisos: rol === 'administrador' ? ['*'] : permisosValidados,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error interno al procesar el alta de usuario' },
      { status: 500 }
    );
  }
}
