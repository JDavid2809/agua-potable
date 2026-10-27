'use client';

import React, { Suspense } from 'react';
import { CobrosManager } from '@/components/cobros/CobrosManager';

export default function CobrosPage() {
  return (
    <Suspense fallback={null}>
      <CobrosManager />
    </Suspense>
  );
}
