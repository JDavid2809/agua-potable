'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Droplets,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [recordarme, setRecordarme] = useState(true);
  const [cargando, setCargando] = useState(false);

  // Inicio de sesión con detección automática del rol del usuario
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      sileo.warning({
        title: 'Faltan datos',
        description: 'Por favor escribe tu correo y contraseña.',
      });
      return;
    }

    setCargando(true);

    try {
      if (!isSupabaseConfigured) {
        // En modo local de prueba, detectar rol automáticamente según el correo
        const esAdmin = email.toLowerCase().includes('admin');
        const rolDetectado = esAdmin ? 'Administrador' : 'Cajero';

        sileo.success({
          title: 'Acceso autorizado',
          description: `Bienvenido, detectado como ${rolDetectado}.`,
        });

        setTimeout(() => router.push('/'), 900);
        return;
      }

      // Autenticación en Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        sileo.error({
          title: 'Datos incorrectos',
          description: 'El correo o la contraseña no coinciden.',
        });
        return;
      }

      if (authData.user) {
        // Consulta automática del rol en la tabla perfiles
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('rol, nombre_completo')
          .eq('id', authData.user.id)
          .single();

        const rolNombre = perfil?.rol === 'administrador' ? 'Administrador' : 'Cajero';
        const usuarioNombre = perfil?.nombre_completo || authData.user.email;

        sileo.success({
          title: `¡Hola, ${usuarioNombre}!`,
          description: `Turno iniciado automáticamente como ${rolNombre}.`,
        });

        router.push('/');
      }
    } catch {
      sileo.error({
        title: 'Error de conexión',
        description: 'No se pudo conectar con el servidor. Revisa tu conexión.',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-center relative overflow-hidden font-sans selection:bg-blue-600 selection:text-white py-10 lg:py-0">
      {/* =========================================================================
          FORMAS GEOMÉTRICAS Y ORGÁNICAS FLOTANTES
          Exclusivamente en tonos azules claros, cianes y azules profundos
          ========================================================================= */}
      <div className="absolute top-0 right-0 w-[55vw] h-full pointer-events-none hidden lg:block overflow-hidden">
        {/* Círculo difuminado azul cielo suave */}
        <div className="absolute -top-16 right-52 w-72 h-72 rounded-full bg-sky-200/50 blur-2xl" />

        {/* Medio círculo azul marino profundo en esquina superior derecha */}
        <div className="absolute -top-12 -right-12 w-80 h-80 rounded-bl-full bg-blue-900/35" />

        {/* Semicírculo superior en azul claro brillante */}
        <div className="absolute -top-10 right-84 w-64 h-32 rounded-b-full bg-sky-400" />

        {/* Matriz de puntos sutiles en tono azul */}
        <svg
          className="absolute top-44 right-32 w-40 h-40 text-blue-300/70"
          fill="currentColor"
          viewBox="0 0 100 100"
        >
          <pattern id="dot-pattern" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" />
          </pattern>
          <rect width="100" height="100" fill="url(#dot-pattern)" />
        </svg>

        {/* Pastilla semicircular inferior en azul cian claro */}
        <div className="absolute bottom-20 right-80 w-56 h-28 rounded-b-full bg-cyan-300" />

        {/* Forma geométrica inferior en azul marino intenso oscuro */}
        <div className="absolute -bottom-10 right-44 w-48 h-48 rounded-3xl rotate-45 bg-gradient-to-tr from-blue-950 via-blue-900 to-blue-800 shadow-xl" />

        {/* Forma triangular redondeada en azul real medio */}
        <div className="absolute bottom-28 -right-10 w-52 h-52 rounded-[44px] rotate-12 bg-blue-600/30" />
      </div>

      {/* =========================================================================
          CONTENIDO: MAYOR ESPACIADO HORIZONTAL Y EXPANSIÓN EN EJE Y
          ========================================================================= */}
      <div className="max-w-7xl w-full mx-auto px-6 sm:px-12 lg:px-16 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 xl:gap-32 items-center">
        {/* COLUMNA IZQUIERDA: Formulario con componentes expandidos en eje Y y logo centrado */}
        <div className="lg:col-span-5 max-w-md w-full mx-auto space-y-9">
          {/* LOGO CENTRADO EN LA COLUMNA IZQUIERDA */}
          <div className="flex flex-col items-center text-center space-y-4 w-full">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-xl shadow-blue-600/30">
              <Droplets className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Iniciar Sesión
              </h1>
              <p className="text-sm font-semibold text-slate-500 max-w-xs mx-auto">
                Ingresa tus datos para acceder al control de agua potable
              </p>
            </div>
          </div>

          {/* Formulario con mayor altura y separación vertical (Eje Y) */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Campo Correo Electrónico expandido */}
            <div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                className="w-full text-base font-medium bg-slate-100 text-slate-900 placeholder:text-slate-400 rounded-xl px-5 py-4 outline-none transition-all border border-transparent focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 shadow-xs"
              />
            </div>

            {/* Campo Contraseña expandido */}
            <div className="relative flex items-center">
              <input
                type={verPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full text-base font-medium bg-slate-100 text-slate-900 placeholder:text-slate-400 rounded-xl pl-5 pr-12 py-4 outline-none transition-all border border-transparent focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 shadow-xs"
              />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                className="absolute right-4 text-slate-400 hover:text-slate-900 transition-colors p-1"
                title={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Fila Recordar sesión + Olvidé contraseña */}
            <div className="flex items-center justify-between text-xs sm:text-sm pt-0.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordarme}
                  onChange={(e) => setRecordarme(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600"
                />
                <span className="font-semibold text-slate-600">Recordar mi sesión</span>
              </label>

              <button
                type="button"
                onClick={() =>
                  sileo.info({
                    title: 'Recuperación de contraseña',
                    description: 'Comunícate con el administrador del comité para restablecer tu clave.',
                  })
                }
                className="font-bold text-blue-600 hover:text-blue-800 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Botón Principal expandido verticalmente con silueta asimétrica */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={cargando}
                className="w-full py-4 text-base font-bold shadow-lg shadow-blue-600/30"
                icon={<ArrowRight className="w-5 h-5" />}
              >
                {cargando ? 'Ingresando...' : 'Entrar'}
              </Button>
            </div>
          </form>
        </div>

        {/* COLUMNA DERECHA: Frase Inspiradora con espacio generoso */}
        <div className="lg:col-span-7 flex flex-col justify-center items-center lg:items-start text-center lg:text-left relative py-8 lg:pl-6">
          <div className="max-w-xl space-y-5">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
              Cuidando y administrando el agua de nuestra comunidad
            </h2>
            <p className="text-base sm:text-lg font-medium text-slate-600 leading-relaxed max-w-lg">
              Control de tomas, cobro de cuotas mensuales y registro transparente para todos los vecinos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
