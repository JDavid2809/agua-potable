'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Receipt, Banknote, Droplets } from 'lucide-react';
import { sileo } from 'sileo';
import { supabase } from '@/lib/supabase/client';
import { dbLocal } from '@/lib/db/offline-db';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { VentanillaCobro } from './VentanillaCobro';
import { HistorialCobros } from './HistorialCobros';
import { CorteCajaDiario } from './CorteCajaDiario';
import { obtenerMensajeError } from '@/lib/utils/errors';
import type { Persona, Toma, Pago, Organizacion } from '@/types/database';

export function CobrosManager() {
  const searchParams = useSearchParams();
  const codigoTomaUrl = searchParams.get('toma');
  const [tabActiva, setTabActiva] = useState<'ventanilla' | 'historial' | 'corte'>('ventanilla');

  // Estados de datos
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [tomas, setTomas] = useState<(Toma & { persona?: Persona; manzana?: any })[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [cajeroId, setCajeroId] = useState<string | undefined>(undefined);
  const [cajeroNombre, setCajeroNombre] = useState<string | undefined>(undefined);
  const [cargando, setCargando] = useState(true);

  // Carga general de datos de caja
  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);

      // 1. Obtener usuario autenticado y perfil
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCajeroId(user.id);

        const { data: perfilData } = await supabase
          .from('perfiles')
          .select('nombre_completo, organizacion:organizaciones(*)')
          .eq('id', user.id)
          .single();

        if (perfilData) {
          setCajeroNombre(perfilData.nombre_completo);
          if (perfilData.organizacion) {
            const org = Array.isArray(perfilData.organizacion)
              ? perfilData.organizacion[0]
              : perfilData.organizacion;
            setOrganizacion(org as unknown as Organizacion);
          }
        }
      }

      // 2. Cargar Tomas activas con su persona y manzana asociada
      const { data: dataTomas, error: errTomas } = await supabase
        .from('tomas')
        .select(`
          *,
          persona:personas (*),
          manzana:manzanas (id, barrio, seccion, numero_manzana)
        `)
        .is('deleted_at', null)
        .order('codigo_toma', { ascending: true });

      if (errTomas) throw errTomas;
      setTomas(dataTomas || []);

      // 3. Cargar personas
      const { data: dataPersonas, error: errPersonas } = await supabase
        .from('personas')
        .select('*')
        .is('deleted_at', null)
        .order('nombre_completo', { ascending: true });

      if (errPersonas) throw errPersonas;
      setPersonas(dataPersonas || []);

      // 4. Cargar Historial de Pagos con sus detalles
      const { data: dataPagos, error: errPagos } = await supabase
        .from('pagos')
        .select(`
          *,
          persona:personas (*),
          cajero:perfiles (id, nombre_completo),
          detalles:pago_detalles (
            id,
            toma_id,
            anio,
            mes,
            monto,
            recargo,
            toma:tomas (codigo_toma, numero_medidor, direccion_referencia)
          )
        `)
        .order('fecha_pago', { ascending: false })
        .limit(100);

      if (errPagos) throw errPagos;

      // Combinar pagos de la nube con pagos locales aún pendientes de sincronizar en Dexie
      const pagosNube = dataPagos || [];
      try {
        const pagosLocales = await dbLocal.pagos.toArray();
        const idsNube = new Set(pagosNube.map((p) => p.id));
        const pendientesLocales = pagosLocales.filter((p) => !idsNube.has(p.id));
        const combinados = [...pendientesLocales, ...pagosNube].sort(
          (a, b) =>
            new Date(b.fecha_pago || b.created_at).getTime() -
            new Date(a.fecha_pago || a.created_at).getTime()
        );
        setPagos(combinados);
      } catch {
        setPagos(pagosNube);
      }
    } catch (err: unknown) {
      // Fallback a base de datos local Dexie si el dispositivo está sin conexión
      try {
        const [tomasLocal, personasLocal, manzanasLocal, pagosLocal] = await Promise.all([
          dbLocal.tomas.toArray(),
          dbLocal.personas.toArray(),
          dbLocal.manzanas.toArray(),
          dbLocal.pagos.toArray(),
        ]);

        if (tomasLocal.length > 0 || personasLocal.length > 0 || pagosLocal.length > 0) {
          const mapaPersonas = new Map(personasLocal.map((p) => [p.id, p]));
          const mapaManzanas = new Map(manzanasLocal.map((m) => [m.id, m]));
          setPersonas(personasLocal);
          setTomas(
            tomasLocal.map((t) => ({
              ...t,
              persona: mapaPersonas.get(t.persona_id),
              manzana: t.manzana_id ? mapaManzanas.get(t.manzana_id) : undefined,
            }))
          );
          setPagos(
            pagosLocal.sort(
              (a, b) =>
                new Date(b.fecha_pago || b.created_at).getTime() -
                new Date(a.fecha_pago || a.created_at).getTime()
            )
          );
          return;
        }
      } catch {
        // Ignorar error de fallback local
      }

      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudieron cargar los datos de caja.'),
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Actualización rápida de cuota base
  const handleCuotaActualizada = (nuevaCuota: number, nuevoRecargo: number) => {
    if (organizacion) {
      setOrganizacion({
        ...organizacion,
        config: {
          ...organizacion.config,
          cuota_base: nuevaCuota,
          recargo_mora: nuevoRecargo,
        },
      });
    }
    cargarDatos();
  };

  return (
    <div className="w-full space-y-6">
      {/* Cabecera Principal con Identidad en Anillo y Pestañas */}
      <PageHeader
        icon={<CreditCard />}
        tone="blue"
        title="Caja y Cobros"
        subtitle="Cobro de cuotas por toma, emisión de recibos con folio comunitario y arqueo diario."
        status="Caja en operación"
        action={
          <PageTabs
            value={tabActiva}
            onChange={(val) => setTabActiva(val as any)}
            items={[
              {
                value: 'ventanilla',
                label: 'Cobro por Toma',
                icon: <Droplets />,
              },
              {
                value: 'historial',
                label: 'Historial de Recibos',
                icon: <Receipt />,
              },
              {
                value: 'corte',
                label: 'Corte de Caja',
                icon: <Banknote />,
              },
            ]}
          />
        }
      />

      {/* Vistas según la pestaña activa */}
      {tabActiva === 'ventanilla' && (
        <VentanillaCobro
          personas={personas}
          tomas={tomas}
          organizacion={organizacion}
          cajeroId={cajeroId}
          cajeroNombre={cajeroNombre}
          initialCodigoToma={codigoTomaUrl}
          onPagoCompletado={cargarDatos}
          onCuotaActualizada={handleCuotaActualizada}
        />
      )}

      {tabActiva === 'historial' && (
        <HistorialCobros
          pagos={pagos}
          organizacion={organizacion}
          cargando={cargando}
          onRefresh={cargarDatos}
        />
      )}

      {tabActiva === 'corte' && (
        <CorteCajaDiario
          pagos={pagos}
          organizacion={organizacion}
          cajeroNombre={cajeroNombre}
        />
      )}
    </div>
  );
}
