import { IQueueItem } from './queue';
import { IDelegate } from './delegate';
import { ISession } from './session';

// Event payload interfaces
export interface QueueUpdatePayload {
  sessionId: string;
  queue: IQueueItem[];
  action: 'added' | 'removed' | 'reordered' | 'advanced' | 'reset' | 'locked' | 'unlocked';
  affectedItems?: string[];
  timestamp: Date;
}

export interface SpeakerAdvancedPayload {
  sessionId: string;
  previousSpeaker?: IQueueItem;
  currentSpeaker: IQueueItem;
  nextSpeaker?: IQueueItem;
  timestamp: Date;
}

export interface TimerTickPayload {
  sessionId: string;
  delegateId?: string;
  remainingTime: number;
  totalTime: number;
  isWarning: boolean;
  timestamp: Date;
}

export interface DemographicsUpdatePayload {
  sessionId: string;
  totalDelegates: number;
  demographics: {
    region: Record<string, number>;
    age: Record<string, number>;
    gender: Record<string, number>;
    firstTime: number;
  };
  timestamp: Date;
}

export interface GardenStatePayload {
  sessionId: string;
  speakerPositions: Array<{
    delegateId: string;
    position: { x: number; y: number };
    isSpeaking: boolean;
  }>;
  timestamp: Date;
}

export interface ServerToClientEvents {
  'queue:updated': (payload: QueueUpdatePayload) => void;
  'queue:joined': (payload: {
    sessionId: string;
    queueItem: IQueueItem;
    position: number;
    timestamp: Date;
  }) => void;
  'queue:left': (payload: {
    sessionId: string;
    queueItemId: string;
    delegateId: string;
    reason: 'completed' | 'removed' | 'timeout';
    timestamp: Date;
  }) => void;
  'queue:snapshot': (payload: {
    sessionId: string;
    queue: IQueueItem[];
    currentSpeaker: IQueueItem | null;
    onDeck: IQueueItem[];
    totalInQueue: number;
    timestamp: Date;
  }) => void;
  'speaker:advanced': (payload: SpeakerAdvancedPayload) => void;
  'speaker:started': (queueItem: IQueueItem) => void;
  'speaker:finished': (queueItem: IQueueItem) => void;
  'delegate:joined': (delegate: IDelegate) => void;
  'delegate:left': (delegateId: string) => void;
  'session:created': (payload: {
    sessionId: string;
    name: string;
    participantCount: number;
    timestamp: Date;
  }) => void;
  'session:ended': (payload: {
    sessionId: string;
    totalSpeakers: number;
    totalDuration: number;
    timestamp: Date;
  }) => void;
  'session:participant:joined': (payload: {
    sessionId: string;
    participantId: string;
    role: string;
    timestamp: Date;
  }) => void;
  'session:participant:left': (payload: {
    sessionId: string;
    participantId: string;
    role: string;
    timestamp: Date;
  }) => void;
  'session:updated': (session: ISession) => void;
  'timer:tick': (payload: TimerTickPayload) => void;
  'timer:warning': (remainingTime: number) => void;
  'timer:expired': () => void;
  'timer:pause': (payload: {
    sessionId: string;
    delegateId?: string;
    remainingTime: number;
    timestamp: Date;
  }) => void;
  'timer:resume': (payload: {
    sessionId: string;
    delegateId?: string;
    remainingTime: number;
    timestamp: Date;
  }) => void;
  'timer:stop': (payload: {
    sessionId: string;
    delegateId?: string;
    remainingTime: number;
    timestamp: Date;
  }) => void;
  'timer:state': (payload: {
    sessionId: string;
    remainingTime: number;
    totalTime: number;
    isRunning: boolean;
    isPaused: boolean;
    serverTimestamp: Date;
  }) => void;
  'demographics:updated': (payload: DemographicsUpdatePayload) => void;
  'demographics:snapshot': (payload: {
    sessionId: string;
    totalDelegates: number;
    demographics: Record<string, unknown>;
    balance: Record<string, unknown>;
    timestamp: Date;
  }) => void;
  'balance:update': (payload: {
    sessionId: string;
    balance: Record<string, unknown>;
    deltas?: Record<string, unknown>;
    timestamp: Date;
  }) => void;
  'garden:stateChanged': (payload: GardenStatePayload) => void;
  'garden:snapshot': (payload: {
    sessionId: string;
    imageIndex: number;
    performanceScore: number;
    averageTime: number;
    onTimePercentage: number;
    timestamp: Date;
  }) => void;
  'connection:restored': (data: { sessionId: string; missedEvents: number }) => void;
  error: (error: { code: string; message: string }) => void;
  'server:shutdown': (data: { message: string; reconnectIn: number }) => void;
}

