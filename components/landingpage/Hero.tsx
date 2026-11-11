'use client';

import React from 'react';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative z-10 flex min-h-[85vh] w-full flex-col justify-between px-6 pb-12 pt-10 sm:px-12 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-center py-8">
        <h1 className="flex flex-col select-none font-extralight tracking-[-0.045em] text-slate-950 dark:text-white">
          <span className="self-start text-[clamp(3.1rem,8.6vw,8.4rem)] leading-[0.92]">
            El agua de
          </span>
          <span className="my-1 self-center font-light italic text-sky-600 dark:text-sky-300 text-[clamp(3.1rem,8.6vw,8.4rem)] leading-[0.92]">
            tu comunidad,
          </span>
          <span className="self-end text-right text-[clamp(3.1rem,8.6vw,8.4rem)] leading-[0.92]">
            bajo control.
          </span>
        </h1>
      </div>

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-8 border-t border-slate-900/15 pt-8 dark:border-white/15 md:grid-cols-12">
        <div className="md:col-span-6">
          <p className="max-w-md text-base font-light leading-relaxed text-slate-700 dark:text-slate-300 sm:text-lg">
            Plataforma operativa para comités de agua potable. Padrón de tomas,
            recaudación en ventanilla, cooperaciones de obra y continuidad sin
            conexión.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 md:col-span-6 md:justify-end">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-8 text-sm font-medium tracking-tight text-white transition-colors hover:bg-sky-600 dark:bg-white dark:text-slate-950 dark:hover:bg-sky-300"
          >
            Entrar al sistema
          </Link>
        </div>
      </div>
    </section>
  );
}

export default Hero;
