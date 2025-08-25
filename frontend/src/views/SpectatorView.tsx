import { useEffect, useState } from 'react';
import { CurrentSpeaker } from '../components/CurrentSpeaker';
import { NextSpeaker } from '../components/NextSpeaker';
import { FollowingSpeaker } from '../components/FollowingSpeaker';
import { QueueGrid } from '../components/QueueGrid';
import { useWebSocket } from '../hooks/useWebSocket';
import { useQueue } from '../hooks/useQueue';

export function SpectatorView() {
  const { isConnected } = useWebSocket();
  const { queue, currentSpeaker, nextSpeaker, followingSpeaker } = useQueue();

  return (
    <div className="spectator-view min-h-screen bg-gray-900 text-white p-8">
      {/* Connection Status */}
      <div className="absolute top-4 right-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
          isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span className="text-sm font-medium">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">
          Convention Speaker Queue
        </h1>

        {/* Speaker Display Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <CurrentSpeaker speaker={currentSpeaker} />
          <NextSpeaker speaker={nextSpeaker} />
          <FollowingSpeaker speaker={followingSpeaker} />
        </div>

        {/* Queue Grid */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-semibold mb-6">Queue Positions</h2>
          <QueueGrid queue={queue} />
        </div>
      </div>
    </div>
  );
}