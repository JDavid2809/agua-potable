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
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-center relative overflow-hidden font-sans selection:bg-blue-600 selection:text-white py-12 lg:py-0">
      {/* =========================================================================
          CONTENIDO: DOS COLUMNAS CON ESPACIADO GENEROSO
          Izquierda: Formulario limpio centrado
          Derecha: Mancha fluida orgánica de agua con el mensaje principal
          ========================================================================= */}
      <div className="max-w-7xl w-full mx-auto px-6 sm:px-12 lg:px-16 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 xl:gap-28 items-center min-h-[85vh]">
        
        {/* COLUMNA IZQUIERDA: Formulario con logo centrado y campos expandidos en Y */}
        <div className="lg:col-span-5 max-w-md w-full mx-auto space-y-9">
          {/* Logo y Encabezado centrado */}
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

          {/* Formulario de entrada con mayor presencia vertical */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Correo Electrónico */}
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

            {/* Contraseña con botón mostrar/ocultar */}
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

            {/* Botón Principal con silueta asimétrica en azul sólido */}
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

        {/* COLUMNA DERECHA: La Mancha Fluida Orgánica (Estilo idéntico a la imagen de referencia con lóbulos ondulados festoneados) */}
        <div className="lg:col-span-7 relative flex items-center justify-center py-8 lg:py-12">
          {/* CONTENEDOR DE LA MANCHA */}
          <div className="relative w-full max-w-2xl aspect-square flex items-center justify-center p-6 sm:p-12">
            
            {/* SVG DE LA MANCHA CON LÓBULOS ONDULADOS MULTICAPA */}
            <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
              <svg
                viewBox="-20 -40 640 640"
                className="w-full h-full drop-shadow-2xl"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Gradiente principal: Tonos azules ricos, vibrantes y profundos */}
                  <linearGradient id="manchaGradientePrincipal" x1="10%" y1="0%" x2="90%" y2="100%">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="45%" stopColor="#2563eb" />
                    <stop offset="85%" stopColor="#1e40af" />
                    <stop offset="100%" stopColor="#172554" />
                  </linearGradient>

                  {/* Halo exterior suave en azul celeste */}
                  <linearGradient id="manchaHaloExterior" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.25" />
                  </linearGradient>
                </defs>

                {/* Capa 1: Halo exterior ondulado festoneado (Sombra suave de la mancha) */}
                <path
                  d="M 545.6 280.0 C 549.9 300.7, 588.7 327.0, 585.4 345.2 C 582.2 363.3, 535.3 369.1, 526.3 389.0 C 517.3 408.9, 543.6 450.8, 531.3 464.5 C 519.0 478.2, 471.1 460.5, 452.6 471.3 C 434.0 482.1, 436.8 522.9, 420.1 529.4 C 403.5 536.0, 372.6 505.0, 352.6 510.5 C 332.6 516.0, 317.7 561.7, 300.0 562.3 C 282.3 562.9, 266.9 518.7, 246.6 513.8 C 226.3 509.0, 193.9 541.1, 178.1 533.0 C 162.4 525.0, 168.9 478.0, 152.2 465.4 C 135.4 452.8, 87.8 471.4, 77.7 457.3 C 67.6 443.1, 98.4 399.9, 91.7 380.3 C 84.9 360.8, 38.0 356.7, 37.0 340.0 C 36.1 323.3, 82.8 299.3, 85.9 280.0 C 89.0 260.7, 50.4 239.0, 55.4 224.2 C 60.4 209.4, 107.1 207.5, 115.9 191.3 C 124.6 175.1, 99.5 140.0, 108.0 126.9 C 116.5 113.8, 154.3 127.9, 166.8 113.0 C 179.3 98.0, 169.9 49.2, 183.0 37.0 C 196.1 24.9, 225.7 49.5, 245.2 39.9 C 264.7 30.2, 281.0 -17.6, 300.0 -20.9 C 319.0 -24.1, 336.8 16.8, 359.3 20.1 C 381.8 23.5, 418.1 -10.3, 435.2 -0.8 C 452.3 8.7, 445.9 61.0, 461.9 77.0 C 477.9 93.0, 522.4 78.9, 531.4 95.5 C 540.4 112.0, 511.0 155.2, 515.7 176.1 C 520.4 197.0, 554.4 203.5, 559.4 220.8 C 564.4 238.1, 541.2 259.3, 545.6 280.0 Z"
                  fill="url(#manchaHaloExterior)"
                />

                {/* Capa 2: Mancha principal con lóbulos fluidos festoneados idénticos a la referencia */}
                <path
                  d="M 522.2 280.0 C 526.5 298.6, 560.0 322.2, 557.2 338.7 C 554.4 355.2, 513.3 360.9, 505.2 378.8 C 497.1 396.8, 519.9 434.0, 508.7 446.4 C 497.5 458.8, 454.8 443.5, 438.0 453.0 C 421.1 462.5, 422.6 497.5, 407.5 503.3 C 392.4 509.1, 365.3 482.7, 347.4 487.7 C 329.5 492.7, 315.9 532.7, 300.0 533.3 C 284.1 533.9, 270.0 495.4, 251.8 491.0 C 233.6 486.6, 204.9 514.2, 190.7 506.9 C 176.5 499.6, 181.8 458.4, 166.8 447.1 C 151.7 435.8, 109.4 452.0, 100.4 439.2 C 91.4 426.4, 118.6 387.8, 112.7 370.2 C 106.9 352.6, 65.9 348.6, 65.3 333.6 C 64.7 318.5, 106.2 297.2, 109.3 280.0 C 112.4 262.8, 79.1 243.7, 83.7 230.6 C 88.3 217.5, 129.1 215.8, 137.0 201.5 C 144.8 187.2, 123.3 156.7, 130.7 145.0 C 138.1 133.3, 170.6 144.9, 181.4 131.3 C 192.2 117.6, 184.1 74.6, 195.6 63.2 C 207.1 51.7, 233.0 71.8, 250.4 62.7 C 267.8 53.5, 282.7 11.4, 300.0 8.1 C 317.3 4.9, 333.7 40.1, 354.1 42.9 C 374.5 45.8, 407.1 16.6, 422.6 25.3 C 438.2 34.1, 432.9 80.6, 447.3 95.3 C 461.6 110.0, 500.9 98.4, 508.7 113.5 C 516.6 128.7, 490.9 167.3, 494.6 186.3 C 498.3 205.2, 526.6 211.6, 531.2 227.2 C 535.7 242.9, 517.8 261.4, 522.2 280.0 Z"
                  fill="url(#manchaGradientePrincipal)"
                />

                {/* Capa 3: Relieve tonal interior más oscuro (como los contrastes de la imagen) */}
                <path
                  d="M 490.0 280.0 C 493.5 298.3, 519.3 321.6, 515.6 337.8 C 512.0 353.9, 477.9 360.6, 467.9 376.9 C 457.9 393.3, 468.4 425.2, 455.8 435.8 C 443.3 446.4, 409.5 432.4, 392.6 440.4 C 375.7 448.3, 370.0 480.9, 354.6 483.7 C 339.2 486.6, 318.3 457.0, 300.0 457.5 C 281.7 457.9, 259.9 489.7, 244.7 486.5 C 229.4 483.3, 224.9 447.2, 208.6 438.3 C 192.3 429.5, 156.9 445.0, 146.7 433.3 C 136.6 421.5, 152.8 385.3, 147.4 368.1 C 142.1 350.8, 115.5 344.4, 114.6 329.7 C 113.7 315.0, 139.2 295.8, 142.1 280.0 C 145.0 264.2, 127.4 247.5, 132.2 235.0 C 137.0 222.6, 165.2 220.2, 170.9 205.5 C 176.7 190.8, 159.2 158.6, 166.7 146.7 C 174.2 134.8, 203.0 146.8, 215.9 134.3 C 228.8 121.7, 230.1 80.5, 244.1 71.4 C 258.1 62.4, 280.3 83.9, 300.0 80.0 C 319.7 76.1, 344.7 45.0, 362.1 48.1 C 379.6 51.3, 387.4 87.8, 404.6 98.9 C 421.8 110.0, 455.7 100.2, 465.2 114.8 C 474.7 129.4, 456.7 167.9, 461.6 186.7 C 466.5 205.6, 489.9 212.3, 494.6 227.9 C 499.3 243.4, 486.5 261.7, 490.0 280.0 Z"
                  fill="#172554"
                  fillOpacity="0.22"
                />

                {/* Detalles gráficos interiores sutiles en la mancha (como los círculos y figuras de la imagen) */}
                {/* Cuadrado redondeado sutil en esquina superior derecha */}
                <rect
                  x="400"
                  y="120"
                  width="44"
                  height="44"
                  rx="14"
                  transform="rotate(18 422 142)"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="8"
                  strokeOpacity="0.25"
                />

                {/* Anillo de agua interior sutil en zona izquierda */}
                <circle
                  cx="160"
                  cy="390"
                  r="48"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="12"
                  strokeOpacity="0.25"
                />

                {/* Círculo sólido pequeño como en la referencia */}
                <circle
                  cx="450"
                  cy="360"
                  r="18"
                  fill="#1e3a8a"
                  fillOpacity="0.4"
                />

                {/* Gotitas fluidas flotantes alrededor de la mancha */}
                <circle cx="538" cy="115" r="12" fill="#38bdf8" />
                <circle cx="80" cy="380" r="16" fill="#60a5fa" fillOpacity="0.75" />
                <circle cx="490" cy="480" r="10" fill="#93c5fd" />
                <circle cx="210" cy="45" r="8" fill="#bae6fd" />
              </svg>
            </div>

            {/* CONTENIDO CENTRADO DENTRO DE LA MANCHA: Siguiendo la composición del cartel de referencia */}
            <div className="relative z-10 text-center max-w-sm sm:max-w-md px-6 space-y-5">
              {/* Insignia / Ícono superior como el logo Layar Tancap de la referencia */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold tracking-wide border border-white/20">
                <Droplets className="w-4 h-4 text-sky-200" />
                <span>Agua Potable Comunitaria</span>
              </div>

              {/* Título principal en blanco de alto impacto */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-[1.12] tracking-tight drop-shadow-md">
                Bienvenido al Sistema
              </h2>

              {/* Párrafo descriptivo amigable */}
              <p className="text-sm sm:text-base font-medium text-sky-100 leading-relaxed max-w-xs sm:max-w-sm mx-auto drop-shadow-xs">
                Para ingresar y gestionar las tomas y pagos de la comunidad, inicia sesión con tu cuenta.
              </p>

              {/* Botón pill estilo "SIGN IN" de la mancha de referencia */}
              <div className="pt-2">
                <div className="inline-flex items-center gap-2 px-7 py-2.5 rounded-full border-2 border-white/70 text-white font-bold text-xs uppercase tracking-widest bg-white/10 backdrop-blur-xs select-none">
                  Gestión Vecinal Activa
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
