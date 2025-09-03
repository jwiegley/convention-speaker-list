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
    <div className="h-screen bg-gray-900 text-white p-2 flex flex-col overflow-hidden">
      {/* Top Section - Current and Next Speakers */}
      <div className="grid grid-cols-2 gap-2 mb-2 flex-shrink-0" style={{ height: '32vh' }}>
        {/* Left: Current Speaker */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-4 flex flex-col shadow-2xl">
          <h2 className="text-xl font-bold mb-2 text-green-100 flex-shrink-0">Currently Speaking</h2>
          <div className="flex-grow flex items-center justify-center">
            {currentSpeaker ? (
              <div className={`rounded-lg p-4 w-full h-full flex flex-col justify-center ${
                currentSpeaker.delegate.has_spoken ? 'bg-blue-600 text-white' : 'bg-yellow-400 text-black'
              }`}>
                <div className="text-9xl font-bold text-center mb-2" style={{ fontSize: '10rem', lineHeight: '1' }}>{currentSpeaker.delegate.number}</div>
                <div className="text-5xl text-center font-semibold">{currentSpeaker.delegate.name}</div>
              </div>
            ) : (
              <div className="text-3xl text-green-200 text-center">No current speaker</div>
            )}
          </div>
        </div>

        {/* Right: Next Two Speakers */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-4 flex flex-col shadow-2xl">
          <h2 className="text-xl font-bold mb-2 text-blue-100 flex-shrink-0">Next Speakers</h2>
          <div className="flex-grow flex flex-col justify-center gap-2">
            {nextTwo.length > 0 ? (
              nextTwo.map((item, index) => (
                <div key={item.id} className={`rounded-lg p-4 flex-1 flex items-center ${
                  item.delegate.has_spoken ? 'bg-blue-600 text-white' : 'bg-yellow-400 text-black'
                }`} style={{ minHeight: nextTwo.length === 1 ? '50%' : 'auto' }}>
                  <div className="flex-grow">
                    <div className="text-5xl font-bold mb-1">{item.delegate.number}</div>
                    <div className="text-3xl font-semibold">{item.delegate.name}</div>
                  </div>
                  <div className={`text-2xl font-bold px-4 ${
                    item.delegate.has_spoken ? 'text-white' : 'text-black'
                  }`}>
                    {index === 0 ? 'NEXT' : '2nd'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-2xl text-blue-200 text-center">No speakers in queue</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Queue Lists */}
      <div className="grid grid-cols-2 gap-2 flex-grow overflow-hidden">
        {/* Left: Next 10 with Names */}
        <div className="bg-gray-800 rounded-xl p-3 shadow-xl flex flex-col overflow-hidden">
          <h3 className="text-lg font-bold mb-2 text-gray-200 flex-shrink-0">
            Next 10 Speakers
          </h3>
          <div className="space-y-1.5 overflow-y-auto flex-grow">
            {nextTen.length > 0 ? (
              nextTen.map((item, index) => (
                <div key={item.id} className={`rounded p-2 flex items-center justify-between transition-colors ${
                  item.delegate.has_spoken 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-yellow-400 text-black hover:bg-yellow-500'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold">{item.delegate.number}</div>
                    <div className="text-base">{item.delegate.name}</div>
                  </div>
                  <div className={`text-sm font-semibold ${item.delegate.has_spoken ? 'text-gray-200' : 'text-gray-700'}`}>{index + 3}</div>
                </div>
              ))
            ) : (
              <div className="text-gray-400 text-center py-4">No additional speakers</div>
            )}
          </div>
        </div>

        {/* Right: Remaining Numbers Only */}
        <div className="bg-gray-800 rounded-xl p-3 shadow-xl flex flex-col overflow-hidden">
          <h3 className="text-lg font-bold mb-2 text-gray-200 flex-shrink-0">
            Remaining Queue ({remaining.length} speakers)
          </h3>
          <div className="grid grid-cols-4 gap-1.5 overflow-y-auto flex-grow content-start">
            {remaining.length > 0 ? (
              remaining.map((item) => (
                <div key={item.id} className={`rounded p-2 flex items-center justify-center transition-colors ${
                  item.delegate.has_spoken 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-yellow-400 text-black hover:bg-yellow-500'
                }`} style={{ aspectRatio: '1 / 1' }}>
                  <div className="text-base font-bold">{item.delegate.number}</div>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-gray-400 text-center py-4">No more speakers</div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="mt-2 bg-gray-800 border-t border-gray-700 px-3 py-1 flex-shrink-0">
        <div className="flex justify-around max-w-4xl mx-auto">
          <div className="text-center">
            <span className="text-gray-400 text-xs">Total: </span>
            <span className="text-base font-bold text-blue-400">{queueData?.stats.total || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Waiting: </span>
            <span className="text-base font-bold text-yellow-400">{queueData?.stats.waiting || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Speaking: </span>
            <span className="text-base font-bold text-green-400">{queueData?.stats.speaking || 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-400 text-xs">Completed: </span>
            <span className="text-base font-bold text-gray-400">{queueData?.stats.completed || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}