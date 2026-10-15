import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/users
 * Lista todos los usuarios pertenecientes a la organización del administrador en sesión.
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

    // 3. Obtener perfiles de la organización
    const { data: usuarios, error: listError } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol, permisos, telefono, activo, created_at, updated_at')
      .eq('organizacion_id', perfilAdmin.organizacion_id)
      .order('created_at', { ascending: false });

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    // 4. Cruzar con correos usando el cliente administrativo
    const adminSupabase = createAdminClient();
    const { data: authUsersData } = await adminSupabase.auth.admin.listUsers({
      perPage: 1000,
    });

    const userEmailsMap = new Map(
      (authUsersData?.users || []).map((u) => [u.id, u.email])
    );

    const usuariosConEmail = (usuarios || []).map((u) => ({
      ...u,
      email: userEmailsMap.get(u.id) || '',
    }));

    return NextResponse.json({ usuarios: usuariosConEmail });
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

    // 3. Validar datos del formulario
    const body = await request.json();
    const { email, password, nombre_completo, rol, permisos, telefono } = body;

    if (!email || !password || !nombre_completo || !rol) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: email, password, nombre_completo y rol son requeridos.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    // 4. Crear el usuario mediante Supabase Admin API
    const adminSupabase = createAdminClient();

    const { data: newUserAuth, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email: email.trim(),
        password: password.trim(),
        email_confirm: true, // Confirmación automática de correo
        user_metadata: {
          nombre_completo: nombre_completo.trim(),
          rol,
          organizacion_id: perfilAdmin.organizacion_id,
          permisos: Array.isArray(permisos) ? permisos : [],
          telefono: telefono?.trim() || null,
        },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // El trigger handle_new_user ya creó el registro en perfiles.
    // Retornamos los datos creados
    return NextResponse.json({
      success: true,
      mensaje: `Usuario ${nombre_completo} creado con éxito.`,
      user: {
        id: newUserAuth.user.id,
        email: newUserAuth.user.email,
        nombre_completo,
        rol,
        organizacion_id: perfilAdmin.organizacion_id,
        permisos,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error interno al procesar el alta de usuario' },
      { status: 500 }
    );
  }
}
