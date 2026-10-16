'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { sileo } from 'sileo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Header } from '@/components/ui/Header';
import { aislarOrganizacionLocal, limpiarDatosLocales } from '@/lib/db/offline-db';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [recordarme, setRecordarme] = useState(true);
  const [cargando, setCargando] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      sileo.warning({
        title: 'Faltan datos',
        description: 'Por favor escribe tu correo y contraseña.',
      });
      return;
    }

    setCargando(true);

    try {
      if (!isSupabaseConfigured) {
        sileo.error({
          title: 'Configuración pendiente',
          description: 'Las variables de Supabase no están configuradas en el entorno.',
        });
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password, // No recortar contraseña con trim()
      });

      if (authError) {
        sileo.error({
          title: 'Datos incorrectos',
          description: 'El correo o la contraseña no coinciden.',
        });
        return;
      }

      if (authData.user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('rol, nombre_completo, activo, organizacion_id')
          .eq('id', authData.user.id)
          .single();

        if (!perfil || !perfil.organizacion_id) {
          await limpiarDatosLocales({ limpiarCola: true });
          await supabase.auth.signOut();
          sileo.error({
            title: 'Acceso denegado',
            description: 'Tu cuenta no está vinculada a ningún comité de agua potable. Contacta al administrador.',
          });
          return;
        }

        if (!perfil.activo) {
          await limpiarDatosLocales({ limpiarCola: true });
          await supabase.auth.signOut();
          sileo.error({
            title: 'Cuenta suspendida',
            description: 'Tu cuenta ha sido desactivada. Contacta al administrador del comité.',
          });
          return;
        }

        const { data: orgData } = await supabase
          .from('organizaciones')
          .select('id, activo')
          .eq('id', perfil.organizacion_id)
          .single();

        if (!orgData || !orgData.activo) {
          await limpiarDatosLocales({ limpiarCola: true });
          await supabase.auth.signOut();
          sileo.error({
            title: 'Organización no disponible',
            description: 'El comité de agua potable asociado no existe o se encuentra inactivo.',
          });
          return;
        }

        await aislarOrganizacionLocal(perfil.organizacion_id);

        const rolNombre = perfil?.rol === 'administrador' ? 'Administrador' : 'Cajero';
        const usuarioNombre = perfil?.nombre_completo || authData.user.email;

        sileo.success({
          title: `¡Hola, ${usuarioNombre}!`,
          description: `Turno iniciado automáticamente como ${rolNombre}.`,
        });

        router.push('/dashboard');
        router.refresh();
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
    <div className="min-h-screen w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white relative overflow-hidden font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200">

      {/* HEADER FLOTANTE */}
      <div className="absolute top-0 inset-x-0 z-50 pointer-events-none">
        <Header logoSrc="/Img/Logo_Fluvib.webp" />
      </div>

      {/* LAYOUT DOS COLUMNAS */}
      <div className="w-full min-h-screen flex flex-col lg:flex-row">

        {/* COLUMNA IZQUIERDA: Formulario — visible siempre */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-start lg:justify-center px-6 sm:px-12 lg:px-16 bg-white dark:bg-slate-950 z-10 transition-colors pt-44 sm:pt-48 lg:pt-20 pb-0 lg:pb-12 min-h-screen relative overflow-hidden">
          {/* Brillo ambiental sutil en móvil para dar profundidad sin saturar */}
          <div className="block lg:hidden absolute top-12 left-1/2 -translate-x-1/2 w-80 h-80 bg-sky-400/10 dark:bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-md w-full space-y-7 relative z-10">

            {/* Encabezado */}
            <div className="flex flex-col items-center text-center space-y-4 w-full">
              <div className="space-y-1.5">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Iniciar Sesión
                </h1>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Ingresa tus datos para acceder al control de agua potable
                </p>
              </div>
            </div>

            {/* Formulario con el componente Input uniforme */}
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Correo Electrónico */}
              <div>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Correo electrónico"
                />
              </div>

              {/* Contraseña con botón mostrar/ocultar */}
              <div>
                <Input
                  type={verPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setVerPassword(!verPassword)}
                      className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1"
                      title={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  }
                />
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
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Recordar mi sesión</span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    sileo.info({
                      title: 'Recuperación de contraseña',
                      description: 'Comunícate con el administrador del comité para restablecer tu clave.',
                    })
                  }
                  className="font-bold text-blue-600 dark:text-sky-400 hover:text-blue-800 dark:hover:text-sky-300 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Botón Principal */}
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

          {/* Fluvib abajo — SOLO MÓVIL con integración sutil */}
          <div className="block lg:hidden w-full mt-auto pt-8 pb-0 pointer-events-none select-none relative">
            <div className="absolute inset-x-0 bottom-0 h-28 bg-sky-100/40 dark:bg-sky-950/20 -z-10" />
            <Image
              src="/Img/Fluvib_B.webp"
              alt="Fluvib"
              width={900}
              height={641}
              sizes="100vw"
              className="w-full h-auto object-contain object-bottom max-h-60 mx-auto"
            />
          </div>
        </div>

        {/* COLUMNA DERECHA: Ondas — OCULTA EN MÓVIL */}
        <div className="hidden lg:flex w-full lg:w-1/2 min-h-screen relative items-center justify-center overflow-hidden">
          <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
            <svg
              viewBox="0 0 500 800"
              preserveAspectRatio="none"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="manchaFondoY" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#90e0ef" />
                  <stop offset="55%" stopColor="#72ddf7" />
                  <stop offset="100%" stopColor="#48cae4" />
                </linearGradient>
                <linearGradient id="manchaHaloY" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#caf0f8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#90e0ef" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              <path
                d="M 30 0 C 110 110, 15 220, 75 340 C 135 460, 20 570, 80 690 C 130 770, 50 800, 40 800 L 500 800 L 500 0 Z"
                fill="url(#manchaHaloY)"
              />
              <path
                d="M 60 0 C 130 95, 45 195, 105 320 C 165 445, 50 545, 110 665 C 150 745, 80 800, 75 800 L 500 800 L 500 0 Z"
                fill="url(#manchaFondoY)"
              />
            </svg>
          </div>

          {/* Texto superior derecho */}
          <div className="absolute top-16 right-14 z-10 text-right max-w-md space-y-3">
            <h2 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-xs">
              Sistema de Gestión de Agua Potable
            </h2>
            <p className="text-base font-semibold text-white leading-relaxed max-w-sm ml-auto">
              Control de tomas, cobro de cuotas mensuales y administración transparente para todos los vecinos.
            </p>
          </div>

          {/* Mascota Fluvib esquina inferior derecha */}
          <div className="absolute bottom-0 right-0 z-20 pointer-events-none select-none">
            <Image
              src="/Img/Fluvib.webp"
              alt="Fluvib"
              width={640}
              height={877}
              sizes="256px"
              className="w-40 sm:w-48 md:w-56 lg:w-60 xl:w-64 h-auto object-contain drop-shadow-xl"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
