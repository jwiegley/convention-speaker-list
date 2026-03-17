// Re-export shared types with frontend-friendly aliases
export type {
  IDelegate as Delegate,
  IQueueItem as QueueEntry,
  ISession as Session,
  SocketEventNames as SocketEvents,
} from '@shared/types';

export type { SpeakingInstance } from '@shared/types';

// Frontend-specific types
export interface Speaker {
  id: string;
  delegateId: string;
  name: string;
  country: string;
  organization?: string;
  position: number;
  isFirstTime: boolean;
  speakingTime?: number;
}

export interface TimerState {
  sessionId: string;
  delegateId?: string;
  duration: number;
  remainingTime: number;
  isRunning: boolean;
  isPaused: boolean;
  startedAt?: Date;
  pausedAt?: Date;
  serverTimestamp: Date;
}

export interface QueueState {
  entries: QueueEntry[];
  currentSpeaker?: Speaker;
  nextSpeaker?: Speaker;
  followingSpeaker?: Speaker;
  totalInQueue: number;
}

// Need to import the type to use it
import type { IQueueItem } from '@shared/types';
type QueueEntry = IQueueItem;

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  success: boolean;
}
