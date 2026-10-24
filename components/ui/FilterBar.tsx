'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, RefreshCw, ChevronDown, Check } from 'lucide-react';

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
  /** Menú o contenido desplegable que aparece bajo la búsqueda al escribir o enfocar */
  dropdown?: React.ReactNode;
  /** Control explícito para forzar apertura del desplegable (opcional) */
  dropdownOpen?: boolean;
  /** Callback al cerrar el desplegable al hacer clic fuera */
  onDropdownClose?: () => void;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar...',
  dropdown,
  dropdownOpen,
  onDropdownClose,
  className = '',
  onFocus,
  onBlur,
  ...props
}: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera del contenedor
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
        onDropdownClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDropdownClose]);

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  const showDropdown = Boolean(
    dropdown &&
      (dropdownOpen !== undefined
        ? dropdownOpen
        : isFocused && Boolean(value && String(value).trim()))
  );

  return (
    <div
      ref={containerRef}
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
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
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

      {/* Menú flotante de resultados para la búsqueda */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white dark:bg-[#0B1224] border border-slate-200 dark:border-[#26345C] rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1F2B4D] animate-in fade-in duration-150">
          {dropdown}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── FilterSelect ─────────────────────────── */

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options?: FilterSelectOption[];
  children?: React.ReactNode;
  className?: string;
}

/**
 * FilterSelect con menú desplegable flotante personalizado
 * Comparte el mismo diseño de popover flotante con bordes redondeados y fondos oscuros.
 */
export function FilterSelect({
  label,
  options,
  children,
  value,
  onChange,
  disabled = false,
  className = '',
  name,
  ...props
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parsear opciones desde el prop options o desde children <option>
  const parsedOptions = useMemo<FilterSelectOption[]>(() => {
    if (options && options.length > 0) return options;
    const items: FilterSelectOption[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const val = (child.props as any).value ?? '';
        const lbl = (child.props as any).children ?? val;
        items.push({ value: String(val), label: String(lbl) });
      }
    });
    return items;
  }, [options, children]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Etiqueta de la opción seleccionada
  const selectedOption = parsedOptions.find(
    (opt) => String(opt.value) === String(value)
  );
  const displayLabel = selectedOption
    ? selectedOption.label
    : parsedOptions[0]?.label || 'Seleccionar...';

  const handleSelectOption = (optValue: string) => {
    setIsOpen(false);
    if (onChange) {
      const syntheticEvent = {
        target: { value: optValue, name },
        currentTarget: { value: optValue, name },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center gap-2">
      {label && (
        <span className="hidden whitespace-nowrap text-[13px] font-medium text-slate-500 dark:text-slate-400 sm:inline">
          {label}
        </span>
      )}

      <div
        className={`group/field relative border-b border-dashed ${LINE} ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={`flex items-center justify-between gap-2 bg-transparent py-2 pl-0.5 pr-7 text-sm font-medium text-slate-800 transition-colors focus:outline-none dark:text-slate-200 cursor-pointer ${className}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="truncate max-w-[14rem] text-left">{displayLabel}</span>
          <ChevronDown
            aria-hidden="true"
            className={`pointer-events-none absolute right-0.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform duration-200 ${
              isOpen
                ? 'rotate-180 text-[#2F6BFF] dark:text-[#6C97FF]'
                : ''
            }`}
          />
        </button>
        <FocusLine />

        {/* Menú flotante desplegable con el diseño de opciones múltiples */}
        {isOpen && (
          <div
            role="listbox"
            className="absolute top-full left-0 mt-2 z-50 min-w-[12rem] max-w-xs bg-white dark:bg-[#0B1224] border border-slate-200 dark:border-[#26345C] rounded-xl shadow-xl overflow-hidden py-1 divide-y divide-slate-100 dark:divide-[#1F2B4D] animate-in fade-in duration-150"
          >
            {parsedOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectOption(opt.value)}
                  className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#2F6BFF]/10 dark:bg-[#2F6BFF]/20 text-[#2F6BFF] dark:text-[#6C97FF] font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 font-medium'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#2F6BFF] dark:text-[#6C97FF]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
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
  /** Desplegable personalizado para la búsqueda */
  searchDropdown?: React.ReactNode;
  /** Callback del botón refrescar */
  onRefresh?: () => void;
  /** Estado de carga del refresco */
  isRefreshing?: boolean;
  /** Tooltip del botón refrescar */
  refreshTitle?: string;
  /** Filtros adicionales o elementos secundarios (FilterSelect, switches, etc.) */
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
  searchDropdown,
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
        dropdown={searchDropdown}
      />
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
      </button>
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