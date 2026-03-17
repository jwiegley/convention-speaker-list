interface ProgressProps {
  value?: number;
  className?: string;
}

export function Progress({ value = 0, className = '' }: ProgressProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-gray-200 ${className}`}>
      <div
        className="h-full bg-blue-600 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
