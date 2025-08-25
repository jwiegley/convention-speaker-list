import { IQueueItem, IQueue } from '@shared/types';

export interface IQueueAdvanceResult {
  previousSpeaker: IQueueItem | null;
  currentSpeaker: IQueueItem | null;
  onDeck: IQueueItem | null;
}

export interface IQueuePosition {
  position: number;
  isFirstTimeSpeaker: boolean;
  isOnDeck: boolean; // positions 1-3
}

export interface IQueueState {
  sessionId: string;
  items: IQueueItem[];
  currentSpeakerId: string | null;
  onDeckPositions: string[]; // IDs of delegates in positions 1-3
  lastUpdated: Date;
}

export interface IQueueService {
  // Core queue operations
  addToQueue(delegateId: string, sessionId: string): Promise<IQueueItem>;
  removeFromQueue(queueItemId: string): Promise<void>;
  advanceQueue(sessionId: string): Promise<IQueueAdvanceResult>;
  
  // Queue state management
  getQueueState(sessionId: string): Promise<IQueueState>;
  getQueuePosition(delegateId: string, sessionId: string): Promise<IQueuePosition | null>;
  
  // Priority and ordering
  calculateQueuePosition(delegateId: string, sessionId: string): Promise<number>;
  reorderQueue(sessionId: string, newOrder: string[]): Promise<void>;
  
  // On-deck management
  lockOnDeckPositions(sessionId: string): Promise<void>;
  unlockOnDeckPositions(sessionId: string): Promise<void>;
  isPositionLocked(position: number, sessionId: string): Promise<boolean>;
  
  // Validation
  validateDelegate(delegateId: string): Promise<boolean>;
  checkDuplicateEntry(delegateId: string, sessionId: string): Promise<boolean>;
  
  // Queue persistence
  saveQueueSnapshot(sessionId: string): Promise<void>;
  restoreQueueFromSnapshot(sessionId: string, snapshotId: string): Promise<void>;
  
  // Event handling
  emitQueueUpdate(sessionId: string, event: string, data: any): Promise<void>;
}