import React, { useEffect, useState, useRef } from 'react';
import { BalanceIndicator, DemographicType } from './BalanceIndicator';

interface AnimatedBalanceIndicatorProps {
  type: DemographicType;
  targetPercentage: number;
  label?: string;
  height?: number;
  width?: number;
  className?: string;
  animationDuration?: number; // milliseconds
  animationType?: 'spring' | 'smooth' | 'bounce';
  onAnimationComplete?: () => void;
}

export const AnimatedBalanceIndicator: React.FC<AnimatedBalanceIndicatorProps> = ({
  type,
  targetPercentage,
  label,
  height = 300,
  width = 80,
  className = '',
  animationDuration = 1000,
  animationType = 'spring',
  onAnimationComplete
}) => {
  const [currentPercentage, setCurrentPercentage] = useState(targetPercentage);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const startValueRef = useRef<number>(targetPercentage);

  useEffect(() => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startValue = currentPercentage;
    const endValue = targetPercentage;
    const valueDiff = endValue - startValue;

    // Skip animation if values are the same
    if (Math.abs(valueDiff) < 0.01) {
      return;
    }

    startValueRef.current = startValue;

    // Easing functions
    const easingFunctions = {
      smooth: (t: number) => {
        // Smooth ease-in-out
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      },
      spring: (t: number) => {
        // Spring with slight overshoot
        const c4 = (2 * Math.PI) / 3;
        return t === 0
          ? 0
          : t === 1
          ? 1
          : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      },
      bounce: (t: number) => {
        // Bounce effect
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
          return n1 * t * t;
        } else if (t < 2 / d1) {
          return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
          return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
          return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
      }
    };

    const easing = easingFunctions[animationType];

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = easing(progress);
      
      const newValue = startValueRef.current + (valueDiff * easedProgress);
      setCurrentPercentage(newValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        setCurrentPercentage(endValue);
        startTimeRef.current = undefined;
        onAnimationComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetPercentage, animationDuration, animationType, onAnimationComplete]);

  return (
    <BalanceIndicator
      type={type}
      percentage={currentPercentage}
      label={label}
      height={height}
      width={width}
      animated={false} // We handle animation here
      className={className}
    />
  );
};

// Hook for managing multiple balance indicators
export const useBalanceIndicators = (demographics: {
  gender: number;
  age: number;
  race: number;
}) => {
  const [values, setValues] = useState(demographics);
  const [isAnimating, setIsAnimating] = useState(false);

  const updateValues = (newValues: typeof demographics) => {
    setIsAnimating(true);
    setValues(newValues);
  };

  const handleAnimationComplete = () => {
    setIsAnimating(false);
  };

  return {
    values,
    updateValues,
    isAnimating,
    handleAnimationComplete
  };
};

export default AnimatedBalanceIndicator;