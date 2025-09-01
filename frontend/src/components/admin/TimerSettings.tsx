import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '@/utils/config';

interface TimerConfig {
  warningTime: number; // seconds before turning yellow
  limitTime: number;   // seconds before turning red
}

export function TimerSettings() {
  const [warningTime, setWarningTime] = useState<number>(90);
  const [limitTime, setLimitTime] = useState<number>(120);

  // Fetch current timer settings
  const { data: settings, refetch } = useQuery<TimerConfig>({
    queryKey: ['timerSettings'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/settings/timer`);
      return response.data;
    },
    onSuccess: (data) => {
      setWarningTime(data.warningTime);
      setLimitTime(data.limitTime);
    },
  });

  // Update timer settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (config: TimerConfig) => {
      const response = await axios.put(`${API_BASE_URL}/settings/timer`, config);
      return response.data;
    },
    onSuccess: () => {
      refetch();
      alert('Timer settings updated successfully');
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      warningTime,
      limitTime,
    });
  };

  // Convert seconds to minutes:seconds for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="timer-settings space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Timer Settings</h2>
      
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Speaking Time Limits</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure when the timer changes color to indicate time warnings to the admin.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Warning Time (Yellow)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={warningTime}
                onChange={(e) => setWarningTime(Number(e.target.value))}
                min="0"
                max="600"
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-600">seconds ({formatTime(warningTime)})</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Timer turns yellow when speaker reaches this time
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Limit (Red)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={limitTime}
                onChange={(e) => setLimitTime(Number(e.target.value))}
                min="0"
                max="600"
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-600">seconds ({formatTime(limitTime)})</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Timer turns red when speaker exceeds this time
            </p>
          </div>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={handleSaveSettings}
            disabled={updateSettingsMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Save Settings
          </button>
        </div>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Color Guide</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span>Green: Under {warningTime} seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span>Yellow: {warningTime} - {limitTime - 1} seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span>Red: {limitTime} seconds or more</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}