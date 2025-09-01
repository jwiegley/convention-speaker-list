import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '@/utils/config';

interface Delegate {
  id: string;
  name: string;
  number: number;
  gender: string;
  age_group?: string;
  race_orientation?: string;
  has_spoken: boolean;
}

interface QueueItem {
  id: string;
  delegate: Delegate;
  position: number;
  addedAt: string;
  startedAt?: string;
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

export function SpectatorView() {
  // Fetch queue data with auto-refresh
  const { data: queueData } = useQuery<QueueData>({
    queryKey: ['queue'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/queue`);
      return response.data;
    },
    refetchInterval: 1000, // Refresh every second for real-time updates
  });

  // Extract speakers from queue
  const currentSpeaker = queueData?.currentSpeaker;
  const nextTwo = queueData?.queue.slice(0, 2) || [];
  const nextTen = queueData?.queue.slice(2, 12) || [];
  const remaining = queueData?.queue.slice(12) || [];

  return (
    <div className="h-screen bg-gray-900 text-white p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-4xl font-bold text-center">Convention Speaker Queue</h1>
        <div className="flex justify-center mt-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium">Live Updates</span>
          </div>
        </div>
      </div>

      {/* Top Section - Current and Next Speakers */}
      <div className="grid grid-cols-2 gap-4 mb-4 flex-shrink-0" style={{ height: '30vh' }}>
        {/* Left: Current Speaker */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-6 flex flex-col justify-center shadow-2xl">
          <h2 className="text-2xl font-bold mb-3 text-green-100">Currently Speaking</h2>
          {currentSpeaker ? (
            <div className={`backdrop-blur rounded-xl p-4 ${
              currentSpeaker.delegate.has_spoken ? 'bg-blue-500/20' : 'bg-yellow-500/20'
            }`}>
              <div className="text-4xl font-bold mb-1">#{currentSpeaker.delegate.number}</div>
              <div className="text-2xl">{currentSpeaker.delegate.name}</div>
            </div>
          ) : (
            <div className="text-xl text-green-200">No current speaker</div>
          )}
        </div>

        {/* Right: Next Two Speakers */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-2xl font-bold mb-3 text-blue-100">Next Speakers</h2>
          <div className="space-y-3">
            {nextTwo.length > 0 ? (
              nextTwo.map((item, index) => (
                <div key={item.id} className={`backdrop-blur rounded-xl p-3 ${
                  item.delegate.has_spoken ? 'bg-blue-500/20' : 'bg-yellow-500/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold">#{item.delegate.number}</div>
                      <div className="text-xl">{item.delegate.name}</div>
                    </div>
                    <div className="text-2xl font-bold text-blue-300">
                      {index === 0 ? 'NEXT' : '2nd'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-lg text-blue-200">No speakers in queue</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Queue Lists */}
      <div className="grid grid-cols-2 gap-4 flex-grow overflow-hidden">
        {/* Left: Next 10 with Names */}
        <div className="bg-gray-800 rounded-2xl p-4 shadow-xl flex flex-col overflow-hidden">
          <h3 className="text-xl font-bold mb-3 text-gray-200 flex-shrink-0">
            Next 10 Speakers
          </h3>
          <div className="space-y-1 overflow-y-auto flex-grow">
            {nextTen.length > 0 ? (
              nextTen.map((item, index) => (
                <div key={item.id} className={`rounded-lg p-2 flex items-center justify-between transition-colors ${
                  item.delegate.has_spoken 
                    ? 'bg-blue-700/50 hover:bg-blue-600/50' 
                    : 'bg-yellow-700/50 hover:bg-yellow-600/50'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold">#{item.delegate.number}</div>
                    <div className="text-base">{item.delegate.name}</div>
                  </div>
                  <div className="text-xs text-gray-400">Position {index + 3}</div>
                </div>
              ))
            ) : (
              <div className="text-gray-400 text-center py-4">No additional speakers</div>
            )}
          </div>
        </div>

        {/* Right: Remaining Numbers Only */}
        <div className="bg-gray-800 rounded-2xl p-4 shadow-xl flex flex-col overflow-hidden">
          <h3 className="text-xl font-bold mb-3 text-gray-200 flex-shrink-0">
            Remaining Queue ({remaining.length} speakers)
          </h3>
          <div className="grid grid-cols-4 gap-1 overflow-y-auto flex-grow">
            {remaining.length > 0 ? (
              remaining.map((item) => (
                <div key={item.id} className={`rounded-lg p-2 text-center transition-colors ${
                  item.delegate.has_spoken 
                    ? 'bg-blue-700/50 hover:bg-blue-600/50' 
                    : 'bg-yellow-700/50 hover:bg-yellow-600/50'
                }`}>
                  <div className="text-base font-bold">#{item.delegate.number}</div>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-gray-400 text-center py-4">No more speakers</div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="mt-4 bg-gray-800 border-t border-gray-700 px-4 py-2 flex-shrink-0">
        <div className="flex justify-around max-w-4xl mx-auto">
          <div className="text-center">
            <span className="text-gray-400 text-xs">Total: </span>
            <span className="text-lg font-bold text-blue-400">{queueData?.stats.total || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Waiting: </span>
            <span className="text-lg font-bold text-yellow-400">{queueData?.stats.waiting || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Speaking: </span>
            <span className="text-lg font-bold text-green-400">{queueData?.stats.speaking || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Completed: </span>
            <span className="text-lg font-bold text-gray-400">{queueData?.stats.completed || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}