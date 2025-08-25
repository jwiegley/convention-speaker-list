import { EventEmitter } from 'events';
// import { speakingInstanceService } from './speakingInstanceService'; // Reserved for future use
import logger from '../utils/logger';

export interface TimerState {
  sessionId: string;
  delegateId?: string;  // Track which delegate is speaking
  duration: number;
  remainingTime: number;
  isRunning: boolean;
  isPaused: boolean;
  startedAt?: Date;
  pausedAt?: Date;
  serverTimestamp: Date;
}

export interface TimerEvent {
  type: 'start' | 'tick' | 'pause' | 'resume' | 'stop' | 'expired' | 'warning';
  sessionId: string;
  delegateId?: string;  // Include delegate in events
  remainingTime: number;
  totalTime: number;
  timestamp: Date;
}

/**
 * Service for managing session timers with millisecond precision
 */
export class TimerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private timerStates: Map<string, TimerState> = new Map();
  private eventEmitter: EventEmitter;
  private readonly TICK_INTERVAL = 1000; // 1 second
  private readonly WARNING_THRESHOLD = 30; // 30 seconds warning
  private readonly DEFAULT_DURATION = 180; // 3 minutes in seconds
  
  constructor() {
    this.eventEmitter = new EventEmitter();
    this.recoverTimers();
    logger.info('TimerService initialized');
  }
  
  /**
   * Generate a unique timer key from sessionId and optional delegateId
   */
  private getTimerKey(sessionId: string, delegateId?: string): string {
    return delegateId ? `${sessionId}:${delegateId}` : sessionId;
  }
  
  /**
   * Start a timer for a session and optionally a specific delegate
   */
  startTimer(sessionId: string, duration: number, delegateId?: string): void {
    // Stop existing timer if any
    const timerKey = this.getTimerKey(sessionId, delegateId);
    this.stopTimerByKey(timerKey);
    
    const state: TimerState = {
      sessionId,
      delegateId,
      duration: duration || this.DEFAULT_DURATION,
      remainingTime: duration || this.DEFAULT_DURATION,
      isRunning: true,
      isPaused: false,
      startedAt: new Date(),
      serverTimestamp: new Date()
    };
    
    this.timerStates.set(timerKey, state);
    
    // Emit start event
    this.emitTimerEvent('start', sessionId, state.duration, state.duration, delegateId);
    
    // Start the interval timer
    const interval = setInterval(() => {
      this.handleTimerTick(timerKey);
    }, this.TICK_INTERVAL);
    
    this.timers.set(timerKey, interval);
    
    logger.info(`Timer started for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}, duration: ${state.duration}s`);
  }
  
  /**
   * Handle timer tick
   */
  private handleTimerTick(timerKey: string): void {
    const state = this.timerStates.get(timerKey);
    if (!state || !state.isRunning || state.isPaused) {
      return;
    }
    
    // Calculate remaining time based on actual elapsed time for precision
    const elapsed = Math.floor((Date.now() - state.startedAt!.getTime()) / 1000);
    state.remainingTime = Math.max(0, state.duration - elapsed);
    state.serverTimestamp = new Date();
    
    // Emit tick event
    this.emitTimerEvent('tick', state.sessionId, state.remainingTime, state.duration, state.delegateId);
    
    // Check for warning threshold
    if (state.remainingTime === this.WARNING_THRESHOLD) {
      this.emitTimerEvent('warning', state.sessionId, state.remainingTime, state.duration, state.delegateId);
    }
    
    // Check for expiration
    if (state.remainingTime === 0) {
      this.emitTimerEvent('expired', state.sessionId, 0, state.duration, state.delegateId);
      this.stopTimerByKey(timerKey);
      logger.info(`Timer expired for session ${state.sessionId}${state.delegateId ? ` (delegate: ${state.delegateId})` : ''}`);
    }
  }
  
  /**
   * Pause a timer
   */
  pauseTimer(sessionId: string, delegateId?: string): void {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    const state = this.timerStates.get(timerKey);
    if (!state || !state.isRunning || state.isPaused) {
      return;
    }
    
    state.isPaused = true;
    state.pausedAt = new Date();
    
    // Clear the interval
    const interval = this.timers.get(timerKey);
    if (interval) {
      clearInterval(interval);
      this.timers.delete(timerKey);
    }
    
    this.emitTimerEvent('pause', state.sessionId, state.remainingTime, state.duration, state.delegateId);
    logger.info(`Timer paused for session ${state.sessionId}${state.delegateId ? ` (delegate: ${state.delegateId})` : ''}, remaining: ${state.remainingTime}s`);
  }
  
  /**
   * Resume a paused timer
   */
  resumeTimer(sessionId: string, delegateId?: string): void {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    const state = this.timerStates.get(timerKey);
    if (!state || !state.isPaused) {
      return;
    }
    
    // Calculate time spent paused and adjust
    if (state.pausedAt && state.startedAt) {
      const pausedDuration = Date.now() - state.pausedAt.getTime();
      state.startedAt = new Date(state.startedAt.getTime() + pausedDuration);
    }
    
    state.isPaused = false;
    state.pausedAt = undefined;
    
    // Restart the interval
    const interval = setInterval(() => {
      this.handleTimerTick(timerKey);
    }, this.TICK_INTERVAL);
    
    this.timers.set(timerKey, interval);
    
    this.emitTimerEvent('resume', state.sessionId, state.remainingTime, state.duration, state.delegateId);
    logger.info(`Timer resumed for session ${state.sessionId}${state.delegateId ? ` (delegate: ${state.delegateId})` : ''}, remaining: ${state.remainingTime}s`);
  }
  
  /**
   * Stop a timer by its key
   */
  private stopTimerByKey(timerKey: string): void {
    const interval = this.timers.get(timerKey);
    if (interval) {
      clearInterval(interval);
      this.timers.delete(timerKey);
    }
    
    const state = this.timerStates.get(timerKey);
    if (state) {
      this.emitTimerEvent('stop', state.sessionId, state.remainingTime, state.duration, state.delegateId);
      this.timerStates.delete(timerKey);
      logger.info(`Timer stopped for session ${state.sessionId}${state.delegateId ? ` (delegate: ${state.delegateId})` : ''}`);
    }
  }
  
  /**
   * Stop a timer
   */
  stopTimer(sessionId: string, delegateId?: string): void {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    this.stopTimerByKey(timerKey);
  }
  
  /**
   * Reset a timer to its original duration
   */
  resetTimer(sessionId: string, delegateId?: string): void {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    const state = this.timerStates.get(timerKey);
    if (!state) {
      return;
    }
    
    const duration = state.duration;
    this.stopTimer(sessionId, delegateId);
    this.startTimer(sessionId, duration, delegateId);
    
    logger.info(`Timer reset for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`);
  }
  
  /**
   * Get timer state for a session and optionally a delegate
   */
  getTimerState(sessionId: string, delegateId?: string): TimerState | null {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    const state = this.timerStates.get(timerKey);
    if (!state) {
      return null;
    }
    
    // Update remaining time if timer is running
    if (state.isRunning && !state.isPaused && state.startedAt) {
      const elapsed = Math.floor((Date.now() - state.startedAt.getTime()) / 1000);
      state.remainingTime = Math.max(0, state.duration - elapsed);
      state.serverTimestamp = new Date();
    }
    
    return { ...state };
  }
  
  /**
   * Get all active timer states
   */
  getAllTimerStates(): Map<string, TimerState> {
    const states = new Map<string, TimerState>();
    
    for (const [timerKey, state] of this.timerStates) {
      const currentState = this.getTimerState(state.sessionId, state.delegateId);
      if (currentState) {
        states.set(timerKey, currentState);
      }
    }
    
    return states;
  }
  
  /**
   * Get timer state by delegate ID within a session
   */
  getTimerByDelegate(sessionId: string, delegateId: string): TimerState | null {
    return this.getTimerState(sessionId, delegateId);
  }
  
  /**
   * Get all timers for a specific session
   */
  getSessionTimers(sessionId: string): TimerState[] {
    const sessionTimers: TimerState[] = [];
    
    for (const [, state] of this.timerStates) {
      if (state.sessionId === sessionId) {
        const currentState = this.getTimerState(state.sessionId, state.delegateId);
        if (currentState) {
          sessionTimers.push(currentState);
        }
      }
    }
    
    return sessionTimers;
  }
  
  /**
   * Check if a timer exists for a delegate
   */
  hasActiveTimer(sessionId: string, delegateId?: string): boolean {
    const timerKey = this.getTimerKey(sessionId, delegateId);
    const state = this.timerStates.get(timerKey);
    return state ? state.isRunning : false;
  }
  
  /**
   * Emit timer event
   */
  private emitTimerEvent(
    type: TimerEvent['type'],
    sessionId: string,
    remainingTime: number,
    totalTime: number,
    delegateId?: string
  ): void {
    const event: TimerEvent = {
      type,
      sessionId,
      delegateId,
      remainingTime,
      totalTime,
      timestamp: new Date()
    };
    
    this.eventEmitter.emit('timer:event', event);
    logger.debug(`Timer event: ${type} for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}, remaining: ${remainingTime}s`);
  }
  
  /**
   * Subscribe to timer events
   */
  onTimerEvent(callback: (event: TimerEvent) => void): void {
    this.eventEmitter.on('timer:event', callback);
  }
  
  /**
   * Unsubscribe from timer events
   */
  offTimerEvent(callback: (event: TimerEvent) => void): void {
    this.eventEmitter.off('timer:event', callback);
  }
  
  /**
   * Recover timers from database on service restart
   */
  private async recoverTimers(): Promise<void> {
    try {
      // This would typically query active speaking instances from the database
      // For now, we'll just log that recovery was attempted
      logger.info('Attempting to recover active timers from database...');
      
      // In a production implementation, you would:
      // 1. Query speaking_instances table for records with end_time IS NULL
      // 2. Calculate remaining time based on start_time and current time
      // 3. Resume timers for active speakers
      
      // Example (pseudo-code):
      // const activeSpeakers = await speakingInstanceService.getAllActiveSpeakers();
      // for (const speaker of activeSpeakers) {
      //   const elapsed = Date.now() - speaker.start_time;
      //   const remaining = Math.max(0, this.DEFAULT_DURATION - Math.floor(elapsed / 1000));
      //   if (remaining > 0) {
      //     this.startTimer(speaker.session_id, remaining, speaker.delegate_id);
      //   }
      // }
      
      logger.info('Timer recovery completed');
    } catch (error) {
      logger.error('Error recovering timers:', error);
    }
  }
  
  /**
   * Save timer state for persistence (called on state changes)
   * Reserved for future use when persistence is needed
   */
  // private async persistTimerState(state: TimerState): Promise<void> {
  //   try {
  //     // Timer state is already persisted through speaking_instances table
  //     // This method is here for additional persistence needs if required
  //     logger.debug(`Timer state persisted for session ${state.sessionId}${state.delegateId ? ` (delegate: ${state.delegateId})` : ''}`);
  //   } catch (error) {
  //     logger.error('Error persisting timer state:', error);
  //   }
  // }
  
  /**
   * Cleanup all timers (for graceful shutdown)
   */
  cleanup(): void {
    for (const [timerKey, interval] of this.timers) {
      clearInterval(interval);
      logger.debug(`Cleaned up timer ${timerKey}`);
    }
    
    this.timers.clear();
    this.timerStates.clear();
    this.eventEmitter.removeAllListeners();
    
    logger.info('TimerService cleaned up');
  }
}

// Create singleton instance
const timerService = new TimerService();

export default timerService;
export { timerService };