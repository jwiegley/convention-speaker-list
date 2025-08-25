import type { Speaker } from '../types';

interface NextSpeakerProps {
  speaker?: Speaker;
}

export function NextSpeaker({ speaker }: NextSpeakerProps) {
  return (
    <div className="next-speaker bg-orange-900/20 border-2 border-orange-500 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-orange-400 mb-4">Next Speaker</h3>
      {speaker ? (
        <div className="space-y-2">
          <p className="text-2xl font-bold text-orange-300">{speaker.name}</p>
          <p className="text-lg text-gray-300">{speaker.country}</p>
          {speaker.organization && (
            <p className="text-sm text-gray-400">{speaker.organization}</p>
          )}
        </div>
      ) : (
        <p className="text-gray-500 italic">No next speaker</p>
      )}
    </div>
  );
}