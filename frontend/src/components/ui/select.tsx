import React from 'react';

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, children }: SelectProps) {
  return (
    <div className="relative">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              value?: string;
              onValueChange?: (value: string) => void;
            }>,
            { value, onValueChange }
          );
        }
        return child;
      })}
    </div>
  );
}

interface SelectTriggerProps {
  className?: string;
  children: React.ReactNode;
  value?: string;
}

export function SelectTrigger({ className = '', children }: SelectTriggerProps) {
  return (
    <button
      className={`flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${className}`}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span>{placeholder}</span>;
}

interface SelectContentProps {
  children: React.ReactNode;
}

export function SelectContent({ children }: SelectContentProps) {
  return (
    <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">{children}</div>
  );
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
}

export function SelectItem({ value, children, onValueChange }: SelectItemProps) {
  return (
    <div
      className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </div>
  );
}
