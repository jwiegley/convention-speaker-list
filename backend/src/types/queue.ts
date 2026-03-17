import { QueueStatus } from '@shared/enums';

export interface QueueEntry {
  id: string;
  sessionId: string;
  delegateId: string;
  position: number;
  status: QueueStatus;
  joinedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  isLocked: boolean; // For on-deck positions
  priority: number; // 0 = highest priority (first-time speakers)
  metadata?: Record<string, any>;
}

export interface QueueOperationOptions {
  skipValidation?: boolean;
  skipDuplicateCheck?: boolean;
  forcePriority?: number;
  emitEvents?: boolean;
  useLock?: boolean;
  lockTimeout?: number; // milliseconds
}

export interface QueueLock {
  sessionId: string;
  lockId: string;
  acquiredAt: Date;
  expiresAt: Date;
  operation: string;
}

export interface QueueSnapshot {
  id: string;
  sessionId: string;
  timestamp: Date;
  entries: QueueEntry[];
  metadata: {
    totalSpeakers: number;
    firstTimeSpeakers: number;
    averageSpeakingTime: number;
  };
}

export interface QueueStatistics {
  sessionId: string;
  totalInQueue: number;
  currentPosition: number;
  firstTimeSpeakers: number;
  repeatSpeakers: number;
  averageWaitTime: number;
  estimatedTimeToSpeak: number;
}

export interface QueueEvent {
  type: 'added' | 'removed' | 'advanced' | 'reordered' | 'locked' | 'unlocked' | 'reset';
  sessionId: string;
  timestamp: Date;
  data: any;
  userId?: string;
}
