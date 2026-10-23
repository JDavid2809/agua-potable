'use client';

import React, { useState } from 'react';
import { Droplets, MapPin } from 'lucide-react';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { ManzanasManager } from '@/components/tomas/ManzanasManager';
import { TomasManager } from '@/components/tomas/TomasManager';

export default function TomasPage() {
  const [tabActiva, setTabActiva] = useState<'tomas' | 'manzanas'>('manzanas');
  const [vistaManzanas, setVistaManzanas] = useState<'lista' | 'formulario'>('lista');
  const [vistaTomas, setVistaTomas] = useState<'lista' | 'formulario'>('lista');

  const enFormulario =
    (tabActiva === 'manzanas' && vistaManzanas === 'formulario') ||
    (tabActiva === 'tomas' && vistaTomas === 'formulario');

  return (
    <div className="w-full space-y-6">
      {/* Cabecera del módulo solo en vista de lista */}
      {!enFormulario && (
        <PageHeader
          icon={<Droplets />}
          title="Padrón de Tomas y Ubicaciones"
          subtitle="Administración de conexiones, contratos, barrios, secciones y manzanas del comité."
          action={
            <PageTabs
              value={tabActiva}
              onChange={(val) => setTabActiva(val as 'tomas' | 'manzanas')}
              items={[
                { value: 'tomas', label: 'Tomas de Agua', icon: <Droplets /> },
                {
                  value: 'manzanas',
                  label: 'Barrios y Manzanas',
                  icon: <MapPin />,
                },
              ]}
            />
          }
        />
      )}

      {/* Contenido según pestaña */}
      {tabActiva === 'manzanas' ? (
        <ManzanasManager onVistaChange={setVistaManzanas} />
      ) : (
        <TomasManager onVistaChange={setVistaTomas} />
      )}
    </div>
  );
}
