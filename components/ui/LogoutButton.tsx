'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { sileo } from 'sileo';

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      sileo.info({
        title: 'Sesión cerrada',
        description: 'Has salido del sistema con éxito.',
      });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  return (
    <button
      onClick={handleLogout}
      type="button"
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="flex items-center justify-center h-10 w-10 rounded-full transition-colors text-slate-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/15"
    >
      <LogOut className="h-[18px] w-[18px]" />
    </button>
  );
}
