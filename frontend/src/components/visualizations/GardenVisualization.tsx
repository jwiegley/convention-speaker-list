import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GardenVisualizationProps {
  currentState: number; // 0-32, where 0 is desert and 32 is garden
  sessionId: string;
  animationDuration?: number; // milliseconds
  className?: string;
  onStateChange?: (newState: number) => void;
  preloadImages?: boolean;
}

const TOTAL_STATES = 33; // 0 to 32
const IMAGE_BASE_PATH = '/images/garden-states/';

export const GardenVisualization: React.FC<GardenVisualizationProps> = ({
  currentState,
  sessionId,
  animationDuration = 1000,
  className = '',
  onStateChange,
  preloadImages = true
}) => {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [displayState, setDisplayState] = useState(currentState);

  // Validate and clamp state value
  const validState = useMemo(() => {
    return Math.max(0, Math.min(32, Math.floor(currentState)));
  }, [currentState]);

  // Generate image path for a given state
  const getImagePath = useCallback((state: number): string => {
    // Pad state number with leading zeros for consistent naming
    const paddedState = String(state).padStart(2, '0');
    return `${IMAGE_BASE_PATH}state-${paddedState}.webp`;
  }, []);

  // Preload images for smooth transitions
  useEffect(() => {
    if (!preloadImages) {
      setIsLoading(false);
      return;
    }

    const preloadPromises: Promise<void>[] = [];
    
    // Preload current state and adjacent states first
    const priorityStates = [
      validState,
      Math.max(0, validState - 1),
      Math.min(32, validState + 1)
    ];

    priorityStates.forEach(state => {
      const img = new Image();
      const promise = new Promise<void>((resolve, reject) => {
        img.onload = () => {
          setLoadedImages(prev => new Set(prev).add(state));
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load garden state image: ${state}`);
          reject(new Error(`Failed to load image for state ${state}`));
        };
        img.src = getImagePath(state);
      });
      preloadPromises.push(promise);
    });

    // Load priority images first, then others in background
    Promise.all(preloadPromises)
      .then(() => {
        setIsLoading(false);
        
        // Load remaining images in background
        for (let i = 0; i < TOTAL_STATES; i++) {
          if (!priorityStates.includes(i)) {
            const img = new Image();
            img.onload = () => {
              setLoadedImages(prev => new Set(prev).add(i));
            };
            img.src = getImagePath(i);
          }
        }
      })
      .catch(err => {
        setImageError(err.message);
        setIsLoading(false);
      });
  }, [validState, getImagePath, preloadImages]);

  // Handle state changes with animation
  useEffect(() => {
    if (displayState !== validState) {
      setDisplayState(validState);
      onStateChange?.(validState);
    }
  }, [validState, displayState, onStateChange]);

  // Get descriptive text for current state
  const getStateDescription = useMemo(() => {
    if (validState === 0) return 'Barren Desert';
    if (validState <= 8) return 'Arid Landscape';
    if (validState <= 16) return 'Emerging Growth';
    if (validState <= 24) return 'Flourishing Garden';
    if (validState <= 31) return 'Lush Paradise';
    return 'Perfect Garden';
  }, [validState]);

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    return (validState / 32) * 100;
  }, [validState]);

  if (isLoading) {
    return (
      <div className={`garden-visualization garden-loading ${className}`}>
        <div className="flex flex-col items-center justify-center h-64 bg-gray-100 rounded-lg">
          <div className="animate-pulse">
            <div className="w-32 h-32 bg-gray-300 rounded-full mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-24 mx-auto"></div>
          </div>
          <p className="mt-4 text-sm text-gray-600">Loading garden visualization...</p>
        </div>
      </div>
    );
  }

  if (imageError) {
    return (
      <div className={`garden-visualization garden-error ${className}`}>
        <div className="flex flex-col items-center justify-center h-64 bg-red-50 rounded-lg p-4">
          <svg className="w-16 h-16 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
          <p className="text-red-600 text-center">{imageError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`garden-visualization ${className}`}>
      <div className="garden-container relative">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Garden Health</span>
            <span className="text-sm font-semibold text-gray-900">{getStateDescription}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <motion.div 
              className="h-2.5 rounded-full"
              style={{
                background: `linear-gradient(90deg, #DC2626 0%, #F59E0B 33%, #10B981 66%, #059669 100%)`
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: animationDuration / 1000 }}
            />
          </div>
        </div>

        {/* Main image display */}
        <div className="garden-image-container relative overflow-hidden rounded-lg shadow-lg">
          <AnimatePresence mode="wait">
            <motion.img
              key={displayState}
              src={getImagePath(displayState)}
              alt={`Garden state: ${getStateDescription}`}
              className="w-full h-auto"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: animationDuration / 1000 }}
              onError={() => {
                console.error(`Failed to display image for state ${displayState}`);
                setImageError(`Unable to load garden state ${displayState}`);
              }}
            />
          </AnimatePresence>

          {/* Overlay with state information */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <div className="text-white">
              <p className="text-lg font-semibold">State {displayState} of 32</p>
              <p className="text-sm opacity-90">Session: {sessionId}</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex justify-between text-xs text-gray-600">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
            <span>Desert (Late)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></div>
            <span>Growing (On Time)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
            <span>Garden (Early)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GardenVisualization;