import type { Speaker } from '../types';

interface CurrentSpeakerProps {
  speaker?: Speaker;
}

export function CurrentSpeaker({ speaker }: CurrentSpeakerProps) {
  return (
    <div className="current-speaker bg-green-900/20 border-2 border-green-500 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-green-400 mb-4">Current Speaker</h3>
      {speaker ? (
        <div className="space-y-2">
          <p className="text-3xl font-bold text-green-300">{speaker.name}</p>
          <p className="text-xl text-gray-300">{speaker.country}</p>
          {speaker.organization && (
            <p className="text-sm text-gray-400">{speaker.organization}</p>
          )}
        </div>
      ) : (
        <p className="text-gray-500 italic">No current speaker</p>
      )}
    </div>
  );
}