'use client';

import React from 'react';
import { Search, X, RefreshCw, ChevronDown } from 'lucide-react';

const LINE = 'border-slate-300 dark:border-[#26345C]';
const ACCENT_BG = 'bg-[#2F6BFF] dark:bg-[#6C97FF]';
const ACCENT_TEXT =
  'group-focus-within/field:text-[#2F6BFF] dark:group-focus-within/field:text-[#6C97FF]';

/** Línea de acento que se dibuja al enfocar el campo. */
function FocusLine() {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -bottom-px left-0 h-[2px] w-full origin-left scale-x-0 transition-transform duration-300 ease-out group-focus-within/field:scale-x-100 motion-reduce:transition-none ${ACCENT_BG}`}
    />
  );
}

/* ─────────────────────────── SearchInput ─────────────────────────── */

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar...',
  className = '',
  ...props
}: SearchInputProps) {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  return (
    <div
      className={`group/field relative min-w-[12rem] max-w-sm flex-1 border-b border-dashed ${LINE} ${className}`}
    >
      <Search
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors ${ACCENT_TEXT}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 pl-7 pr-7 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 dark:text-white"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpiar búsqueda"
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <FocusLine />
    </div>
  );
}

/* ─────────────────────────── FilterSelect ─────────────────────────── */

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: FilterSelectOption[];
  className?: string;
}

export function FilterSelect({
  label,
  options,
  children,
  className = '',
  ...props
}: FilterSelectProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {label && (
        <span className="hidden whitespace-nowrap text-[13px] font-medium text-slate-500 dark:text-slate-400 sm:inline">
          {label}
        </span>
      )}
      <div
        className={`group/field relative border-b border-dashed ${LINE}`}
      >
        <select
          className={`cursor-pointer appearance-none bg-transparent py-2 pl-0.5 pr-7 text-sm font-medium text-slate-800 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-white text-slate-900 dark:bg-[#0B1224] dark:text-white"
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-0.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors ${ACCENT_TEXT}`}
        />
        <FocusLine />
      </div>
    </div>
  );
}

/* ──────────────────────────── FilterBar ──────────────────────────── */

export interface FilterBarProps {
  /** Valor del input de búsqueda */
  searchValue?: string;
  /** Callback al cambiar la búsqueda */
  onSearchChange?: (value: string) => void;
  /** Placeholder del input de búsqueda */
  searchPlaceholder?: string;
  /** Callback para limpiar la búsqueda */
  onClearSearch?: () => void;
  /** Callback del botón refrescar */
  onRefresh?: () => void;
  /** Estado de carga del refresco */
  isRefreshing?: boolean;
  /** Tooltip del botón refrescar */
  refreshTitle?: string;
  /** Filtros adicionales o elementos secundarios (selects, switches, etc.) */
  children?: React.ReactNode;
  /** Elemento principal a la derecha (p. ej. botón Nuevo Registro) */
  action?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  onClearSearch,
  onRefresh,
  isRefreshing = false,
  refreshTitle = 'Actualizar lista',
  children,
  action,
  className = '',
}: FilterBarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange !== undefined;

  const controls: React.ReactNode[] = [];

  if (hasSearch) {
    controls.push(
      <SearchInput
        key="search"
        value={searchValue}
        onChange={onSearchChange}
        onClear={onClearSearch}
        placeholder={searchPlaceholder}
      />,
    );
  }

  React.Children.toArray(children).forEach((child, i) => {
    controls.push(<React.Fragment key={`c${i}`}>{child}</React.Fragment>);
  });

  if (onRefresh) {
    controls.push(
      <button
        key="refresh"
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        title={refreshTitle}
        aria-label={refreshTitle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-slate-500 transition-colors hover:border-[#2F6BFF] hover:text-[#2F6BFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/50 disabled:opacity-60 dark:text-slate-400 dark:hover:border-[#6C97FF] dark:hover:text-[#6C97FF] ${LINE}`}
      >
        <RefreshCw
          className={`h-4 w-4 ${
            isRefreshing
              ? 'animate-spin text-[#2F6BFF] dark:text-[#6C97FF]'
              : ''
          }`}
        />
      </button>,
    );
  }

  return (
    <div
      className={`flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center ${className}`}
    >
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-3">
        {controls.map((control, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`hidden h-6 border-l border-dashed sm:block ${LINE}`}
              />
            )}
            {control}
          </React.Fragment>
        ))}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}