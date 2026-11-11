import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/ui';
import { Hero } from '@/components/landingpage/Hero';

export const metadata: Metadata = {
  title: 'Fluvib — Gestión Integral del Agua Potable',
  description:
    'Sistema operativo para comités de agua potable. Padrón territorial, cobro en ventanilla, cooperaciones de obra y funcionamiento offline-first.',
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-slate-50 text-slate-950 selection:bg-sky-500 selection:text-white dark:bg-slate-950 dark:text-white">
      <Header
        logoSrc="/Img/Logo_Fluvib.webp"
        actions={
          <Link
            href="/login"
            className="rounded-full bg-sky-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-400"
          >
            Iniciar sesión
          </Link>
        }
      />
      <main className="relative z-10">
        <Hero />
      </main>
    </div>
  );
}
