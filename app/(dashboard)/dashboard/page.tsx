import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSesionActual } from '@/lib/auth/session';
import {
  Users,
  Droplets,
  CreditCard,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const instant = false;

export default async function DashboardPage() {
  await connection();

  // 1. Obtener sesión deduplicada de memoria por React.cache (P1)
  const { user, perfil, organizacion, esAdmin } = await getSesionActual();

  if (!user || !perfil?.organizacion_id || !organizacion) {
    redirect('/login');
  }

  const supabase = await createClient();
  const orgId = perfil.organizacion_id;

  // Contadores rápidos de la organización
  const [
    { count: tomasCount },
    { count: personasCount },
    { count: usuariosCount },
  ] = await Promise.all([
    supabase
      .from('tomas')
      .select('*', { count: 'exact', head: true })
      .eq('organizacion_id', orgId),
    supabase
      .from('personas')
      .select('*', { count: 'exact', head: true })
      .eq('organizacion_id', orgId),
    supabase
      .from('perfiles')
      .select('*', { count: 'exact', head: true })
      .eq('organizacion_id', orgId),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Cabecera del Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          ¡Hola, {perfil?.nombre_completo || 'Usuario'}!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm max-w-2xl">
          Bienvenido al panel de control de <strong>{organizacion?.nombre || 'Comité de Agua Potable'}</strong>.
          Gestiona el padrón de tomas, cobros en caja y usuarios autorizados.
        </p>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="p-6 space-y-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tomas Registradas
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Droplets className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              {tomasCount || 0}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
              Contratos en el padrón
            </p>
          </div>
        </Card>

        <Card className="p-6 space-y-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contribuyentes
            </span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              {personasCount || 0}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
              Titulares de toma activos
            </p>
          </div>
        </Card>

        <Card className="p-6 space-y-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Equipo Autorizado
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              {usuariosCount || 0}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
              {esAdmin ? 'Admins y cajeros' : 'Tu organización'}
            </p>
          </div>
        </Card>

        <Card className="p-6 space-y-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cuota Base Mensual
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              ${Number(organizacion?.config?.cuota_base || 50).toFixed(2)}
            </p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
              Tarifa vigente del comité
            </p>
          </div>
        </Card>
      </div>

      {/* Accesos Rápidos */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Módulos del Sistema
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Módulo Usuarios (Solo Administradores) */}
          {esAdmin && (
            <Card className="p-6 flex flex-col justify-between space-y-5 border-l-4 border-l-blue-600">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Usuarios y Permisos
                </h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                  Da de alta nuevos cajeros, administradores y personal de campo, asignándoles permisos específicos de tu organización.
                </p>
              </div>
              <Link href="/usuarios">
                <Button variant="primary" className="w-full justify-center gap-2">
                  <span>Administrar Usuarios</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </Card>
          )}

          {/* Módulo Caja / Cobros */}
          <Card className="p-6 flex flex-col justify-between space-y-5 border-l-4 border-l-emerald-500">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Caja y Recaudación
              </h3>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Cobro de mensualidades, emisión de recibos con folio comunitario y consulta de estado de cuenta por toma.
              </p>
            </div>
            <Link href="/cobros">
              <Button variant="secondary" className="w-full justify-center gap-2">
                <span>Ir a Cobros</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </Card>

          {/* Módulo Padrón de Tomas */}
          <Card className="p-6 flex flex-col justify-between space-y-5 border-l-4 border-l-cyan-500">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                <Droplets className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Padrón de Tomas
              </h3>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Control de contratos domiciliarios y comerciales, manzana, sección y estado de servicio (activo, suspendido, corte).
              </p>
            </div>
            <Link href="/tomas">
              <Button variant="secondary" className="w-full justify-center gap-2">
                <span>Ver Padrón</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
