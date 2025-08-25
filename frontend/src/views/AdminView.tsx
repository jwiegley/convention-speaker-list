import { useState } from 'react';
import { DelegateManagement } from '../components/admin/DelegateManagement';
import { QueueControl } from '../components/admin/QueueControl';
import { TimerControl } from '../components/admin/TimerControl';
import { SessionManagement } from '../components/admin/SessionManagement';
import { useWebSocket } from '../hooks/useWebSocket';

type TabType = 'delegates' | 'queue' | 'timer' | 'session';

export function AdminView() {
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const { isConnected } = useWebSocket();

  const tabs: { id: TabType; label: string }[] = [
    { id: 'queue', label: 'Queue Control' },
    { id: 'delegates', label: 'Delegates' },
    { id: 'timer', label: 'Timer' },
    { id: 'session', label: 'Session' },
  ];

  return (
    <div className="admin-view min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">
              Convention Admin Panel
            </h1>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
              isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm font-medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'queue' && <QueueControl />}
          {activeTab === 'delegates' && <DelegateManagement />}
          {activeTab === 'timer' && <TimerControl />}
          {activeTab === 'session' && <SessionManagement />}
        </div>
      </main>
    </div>
  );
}