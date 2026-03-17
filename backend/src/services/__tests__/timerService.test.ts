describe('TimerService', () => {
  let TimerService: any;
  let timerService: any;
  let originalDateNow: () => number;
  let mockLogger: any;

  beforeAll(() => {
    // Set up logger mock
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Mock dependencies
    jest.mock('../../utils/logger', () => ({
      __esModule: true,
      default: mockLogger,
    }));

    jest.mock('../speakingInstanceService');
  });

  beforeEach(() => {
    // Clear all modules to ensure fresh imports
    jest.resetModules();

    // Clear all timers and mocks before each test
    jest.clearAllTimers();
    jest.clearAllMocks();

    // Use fake timers for precise control
    jest.useFakeTimers();

    // Set a fixed system time
    originalDateNow = Date.now;
    jest.setSystemTime(new Date(1000000000000));

    // Helper to advance time (advances both timers and system clock)
    (global as any).advanceTime = (ms: number) => {
      jest.advanceTimersByTime(ms);
    };

    // Set up the logger mock again for this module context
    jest.doMock('../../utils/logger', () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      },
    }));

    jest.doMock('../speakingInstanceService');

    // Now require the module (this will create the singleton)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('../timerService');
    TimerService = module.TimerService;

    // Create a new instance for testing
    timerService = new TimerService();
  });

  afterEach(() => {
    // Cleanup
    if (timerService && typeof timerService.cleanup === 'function') {
      timerService.cleanup();
    }
    jest.useRealTimers();
    Date.now = originalDateNow;
    jest.resetModules();
  });

  describe('Timer Lifecycle', () => {
    test('should start a timer with default duration', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      const state = timerService.getTimerState(sessionId, delegateId);
      expect(state).toBeDefined();
      expect(state?.duration).toBe(180);
      expect(state?.remainingTime).toBe(180);
      expect(state?.isRunning).toBe(true);
      expect(state?.isPaused).toBe(false);
      expect(state?.delegateId).toBe(delegateId);
    });

    test('should start a timer with custom duration', () => {
      const sessionId = 'session-1';
      const duration = 300; // 5 minutes

      timerService.startTimer(sessionId, duration);

      const state = timerService.getTimerState(sessionId);
      expect(state?.duration).toBe(duration);
      expect(state?.remainingTime).toBe(duration);
    });

    test('should stop a timer', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);
      timerService.stopTimer(sessionId, delegateId);

      const state = timerService.getTimerState(sessionId, delegateId);
      expect(state).toBeNull();
    });

    test('should reset a timer', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Advance time by 60 seconds
      (global as any).advanceTime(60000);

      const stateBeforeReset = timerService.getTimerState(sessionId, delegateId);
      expect(stateBeforeReset?.remainingTime).toBe(120);

      timerService.resetTimer(sessionId, delegateId);

      const stateAfterReset = timerService.getTimerState(sessionId, delegateId);
      expect(stateAfterReset?.remainingTime).toBe(180);
      expect(stateAfterReset?.isRunning).toBe(true);
    });
  });

  describe('Timer Accuracy', () => {
    test('should maintain timer accuracy', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Advance 30 seconds
      (global as any).advanceTime(30000);
      let state = timerService.getTimerState(sessionId, delegateId);
      expect(state?.remainingTime).toBe(150);

      // Advance another 60 seconds
      (global as any).advanceTime(60000);
      state = timerService.getTimerState(sessionId, delegateId);
      expect(state?.remainingTime).toBe(90);

      // Advance to near expiration
      (global as any).advanceTime(89000);
      state = timerService.getTimerState(sessionId, delegateId);
      expect(state?.remainingTime).toBe(1);
    });

    test('should handle timer expiration', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 3, delegateId); // 3 second timer

      // Advance to expiration
      (global as any).advanceTime(3000);

      const state = timerService.getTimerState(sessionId, delegateId);
      expect(state).toBeNull(); // Timer should be automatically removed
    });

    test('should emit tick events', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';
      const tickEvents: any[] = [];

      timerService.onTimerEvent((event: any) => {
        if (event.type === 'tick') {
          tickEvents.push(event);
        }
      });

      timerService.startTimer(sessionId, 5, delegateId);

      // Advance 4 seconds (should get 4 tick events)
      for (let i = 0; i < 4; i++) {
        (global as any).advanceTime(1000);
      }

      expect(tickEvents).toHaveLength(4);
      expect(tickEvents[0]?.remainingTime).toBe(4);
      expect(tickEvents[3]?.remainingTime).toBe(1);
    });
  });

  describe('Pause and Resume', () => {
    test('should pause and maintain time', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Run for 60 seconds
      (global as any).advanceTime(60000);

      const stateBeforePause = timerService.getTimerState(sessionId, delegateId);
      expect(stateBeforePause?.remainingTime).toBe(120);

      timerService.pauseTimer(sessionId, delegateId);

      const pausedState = timerService.getTimerState(sessionId, delegateId);
      expect(pausedState?.isPaused).toBe(true);
      expect(pausedState?.remainingTime).toBe(120);

      // Wait 30 seconds while paused
      (global as any).advanceTime(30000);

      // Time should not have changed
      const stillPausedState = timerService.getTimerState(sessionId, delegateId);
      expect(stillPausedState?.remainingTime).toBe(120);
    });

    test('should resume correctly', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Run for 60 seconds
      (global as any).advanceTime(60000);

      timerService.pauseTimer(sessionId, delegateId);

      // Wait 30 seconds while paused
      (global as any).advanceTime(30000);

      timerService.resumeTimer(sessionId, delegateId);

      const resumedState = timerService.getTimerState(sessionId, delegateId);
      expect(resumedState?.isPaused).toBe(false);
      expect(resumedState?.isRunning).toBe(true);
      expect(resumedState?.remainingTime).toBe(120);

      // Continue for another 60 seconds
      (global as any).advanceTime(60000);

      const finalState = timerService.getTimerState(sessionId, delegateId);
      expect(finalState?.remainingTime).toBe(60);
    });

    test('should handle rapid pause/resume', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Rapid pause/resume cycle
      for (let i = 0; i < 5; i++) {
        (global as any).advanceTime(5000); // 5 seconds running
        timerService.pauseTimer(sessionId, delegateId);
        (global as any).advanceTime(2000); // 2 seconds paused
        timerService.resumeTimer(sessionId, delegateId);
      }

      // Total running time: 5 * 5 = 25 seconds
      const finalState = timerService.getTimerState(sessionId, delegateId);
      expect(finalState?.remainingTime).toBe(155); // 180 - 25
    });
  });

  describe('Timer Events', () => {
    test('should emit events correctly', () => {
      const sessionId = 'session-1';
      const events: any[] = [];

      timerService.onTimerEvent((event: any) => {
        events.push(event.type);
      });

      timerService.startTimer(sessionId, 180);
      expect(events).toContain('start');

      timerService.pauseTimer(sessionId);
      expect(events).toContain('pause');

      timerService.resumeTimer(sessionId);
      expect(events).toContain('resume');

      timerService.stopTimer(sessionId);
      expect(events).toContain('stop');
    });

    test('should emit warning at 30 seconds', (done) => {
      const sessionId = 'session-1';

      timerService.onTimerEvent((event: any) => {
        if (event.type === 'warning') {
          expect(event.remainingTime).toBe(30);
          done();
        }
      });

      timerService.startTimer(sessionId, 60);

      // Advance to warning threshold
      (global as any).advanceTime(30000);
    });

    test('should emit expired event', (done) => {
      const sessionId = 'session-1';

      timerService.onTimerEvent((event: any) => {
        if (event.type === 'expired') {
          expect(event.remainingTime).toBe(0);
          done();
        }
      });

      timerService.startTimer(sessionId, 2);

      // Advance to expiration
      (global as any).advanceTime(2000);
    });
  });

  describe('Multiple Timers', () => {
    test('should handle multiple timers', () => {
      timerService.startTimer('session-1', 180);
      timerService.startTimer('session-2', 120);
      timerService.startTimer('session-3', 60);

      (global as any).advanceTime(30000);

      const state1 = timerService.getTimerState('session-1');
      const state2 = timerService.getTimerState('session-2');
      const state3 = timerService.getTimerState('session-3');

      expect(state1?.remainingTime).toBe(150);
      expect(state2?.remainingTime).toBe(90);
      expect(state3?.remainingTime).toBe(30);
    });

    test('should handle delegate timers', () => {
      const sessionId = 'session-1';

      timerService.startTimer(sessionId, 180, 'delegate-1');
      timerService.startTimer(sessionId, 120, 'delegate-2');

      (global as any).advanceTime(60000);

      const state1 = timerService.getTimerState(sessionId, 'delegate-1');
      const state2 = timerService.getTimerState(sessionId, 'delegate-2');

      expect(state1?.remainingTime).toBe(120);
      expect(state2?.remainingTime).toBe(60);
    });

    test('should get all session timers', () => {
      const sessionId = 'session-1';

      timerService.startTimer(sessionId, 180, 'delegate-1');
      timerService.startTimer(sessionId, 120, 'delegate-2');
      timerService.startTimer(sessionId, 60, 'delegate-3');

      const sessionTimers = timerService.getSessionTimers(sessionId);

      expect(sessionTimers).toHaveLength(3);
      expect(sessionTimers.map((t: any) => t.delegateId).sort()).toEqual([
        'delegate-1',
        'delegate-2',
        'delegate-3',
      ]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero duration', () => {
      const sessionId = 'session-1';

      timerService.startTimer(sessionId, 0);
      const state = timerService.getTimerState(sessionId);
      expect(state?.duration).toBe(180); // Should use default
    });

    test('should handle negative duration', () => {
      const sessionId = 'session-1';

      timerService.startTimer(sessionId, -10);
      const state = timerService.getTimerState(sessionId);
      // Implementation uses `duration || DEFAULT` which only defaults for 0/null/undefined
      // Negative durations are used as-is
      expect(state?.duration).toBe(-10);
    });

    test('should handle cleanup', () => {
      timerService.startTimer('session-1', 180);
      timerService.startTimer('session-2', 120);

      timerService.cleanup();

      const state1 = timerService.getTimerState('session-1');
      const state2 = timerService.getTimerState('session-2');

      expect(state1).toBeNull();
      expect(state2).toBeNull();
    });

    test('should handle very short timers', () => {
      const sessionId = 'session-1';

      timerService.startTimer(sessionId, 1);

      const initialState = timerService.getTimerState(sessionId);
      expect(initialState?.remainingTime).toBe(1);

      (global as any).advanceTime(1000);

      const finalState = timerService.getTimerState(sessionId);
      expect(finalState).toBeNull(); // Should be expired
    });
  });

  describe('Performance', () => {
    test('should handle many timers', () => {
      // Create 50 timers
      for (let i = 0; i < 50; i++) {
        timerService.startTimer(`session-${i}`, 180, `delegate-${i}`);
      }

      // Advance time
      (global as any).advanceTime(60000);

      // Check all timers
      for (let i = 0; i < 50; i++) {
        const state = timerService.getTimerState(`session-${i}`, `delegate-${i}`);
        expect(state?.remainingTime).toBe(120);
      }

      // Performance check: just ensure all timers were created and tracked
      const sessionTimers = timerService.getSessionTimers('session-0');
      expect(sessionTimers).toHaveLength(1);
    });
  });

  describe('Integration', () => {
    test('should handle speaker flow', () => {
      const sessionId = 'session-1';
      const events: any[] = [];

      timerService.onTimerEvent((event: any) => {
        events.push(event);
      });

      // First speaker starts
      timerService.startTimer(sessionId, 180, 'delegate-1');

      // Speaking for 90 seconds
      (global as any).advanceTime(90000);

      // Queue advances - stop current, start next
      timerService.stopTimer(sessionId, 'delegate-1');
      timerService.startTimer(sessionId, 180, 'delegate-2');

      // Verify states
      const state1 = timerService.getTimerState(sessionId, 'delegate-1');
      const state2 = timerService.getTimerState(sessionId, 'delegate-2');

      expect(state1).toBeNull();
      expect(state2?.remainingTime).toBe(180);
      expect(state2?.delegateId).toBe('delegate-2');

      // Check events
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('stop');
    });

    test('should handle pause during speech', () => {
      const sessionId = 'session-1';
      const delegateId = 'delegate-1';

      timerService.startTimer(sessionId, 180, delegateId);

      // Speaking for 1 minute
      (global as any).advanceTime(60000);

      // Technical issue - pause
      timerService.pauseTimer(sessionId, delegateId);
      let state = timerService.getTimerState(sessionId, delegateId);
      expect(state?.remainingTime).toBe(120);
      expect(state?.isPaused).toBe(true);

      // Wait 10 seconds
      (global as any).advanceTime(10000);

      // Resume
      timerService.resumeTimer(sessionId, delegateId);
      state = timerService.getTimerState(sessionId, delegateId);
      expect(state?.remainingTime).toBe(120); // Should still be 120
      expect(state?.isPaused).toBe(false);

      // Continue for remaining time
      (global as any).advanceTime(120000);

      // Should be expired
      state = timerService.getTimerState(sessionId, delegateId);
      expect(state).toBeNull();
    });
  });
});
