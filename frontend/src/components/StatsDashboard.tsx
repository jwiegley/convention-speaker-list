import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';

type Socket = ReturnType<typeof io>;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Clock,
  Activity,
  TrendingUp,
  BarChart3,
  Timer,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

interface SessionMetrics {
  sessionId: string;
  duration: number;
  uniqueSpeakers: number;
  totalSpeakingInstances: number;
  averageSpeakingTime: number;
  medianSpeakingTime: number;
  queueLength: number;
  participationRate: number;
  demographicBalance: {
    gender: number;
    age: number;
    race: number;
  };
}

interface RealtimeStats {
  currentSpeaker: {
    id: string;
    name: string;
    startTime: Date;
    elapsedTime: number;
  } | null;
  queueStatus: {
    length: number;
    estimatedWaitTime: number;
    nextSpeakers: { id: string; name: string }[];
  };
  sessionTrend: {
    lastHourSpeakers: number;
    lastHourAvgTime: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
}

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  status?: 'success' | 'warning' | 'danger' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  status = 'neutral',
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'danger':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />;
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <h2 className={`text-2xl font-bold ${getStatusColor()}`}>{value}</h2>
              {getTrendIcon()}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-full bg-gray-100 ${getStatusColor()}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const AnimatedCounter: React.FC<{ value: number; duration?: number }> = ({
  value,
  duration = 1000,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    const difference = value - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startValue + difference * easeOutQuart);

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{displayValue}</span>;
};

const DurationTimer: React.FC<{ startTime: Date }> = ({ startTime }) => {
  const [duration, setDuration] = useState('00:00:00');

  useEffect(() => {
    const updateDuration = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - new Date(startTime).getTime()) / 1000);

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="font-mono">{duration}</span>;
};

export const StatsDashboard: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [realtimeStats, setRealtimeStats] = useState<RealtimeStats | null>(null);
  const [refreshRate, setRefreshRate] = useState(2); // seconds
  const [_socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>(
    'disconnected'
  );
  const [loading, setLoading] = useState(true);

  // Fetch initial metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`/api/analytics/session/${sessionId}/metrics`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  }, [sessionId]);

  // Setup WebSocket connection
  useEffect(() => {
    const newSocket = io('/analytics', {
      query: { sessionId },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Connected to analytics WebSocket');
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    newSocket.on('error', () => {
      setConnectionStatus('error');
    });

    newSocket.on('metrics:update', (data: SessionMetrics) => {
      setMetrics(data);
    });

    newSocket.on('realtime:update', (data: RealtimeStats) => {
      setRealtimeStats(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [sessionId]);

  // Setup polling for metrics
  useEffect(() => {
    fetchMetrics();
    setLoading(false);

    const interval = setInterval(fetchMetrics, refreshRate * 1000);
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshRate]);

  const getBalanceStatus = (score: number): 'success' | 'warning' | 'danger' => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const overallBalance =
    (metrics.demographicBalance.gender +
      metrics.demographicBalance.age +
      metrics.demographicBalance.race) /
    3;

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Real-time Statistics</h2>
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
            {connectionStatus === 'connected' ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
                Live
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 mr-2" />
                {connectionStatus}
              </>
            )}
          </Badge>
        </div>

        <Select
          value={refreshRate.toString()}
          onValueChange={(v: string) => setRefreshRate(Number(v))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Refresh rate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 second</SelectItem>
            <SelectItem value="2">2 seconds</SelectItem>
            <SelectItem value="3">3 seconds</SelectItem>
            <SelectItem value="5">5 seconds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Session Duration"
          value={
            metrics.duration ? (
              <DurationTimer startTime={new Date(Date.now() - metrics.duration * 1000)} />
            ) : (
              '00:00:00'
            )
          }
          icon={<Clock className="w-4 h-4" />}
        />

        <StatCard
          title="Unique Speakers"
          value={<AnimatedCounter value={metrics.uniqueSpeakers} />}
          subtitle={`${metrics.participationRate.toFixed(1)}% participation`}
          icon={<Users className="w-4 h-4" />}
          status={
            metrics.participationRate > 70
              ? 'success'
              : metrics.participationRate > 40
                ? 'warning'
                : 'danger'
          }
        />

        <StatCard
          title="Average Speaking Time"
          value={formatTime(metrics.averageSpeakingTime)}
          subtitle={`Median: ${formatTime(metrics.medianSpeakingTime)}`}
          icon={<Timer className="w-4 h-4" />}
        />

        <StatCard
          title="Queue Length"
          value={<AnimatedCounter value={metrics.queueLength} />}
          subtitle={
            realtimeStats?.queueStatus.estimatedWaitTime
              ? `~${formatTime(realtimeStats.queueStatus.estimatedWaitTime)} wait`
              : 'No wait time'
          }
          icon={<UserCheck className="w-4 h-4" />}
          status={metrics.queueLength > 10 ? 'warning' : 'success'}
        />
      </div>

      {/* Current speaker info */}
      {realtimeStats?.currentSpeaker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Speaker</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{realtimeStats.currentSpeaker.name}</p>
                <p className="text-sm text-muted-foreground">
                  Speaking for: <DurationTimer startTime={realtimeStats.currentSpeaker.startTime} />
                </p>
              </div>
              <div className="animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demographic balance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Demographic Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Gender Balance</span>
              <span className="font-medium">{metrics.demographicBalance.gender.toFixed(0)}%</span>
            </div>
            <Progress
              value={metrics.demographicBalance.gender}
              className={`h-2 ${getBalanceStatus(metrics.demographicBalance.gender) === 'success' ? 'bg-green-100' : ''}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Age Balance</span>
              <span className="font-medium">{metrics.demographicBalance.age.toFixed(0)}%</span>
            </div>
            <Progress
              value={metrics.demographicBalance.age}
              className={`h-2 ${getBalanceStatus(metrics.demographicBalance.age) === 'success' ? 'bg-green-100' : ''}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Race Balance</span>
              <span className="font-medium">{metrics.demographicBalance.race.toFixed(0)}%</span>
            </div>
            <Progress
              value={metrics.demographicBalance.race}
              className={`h-2 ${getBalanceStatus(metrics.demographicBalance.race) === 'success' ? 'bg-green-100' : ''}`}
            />
          </div>

          <div className="pt-2 border-t">
            <div className="flex justify-between text-sm font-medium">
              <span>Overall Balance Score</span>
              <span
                className={`${getBalanceStatus(overallBalance) === 'success' ? 'text-green-600' : getBalanceStatus(overallBalance) === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}
              >
                {overallBalance.toFixed(0)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue preview */}
      {realtimeStats &&
        realtimeStats.queueStatus.nextSpeakers &&
        realtimeStats.queueStatus.nextSpeakers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Next in Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {realtimeStats.queueStatus.nextSpeakers.slice(0, 5).map((speaker, index) => (
                  <div key={speaker.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                    <span className="text-sm">{speaker.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
};

export default StatsDashboard;
