import React from 'react';

/* =========================================================================
   TABLA TIPO "LIBRO CONTABLE"
   Líneas finas en lugar de tarjetas flotantes. Cada fila lleva un índice
   (01, 02, 03…) y, al pasar el cursor, se barre un fondo de izquierda a
   derecha mientras una barra azul crece en el borde. Las filas entran
   escalonadas y la regla del encabezado se dibuja al cargar.
   La API (props y exports) es la misma de antes.
   ========================================================================= */

const css = `
@keyframes fvt-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fvt-draw{from{background-size:0% 1.5px}to{background-size:100% 1.5px}}

.fvt-body{counter-reset:fvt}

/* Encabezado: la regla inferior se dibuja de izquierda a derecha */
.fvt-head th{
  background:linear-gradient(var(--fvt-ink),var(--fvt-ink)) left bottom/100% 1.5px no-repeat;
  animation:fvt-draw .9s cubic-bezier(.65,0,.2,1) both;
}
.fvt-head th:first-child{padding-left:3.25rem}

/* Fila */
.fvt-row{
  counter-increment:fvt;
  animation:fvt-in .55s cubic-bezier(.22,1,.36,1) backwards;
  animation-delay:calc(var(--i,0) * 40ms);
}
.fvt-row>td{
  background:linear-gradient(90deg,var(--fvt-wash),var(--fvt-wash) 75%,transparent) left/0% 100% no-repeat;
  transition:background-size .55s cubic-bezier(.22,1,.36,1);
}
.fvt-row:hover>td{background-size:100% 100%}
.fvt-row>td:nth-child(2){transition-delay:.04s}
.fvt-row>td:nth-child(3){transition-delay:.08s}
.fvt-row>td:nth-child(4){transition-delay:.12s}
.fvt-row>td:nth-child(5){transition-delay:.16s}
.fvt-row>td:nth-child(6){transition-delay:.2s}
.fvt-row>td:nth-child(7){transition-delay:.24s}
.fvt-row>td:nth-child(8){transition-delay:.28s}

/* Primera celda: índice + barra de acento */
.fvt-row>td:first-child{position:relative;padding-left:3.25rem}
.fvt-row>td:first-child::after{
  content:counter(fvt,decimal-leading-zero);
  position:absolute;left:1.1rem;top:50%;
  transform:translateY(-50%);
  font:500 .7rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.04em;opacity:.35;
  transition:transform .45s cubic-bezier(.34,1.45,.64,1),opacity .3s,color .3s;
}
.fvt-row:hover>td:first-child::after{opacity:1;color:var(--fvt-accent);transform:translate(4px,-50%)}
.fvt-row>td:first-child::before{
  content:'';position:absolute;left:0;top:.5rem;bottom:.5rem;width:2px;border-radius:2px;
  background:var(--fvt-accent);
  transform:scaleY(0);
  transition:transform .45s cubic-bezier(.34,1.45,.64,1);
}
.fvt-row:hover>td:first-child::before{transform:scaleY(1)}

@media (prefers-reduced-motion:reduce){
  .fvt-head th,.fvt-row{animation:none}
  .fvt-row>td,.fvt-row>td:first-child::before,.fvt-row>td:first-child::after{transition:none}
}
`;

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
  containerClassName?: string;
}

export function Table({
  children,
  className = '',
  containerClassName = '',
  ...props
}: TableProps) {
  return (
    <div className={`custom-scrollbar w-full overflow-x-auto pb-2 ${containerClassName}`}>
      <style>{css}</style>
      <table
        className={`w-full border-collapse text-left text-sm ${className}`}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`fvt-head select-none [--fvt-ink:#0f172a] dark:[--fvt-ink:#f1f5f9] ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableHead({
  children,
  className = '',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`whitespace-nowrap px-4 pb-3.5 pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 last:pr-5 dark:text-slate-500 ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableBody({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  // Cada fila recibe su posición (--i) para escalonar la animación de entrada
  const rows = React.Children.map(children, (child, i) =>
    React.isValidElement<{ style?: React.CSSProperties }>(child) && child.type !== React.Fragment
      ? React.cloneElement(child, {
          style: { ...child.props.style, '--i': Math.min(i, 12) } as React.CSSProperties,
        })
      : child
  );

  return (
    <tbody className={`fvt-body ${className}`} {...props}>
      {rows}
    </tbody>
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  /** Activa índice, barrido y barra de acento. Úsalo en false para filas vacías o de totales. */
  elevate?: boolean;
}

export function TableRow({
  children,
  className = '',
  elevate = true,
  ...props
}: TableRowProps) {
  const rowStyles = elevate
    ? 'fvt-row group cursor-default [--fvt-wash:#f1f5f9] [--fvt-accent:#2563eb] dark:[--fvt-wash:#1e293b99] dark:[--fvt-accent:#60a5fa]'
    : '';

  return (
    <tr className={`${rowStyles} ${className}`} {...props}>
      {children}
    </tr>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
}

export function TableCell({
  children,
  className = '',
  ...props
}: TableCellProps) {
  return (
    <td
      className={`border-b border-slate-200/80 px-4 py-4 align-middle text-slate-700 last:pr-5 dark:border-slate-800/80 dark:text-slate-300 ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}