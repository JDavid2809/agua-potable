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
import { Card, CardGroup } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
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
      <PageHeader
        icon={<Droplets />}
        tone="blue"
        title={`¡Hola, ${perfil?.nombre_completo || 'Usuario'}!`}
        subtitle={
          <>
            Bienvenido al panel de control de{' '}
            <strong>{organizacion?.nombre || 'Comité de Agua Potable'}</strong>.
            Gestiona el padrón de tomas, cobros en caja y usuarios autorizados.
          </>
        }
        status="Sistema comunitario en línea"
      />

      {/* Métricas Principales */}
      <CardGroup>
        <Card
          tone="blue"
          icon={<Droplets />}
          label="Tomas registradas"
          value={tomasCount || 0}
          hint="Contratos en el padrón"
        />
        <Card
          tone="cyan"
          icon={<Users />}
          label="Contribuyentes"
          value={personasCount || 0}
          hint="Titulares de toma activos"
        />
        <Card
          tone="purple"
          icon={<ShieldCheck />}
          label="Equipo autorizado"
          value={usuariosCount || 0}
          hint={esAdmin ? 'Admins y cajeros' : 'Tu organización'}
        />
        <Card
          tone="green"
          icon={<TrendingUp />}
          label="Cuota base mensual"
          value={`$${Number(organizacion?.config?.cuota_base || 50).toFixed(0)}`}
          hint="Tarifa vigente del comité"
        />
      </CardGroup>

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
