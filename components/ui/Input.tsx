import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      rightElement,
      inputSize = 'lg',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const sizeClasses = {
      sm: 'py-2 px-3 text-xs',
      md: 'py-2.5 px-4 text-sm',
      lg: 'py-4 px-5 text-base font-medium',
    }[inputSize];

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-4 pointer-events-none text-slate-400 dark:text-slate-500 flex items-center justify-center">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl transition-all duration-150 outline-none shadow-xs
              ${icon ? 'pl-11' : ''}
              ${rightElement ? 'pr-12' : ''}
              ${sizeClasses}
              ${
                error
                  ? 'border border-red-500 focus:border-red-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-red-500/15'
                  : 'border border-transparent dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-blue-600/10'
              }
              ${className}`}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-4 flex items-center justify-center text-slate-400 dark:text-slate-500">
              {rightElement}
            </div>
          )}
        </div>

        {error ? (
          <p className="text-xs font-medium text-red-500 pl-1">{error}</p>
        ) : helperText ? (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 pl-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
