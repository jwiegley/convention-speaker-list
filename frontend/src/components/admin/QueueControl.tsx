import { useState } from 'react';

export function QueueControl() {
  const [delegateNumber, setDelegateNumber] = useState('');

  const handleAddToQueue = () => {
    // TODO: Implement add to queue
    console.log('Adding delegate:', delegateNumber);
  };

  const handleAdvanceQueue = () => {
    // TODO: Implement advance queue
    console.log('Advancing queue');
  };

  const handleClearQueue = () => {
    // TODO: Implement clear queue
    if (window.confirm('Are you sure you want to clear the entire queue?')) {
      console.log('Clearing queue');
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
          />
          <button
            onClick={handleAddToQueue}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Advance Queue
          </button>
          <button
            onClick={handleClearQueue}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Clear Queue
          </button>
        </div>
      </div>

      {/* Current Queue Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Current Queue</h3>
        <p className="text-gray-600">Queue display will be implemented here</p>
      </div>
    </div>
  );
}