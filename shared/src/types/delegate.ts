import { Gender, AgeBracket, RaceCategory } from '../enums';

export interface IDelegate {
  id: string;
  sessionId: string;
  name?: string;
  pronouns?: string;
  gender?: Gender;
  age?: AgeBracket;
  race?: RaceCategory;
  microphoneNumber: number;
  timestamp: Date;
  speakingTime?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
