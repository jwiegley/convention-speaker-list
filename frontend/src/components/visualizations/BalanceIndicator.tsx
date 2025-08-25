import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

export type DemographicType = 'gender' | 'age' | 'race';

interface BalanceIndicatorProps {
  type: DemographicType;
  percentage: number; // 0-100
  label?: string;
  height?: number;
  width?: number;
  animated?: boolean;
  className?: string;
}

const INDICATOR_CONFIG = {
  gender: {
    label: 'Gender Balance',
    colors: {
      primary: '#8B5CF6',
      secondary: '#EC4899',
      background: '#F3F4F6'
    }
  },
  age: {
    label: 'Age Distribution',
    colors: {
      primary: '#3B82F6',
      secondary: '#10B981',
      background: '#F3F4F6'
    }
  },
  race: {
    label: 'Racial Diversity',
    colors: {
      primary: '#F59E0B',
      secondary: '#EF4444',
      background: '#F3F4F6'
    }
  }
};

export const BalanceIndicator: React.FC<BalanceIndicatorProps> = ({
  type,
  percentage,
  label,
  height = 300,
  width = 80,
  animated = true,
  className = ''
}) => {
  const config = INDICATOR_CONFIG[type];
  const displayLabel = label || config.label;
  
  // Calculate lever position (0% at bottom, 100% at top)
  const leverY = useMemo(() => {
    const range = height - 60; // Leave margin for lever handle
    return height - 30 - (range * (percentage / 100));
  }, [percentage, height]);

  // Determine color based on balance
  const leverColor = useMemo(() => {
    if (percentage >= 45 && percentage <= 55) {
      return '#10B981'; // Green for balanced
    } else if (percentage >= 35 && percentage <= 65) {
      return '#F59E0B'; // Yellow for slightly unbalanced
    } else {
      return '#EF4444'; // Red for very unbalanced
    }
  }, [percentage]);

  const LeverComponent = animated ? motion.g : 'g';
  const leverProps = animated 
    ? {
        initial: { y: height - 30 },
        animate: { y: leverY },
        transition: { 
          type: 'spring',
          stiffness: 100,
          damping: 20
        }
      }
    : { transform: `translate(0, ${leverY})` };

  return (
    <div className={`balance-indicator ${className}`}>
      <div className="text-center mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{displayLabel}</h3>
        <p className="text-2xl font-bold" style={{ color: leverColor }}>
          {percentage.toFixed(1)}%
        </p>
      </div>
      
      <svg 
        width={width} 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
        className="balance-indicator-svg"
      >
        {/* Background track */}
        <rect
          x={width / 2 - 4}
          y={20}
          width={8}
          height={height - 40}
          fill={config.colors.background}
          rx={4}
        />
        
        {/* Gradient fill showing current level */}
        <defs>
          <linearGradient id={`gradient-${type}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={config.colors.secondary} />
            <stop offset="100%" stopColor={config.colors.primary} />
          </linearGradient>
        </defs>
        
        <rect
          x={width / 2 - 4}
          y={leverY}
          width={8}
          height={height - 40 - (leverY - 20)}
          fill={`url(#gradient-${type})`}
          rx={4}
          opacity={0.3}
        />
        
        {/* Lever handle */}
        <LeverComponent {...leverProps}>
          <circle
            cx={width / 2}
            cy={0}
            r={12}
            fill={leverColor}
            stroke="white"
            strokeWidth={2}
          />
          <rect
            x={10}
            y={-2}
            width={width - 20}
            height={4}
            fill={leverColor}
            rx={2}
          />
        </LeverComponent>
        
        {/* Scale marks */}
        {[0, 25, 50, 75, 100].map((mark) => {
          const markY = height - 30 - ((height - 60) * (mark / 100));
          return (
            <g key={mark}>
              <line
                x1={width / 2 - 12}
                y1={markY}
                x2={width / 2 - 8}
                y2={markY}
                stroke="#9CA3AF"
                strokeWidth={1}
              />
              <text
                x={width / 2 - 16}
                y={markY + 4}
                fontSize={10}
                fill="#6B7280"
                textAnchor="end"
              >
                {mark}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default BalanceIndicator;