// Environment configuration
export const config = {
  api: {
    // Use relative URL in development to work with Vite proxy
    baseUrl: import.meta.env.VITE_API_URL || '/api/v1',
    timeout: 30000,
  },
  ws: {
    // Use relative path for WebSocket to go through Vite proxy
    url: import.meta.env.VITE_WS_URL || '',
    reconnectDelay: 3000,
    maxReconnectAttempts: 5,
  },
  env: import.meta.env.VITE_ENV || 'development',
  features: {
    enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
    enableDebug: import.meta.env.VITE_ENABLE_DEBUG === 'true',
  },
} as const;

export const isDevelopment = config.env === 'development';
export const isProduction = config.env === 'production';
export const API_BASE_URL = config.api.baseUrl;
