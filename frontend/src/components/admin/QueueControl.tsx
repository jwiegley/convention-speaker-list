import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '@/utils/config';

interface Delegate {
  id: string;
  name: string;
  number: number;
  country: string;
  gender: string;
  has_spoken: boolean;
}

interface QueueItem {
  id: string;
  delegate: Delegate;
  position: number;
  addedAt: string;
  startedAt?: string;
  endedAt?: string;
}

interface QueueData {
  queue: QueueItem[];
  currentSpeaker: QueueItem | null;
  history: QueueItem[];
  stats: {
    total: number;
    waiting: number;
    speaking: number;
    completed: number;
  };
}

export function QueueControl() {
  const [delegateNumber, setDelegateNumber] = useState('');

  // Fetch delegates
  const { data: delegates = [] } = useQuery<Delegate[]>({
    queryKey: ['delegates'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/delegates`);
      return response.data;
    },
  });

  // Fetch queue data
  const { data: queueData, refetch: refetchQueue } = useQuery<QueueData>({
    queryKey: ['queue'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/queue`);
      return response.data;
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Add to queue mutation
  const addToQueueMutation = useMutation({
    mutationFn: async (delegateId: string) => {
      const response = await axios.post(`${API_BASE_URL}/queue/add`, { delegateId });
      return response.data;
    },
    onSuccess: () => {
      refetchQueue();
      setDelegateNumber('');
    },
    onError: (error: any) => {
      if (error.response?.status === 400 && error.response?.data?.error === 'Duplicate entry') {
        alert('This delegate is already in the queue or currently speaking');
      } else {
        alert('Failed to add delegate to queue');
      }
    },
  });

  // Advance queue mutation
  const advanceQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/queue/advance`);
      return response.data;
    },
    onSuccess: () => {
      refetchQueue();
    },
  });

  // Undo advance mutation
  const undoAdvanceMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/queue/undo`);
      return response.data;
    },
    onSuccess: () => {
      refetchQueue();
    },
  });

  // Remove from queue mutation
  const removeFromQueueMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await axios.delete(`${API_BASE_URL}/queue/${itemId}`);
      return response.data;
    },
    onSuccess: () => {
      refetchQueue();
    },
  });

  const handleAddToQueue = () => {
    const delegate = delegates.find(d => d.number.toString() === delegateNumber);
    if (delegate) {
      addToQueueMutation.mutate(delegate.id);
    } else {
      alert(`Delegate with number ${delegateNumber} not found`);
    }
  };

  const handleAdvanceQueue = () => {
    advanceQueueMutation.mutate();
  };

  const handleUndoAdvance = () => {
    undoAdvanceMutation.mutate();
  };

  const handleRemoveFromQueue = (itemId: string) => {
    if (window.confirm('Remove this delegate from the queue?')) {
      removeFromQueueMutation.mutate(itemId);
    }
  };

  const handleClearQueue = () => {
    if (window.confirm('Are you sure you want to clear everything (queue and current speaker)?')) {
      // Clear all items in queue
      queueData?.queue.forEach(item => {
        removeFromQueueMutation.mutate(item.id);
      });
      // If there's a current speaker, advance to clear them too
      if (queueData?.currentSpeaker) {
        advanceQueueMutation.mutate();
      }
    }
  };

  return (
    <div className="queue-control space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Queue Control</h2>
      
      {/* Add to Queue */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Add Delegate to Queue</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={delegateNumber}
            onChange={(e) => setDelegateNumber(e.target.value)}
            placeholder="Enter delegate number"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && handleAddToQueue()}
          />
          <button
            onClick={handleAddToQueue}
            disabled={!delegateNumber || addToQueueMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Add to Queue
          </button>
        </div>
      </div>

      {/* Queue Actions */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Queue Actions</h3>
        <div className="flex gap-3">
          <button
            onClick={handleAdvanceQueue}
            disabled={(!queueData?.queue.length && !queueData?.currentSpeaker) || advanceQueueMutation.isPending}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            title={queueData?.queue.length ? "Move to next speaker" : "Clear current speaker"}
          >
            {queueData?.queue.length ? "Advance Queue" : "Clear Speaker"}
          </button>
          <button
            onClick={handleUndoAdvance}
            disabled={(!queueData?.history.length && !queueData?.currentSpeaker) || undoAdvanceMutation.isPending}
            className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
          >
            Undo Advance
          </button>
          <button
            onClick={handleClearQueue}
            disabled={!queueData?.queue.length && !queueData?.currentSpeaker}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Current Speaker */}
      {queueData?.currentSpeaker && (
        <div className="bg-green-50 rounded-lg p-4 border-2 border-green-500">
          <h3 className="text-lg font-semibold mb-3 text-green-800">Currently Speaking</h3>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-lg font-medium">
                #{queueData.currentSpeaker.delegate.number} - {queueData.currentSpeaker.delegate.name}
              </p>
              <p className="text-sm text-gray-600">
                {queueData.currentSpeaker.delegate.country} • {queueData.currentSpeaker.delegate.gender}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              Started: {new Date(queueData.currentSpeaker.startedAt!).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Current Queue */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">
          Waiting Queue ({queueData?.queue.length || 0} delegates)
        </h3>
        {queueData?.queue.length ? (
          <div className="space-y-2">
            {queueData.queue.map((item) => (
              <div key={item.id} className="bg-white p-3 rounded flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-semibold">
                    {item.position}
                  </span>
                  <div>
                    <p className="font-medium">
                      #{item.delegate.number} - {item.delegate.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {item.delegate.country} • {item.delegate.gender}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFromQueue(item.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No delegates in queue</p>
        )}
      </div>

      {/* Speaker History */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">
          Speaker History ({queueData?.history.length || 0} speakers)
        </h3>
        {queueData?.history.length ? (
          <div className="space-y-2">
            {queueData.history.map((item, index) => (
              <div key={item.id} className="bg-white p-3 rounded flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded">
                    #{queueData.history.length - index}
                  </span>
                  <div>
                    <p className="font-medium">
                      #{item.delegate.number} - {item.delegate.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {item.delegate.country} • {item.delegate.gender}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {item.startedAt && `${new Date(item.startedAt).toLocaleTimeString()}`}
                  {item.endedAt && ` - ${new Date(item.endedAt).toLocaleTimeString()}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No speakers yet</p>
        )}
      </div>

      {/* Queue Statistics */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Session Statistics</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{queueData?.stats.total || 0}</p>
            <p className="text-sm text-gray-600">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{queueData?.stats.waiting || 0}</p>
            <p className="text-sm text-gray-600">Waiting</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{queueData?.stats.speaking || 0}</p>
            <p className="text-sm text-gray-600">Speaking</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{queueData?.stats.completed || 0}</p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}