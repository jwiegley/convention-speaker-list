// Re-export shared types
export type {
  Delegate,
  QueueEntry,
  Session,
  SpeakingInstance,
  SocketEvents,
} from '@shared/types';

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