'use client';

import React from 'react';
import { Toaster } from 'sileo';
import { useTheme } from '@/hooks/use-theme';

export function AppToaster() {
  const { isDark } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={isDark ? 'dark' : 'light'}
      options={{
        fill: isDark ? '#ffffff' : '#0f172a',
        styles: {
          title: isDark ? '!text-slate-900 !font-semibold' : '!text-white !font-semibold',
          description: isDark ? '!text-slate-600 !font-normal' : '!text-slate-200 !font-normal',
        },
      }}
    />
  );
}
