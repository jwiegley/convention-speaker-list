import { Request, Response, NextFunction } from 'express';

// Mock delegate data
let mockDelegates = [
  { id: '1', name: 'John Doe', number: 101, gender: 'Male', age_group: '30-39', race_orientation: 'Majority', has_spoken: false, total_speaking_time: 0 },
  { id: '2', name: 'Jane Smith', number: 102, gender: 'Female', age_group: '40-49', race_orientation: 'Minority', has_spoken: false, total_speaking_time: 0 },
  { id: '3', name: 'Bob Johnson', number: 103, gender: 'Male', age_group: '50-59', race_orientation: 'Majority', has_spoken: true, total_speaking_time: 145 },
];

// Mock queue data with history
let mockQueue: any[] = [];
let speakerHistory: any[] = [];
let currentSpeaker: any = null;

// Timer settings
let timerSettings = {
  warningTime: 90,
  limitTime: 120
};

// Mock data middleware for development without database
export const useMockData = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'development' || process.env.USE_REAL_DB) {
    return next();
  }

  // Mock sessions endpoint
  if (req.path === '/api/v1/sessions' && req.method === 'GET') {
    return res.json({
      data: [
        {
          id: 1,
          name: 'Main Session',
          started_at: new Date().toISOString(),
          ended_at: null,
          is_active: true,
          total_speakers: speakerHistory.length + (currentSpeaker ? 1 : 0),
          completed_speakers: speakerHistory.length,
          avg_speaking_time_seconds: 120
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      }
    });
  }

  // Mock current session endpoint
  if (req.path === '/api/v1/sessions/current' && req.method === 'GET') {
    return res.json({
      id: '1',
      name: 'Mock Session',
      code: 'MOCK123',
      status: 'active',
      created_at: new Date().toISOString(),
      settings: {
        allow_self_registration: true,
        speaking_time_limit: 120,
        queue_management_mode: 'manual'
      }
    });
  }

  // Mock delegates endpoint - GET
  if (req.path === '/api/v1/delegates' && req.method === 'GET') {
    return res.json(mockDelegates);
  }

  // Mock create delegate endpoint - POST
  if (req.path === '/api/v1/delegates' && req.method === 'POST') {
    const { name, number, gender, age_group, race_orientation, has_spoken } = req.body;
    const newDelegate = {
      id: String(Date.now()),
      name: name || '',
      number: number || Math.floor(Math.random() * 1000),
      gender: gender || 'Other',
      age_group: age_group || '30-39',
      race_orientation: race_orientation || 'Majority',
      has_spoken: has_spoken || false,
      total_speaking_time: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockDelegates.push(newDelegate);
    return res.status(201).json(newDelegate);
  }

  // Mock update delegate endpoint - PUT
  if (req.path.match(/^\/api\/v1\/delegates\/\d+$/) && req.method === 'PUT') {
    const id = req.path.split('/').pop();
    const delegateIndex = mockDelegates.findIndex(d => d.id === id);
    if (delegateIndex !== -1) {
      mockDelegates[delegateIndex] = {
        ...mockDelegates[delegateIndex],
        ...req.body,
        updated_at: new Date().toISOString()
      };
      return res.json(mockDelegates[delegateIndex]);
    }
    return res.status(404).json({ error: 'Delegate not found' });
  }

  // Mock delete delegate endpoint - DELETE
  if (req.path.match(/^\/api\/v1\/delegates\/\d+$/) && req.method === 'DELETE') {
    const id = req.path.split('/').pop();
    const initialLength = mockDelegates.length;
    mockDelegates = mockDelegates.filter(d => d.id !== id);
    if (mockDelegates.length < initialLength) {
      return res.status(204).send();
    }
    return res.status(404).json({ error: 'Delegate not found' });
  }

  // Mock queue endpoints - GET
  if (req.path === '/api/v1/queue' && req.method === 'GET') {
    return res.json({
      queue: mockQueue,
      currentSpeaker,
      history: speakerHistory,
      stats: {
        total: mockQueue.length + (currentSpeaker ? 1 : 0),
        waiting: mockQueue.length,
        speaking: currentSpeaker ? 1 : 0,
        completed: speakerHistory.length
      }
    });
  }

  // Add to queue endpoint - POST
  if (req.path === '/api/v1/queue/add' && req.method === 'POST') {
    const { delegateId } = req.body;
    const delegate = mockDelegates.find(d => d.id === delegateId);
    if (delegate) {
      // Check if delegate is already in the queue
      const alreadyInQueue = mockQueue.some(item => item.delegate.id === delegateId);
      
      // Check if delegate is currently speaking
      const isCurrentlySpeaking = currentSpeaker && currentSpeaker.delegate.id === delegateId;
      
      if (alreadyInQueue || isCurrentlySpeaking) {
        return res.status(400).json({ 
          error: 'Duplicate entry',
          message: 'This delegate is already in the queue or currently speaking'
        });
      }
      
      const queueItem = {
        id: String(Date.now()),
        delegate,
        position: mockQueue.length + 1,
        addedAt: new Date().toISOString()
      };
      mockQueue.push(queueItem);
      return res.json({
        success: true,
        position: queueItem.position,
        queueItem,
        message: 'Added to queue'
      });
    }
    return res.status(404).json({ error: 'Delegate not found' });
  }

  // Advance queue endpoint - POST
  if (req.path === '/api/v1/queue/advance' && req.method === 'POST') {
    if (currentSpeaker) {
      // Calculate speaking time and update delegate
      const endTime = new Date();
      const startTime = new Date(currentSpeaker.startedAt);
      const speakingSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      
      const delegateIndex = mockDelegates.findIndex(d => d.id === currentSpeaker.delegate.id);
      if (delegateIndex !== -1) {
        mockDelegates[delegateIndex].has_spoken = true;
        mockDelegates[delegateIndex].total_speaking_time += speakingSeconds;
      }
      
      speakerHistory.unshift({
        ...currentSpeaker,
        endedAt: endTime.toISOString(),
        speakingTime: speakingSeconds
      });
    }
    
    if (mockQueue.length > 0) {
      currentSpeaker = {
        ...mockQueue.shift(),
        startedAt: new Date().toISOString()
      };
    } else {
      currentSpeaker = null;
    }
    
    // Update queue positions
    mockQueue.forEach((item, index) => {
      item.position = index + 1;
    });
    
    return res.json({
      success: true,
      currentSpeaker,
      queue: mockQueue,
      history: speakerHistory
    });
  }

  // Undo advance endpoint - POST
  if (req.path === '/api/v1/queue/undo' && req.method === 'POST') {
    // Case 1: There's history - restore the last completed speaker
    if (speakerHistory.length > 0) {
      const lastSpeaker = speakerHistory.shift();
      
      // Revert the has_spoken status for the speaker being moved back
      const delegateIndex = mockDelegates.findIndex(d => d.id === lastSpeaker.delegate.id);
      if (delegateIndex !== -1) {
        // Check if this delegate has other entries in history
        const otherAppearances = speakerHistory.some(h => h.delegate.id === lastSpeaker.delegate.id);
        if (!otherAppearances) {
          mockDelegates[delegateIndex].has_spoken = false;
        }
      }
      
      // Move current speaker back to front of queue if exists
      if (currentSpeaker) {
        mockQueue.unshift({
          ...currentSpeaker,
          position: 1
        });
        delete currentSpeaker.startedAt;
      }
      
      // Make last speaker from history the current speaker
      currentSpeaker = {
        ...lastSpeaker,
        startedAt: lastSpeaker.startedAt
      };
      delete currentSpeaker.endedAt;
      
      // Update queue positions
      mockQueue.forEach((item, index) => {
        item.position = index + 1;
      });
      
      return res.json({
        success: true,
        currentSpeaker,
        queue: mockQueue,
        history: speakerHistory
      });
    }
    
    // Case 2: No history but there's a current speaker - move them back to queue
    if (currentSpeaker) {
      // Revert the has_spoken status for the current speaker
      const delegateIndex = mockDelegates.findIndex(d => d.id === currentSpeaker.delegate.id);
      if (delegateIndex !== -1) {
        mockDelegates[delegateIndex].has_spoken = false;
      }
      
      // Move current speaker back to front of queue
      mockQueue.unshift({
        ...currentSpeaker,
        position: 1
      });
      delete currentSpeaker.startedAt;
      
      // Clear current speaker
      currentSpeaker = null;
      
      // Update queue positions
      mockQueue.forEach((item, index) => {
        item.position = index + 1;
      });
      
      return res.json({
        success: true,
        currentSpeaker,
        queue: mockQueue,
        history: speakerHistory
      });
    }
    
    return res.json({
      success: false,
      message: 'Nothing to undo'
    });
  }

  // Remove from queue endpoint - DELETE
  if (req.path.match(/^\/api\/v1\/queue\/\w+$/) && req.method === 'DELETE') {
    const id = req.path.split('/').pop();
    const initialLength = mockQueue.length;
    mockQueue = mockQueue.filter(item => item.id !== id);
    
    if (mockQueue.length < initialLength) {
      // Update positions
      mockQueue.forEach((item, index) => {
        item.position = index + 1;
      });
      return res.json({
        success: true,
        queue: mockQueue
      });
    }
    
    return res.status(404).json({ error: 'Queue item not found' });
  }

  // Get timer settings endpoint - GET
  if (req.path === '/api/v1/settings/timer' && req.method === 'GET') {
    return res.json(timerSettings);
  }

  // Update timer settings endpoint - PUT
  if (req.path === '/api/v1/settings/timer' && req.method === 'PUT') {
    const { warningTime, limitTime } = req.body;
    if (warningTime !== undefined) timerSettings.warningTime = warningTime;
    if (limitTime !== undefined) timerSettings.limitTime = limitTime;
    return res.json(timerSettings);
  }

  next();
};