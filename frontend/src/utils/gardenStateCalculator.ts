/**
 * Garden State Calculator
 * Manages the garden visualization state based on speaker timing performance
 */

export interface SpeakerPerformance {
  speakerId: string;
  allocatedTime: number; // in seconds
  actualTime: number; // in seconds
  timestamp: Date;
}

export interface GardenStateConfig {
  initialState?: number; // Starting state (0-32), default 16
  earlyThreshold?: number; // Percentage of allocated time for "early" (default 90%)
  lateThreshold?: number; // Percentage of allocated time for "late" (default 110%)
  sensitivityFactor?: number; // Multiplier for state changes (default 1)
  minState?: number; // Minimum state (default 0)
  maxState?: number; // Maximum state (default 32)
}

export interface GardenStateChange {
  previousState: number;
  newState: number;
  change: number;
  reason: 'early' | 'on-time' | 'late';
  performance: SpeakerPerformance;
  timestamp: Date;
}

export class GardenStateCalculator {
  private currentState: number;
  private config: Required<GardenStateConfig>;
  private history: GardenStateChange[] = [];
  private performanceHistory: SpeakerPerformance[] = [];

  constructor(config: GardenStateConfig = {}) {
    this.config = {
      initialState: config.initialState ?? 16,
      earlyThreshold: config.earlyThreshold ?? 0.9,
      lateThreshold: config.lateThreshold ?? 1.1,
      sensitivityFactor: config.sensitivityFactor ?? 1,
      minState: config.minState ?? 0,
      maxState: config.maxState ?? 32,
    };

    this.currentState = this.config.initialState;
  }

  /**
   * Calculate state change based on speaker performance
   */
  public calculateStateChange(performance: SpeakerPerformance): GardenStateChange {
    const timeRatio = performance.actualTime / performance.allocatedTime;
    const previousState = this.currentState;
    let change = 0;
    let reason: 'early' | 'on-time' | 'late' = 'on-time';

    if (timeRatio < this.config.earlyThreshold) {
      // Speaker finished early - move toward garden
      const earlyPercentage = (this.config.earlyThreshold - timeRatio) / this.config.earlyThreshold;
      change = Math.ceil(earlyPercentage * 2 * this.config.sensitivityFactor); // +1 or +2 based on how early
      reason = 'early';
    } else if (timeRatio > this.config.lateThreshold) {
      // Speaker went over time - move toward desert
      const latePercentage =
        (timeRatio - this.config.lateThreshold) / (2 - this.config.lateThreshold);
      change = -Math.ceil(latePercentage * 2 * this.config.sensitivityFactor); // -1 or -2 based on how late
      reason = 'late';
    }
    // On-time speakers (between thresholds) don't change the state

    // Apply change with bounds checking
    const newState = this.clampState(this.currentState + change);
    this.currentState = newState;

    // Record the change
    const stateChange: GardenStateChange = {
      previousState,
      newState,
      change: newState - previousState,
      reason,
      performance,
      timestamp: new Date(),
    };

    this.history.push(stateChange);
    this.performanceHistory.push(performance);

    return stateChange;
  }

  /**
   * Process multiple speaker performances at once
   */
  public processBatch(performances: SpeakerPerformance[]): GardenStateChange[] {
    return performances.map((perf) => this.calculateStateChange(perf));
  }

  /**
   * Get current garden state
   */
  public getCurrentState(): number {
    return this.currentState;
  }

  /**
   * Set the garden state directly (useful for initialization from saved state)
   */
  public setState(state: number): void {
    this.currentState = this.clampState(state);
  }

  /**
   * Reset to initial state
   */
  public reset(): void {
    this.currentState = this.config.initialState;
    this.history = [];
    this.performanceHistory = [];
  }

  /**
   * Get change history
   */
  public getHistory(): GardenStateChange[] {
    return [...this.history];
  }

