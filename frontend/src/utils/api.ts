import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from './config';
import type { ApiResponse } from '../types';

// Create axios instance with default configuration
const api: AxiosInstance = axios.create({
  baseURL: config.api.baseUrl,
  timeout: config.api.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (requestConfig) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (config.features.enableDebug) {
      console.error('API Error:', error);
    }
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('authToken');
      // Could trigger a redirect here if needed
    }
    
    return Promise.reject(error);
  }
);

// API endpoints
export const apiEndpoints = {
  // Session endpoints
  sessions: {
    list: () => api.get('/sessions'),
    get: (id: string) => api.get(`/sessions/${id}`),
    create: (data: any) => api.post('/sessions', data),
    update: (id: string, data: any) => api.put(`/sessions/${id}`, data),
    delete: (id: string) => api.delete(`/sessions/${id}`),
    current: () => api.get('/sessions/current'),
  },
  
  // Delegate endpoints
  delegates: {
    list: () => api.get('/delegates'),
    get: (id: string) => api.get(`/delegates/${id}`),
    create: (data: any) => api.post('/delegates', data),
    update: (id: string, data: any) => api.put(`/delegates/${id}`, data),
    delete: (id: string) => api.delete(`/delegates/${id}`),
    bulkImport: (data: any) => api.post('/delegates/bulk', data),
  },
  
  // Queue endpoints
  queue: {
    get: (sessionId: string) => api.get(`/queue/${sessionId}`),
    add: (sessionId: string, delegateId: string) => 
      api.post(`/queue/${sessionId}/add`, { delegateId }),
    remove: (sessionId: string, delegateId: string) => 
      api.post(`/queue/${sessionId}/remove`, { delegateId }),
    advance: (sessionId: string) => api.post(`/queue/${sessionId}/advance`),
    clear: (sessionId: string) => api.post(`/queue/${sessionId}/clear`),
    reorder: (sessionId: string, positions: any) => 
      api.post(`/queue/${sessionId}/reorder`, { positions }),
  },
  
  // Timer endpoints
  timer: {
    start: (sessionId: string, delegateId?: string) => 
      api.post(`/timer/${sessionId}/start`, { delegateId }),
    pause: (sessionId: string) => api.post(`/timer/${sessionId}/pause`),
    resume: (sessionId: string) => api.post(`/timer/${sessionId}/resume`),
    stop: (sessionId: string) => api.post(`/timer/${sessionId}/stop`),
    reset: (sessionId: string) => api.post(`/timer/${sessionId}/reset`),
    state: (sessionId: string) => api.get(`/timer/${sessionId}/state`),
  },
  
  // Statistics endpoints
  stats: {
    session: (sessionId: string) => api.get(`/stats/session/${sessionId}`),
    delegate: (delegateId: string) => api.get(`/stats/delegate/${delegateId}`),
    demographics: (sessionId: string) => api.get(`/stats/demographics/${sessionId}`),
  },
};

export default api;