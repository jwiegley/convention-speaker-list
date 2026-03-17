import { useState, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import type { QueueState } from '../types';

export function useQueue() {
  const { on, off } = useWebSocket();
  const [queueState, setQueueState] = useState<QueueState>({
    entries: [],
    currentSpeaker: undefined,
    nextSpeaker: undefined,
    followingSpeaker: undefined,
    totalInQueue: 0,
  });

  useEffect(() => {
    // WebSocket event handlers
    const handleQueueUpdate = (data: any) => {
      setQueueState({
        entries: data.entries || [],
        currentSpeaker: data.currentSpeaker,
        nextSpeaker: data.nextSpeaker,
        followingSpeaker: data.followingSpeaker,
        totalInQueue: data.totalInQueue || 0,
      });
    };

    const handleSpeakerChange = (data: any) => {
      setQueueState((prev) => ({
        ...prev,
        currentSpeaker: data.currentSpeaker,
        nextSpeaker: data.nextSpeaker,
        followingSpeaker: data.followingSpeaker,
      }));
    };

    const handleQueueAdvance = (data: any) => {
      // Handle queue advancement
      handleQueueUpdate(data);
    };

    // Subscribe to events
    on('queue:update', handleQueueUpdate);
    on('queue:speaker:change', handleSpeakerChange);
    on('queue:advance', handleQueueAdvance);

    // Cleanup
    return () => {
      off('queue:update', handleQueueUpdate);
      off('queue:speaker:change', handleSpeakerChange);
      off('queue:advance', handleQueueAdvance);
    };
  }, [on, off]);

  return {
    queue: queueState.entries,
    currentSpeaker: queueState.currentSpeaker,
    nextSpeaker: queueState.nextSpeaker,
    followingSpeaker: queueState.followingSpeaker,
    totalInQueue: queueState.totalInQueue,
  };
}
