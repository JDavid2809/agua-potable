import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
}

export function Select({
  label,
  error,
  helperText,
  options,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          className={`w-full text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white border rounded-xl transition-colors outline-none appearance-none cursor-pointer
            pl-4 pr-10 py-2.5
            ${
              error
                ? 'border-red-600 focus:border-red-600 focus:ring-2 focus:ring-red-600'
                : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 focus:border-blue-600 dark:focus:border-blue-500'
            }
            ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              {opt.label}
            </option>
          ))}
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 dark:text-slate-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error ? (
        <p className="text-xs font-medium text-red-500 pl-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 pl-1">{helperText}</p>
      ) : null}
    </div>
  );
}
