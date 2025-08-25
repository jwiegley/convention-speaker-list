import React, { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { DemographicsToggle } from './DemographicsToggle';
import { GardenTransitionManager } from './GardenTransitionManager';
import { AnimatedBalanceIndicator } from './AnimatedBalanceIndicator';
import { SpeakerPerformance } from '../../utils/gardenStateCalculator';

interface OptimizedVisualizationContainerProps {
  sessionId: string;
  isSpectatorView?: boolean;
  demographics: {
    gender: number;
    age: number;
    race: number;
  };
  initialGardenState?: number;
  className?: string;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
}

interface PerformanceMetrics {
  fps: number;
  renderTime: number;
  updateCount: number;
  droppedFrames: number;
}

// Memoized balance indicator component
const MemoizedBalanceIndicator = memo(AnimatedBalanceIndicator, (prevProps, nextProps) => {
  // Only re-render if percentage changes by more than 0.5%
  return Math.abs(prevProps.targetPercentage - nextProps.targetPercentage) < 0.5 &&
         prevProps.type === nextProps.type;
});

// Memoized garden component
const MemoizedGardenTransition = memo(GardenTransitionManager, (prevProps, nextProps) => {
  return prevProps.sessionId === nextProps.sessionId &&
         prevProps.initialState === nextProps.initialState;
});

export const OptimizedVisualizationContainer: React.FC<OptimizedVisualizationContainerProps> = ({
  sessionId,
  isSpectatorView = false,
  demographics,
  initialGardenState = 16,
  className = '',
  onPerformanceMetrics
}) => {
  const [gardenState, setGardenState] = React.useState(initialGardenState);
  const [showDemographics, setShowDemographics] = React.useState(true);
  
  // Performance monitoring
  const performanceRef = useRef({
    frameCount: 0,
    lastFrameTime: performance.now(),
    fps: 60,
    renderTimes: [] as number[],
    updateCount: 0,
    droppedFrames: 0
  });

  const rafIdRef = useRef<number>();

  // Throttled demographic updates
  const throttledDemographicsRef = useRef(demographics);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  const throttledUpdateDemographics = useCallback((newDemographics: typeof demographics) => {
    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Throttle updates to max 10 per second
    updateTimeoutRef.current = setTimeout(() => {
      throttledDemographicsRef.current = newDemographics;
      performanceRef.current.updateCount++;
    }, 100);
  }, []);

  // Performance monitoring loop
  useEffect(() => {
    let lastTime = performance.now();
    let frames = 0;

    const measurePerformance = (currentTime: number) => {
      frames++;
      const deltaTime = currentTime - lastTime;

      // Calculate FPS every second
      if (deltaTime >= 1000) {
        const fps = Math.round((frames * 1000) / deltaTime);
        performanceRef.current.fps = fps;
        
        // Detect dropped frames (target 60fps)
        const expectedFrames = Math.round(deltaTime / 16.67);
        const droppedFrames = Math.max(0, expectedFrames - frames);
        performanceRef.current.droppedFrames += droppedFrames;

        // Calculate average render time
        const avgRenderTime = performanceRef.current.renderTimes.length > 0
          ? performanceRef.current.renderTimes.reduce((a, b) => a + b, 0) / performanceRef.current.renderTimes.length
          : 0;

        // Report metrics
        onPerformanceMetrics?.({
          fps,
          renderTime: avgRenderTime,
          updateCount: performanceRef.current.updateCount,
          droppedFrames: performanceRef.current.droppedFrames
        });

        // Reset counters
        frames = 0;
        lastTime = currentTime;
        performanceRef.current.renderTimes = [];
        performanceRef.current.updateCount = 0;
      }

      rafIdRef.current = requestAnimationFrame(measurePerformance);
    };

    rafIdRef.current = requestAnimationFrame(measurePerformance);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [onPerformanceMetrics]);

  // Optimized garden state handler
  const handleGardenStateChange = useCallback((newState: number) => {
    const startTime = performance.now();
    setGardenState(newState);
    const renderTime = performance.now() - startTime;
    performanceRef.current.renderTimes.push(renderTime);
  }, []);

  // Optimized speaker performance handler
  const handleSpeakerPerformance = useCallback((performance: SpeakerPerformance) => {
    // Process in next animation frame to avoid blocking
    requestAnimationFrame(() => {
      // Update garden state calculation
      // This would be connected to the actual garden state calculator
    });
  }, []);

  // Memoized demographic indicators
  const demographicIndicators = useMemo(() => {
    if (!showDemographics || !isSpectatorView) return null;

    return (
      <div className="flex space-x-4">
        <MemoizedBalanceIndicator
          type="gender"
          targetPercentage={throttledDemographicsRef.current.gender}
          height={250}
          width={70}
          animationType="smooth"
        />
        <MemoizedBalanceIndicator
          type="age"
          targetPercentage={throttledDemographicsRef.current.age}
          height={250}
          width={70}
          animationType="smooth"
        />
        <MemoizedBalanceIndicator
          type="race"
          targetPercentage={throttledDemographicsRef.current.race}
          height={250}
          width={70}
          animationType="smooth"
        />
      </div>
    );
  }, [showDemographics, isSpectatorView, throttledDemographicsRef.current]);

  // Use CSS containment for performance
  const containerStyle = useMemo(() => ({
    contain: 'layout style paint',
    willChange: 'transform',
    transform: 'translateZ(0)', // Force GPU acceleration
  }), []);

  return (
    <div 
      className={`optimized-visualization-container ${className}`}
      style={containerStyle}
    >
      {/* Main content area */}
      <div className="visualization-content">
        {/* Garden Visualization - Always visible */}
        <div className="garden-section mb-6">
          <MemoizedGardenTransition
            sessionId={sessionId}
            initialState={initialGardenState}
            onStateChange={handleGardenStateChange}
            transitionDuration={1500}
          />
        </div>

        {/* Demographics Section - Conditionally visible */}
        {demographicIndicators}
      </div>

      {/* Toggle Controls for Spectator View */}
      {isSpectatorView && (
        <DemographicsToggle
          sessionId={sessionId}
          demographics={demographics}
          gardenState={gardenState}
          isSpectatorView={isSpectatorView}
          defaultVisible={showDemographics}
          position="bottom-right"
          onToggle={setShowDemographics}
        />
      )}

      {/* Performance Monitor (Development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 left-4 bg-black/80 text-white p-2 rounded text-xs font-mono">
          <div>FPS: {performanceRef.current.fps}</div>
          <div>Updates: {performanceRef.current.updateCount}</div>
          <div>Dropped: {performanceRef.current.droppedFrames}</div>
        </div>
      )}
    </div>
  );
};

// Performance optimization utilities
export const useOptimizedUpdates = <T extends object>(
  initialValue: T,
  delay = 100
): [T, (updates: Partial<T>) => void] => {
  const [value, setValue] = React.useState(initialValue);
  const pendingUpdates = useRef<Partial<T>>({});
  const timeoutRef = useRef<NodeJS.Timeout>();

  const update = useCallback((updates: Partial<T>) => {
    pendingUpdates.current = { ...pendingUpdates.current, ...updates };

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setValue(prev => ({ ...prev, ...pendingUpdates.current }));
      pendingUpdates.current = {};
    }, delay);
  }, [delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [value, update];
};

// Request idle callback wrapper for non-critical updates
export const useIdleUpdate = (callback: () => void, deps: React.DependencyList) => {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(callback, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    } else {
      // Fallback for browsers without requestIdleCallback
      const timeout = setTimeout(callback, 0);
      return () => clearTimeout(timeout);
    }
  }, deps);
};

// Web Worker for heavy calculations (if needed)
export const useWebWorkerCalculation = <T, R>(
  workerFunction: (data: T) => R
): [(data: T) => Promise<R>, boolean] => {
  const [isCalculating, setIsCalculating] = React.useState(false);
  const workerRef = useRef<Worker>();

  useEffect(() => {
    // Create worker from function
    const workerCode = `
      self.onmessage = function(e) {
        const result = (${workerFunction.toString()})(e.data);
        self.postMessage(result);
      }
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);

    return () => {
      workerRef.current?.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  const calculate = useCallback((data: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      setIsCalculating(true);
      
      workerRef.current.onmessage = (e) => {
        setIsCalculating(false);
        resolve(e.data);
      };

      workerRef.current.onerror = (error) => {
        setIsCalculating(false);
        reject(error);
      };

      workerRef.current.postMessage(data);
    });
  }, []);

  return [calculate, isCalculating];
};

export default OptimizedVisualizationContainer;