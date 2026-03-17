import { SessionStatus } from '../enums';

export interface ISession {
  id: string;
  name: string;
  description?: string;
  status: SessionStatus;
  microphoneCount: number;
  collectDemographics: boolean;
  maxSpeakingTime?: number; // in seconds
  warningTime?: number; // in seconds
  adminPin?: string; // hashed
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}