export interface ClientToServerEvents {
  'join:session': (sessionId: string) => void;
  'leave:session': (sessionId: string) => void;
  'queue:join': (data: { sessionId: string; delegateId: string; microphoneNumber: number }) => void;
  'queue:leave': (data: { sessionId: string; delegateId: string }) => void;
  'speaker:next': (sessionId: string) => void;
  'speaker:skip': (data: { sessionId: string; queueItemId: string }) => void;
  'speaker:finish': (data: { sessionId: string; queueItemId: string }) => void;
  'timer:start': (data: { sessionId: string; duration: number }) => void;
  'timer:pause': (sessionId: string) => void;
  'timer:resume': (sessionId: string) => void;
  'timer:reset': (sessionId: string) => void;
  'admin:authenticate': (data: { sessionId: string; pin: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  sessionId?: string;
  isAdmin?: boolean;
  delegateId?: string;
  userId?: string;
  role?: 'admin' | 'spectator' | 'delegate';
  connectedAt?: Date;
}

// Event name enums for type safety
export enum SocketEventNames {
  // Server to Client
  QUEUE_UPDATED = 'queue:updated',
  QUEUE_JOINED = 'queue:joined',
  QUEUE_LEFT = 'queue:left',
  QUEUE_SNAPSHOT = 'queue:snapshot',
  SPEAKER_ADVANCED = 'speaker:advanced',
  SPEAKER_STARTED = 'speaker:started',
  SPEAKER_FINISHED = 'speaker:finished',
  DELEGATE_JOINED = 'delegate:joined',
  DELEGATE_LEFT = 'delegate:left',
  SESSION_CREATED = 'session:created',
  SESSION_ENDED = 'session:ended',
  SESSION_PARTICIPANT_JOINED = 'session:participant:joined',
  SESSION_PARTICIPANT_LEFT = 'session:participant:left',
  SESSION_UPDATED = 'session:updated',
  TIMER_TICK = 'timer:tick',
  TIMER_WARNING = 'timer:warning',
  TIMER_EXPIRED = 'timer:expired',
  TIMER_PAUSE = 'timer:pause',
  TIMER_RESUME = 'timer:resume',
  TIMER_STOP = 'timer:stop',
  TIMER_STATE = 'timer:state',
  DEMOGRAPHICS_UPDATED = 'demographics:updated',
  DEMOGRAPHICS_SNAPSHOT = 'demographics:snapshot',
  BALANCE_UPDATE = 'balance:update',
  GARDEN_STATE_CHANGED = 'garden:stateChanged',
  GARDEN_SNAPSHOT = 'garden:snapshot',
  CONNECTION_RESTORED = 'connection:restored',
  ERROR = 'error',

  // Client to Server
  JOIN_SESSION = 'join:session',
  LEAVE_SESSION = 'leave:session',
  QUEUE_JOIN = 'queue:join',
  QUEUE_LEAVE = 'queue:leave',
  SPEAKER_NEXT = 'speaker:next',
  SPEAKER_SKIP = 'speaker:skip',
  SPEAKER_FINISH = 'speaker:finish',
  TIMER_START = 'timer:start',
  // TIMER_PAUSE and TIMER_RESUME already defined above
  TIMER_RESET = 'timer:reset',
  ADMIN_AUTHENTICATE = 'admin:authenticate',
}

// Namespace types
export interface AdminNamespaceData extends SocketData {
  isAdmin: true;
  permissions: string[];
}

export interface SpectatorNamespaceData extends SocketData {
  isSpectator: true;
  viewOnly: true;
}
