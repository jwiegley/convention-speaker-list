export * from './delegate';
export * from './session';
export * from './queue';
export * from './socket';

// Type aliases for backwards compatibility
import type { IDelegate } from './delegate';
import type { ISession } from './session';
import type { IQueueItem } from './queue';
import type { SocketEventNames } from './socket';

export type Delegate = IDelegate;
export type QueueEntry = IQueueItem;
export type Session = ISession;
export type SpeakingInstance = {
  id: string;
  delegateId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
};
export type SocketEvents = typeof SocketEventNames;
