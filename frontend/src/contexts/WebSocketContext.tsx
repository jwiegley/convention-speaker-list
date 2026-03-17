import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { useStore } from '../store';

type Socket = ReturnType<typeof io>;

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  sendMessage: (event: string, data?: any) => void;
  subscribeToEvent: (event: string, callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  isConnected: false,
  sendMessage: () => {},
  subscribeToEvent: () => () => {},
});

export const useWebSocket = () => useContext(WebSocketContext);

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
}

export function WebSocketProvider({
  children,
  url = 'http://localhost:3001',
}: WebSocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);
  const eventHandlers = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  // Store actions
  const setConnectionStatus = useStore((state) => state.setConnectionStatus);
  const updateHeartbeat = useStore((state) => state.updateHeartbeat);
  const syncWithServer = useStore((state) => state.syncWithServer);
  const updateQueue = useStore((state) => state.updateQueue);
  const setDelegates = useStore((state) => state.setDelegates);
  const updateSession = useStore((state) => state.updateSession);
  const advanceQueue = useStore((state) => state.advanceQueue);
  const updateTimerElapsed = useStore((state) => state.updateTimerElapsed);

  const isConnected = useStore((state) => state.isConnected);

  // Initialize socket connection
  useEffect(() => {
    if (!socketRef.current) {
      console.log('Initializing WebSocket connection to:', url);

      socketRef.current = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      const socket = socketRef.current;

      // Connection events
      socket.on('connect', () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');

        // Request initial data
        socket.emit('request_initial_state');
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
      });

      socket.on('connect_error', (error: Error) => {
        console.error('WebSocket connection error:', error);
        setConnectionStatus('error');
      });

      // Heartbeat
      socket.on('heartbeat', () => {
        updateHeartbeat();
      });

      // Initial state sync
      socket.on('initial_state', (data: Record<string, unknown>) => {
        console.log('Received initial state:', data);
        syncWithServer(data);
      });

      // Queue events
      socket.on('queue_updated', (queue: unknown) => {
        console.log('Queue updated:', queue);
        updateQueue(queue as Parameters<typeof updateQueue>[0]);
      });

      socket.on('queue_advanced', () => {
        console.log('Queue advanced');
        advanceQueue();
      });

      socket.on('speaker_added', (data: unknown) => {
        console.log('Speaker added to queue:', data);
        // The queue_updated event will handle the actual update
      });

      socket.on('speaker_removed', (data: unknown) => {
        console.log('Speaker removed from queue:', data);
        // The queue_updated event will handle the actual update
      });

      // Delegate events
      socket.on('delegates_updated', (delegates: unknown) => {
        console.log('Delegates updated:', delegates);
        setDelegates(delegates as Parameters<typeof setDelegates>[0]);
      });

      socket.on('delegate_created', (delegate: unknown) => {
        console.log('New delegate created:', delegate);
        // Refetch delegates
        socket.emit('request_delegates');
      });

      socket.on('delegate_updated', (delegate: unknown) => {
        console.log('Delegate updated:', delegate);
        // Refetch delegates
        socket.emit('request_delegates');
      });

      socket.on('delegate_deleted', (delegateId: string) => {
        console.log('Delegate deleted:', delegateId);
        // Refetch delegates
        socket.emit('request_delegates');
      });

      // Session events
      socket.on('session_started', (session: Record<string, unknown>) => {
        console.log('Session started:', session);
        updateSession(session);
      });

      socket.on('session_paused', () => {
        console.log('Session paused');
        updateSession({ status: 'paused' });
      });

      socket.on('session_resumed', () => {
        console.log('Session resumed');
        updateSession({ status: 'active' });
      });

      socket.on('session_ended', (session: Record<string, unknown>) => {
        console.log('Session ended:', session);
        updateSession({ status: 'ended', ended_at: session.ended_at as string | undefined });
      });

      // Timer events
      socket.on('timer_updated', (timerData: { elapsed: number }) => {
        console.log('Timer updated:', timerData);
        updateTimerElapsed(timerData.elapsed);
      });

      socket.on('timer_started', () => {
        console.log('Timer started');
        // Handle in store
      });

      socket.on('timer_stopped', () => {
        console.log('Timer stopped');
        // Handle in store
      });

      socket.on('timer_reset', () => {
        console.log('Timer reset');
        // Handle in store
      });

      // Error handling
      socket.on('error', (error: unknown) => {
        console.error('WebSocket error:', error);
      });

      // Custom event handling
      (
        socket as unknown as { onAny: (fn: (event: string, ...args: unknown[]) => void) => void }
      ).onAny((event: string, ...args: unknown[]) => {
        const handlers = eventHandlers.current.get(event);
        if (handlers) {
          handlers.forEach((handler) => handler(args[0]));
        }
      });
    }

    return () => {
      if (socketRef.current) {
        console.log('Closing WebSocket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [url]);

  // Send message function
  const sendMessage = useCallback((event: string, data?: any) => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('Sending WebSocket message:', event, data);
      socketRef.current.emit(event, data);
    } else {
      console.warn('Cannot send message, socket not connected');
    }
  }, []);

  // Subscribe to custom events
  const subscribeToEvent = useCallback((event: string, callback: (data: any) => void) => {
    if (!eventHandlers.current.has(event)) {
      eventHandlers.current.set(event, new Set());
    }
    eventHandlers.current.get(event)?.add(callback);

    // Return unsubscribe function
    return () => {
      eventHandlers.current.get(event)?.delete(callback);
      if (eventHandlers.current.get(event)?.size === 0) {
        eventHandlers.current.delete(event);
      }
    };
  }, []);

  const contextValue: WebSocketContextType = {
    socket: socketRef.current,
    isConnected,
    sendMessage,
    subscribeToEvent,
  };

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}

// Custom hooks for specific WebSocket operations
export function useQueueOperations() {
  const { sendMessage } = useWebSocket();

  return {
    addToQueue: (delegateNumber: number, position?: number) => {
      sendMessage('add_to_queue', { delegate_number: delegateNumber, position });
    },
    removeFromQueue: (position: number) => {
      sendMessage('remove_from_queue', { position });
    },
    advanceQueue: () => {
      sendMessage('advance_queue');
    },
    reorderQueue: (from: number, to: number) => {
      sendMessage('reorder_queue', { from, to });
    },
  };
}

export function useSessionOperations() {
  const { sendMessage } = useWebSocket();

  return {
    startSession: (name: string) => {
      sendMessage('start_session', { name });
    },
    pauseSession: () => {
      sendMessage('pause_session');
    },
    resumeSession: () => {
      sendMessage('resume_session');
    },
    endSession: () => {
      sendMessage('end_session');
    },
  };
}

export function useTimerOperations() {
  const { sendMessage } = useWebSocket();

  return {
    startTimer: () => {
      sendMessage('start_timer');
    },
    pauseTimer: () => {
      sendMessage('pause_timer');
    },
    resetTimer: () => {
      sendMessage('reset_timer');
    },
    setTimerLimit: (seconds: number) => {
      sendMessage('set_timer_limit', { seconds });
    },
  };
}
