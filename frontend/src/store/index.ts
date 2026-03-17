import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Types
export interface Delegate {
  id: string;
  name: string;
  number: number;
  country: string;
  gender: 'M' | 'F' | 'O';
  has_spoken: boolean;
  speaking_count: number;
  is_first_time?: boolean;
  created_at: string;
  updated_at: string;
}

export interface QueueItem {
  position: number;
  delegate_id: string;
  delegate?: Delegate;
  added_at: string;
}

export interface Session {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'ended';
  started_at: string;
  ended_at?: string;
  current_position: number;
  total_speakers: number;
}

export interface TimerState {
  isRunning: boolean;
  elapsed: number;
  limit: number;
  warningAt: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoAdvance: boolean;
  displayMode: 'compact' | 'expanded';
}

// Store slices
interface QueueSlice {
  queue: QueueItem[];
  currentSpeaker: QueueItem | null;
  nextSpeaker: QueueItem | null;
  followingSpeaker: QueueItem | null;
  updateQueue: (queue: QueueItem[]) => void;
  addToQueue: (delegate: Delegate, position?: number) => void;
  removeFromQueue: (position: number) => void;
  advanceQueue: () => void;
  reorderQueue: (from: number, to: number) => void;
}

interface DelegateSlice {
  delegates: Delegate[];
  delegatesById: Map<string, Delegate>;
  setDelegates: (delegates: Delegate[]) => void;
  addDelegate: (delegate: Delegate) => void;
  updateDelegate: (id: string, updates: Partial<Delegate>) => void;
  removeDelegate: (id: string) => void;
  markAsSpoken: (id: string) => void;
}

interface SessionSlice {
  session: Session | null;
  sessionHistory: Session[];
  startSession: (name: string) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  updateSession: (updates: Partial<Session>) => void;
}

interface TimerSlice {
  timer: TimerState;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  setTimerLimit: (seconds: number) => void;
  updateTimerElapsed: (seconds: number) => void;
}

