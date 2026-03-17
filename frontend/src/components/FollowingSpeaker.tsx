import type { Speaker } from '../types';

interface FollowingSpeakerProps {
  speaker?: Speaker;
}

export function FollowingSpeaker({ speaker }: FollowingSpeakerProps) {
  return (
    <div className="following-speaker bg-sky-900/20 border-2 border-sky-500 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-sky-400 mb-4">Following Speaker</h3>
      {speaker ? (
        <div className="space-y-2">
          <p className="text-xl font-bold text-sky-300">{speaker.name}</p>
          <p className="text-base text-gray-300">{speaker.country}</p>
          {speaker.organization && <p className="text-sm text-gray-400">{speaker.organization}</p>}
        </div>
      ) : (
        <p className="text-gray-500 italic">No following speaker</p>
      )}
    </div>
  );
}
