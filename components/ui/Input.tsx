import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-bold uppercase tracking-wider text-slate-900"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3.5 pointer-events-none text-slate-500">
            {icon}
          </div>
        )}

        <input
          id={inputId}
          className={`w-full text-sm bg-white text-slate-900 placeholder:text-slate-400 border rounded-xl transition-all duration-150 outline-none
            ${icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5
            ${
              error
                ? 'border-red-600 focus:border-red-600 focus:ring-2 focus:ring-red-600'
                : 'border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600'
            }
            ${className}`}
          {...props}
        />
      </div>

      {error ? (
        <p className="text-xs font-bold text-red-600 pl-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs font-bold text-slate-800 pl-1">{helperText}</p>
      ) : null}
    </div>
  );
}
