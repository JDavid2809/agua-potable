import React from 'react';
import type { Metadata } from 'next';
import Hero from '@/components/landingpage/Hero';
import { Header } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Landing • Fluvib',
  description: 'Presentación del Sistema de Agua Potable',
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header />
      <Hero />
    </main>
  );
}
