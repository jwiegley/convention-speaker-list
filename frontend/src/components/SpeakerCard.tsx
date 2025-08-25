import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SpeakerCardProps {
  name: string;
  number: number;
  country: string;
  countryFlag?: string;
  isFirstTime: boolean;
  speakingCount?: number;
  gender?: 'M' | 'F' | 'O';
  additionalDetails?: {
    delegationType?: string;
    committee?: string;
    notes?: string;
  };
  className?: string;
}

const SpeakerCard: React.FC<SpeakerCardProps> = ({
  name,
  number,
  country,
  countryFlag,
  isFirstTime,
  speakingCount = 0,
  gender,
  additionalDetails,
  className = ''
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  // Determine card styling based on speaking history
  const cardStyles = isFirstTime
    ? {
        borderColor: '#FFD700', // Gold for first-time speakers
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        badgeColor: '#FFD700',
        glow: '0 0 20px rgba(255, 215, 0, 0.4)'
      }
    : {
        borderColor: '#4169E1', // Royal blue for previous speakers
        backgroundColor: 'rgba(65, 105, 225, 0.1)',
        badgeColor: '#4169E1',
        glow: '0 0 20px rgba(65, 105, 225, 0.4)'
      };

  const handleCardClick = () => {
    if (additionalDetails) {
      setIsFlipped(!isFlipped);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div className={`speaker-card-container ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          className="speaker-card"
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          role="article"
          tabIndex={additionalDetails ? 0 : -1}
          aria-label={`Speaker card for ${name} from ${country}`}
          aria-describedby={`speaker-${number}-details`}
          style={{
            border: `3px solid ${cardStyles.borderColor}`,
            backgroundColor: cardStyles.backgroundColor,
            boxShadow: cardStyles.glow,
            cursor: additionalDetails ? 'pointer' : 'default',
            position: 'relative',
            padding: '1rem',
            borderRadius: '12px',
            minHeight: '140px',
            transition: 'all 0.3s ease',
          }}
          whileHover={additionalDetails ? { scale: 1.02 } : {}}
          whileTap={additionalDetails ? { scale: 0.98 } : {}}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
        >
          {!isFlipped ? (
            // Front of card
            <div className="card-front">
              {/* Speaker Badge */}
              {!isFirstTime && speakingCount > 0 && (
                <div
                  className="speaker-badge"
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    backgroundColor: cardStyles.badgeColor,
                    color: 'white',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  }}
                  aria-label={`Speaker count: ${speakingCount}`}
                >
                  {speakingCount}
                </div>
              )}

              {/* Country Flag and Name */}
              <div className="card-header" style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {countryFlag && (
                    <span 
                      role="img" 
                      aria-label={`${country} flag`}
                      style={{ fontSize: '1.5rem' }}
                    >
                      {countryFlag}
                    </span>
                  )}
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '1.1rem', 
                    fontWeight: '600',
                    color: '#1a1a1a'
                  }}>
                    {country}
                  </h3>
                </div>
              </div>

              {/* Delegate Info */}
              <div id={`speaker-${number}-details`} className="card-body">
                <p style={{ 
                  margin: '0.25rem 0', 
                  fontSize: '1rem',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  {name}
                </p>
                <p style={{ 
                  margin: '0.25rem 0', 
                  fontSize: '0.9rem',
                  color: '#666'
                }}>
                  Delegate #{number}
                </p>
                {gender && (
                  <p style={{ 
                    margin: '0.25rem 0', 
                    fontSize: '0.85rem',
                    color: '#888'
                  }}>
                    Gender: {gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Other'}
                  </p>
                )}
              </div>

              {/* First Time Speaker Indicator */}
              {isFirstTime && (
                <div 
                  className="first-time-indicator"
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.85rem',
                    color: '#FFD700',
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  ⭐ First Time Speaker
                </div>
              )}

              {/* Flip Indicator */}
              {additionalDetails && (
                <div style={{
                  position: 'absolute',
                  bottom: '5px',
                  right: '5px',
                  fontSize: '0.75rem',
                  color: '#999',
                }}>
                  ↻ Tap for details
                </div>
              )}
            </div>
          ) : (
            // Back of card (additional details)
            <div 
              className="card-back"
              style={{ 
                transform: 'rotateY(180deg)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <h4 style={{ 
                margin: '0 0 0.5rem 0',
                fontSize: '1rem',
                color: '#1a1a1a'
              }}>
                Additional Details
              </h4>
              {additionalDetails?.delegationType && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                  <strong>Type:</strong> {additionalDetails.delegationType}
                </p>
              )}
              {additionalDetails?.committee && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                  <strong>Committee:</strong> {additionalDetails.committee}
                </p>
              )}
              {additionalDetails?.notes && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                  <strong>Notes:</strong> {additionalDetails.notes}
                </p>
              )}
              <div style={{
                position: 'absolute',
                bottom: '5px',
                right: '5px',
                fontSize: '0.75rem',
                color: '#999',
              }}>
                ↻ Tap to flip back
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Loading skeleton component for SpeakerCard
export const SpeakerCardSkeleton: React.FC = () => {
  return (
    <div 
      className="speaker-card-skeleton"
      style={{
        border: '3px solid #e0e0e0',
        backgroundColor: '#f5f5f5',
        padding: '1rem',
        borderRadius: '12px',
        minHeight: '140px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{
        width: '60%',
        height: '20px',
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
        marginBottom: '0.5rem',
      }} />
      <div style={{
        width: '80%',
        height: '16px',
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
        marginBottom: '0.25rem',
      }} />
      <div style={{
        width: '40%',
        height: '14px',
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
      }} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default SpeakerCard;