'use client';

import React, { useEffect, useState } from 'react';
import { Toaster } from 'sileo';

export function AppToaster() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkDark = () => document.documentElement.classList.contains('dark');
    setIsDark(checkDark());

    const observer = new MutationObserver(() => {
      setIsDark(checkDark());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const currentDark = mounted ? isDark : false;

  return (
    <Toaster
      position="bottom-right"
      theme={currentDark ? 'dark' : 'light'}
      options={{
        fill: currentDark ? '#ffffff' : '#0f172a',
        styles: {
          title: currentDark ? '!text-slate-900 !font-semibold' : '!text-white !font-semibold',
          description: currentDark ? '!text-slate-600 !font-normal' : '!text-slate-200 !font-normal',
        },
      }}
    />
  );
}
