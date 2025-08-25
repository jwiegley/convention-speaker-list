import type { QueueEntry } from '@shared/types';

interface QueueGridProps {
  queue: QueueEntry[];
}

export function QueueGrid({ queue }: QueueGridProps) {
  // Create array for positions 1-50
  const positions = Array.from({ length: 50 }, (_, i) => i + 1);
  
  // Map queue entries by position for quick lookup
  const queueMap = new Map(
    queue.map(entry => [entry.position, entry])
  );

  return (
    <div className="queue-grid grid grid-cols-10 gap-2">
      {positions.map(position => {
        const entry = queueMap.get(position);
        const isOccupied = !!entry;
        const showName = position <= 20 && entry;
        
        return (
          <div
            key={position}
            className={`
              aspect-square rounded-lg flex items-center justify-center text-sm font-medium
              transition-all duration-300 hover:scale-105
              ${isOccupied 
                ? entry.delegate?.is_first_time 
                  ? 'bg-yellow-600/80 text-yellow-100 border-2 border-yellow-500' 
                  : 'bg-blue-600/80 text-blue-100 border-2 border-blue-500'
                : 'bg-gray-700/50 text-gray-500 border border-gray-600'
              }
            `}
            title={entry ? `${entry.delegate?.name} - ${entry.delegate?.country}` : `Position ${position}`}
          >
            {showName ? (
              <div className="text-center p-1 overflow-hidden">
                <div className="text-xs truncate">{entry.delegate?.name?.split(' ')[0]}</div>
              </div>
            ) : (
              <span>{position}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}