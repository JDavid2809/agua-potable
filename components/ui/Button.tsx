import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  // Esquinas asimétricas solicitadas exclusivamente para botones
  const baseStyles =
    'relative inline-flex items-center justify-center font-bold tracking-normal select-none transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none rounded-tl-2xl rounded-br-2xl';

  // Colores sólidos, nítidos, sin desvanecidos
  const variantStyles = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20 active:bg-blue-800',
    secondary:
      'bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20 active:bg-black',
    outline:
      'bg-transparent text-blue-600 border-2 border-blue-600 hover:bg-blue-600 hover:text-white active:bg-blue-700',
    danger:
      'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-900/20 active:bg-red-800',
    ghost:
      'bg-transparent text-slate-800 hover:bg-slate-200 active:bg-slate-300',
  };

  const sizeStyles = {
    sm: 'text-xs px-3.5 py-1.5 gap-1.5',
    md: 'text-sm px-5 py-2.5 gap-2',
    lg: 'text-base px-6 py-3.5 gap-2.5',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}