  /**
   * Get performance statistics
   */
  public getStatistics() {
    if (this.performanceHistory.length === 0) {
      return {
        totalSpeakers: 0,
        avgTimeRatio: 0,
        earlyCount: 0,
        onTimeCount: 0,
        lateCount: 0,
        totalStateChange: 0,
        currentTrend: 'stable' as 'improving' | 'declining' | 'stable',
      };
    }

    const earlyCount = this.history.filter((h) => h.reason === 'early').length;
    const onTimeCount = this.history.filter((h) => h.reason === 'on-time').length;
    const lateCount = this.history.filter((h) => h.reason === 'late').length;

    const avgTimeRatio =
      this.performanceHistory.reduce((sum, perf) => sum + perf.actualTime / perf.allocatedTime, 0) /
      this.performanceHistory.length;

    const totalStateChange = this.currentState - this.config.initialState;

    // Determine trend based on last 5 speakers
    const recentChanges = this.history.slice(-5);
    const recentTotalChange = recentChanges.reduce((sum, change) => sum + change.change, 0);
    const currentTrend =
      recentTotalChange > 1 ? 'improving' : recentTotalChange < -1 ? 'declining' : 'stable';

    return {
      totalSpeakers: this.performanceHistory.length,
      avgTimeRatio,
      earlyCount,
      onTimeCount,
      lateCount,
      totalStateChange,
      currentTrend,
    };
  }

  /**
   * Get a descriptive label for the current state
   */
  public getStateDescription(): string {
    const percentage = (this.currentState / this.config.maxState) * 100;

    if (percentage === 0) return 'Barren Desert';
    if (percentage <= 25) return 'Arid Landscape';
    if (percentage <= 50) return 'Emerging Growth';
    if (percentage <= 75) return 'Flourishing Garden';
    if (percentage < 100) return 'Lush Paradise';
    return 'Perfect Garden';
  }

  /**
   * Predict future state based on current performance trend
   */
  public predictFutureState(speakersAhead: number): {
    optimistic: number;
    realistic: number;
    pessimistic: number;
  } {
    const stats = this.getStatistics();

    if (this.performanceHistory.length === 0) {
      return {
        optimistic: this.currentState,
        realistic: this.currentState,
        pessimistic: this.currentState,
      };
    }

    // Calculate average change per speaker
    const avgChangePerSpeaker = stats.totalStateChange / stats.totalSpeakers;

    // Realistic prediction based on average
    const realistic = this.clampState(
      this.currentState + Math.round(avgChangePerSpeaker * speakersAhead)
    );

    // Optimistic: assume all speakers finish early
    const optimistic = this.clampState(
      this.currentState + speakersAhead * this.config.sensitivityFactor
    );

    // Pessimistic: assume all speakers go late
    const pessimistic = this.clampState(
      this.currentState - speakersAhead * this.config.sensitivityFactor
    );

    return { optimistic, realistic, pessimistic };
  }

  /**
   * Export state for persistence
   */
  public exportState() {
    return {
      currentState: this.currentState,
      config: this.config,
      history: this.history,
      performanceHistory: this.performanceHistory,
    };
  }

  /**
   * Import saved state
   */
  public importState(savedState: ReturnType<typeof this.exportState>) {
    this.currentState = savedState.currentState;
    this.config = savedState.config;
    this.history = savedState.history;
    this.performanceHistory = savedState.performanceHistory;
  }

  /**
   * Clamp state value within configured bounds
   */
  private clampState(state: number): number {
    return Math.max(this.config.minState, Math.min(this.config.maxState, Math.floor(state)));
  }
}

// Export singleton instance for app-wide use
export const gardenStateCalculator = new GardenStateCalculator();

// Export helper function for quick calculations
export function calculateGardenStateChange(
  allocatedTime: number,
  actualTime: number,
  currentState: number = 16
): { newState: number; change: number; reason: string } {
  const calculator = new GardenStateCalculator({ initialState: currentState });
  const result = calculator.calculateStateChange({
    speakerId: 'temp',
    allocatedTime,
    actualTime,
    timestamp: new Date(),
  });

  return {
    newState: result.newState,
    change: result.change,
    reason: result.reason,
  };
}
