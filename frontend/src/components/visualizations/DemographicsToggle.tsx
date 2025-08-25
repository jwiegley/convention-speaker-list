import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedBalanceIndicator } from './AnimatedBalanceIndicator';
import { GardenTransitionManager } from './GardenTransitionManager';

interface DemographicsToggleProps {
  sessionId: string;
  demographics: {
    gender: number;
    age: number;
    race: number;
  };
  gardenState: number;
  isSpectatorView?: boolean;
  defaultVisible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
  onToggle?: (visible: boolean) => void;
}

export const DemographicsToggle: React.FC<DemographicsToggleProps> = ({
  sessionId,
  demographics,
  gardenState,
  isSpectatorView = false,
  defaultVisible = true,
  position = 'bottom-right',
  className = '',
  onToggle
}) => {
  const [isVisible, setIsVisible] = useState(defaultVisible);
  const [expandedView, setExpandedView] = useState<'compact' | 'full'>('compact');

  const handleToggle = useCallback(() => {
    const newState = !isVisible;
    setIsVisible(newState);
    onToggle?.(newState);
  }, [isVisible, onToggle]);

  const handleViewToggle = useCallback(() => {
    setExpandedView(prev => prev === 'compact' ? 'full' : 'compact');
  }, []);

  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  // Only show in spectator view
  if (!isSpectatorView) {
    return null;
  }

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        className={`fixed ${positionClasses[position]} z-50 ${className}`}
        onClick={handleToggle}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className={`
          flex items-center space-x-2 px-4 py-2 rounded-full shadow-lg
          ${isVisible 
            ? 'bg-blue-500 text-white' 
            : 'bg-white text-gray-700 border border-gray-300'
          }
          transition-colors duration-200
        `}>
          <svg 
            className="w-5 h-5" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d={isVisible 
                ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              }
            />
          </svg>
          <span className="font-medium text-sm">
            {isVisible ? 'Hide' : 'Show'} Demographics
          </span>
        </div>
      </motion.button>

      {/* Demographics Panel */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`fixed ${
              position.includes('bottom') ? 'bottom-20' : 'top-20'
            } ${
              position.includes('right') ? 'right-4' : 'left-4'
            } z-40`}
          >
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Live Demographics</h3>
                  <button
                    onClick={handleViewToggle}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <svg 
                      className="w-5 h-5" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d={expandedView === 'compact' 
                          ? "M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                          : "M6 18L18 6M6 6l12 12"
                        }
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {expandedView === 'compact' ? (
                  // Compact View
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {/* Mini indicators */}
                      <div className="text-center">
                        <div className="text-xs text-gray-600 mb-1">Gender</div>
                        <div className="relative h-20 w-12 mx-auto">
                          <div className="absolute inset-0 bg-gradient-to-t from-purple-100 to-purple-50 rounded"></div>
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-500 to-purple-400 rounded transition-all duration-500"
                            style={{ height: `${demographics.gender}%` }}
                          ></div>
                        </div>
                        <div className="text-sm font-bold mt-1 text-purple-600">
                          {demographics.gender.toFixed(0)}%
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-xs text-gray-600 mb-1">Age</div>
                        <div className="relative h-20 w-12 mx-auto">
                          <div className="absolute inset-0 bg-gradient-to-t from-blue-100 to-blue-50 rounded"></div>
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-500 to-blue-400 rounded transition-all duration-500"
                            style={{ height: `${demographics.age}%` }}
                          ></div>
                        </div>
                        <div className="text-sm font-bold mt-1 text-blue-600">
                          {demographics.age.toFixed(0)}%
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-xs text-gray-600 mb-1">Race</div>
                        <div className="relative h-20 w-12 mx-auto">
                          <div className="absolute inset-0 bg-gradient-to-t from-orange-100 to-orange-50 rounded"></div>
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-500 to-orange-400 rounded transition-all duration-500"
                            style={{ height: `${demographics.race}%` }}
                          ></div>
                        </div>
                        <div className="text-sm font-bold mt-1 text-orange-600">
                          {demographics.race.toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Garden State Mini */}
                    <div className="pt-2 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">Garden Health</span>
                        <span className="text-xs font-semibold">State {gardenState}/32</span>
                      </div>
                      <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${(gardenState / 32) * 100}%`,
                            background: `linear-gradient(90deg, #DC2626 0%, #F59E0B 33%, #10B981 66%, #059669 100%)`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // Full View
                  <div className="space-y-4" style={{ width: '320px' }}>
                    <div className="grid grid-cols-3 gap-4">
                      <AnimatedBalanceIndicator
                        type="gender"
                        targetPercentage={demographics.gender}
                        height={200}
                        width={80}
                        animationType="spring"
                      />
                      <AnimatedBalanceIndicator
                        type="age"
                        targetPercentage={demographics.age}
                        height={200}
                        width={80}
                        animationType="spring"
                      />
                      <AnimatedBalanceIndicator
                        type="race"
                        targetPercentage={demographics.race}
                        height={200}
                        width={80}
                        animationType="spring"
                      />
                    </div>

                    {/* Garden State Preview */}
                    <div className="border-t pt-4">
                      <div className="text-sm font-semibold mb-2">Garden Status</div>
                      <div className="relative h-32 rounded-lg overflow-hidden">
                        <div 
                          className="absolute inset-0 bg-gradient-to-br"
                          style={{
                            backgroundImage: `linear-gradient(135deg, 
                              ${gardenState < 8 ? '#FEE2E2' : 
                                gardenState < 16 ? '#FEF3C7' : 
                                gardenState < 24 ? '#D1FAE5' : '#A7F3D0'} 0%, 
                              ${gardenState < 8 ? '#FECACA' : 
                                gardenState < 16 ? '#FDE68A' : 
                                gardenState < 24 ? '#6EE7B7' : '#34D399'} 100%)`
                          }}
                        >
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <div className="text-3xl font-bold text-gray-800">
                                {gardenState}/32
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {gardenState === 0 ? 'Desert' :
                                 gardenState <= 10 ? 'Arid' :
                                 gardenState <= 20 ? 'Growing' :
                                 gardenState <= 30 ? 'Flourishing' :
                                 'Paradise'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 text-center">
                Session: {sessionId.slice(0, 8)}...
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Hook for managing demographics toggle state
export const useDemographicsToggle = (defaultVisible = true) => {
  const [isVisible, setIsVisible] = useState(defaultVisible);
  const [demographics, setDemographics] = useState({
    gender: 50,
    age: 50,
    race: 50
  });
  const [gardenState, setGardenState] = useState(16);

  const updateDemographics = useCallback((newDemographics: Partial<typeof demographics>) => {
    setDemographics(prev => ({ ...prev, ...newDemographics }));
  }, []);

  const updateGardenState = useCallback((newState: number) => {
    setGardenState(Math.max(0, Math.min(32, newState)));
  }, []);

  return {
    isVisible,
    setIsVisible,
    demographics,
    updateDemographics,
    gardenState,
    updateGardenState
  };
};

export default DemographicsToggle;