interface UserSlice {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

interface WebSocketSlice {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastHeartbeat: number | null;
  setConnectionStatus: (status: WebSocketSlice['connectionStatus']) => void;
  updateHeartbeat: () => void;
}

// Combined store type
export interface AppStore
  extends QueueSlice,
    DelegateSlice,
    SessionSlice,
    TimerSlice,
    UserSlice,
    WebSocketSlice {
  // Global actions
  resetStore: () => void;
  syncWithServer: (data: any) => void;
}

// Default values
const defaultPreferences: UserPreferences = {
  theme: 'light',
  soundEnabled: true,
  notificationsEnabled: true,
  autoAdvance: false,
  displayMode: 'expanded',
};

const defaultTimer: TimerState = {
  isRunning: false,
  elapsed: 0,
  limit: 180, // 3 minutes default
  warningAt: 30, // 30 seconds warning
};

// Create the store
export const useStore = create<AppStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, _get) => ({
          // Queue slice
          queue: [],
          currentSpeaker: null,
          nextSpeaker: null,
          followingSpeaker: null,

          updateQueue: (queue) =>
            set((state) => {
              state.queue = queue;
              // Update speaker positions
              state.currentSpeaker = queue.find((q) => q.position === 0) || null;
              state.nextSpeaker = queue.find((q) => q.position === 1) || null;
              state.followingSpeaker = queue.find((q) => q.position === 2) || null;
            }),

          addToQueue: (delegate, position) =>
            set((state) => {
              const newItem: QueueItem = {
                position: position ?? state.queue.length,
                delegate_id: delegate.id,
                delegate,
                added_at: new Date().toISOString(),
              };

              if (position !== undefined) {
                // Insert at specific position and shift others
                state.queue.splice(position, 0, newItem);
                // Reindex positions
                state.queue.forEach((item: QueueItem, idx: number) => {
                  item.position = idx;
                });
              } else {
                state.queue.push(newItem);
              }
            }),

          removeFromQueue: (position) =>
            set((state) => {
              state.queue = state.queue.filter((q: QueueItem) => q.position !== position);
              // Reindex positions
              state.queue.forEach((item: QueueItem, idx: number) => {
                item.position = idx;
              });
            }),

          advanceQueue: () =>
            set((state) => {
              if (state.queue.length > 0) {
                // Mark current speaker as spoken
                const current = state.queue[0];
                if (current?.delegate) {
                  const delegate = state.delegatesById.get(current.delegate_id);
                  if (delegate) {
                    delegate.has_spoken = true;
                    delegate.speaking_count += 1;
                  }
                }

                // Remove first speaker
                state.queue.shift();

                // Reindex positions
                state.queue.forEach((item: QueueItem, idx: number) => {
                  item.position = idx;
                });

                // Update current speakers
                state.currentSpeaker = state.queue[0] || null;
                state.nextSpeaker = state.queue[1] || null;
                state.followingSpeaker = state.queue[2] || null;

                // Update session
                if (state.session) {
                  state.session.current_position += 1;
                  state.session.total_speakers += 1;
                }
              }
            }),

          reorderQueue: (from, to) =>
            set((state) => {
              const item = state.queue[from];
              if (item) {
                state.queue.splice(from, 1);
                state.queue.splice(to, 0, item);
                // Reindex positions
                state.queue.forEach((qItem: QueueItem, idx: number) => {
                  qItem.position = idx;
                });
              }
            }),

          // Delegate slice
          delegates: [],
          delegatesById: new Map(),

          setDelegates: (delegates) =>
            set((state) => {
              state.delegates = delegates;
              state.delegatesById = new Map(delegates.map((d: Delegate) => [d.id, d]));
            }),

          addDelegate: (delegate) =>
            set((state) => {
              state.delegates.push(delegate);
              state.delegatesById.set(delegate.id, delegate);
            }),

          updateDelegate: (id, updates) =>
            set((state) => {
              const index = state.delegates.findIndex((d: Delegate) => d.id === id);
              if (index !== -1) {
                Object.assign(state.delegates[index], updates);
                state.delegatesById.set(id, state.delegates[index]);
              }
            }),

          removeDelegate: (id) =>
            set((state) => {
              state.delegates = state.delegates.filter((d: Delegate) => d.id !== id);
              state.delegatesById.delete(id);
            }),

          markAsSpoken: (id) =>
            set((state) => {
              const delegate = state.delegatesById.get(id);
              if (delegate) {
                delegate.has_spoken = true;
                delegate.speaking_count += 1;
              }
            }),

          // Session slice
          session: null,
          sessionHistory: [],

          startSession: (name) =>
            set((state) => {
              const newSession: Session = {
                id: Date.now().toString(),
                name,
                status: 'active',
                started_at: new Date().toISOString(),
                current_position: 0,
                total_speakers: 0,
              };
              state.session = newSession;
              state.sessionHistory.push(newSession);
            }),

          pauseSession: () =>
            set((state) => {
              if (state.session) {
                state.session.status = 'paused';
              }
            }),

          resumeSession: () =>
            set((state) => {
              if (state.session) {
                state.session.status = 'active';
              }
            }),

          endSession: () =>
            set((state) => {
              if (state.session) {
                state.session.status = 'ended';
                state.session.ended_at = new Date().toISOString();
                state.session = null;
              }
            }),

          updateSession: (updates) =>
            set((state) => {
              if (state.session) {
                Object.assign(state.session, updates);
              }
            }),

          // Timer slice
          timer: defaultTimer,

          startTimer: () =>
            set((state) => {
              state.timer.isRunning = true;
            }),

          pauseTimer: () =>
            set((state) => {
              state.timer.isRunning = false;
            }),

          resetTimer: () =>
            set((state) => {
              state.timer.elapsed = 0;
              state.timer.isRunning = false;
            }),

          setTimerLimit: (seconds) =>
            set((state) => {
              state.timer.limit = seconds;
            }),

          updateTimerElapsed: (seconds) =>
            set((state) => {
              state.timer.elapsed = seconds;
            }),

          // User preferences slice
          preferences: defaultPreferences,

          updatePreferences: (updates) =>
            set((state) => {
              Object.assign(state.preferences, updates);
            }),

          resetPreferences: () =>
            set((state) => {
              state.preferences = defaultPreferences;
            }),

          // WebSocket slice
          isConnected: false,
          connectionStatus: 'disconnected',
          lastHeartbeat: null,

          setConnectionStatus: (status) =>
            set((state) => {
              state.connectionStatus = status;
              state.isConnected = status === 'connected';
            }),

          updateHeartbeat: () =>
            set((state) => {
              state.lastHeartbeat = Date.now();
            }),

          // Global actions
          resetStore: () =>
            set((state) => {
              // Reset all slices to initial state
              state.queue = [];
              state.currentSpeaker = null;
              state.nextSpeaker = null;
              state.followingSpeaker = null;
              state.delegates = [];
              state.delegatesById = new Map();
              state.session = null;
              state.timer = defaultTimer;
              state.preferences = defaultPreferences;
              state.isConnected = false;
              state.connectionStatus = 'disconnected';
              state.lastHeartbeat = null;
            }),

          syncWithServer: (data) =>
            set((state) => {
              // Sync state with server data
              if (data.queue) {
                state.queue = data.queue;
                state.currentSpeaker = data.queue[0] || null;
                state.nextSpeaker = data.queue[1] || null;
                state.followingSpeaker = data.queue[2] || null;
              }
              if (data.delegates) {
                state.delegates = data.delegates;
                state.delegatesById = new Map(data.delegates.map((d: Delegate) => [d.id, d]));
              }
              if (data.session) {
                state.session = data.session;
              }
            }),
        }))
      ),
      {
        name: 'speaker-queue-storage',
        partialize: (state) => ({
          preferences: state.preferences,
          sessionHistory: state.sessionHistory,
        }),
      }
    ),
    {
      name: 'SpeakerQueueStore',
    }
  )
);

// Selectors
export const selectCurrentSpeaker = (state: AppStore) => state.currentSpeaker;
export const selectNextSpeaker = (state: AppStore) => state.nextSpeaker;
export const selectFollowingSpeaker = (state: AppStore) => state.followingSpeaker;
export const selectQueueLength = (state: AppStore) => state.queue.length;
export const selectIsSessionActive = (state: AppStore) => state.session?.status === 'active';
export const selectDelegateById = (id: string) => (state: AppStore) => state.delegatesById.get(id);
export const selectQueuePosition = (delegateId: string) => (state: AppStore) =>
  state.queue.findIndex((q) => q.delegate_id === delegateId);

// Middleware for logging (development only)
if (process.env.NODE_ENV === 'development') {
  useStore.subscribe(
    (state) => state,
    (newState, prevState) => {
      console.log('[Store Update]', {
        prev: prevState,
        new: newState,
        diff: Object.keys(newState).reduce((acc, key) => {
          if (
            JSON.stringify(newState[key as keyof AppStore]) !==
            JSON.stringify(prevState[key as keyof AppStore])
          ) {
            acc[key] = {
              prev: prevState[key as keyof AppStore],
              new: newState[key as keyof AppStore],
            };
          }
          return acc;
        }, {} as any),
      });
    }
  );
}

export default useStore;
