export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non-binary',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer-not-to-say'
}

export enum AgeBracket {
  UNDER_18 = 'under-18',
  AGE_18_24 = '18-24',
  AGE_25_34 = '25-34',
  AGE_35_44 = '35-44',
  AGE_45_54 = '45-54',
  AGE_55_64 = '55-64',
  AGE_65_PLUS = '65-plus',
  PREFER_NOT_TO_SAY = 'prefer-not-to-say'
}

export enum RaceCategory {
  WHITE = 'white',
  BLACK = 'black',
  HISPANIC = 'hispanic',
  ASIAN = 'asian',
  NATIVE_AMERICAN = 'native-american',
  PACIFIC_ISLANDER = 'pacific-islander',
  MIDDLE_EASTERN = 'middle-eastern',
  MIXED = 'mixed',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer-not-to-say'
}

export enum QueueStatus {
  WAITING = 'waiting',
  SPEAKING = 'speaking',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  REMOVED = 'removed'
}

export enum SessionStatus {
  SETUP = 'setup',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended'
}

export enum MicrophoneStatus {
  AVAILABLE = 'available',
  IN_USE = 'in-use',
  DISABLED = 'disabled'
}