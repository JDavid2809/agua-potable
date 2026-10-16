import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Rutas que requieren sesión obligatoria
  const esRutaProtegida =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/usuarios') ||
    pathname.startsWith('/tomas') ||
    pathname.startsWith('/personas') ||
    pathname.startsWith('/cobros') ||
    pathname.startsWith('/lecturas') ||
    pathname.startsWith('/reportes') ||
    pathname.startsWith('/configuracion');

  // Si no está logueado e intenta entrar a una ruta protegida -> redirigir a login
  if (!user && esRutaProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Si ya está logueado e intenta visitar /login -> redirigir a dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|Img/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
