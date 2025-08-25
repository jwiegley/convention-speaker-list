import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../utils/config';

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(config.ws.url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: config.ws.reconnectDelay,
      reconnectionAttempts: config.ws.maxReconnectAttempts,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      setIsConnected(true);
      if (config.features.enableDebug) {
        console.log('WebSocket connected');
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      if (config.features.enableDebug) {
        console.log('WebSocket disconnected');
      }
    });

    socket.on('error', (error) => {
      if (config.features.enableDebug) {
        console.error('WebSocket error:', error);
      }
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    off,
  };
}