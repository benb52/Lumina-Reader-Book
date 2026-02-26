import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  as?: any;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', as: Component = 'button', ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90': variant === 'primary',
            'bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80': variant === 'secondary',
            'border border-zinc-200 bg-transparent hover:bg-zinc-100 text-zinc-900': variant === 'outline',
            'hover:bg-zinc-100 hover:text-zinc-900': variant === 'ghost',
            'bg-red-500 text-zinc-50 hover:bg-red-500/90': variant === 'danger',
            'h-9 px-4 py-2': size === 'md',
            'h-8 rounded-lg px-3 text-xs': size === 'sm',
            'h-10 rounded-xl px-8': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
