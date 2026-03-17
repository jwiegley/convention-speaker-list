import { QueueStatus } from '../enums';
import { IDelegate } from './delegate';

export interface IQueueItem {
  id: string;
  sessionId: string;
  delegateId: string;
  delegate?: IDelegate;
  position: number;
  status: QueueStatus;
  joinedAt: Date;
  startedSpeakingAt?: Date;
  finishedSpeakingAt?: Date;
  speakingDuration?: number; // in seconds
  notes?: string;
}

export interface IQueue {
  sessionId: string;
  items: IQueueItem[];
  currentSpeaker?: IQueueItem;
  nextSpeaker?: IQueueItem;
  totalWaiting: number;
  totalCompleted: number;
}
