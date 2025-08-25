import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GardenVisualization } from './GardenVisualization';
import { gardenStateCalculator, SpeakerPerformance } from '../../utils/gardenStateCalculator';
import { imagePreloader } from '../../utils/imagePreloader';

interface GardenTransitionManagerProps {
  sessionId: string;
  initialState?: number;
  className?: string;
  onStateChange?: (newState: number, oldState: number) => void;
  autoPreload?: boolean;
  transitionDuration?: number;
}

export const GardenTransitionManager: React.FC<GardenTransitionManagerProps> = ({
  sessionId,
  initialState = 16,
  className = '',
  onStateChange,
  autoPreload = true,
  transitionDuration = 2000
}) => {
  const [currentState, setCurrentState] = useState(initialState);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [statistics, setStatistics] = useState(gardenStateCalculator.getStatistics());
  
  const transitionQueue = useRef<number[]>([]);
  const isProcessingQueue = useRef(false);

  // Initialize calculator
  useEffect(() => {
    gardenStateCalculator.setState(initialState);
  }, [initialState]);

  // Preload images on mount
  useEffect(() => {
    if (!autoPreload) return;

    const preloadImages = async () => {
      // Preload priority states first
      await imagePreloader.preloadGardenStates(
        '/images/garden-states/',
        'priority',
        (progress) => {
          setPreloadProgress(progress.percentage);
        }
      );

      // Then preload all in background
      imagePreloader.preloadGardenStates(
        '/images/garden-states/',
        'all'
      );
    };

    preloadImages();
  }, [autoPreload]);

  // Process transition queue
  const processTransitionQueue = useCallback(async () => {
    if (isProcessingQueue.current || transitionQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    setIsTransitioning(true);

    while (transitionQueue.current.length > 0) {
      const nextState = transitionQueue.current.shift()!;
      const oldState = currentState;

      // Preload adjacent states for smooth transition
      const adjacentStates = [
        Math.max(0, nextState - 1),
        nextState,
        Math.min(32, nextState + 1)
      ];
      
      await imagePreloader.preloadGardenStates(
        '/images/garden-states/',
        adjacentStates
      );

      // Animate to new state
      setCurrentState(nextState);
      onStateChange?.(nextState, oldState);

      // Wait for transition to complete
      await new Promise(resolve => setTimeout(resolve, transitionDuration));
    }

    setIsTransitioning(false);
    isProcessingQueue.current = false;
  }, [currentState, transitionDuration, onStateChange]);

  // Handle speaker performance updates
  const updateGardenState = useCallback((performance: SpeakerPerformance) => {
    const change = gardenStateCalculator.calculateStateChange(performance);
    const newStats = gardenStateCalculator.getStatistics();
    setStatistics(newStats);

    if (change.change !== 0) {
      // Add to transition queue
      transitionQueue.current.push(change.newState);
      processTransitionQueue();
    }
  }, [processTransitionQueue]);

  // Smooth multi-step transition
  const transitionToState = useCallback(async (targetState: number) => {
    const steps = Math.abs(targetState - currentState);
    if (steps === 0) return;

    const direction = targetState > currentState ? 1 : -1;
    const states: number[] = [];

    // Create smooth transition path
    for (let i = 1; i <= steps; i++) {
      states.push(currentState + (direction * i));
    }

    // Add all states to queue
    transitionQueue.current.push(...states);
    processTransitionQueue();
  }, [currentState, processTransitionQueue]);

  // Get transition variant based on change magnitude
  const getTransitionVariant = (change: number) => {
    const absChange = Math.abs(change);
    
    if (absChange === 0) return 'none';
    if (absChange === 1) return 'subtle';
    if (absChange <= 3) return 'moderate';
    return 'dramatic';
  };

  const transitionVariants = {
    none: {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 }
    },
    subtle: {
      initial: { opacity: 0.8, scale: 1.02 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0.8, scale: 0.98 },
      transition: { duration: transitionDuration / 1000 }
    },
    moderate: {
      initial: { opacity: 0.6, scale: 1.05, filter: 'blur(2px)' },
      animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
      exit: { opacity: 0.6, scale: 0.95, filter: 'blur(2px)' },
      transition: { duration: transitionDuration / 1000 }
    },
    dramatic: {
      initial: { 
        opacity: 0, 
        scale: 1.1, 
        filter: 'blur(4px)',
        rotateY: 10
      },
      animate: { 
        opacity: 1, 
        scale: 1, 
        filter: 'blur(0px)',
        rotateY: 0
      },
      exit: { 
        opacity: 0, 
        scale: 0.9, 
        filter: 'blur(4px)',
        rotateY: -10
      },
      transition: { 
        duration: transitionDuration / 1000,
        type: 'spring',
        stiffness: 100
      }
    }
  };

  return (
    <div className={`garden-transition-manager ${className}`}>
      {/* Statistics Panel */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Session Performance</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Early:</span>
            <span className="ml-2 font-bold text-green-600">{statistics.earlyCount}</span>
          </div>
          <div>
            <span className="text-gray-600">On Time:</span>
            <span className="ml-2 font-bold text-yellow-600">{statistics.onTimeCount}</span>
          </div>
          <div>
            <span className="text-gray-600">Late:</span>
            <span className="ml-2 font-bold text-red-600">{statistics.lateCount}</span>
          </div>
        </div>
        <div className="mt-2">
          <span className="text-gray-600">Trend:</span>
          <span className={`ml-2 font-bold ${
            statistics.currentTrend === 'improving' ? 'text-green-600' :
            statistics.currentTrend === 'declining' ? 'text-red-600' :
            'text-gray-600'
          }`}>
            {statistics.currentTrend.charAt(0).toUpperCase() + statistics.currentTrend.slice(1)}
          </span>
        </div>
      </div>

      {/* Transition Indicator */}
      {isTransitioning && (
        <div className="absolute top-4 right-4 z-10">
          <motion.div
            className="bg-white/90 backdrop-blur px-3 py-2 rounded-full shadow-lg"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <div className="flex items-center space-x-2">
              <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full"></div>
              <span className="text-sm font-medium">Transitioning...</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Garden Visualization with Transitions */}
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentState}
            variants={transitionVariants[getTransitionVariant(
              transitionQueue.current.length > 0 
                ? transitionQueue.current[0] - currentState 
                : 0
            )]}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ perspective: 1000 }}
          >
            <GardenVisualization
              currentState={currentState}
              sessionId={sessionId}
              animationDuration={transitionDuration / 2}
              preloadImages={false} // We handle preloading here
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Preload Progress (only shown during initial load) */}
      {preloadProgress < 100 && preloadProgress > 0 && (
        <div className="mt-2">
          <div className="text-xs text-gray-600 mb-1">
            Loading images: {Math.round(preloadProgress)}%
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div 
              className="bg-green-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${preloadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Hook for managing garden state transitions
export const useGardenTransitions = (sessionId: string, initialState = 16) => {
  const [state, setState] = useState(initialState);
  const managerRef = useRef<{ 
    updateGardenState: (perf: SpeakerPerformance) => void;
    transitionToState: (state: number) => void;
  }>();

  const handleSpeakerComplete = useCallback((
    speakerId: string,
    allocatedTime: number,
    actualTime: number
  ) => {
    const performance: SpeakerPerformance = {
      speakerId,
      allocatedTime,
      actualTime,
      timestamp: new Date()
    };

    managerRef.current?.updateGardenState(performance);
  }, []);

  const jumpToState = useCallback((newState: number) => {
    managerRef.current?.transitionToState(newState);
  }, []);

  return {
    currentState: state,
    handleSpeakerComplete,
    jumpToState,
    setManagerRef: (ref: typeof managerRef.current) => {
      managerRef.current = ref;
    }
  };
};

export default GardenTransitionManager;