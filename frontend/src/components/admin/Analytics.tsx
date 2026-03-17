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
  total_speaking_time?: number;
}

interface QueueItem {
  id: string;
  delegate: Delegate;
  position: number;
  addedAt: string;
  startedAt?: string;
  endedAt?: string;
  speakingTime?: number;
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

export function Analytics() {
  // Fetch delegates
  const { data: delegates = [] } = useQuery<Delegate[]>({
    queryKey: ['delegates'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/delegates`);
      return response.data;
    },
  });

  // Fetch queue data
  const { data: queueData } = useQuery<QueueData>({
    queryKey: ['queue'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/queue`);
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Calculate statistics
  const totalDelegates = delegates.length;
  const totalSpoken = delegates.filter((d) => d.has_spoken).length;
  const totalNotSpoken = totalDelegates - totalSpoken;
  const speakerHistory = queueData?.history || [];

  // Gender statistics
  const genderStats = delegates.reduce(
    (acc, d) => {
      acc[d.gender] = (acc[d.gender] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const genderSpeakerStats = delegates
    .filter((d) => d.has_spoken)
    .reduce(
      (acc, d) => {
        acc[d.gender] = (acc[d.gender] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  // Age group statistics
  const ageStats = delegates.reduce(
    (acc, d) => {
      const age = d.age_group || 'Unknown';
      acc[age] = (acc[age] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const ageSpeakerStats = delegates
    .filter((d) => d.has_spoken)
    .reduce(
      (acc, d) => {
        const age = d.age_group || 'Unknown';
        acc[age] = (acc[age] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  // Race/Orientation statistics
  const raceStats = delegates.reduce(
    (acc, d) => {
      const race = d.race_orientation || 'Unknown';
      acc[race] = (acc[race] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const raceSpeakerStats = delegates
    .filter((d) => d.has_spoken)
    .reduce(
      (acc, d) => {
        const race = d.race_orientation || 'Unknown';
        acc[race] = (acc[race] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  // Calculate average speaking time
  const totalSpeakingTime = speakerHistory.reduce((sum, item) => {
    return sum + (item.speakingTime || 0);
  }, 0);
  const avgSpeakingTime =
    speakerHistory.length > 0 ? Math.round(totalSpeakingTime / speakerHistory.length) : 0;

  // Find longest and shortest speakers
  const speakersWithTime = speakerHistory.filter((s) => s.speakingTime);
  const longestSpeaker = speakersWithTime.reduce(
    (max, item) => ((item.speakingTime || 0) > (max?.speakingTime || 0) ? item : max),
    speakersWithTime[0]
  );
  const shortestSpeaker = speakersWithTime.reduce(
    (min, item) => ((item.speakingTime || 0) < (min?.speakingTime || 999999) ? item : min),
    speakersWithTime[0]
  );

  // Most active speakers (by total time)
  const speakerTimes = delegates
    .filter((d) => d.total_speaking_time && d.total_speaking_time > 0)
    .sort((a, b) => (b.total_speaking_time || 0) - (a.total_speaking_time || 0))
    .slice(0, 5);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculatePercentage = (value: number, total: number): string => {
    if (total === 0) return '0';
    return ((value / total) * 100).toFixed(1);
  };

  return (
    <div className="analytics space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Session Analytics</h2>

      {/* Overall Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-3xl font-bold text-blue-600">{totalDelegates}</div>
          <div className="text-sm text-gray-600">Total Delegates</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-3xl font-bold text-green-600">{totalSpoken}</div>
          <div className="text-sm text-gray-600">Have Spoken</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-3xl font-bold text-yellow-600">{totalNotSpoken}</div>
          <div className="text-sm text-gray-600">Haven't Spoken</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-3xl font-bold text-purple-600">{formatTime(avgSpeakingTime)}</div>
          <div className="text-sm text-gray-600">Avg Speaking Time</div>
        </div>
      </div>

      {/* Demographics Analysis */}
      <div className="grid grid-cols-3 gap-6">
        {/* Gender Distribution */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Gender Distribution</h3>
          <div className="space-y-2">
            {Object.entries(genderStats).map(([gender, count]) => (
              <div key={gender}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{gender}</span>
                  <span className="text-sm text-gray-600">
                    {count} ({calculatePercentage(count, totalDelegates)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${calculatePercentage(count, totalDelegates)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Spoken: {genderSpeakerStats[gender] || 0} / {count}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Age Distribution */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Age Distribution</h3>
          <div className="space-y-2">
            {Object.entries(ageStats)
              .sort()
              .map(([age, count]) => (
                <div key={age}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{age}</span>
                    <span className="text-sm text-gray-600">
                      {count} ({calculatePercentage(count, totalDelegates)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${calculatePercentage(count, totalDelegates)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Spoken: {ageSpeakerStats[age] || 0} / {count}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Race/Orientation Distribution */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Race/Orientation Distribution</h3>
          <div className="space-y-2">
            {Object.entries(raceStats).map(([race, count]) => (
              <div key={race}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{race}</span>
                  <span className="text-sm text-gray-600">
                    {count} ({calculatePercentage(count, totalDelegates)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${calculatePercentage(count, totalDelegates)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Spoken: {raceSpeakerStats[race] || 0} / {count}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Speaking Time Analysis */}
      <div className="grid grid-cols-2 gap-6">
        {/* Speaking Records */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Speaking Records</h3>
          <div className="space-y-3">
            {longestSpeaker && (
              <div className="border-l-4 border-red-500 pl-3">
                <div className="text-sm font-medium">Longest Speech</div>
                <div className="text-xs text-gray-600">
                  #{longestSpeaker.delegate.number} - {longestSpeaker.delegate.name}
                </div>
                <div className="text-lg font-bold text-red-600">
                  {formatTime(longestSpeaker.speakingTime || 0)}
                </div>
              </div>
            )}
            {shortestSpeaker && (
              <div className="border-l-4 border-green-500 pl-3">
                <div className="text-sm font-medium">Shortest Speech</div>
                <div className="text-xs text-gray-600">
                  #{shortestSpeaker.delegate.number} - {shortestSpeaker.delegate.name}
                </div>
                <div className="text-lg font-bold text-green-600">
                  {formatTime(shortestSpeaker.speakingTime || 0)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Most Active Speakers */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Most Active Speakers (Total Time)</h3>
          <div className="space-y-2">
            {speakerTimes.length > 0 ? (
              speakerTimes.map((delegate, index) => (
                <div key={delegate.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-500">#{index + 1}</span>
                    <div>
                      <div className="text-sm font-medium">
                        #{delegate.number} - {delegate.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {delegate.gender} • {delegate.age_group}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-blue-600">
                    {formatTime(delegate.total_speaking_time || 0)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">No speaking data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Speaker History */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Speakers (Last 10)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Number
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Demographics
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Speaking Time
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {speakerHistory.slice(0, 10).map((item, index) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                    #{speakerHistory.length - index}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{item.delegate.number}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                    {item.delegate.name}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                    {item.delegate.gender} • {item.delegate.age_group} •{' '}
                    {item.delegate.race_orientation}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                    <span
                      className={`${
                        (item.speakingTime || 0) >= 120
                          ? 'text-red-600'
                          : (item.speakingTime || 0) >= 90
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`}
                    >
                      {formatTime(item.speakingTime || 0)}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {item.endedAt && new Date(item.endedAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {speakerHistory.length === 0 && (
            <div className="text-center py-4 text-gray-500">No speakers yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
