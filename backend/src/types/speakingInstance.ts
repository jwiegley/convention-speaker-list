/**
 * Types for speaking instance tracking
 */

export interface SpeakingInstance {
  id: string;
  delegate_id: string;
  session_id: string;
  queue_item_id?: string; // Optional reference to queue item
  start_time: Date;
  end_time?: Date;
  duration_seconds?: number;
  position_in_queue: number;
  is_tracked: boolean;
  status?: 'active' | 'completed' | 'interrupted'; // Track speaking status
  created_at: Date;
  updated_at: Date;
}

export interface CreateSpeakingInstanceDTO {
  delegate_id: string;
  session_id: string;
  queue_item_id?: string;
  position_in_queue: number;
  is_tracked?: boolean;
}

export interface UpdateSpeakingInstanceDTO {
  end_time?: Date;
  status?: 'active' | 'completed' | 'interrupted';
}

export interface SpeakingInstanceWithDelegate extends SpeakingInstance {
  delegate_name: string;
  delegate_country?: string;
}

export interface SessionSpeakingStats {
  session_id: string;
  total_speakers: number;
  total_duration_seconds: number;
  average_duration_seconds: number;
  longest_duration_seconds: number;
  shortest_duration_seconds: number;
}

export interface DelegateSpeakingStats {
  delegate_id: string;
  total_instances: number;
  total_duration_seconds: number;
  average_duration_seconds: number;
  sessions_participated: number;
}
