import { EventEmitter } from 'events';
import { getClient } from '../database';
import logger from '../utils/logger';

export interface DemographicsData {
  sessionId: string;
  totalDelegates: number;
  demographics: {
    gender: {
      male: number;
      female: number;
      nonBinary: number;
      other: number;
    };
    age: {
      '18-24': number;
      '25-34': number;
      '35-44': number;
      '45-54': number;
      '55-64': number;
      '65+': number;
    };
    region: {
      northAmerica: number;
      europe: number;
      asia: number;
      africa: number;
      southAmerica: number;
      oceania: number;
    };
    firstTime: {
      yes: number;
      no: number;
    };
  };
  balance: {
    genderBalance: number; // 0-100, where 50 is perfect balance
    ageBalance: number; // 0-100, where higher is more diverse
    regionBalance: number; // 0-100, where higher is more diverse
  };
  deltas?: {
    gender?: Record<string, number>;
    age?: Record<string, number>;
    region?: Record<string, number>;
  };
}

export interface GardenState {
  sessionId: string;
  imageIndex: number; // 0-32 based on timing performance
  performanceScore: number; // 0-100
  averageTime: number; // Average speaking time in seconds
  onTimePercentage: number; // Percentage of speakers on time
}

export interface DemographicsEvent {
  type: 'demographics:updated' | 'garden:stateChanged';
  sessionId: string;
  data: DemographicsData | GardenState;
  timestamp: Date;
}

/**
 * Service for managing demographic data and garden visualization
 */
export class DemographicsService {
  private eventEmitter: EventEmitter;
  private demographicsCache: Map<string, DemographicsData> = new Map();
  private gardenStates: Map<string, GardenState> = new Map();
  private updateBatch: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_DELAY = 2000; // 2 seconds for batching rapid changes
  
  constructor() {
    this.eventEmitter = new EventEmitter();
    logger.info('DemographicsService initialized');
  }
  
  /**
   * Calculate demographics for a session
   */
  async calculateDemographics(sessionId: string): Promise<DemographicsData> {
    const client = await getClient();
    try {
      // Get all delegates who have spoken in this session
      const speakersResult = await client.query(
        `SELECT DISTINCT d.* 
         FROM delegates d
         JOIN speaking_instances si ON d.id = si.delegate_id
         WHERE si.session_id = $1`,
        [sessionId]
      );
      
      const speakers = speakersResult.rows;
      const totalDelegates = speakers.length;
      
      // Initialize counters
      const demographics: DemographicsData['demographics'] = {
        gender: { male: 0, female: 0, nonBinary: 0, other: 0 },
        age: { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55-64': 0, '65+': 0 },
        region: {
          northAmerica: 0,
          europe: 0,
          asia: 0,
          africa: 0,
          southAmerica: 0,
          oceania: 0
        },
        firstTime: { yes: 0, no: 0 }
      };
      
      // Count demographics
      speakers.forEach(speaker => {
        // Gender
        const gender = speaker.gender?.toLowerCase() || 'other';
        if (gender === 'male') demographics.gender.male++;
        else if (gender === 'female') demographics.gender.female++;
        else if (gender === 'non-binary' || gender === 'nonbinary') demographics.gender.nonBinary++;
        else demographics.gender.other++;
        
        // Age
        const age = speaker.age_range || '';
        if (age in demographics.age) {
          demographics.age[age as keyof typeof demographics.age]++;
        }
        
        // Region
        const region = this.mapCountryToRegion(speaker.country);
        if (region in demographics.region) {
          demographics.region[region as keyof typeof demographics.region]++;
        }
        
        // First time
        if (speaker.has_spoken_count === 0) {
          demographics.firstTime.yes++;
        } else {
          demographics.firstTime.no++;
        }
      });
      
      // Calculate balance scores
      const balance = this.calculateBalance(demographics, totalDelegates);
      
      // Get previous data for deltas
      const previous = this.demographicsCache.get(sessionId);
      const deltas = previous ? this.calculateDeltas(previous.demographics, demographics) : undefined;
      
      const data: DemographicsData = {
        sessionId,
        totalDelegates,
        demographics,
        balance,
        deltas
      };
      
      // Cache the result
      this.demographicsCache.set(sessionId, data);
      
      return data;
    } finally {
      client.release();
    }
  }
  
  /**
   * Calculate balance scores
   */
  private calculateBalance(
    demographics: DemographicsData['demographics'],
    total: number
  ): DemographicsData['balance'] {
    if (total === 0) {
      return { genderBalance: 50, ageBalance: 0, regionBalance: 0 };
    }
    
    // Gender balance (0-100, 50 is perfect)
    const genderValues = Object.values(demographics.gender);
    const maxGender = Math.max(...genderValues);
    const minGender = Math.min(...genderValues.filter(v => v > 0));
    const genderBalance = minGender > 0 ? (minGender / maxGender) * 100 : 0;
    
    // Age diversity (0-100, higher is more diverse)
    const ageValues = Object.values(demographics.age);
    const ageWithSpeakers = ageValues.filter(v => v > 0).length;
    const ageBalance = (ageWithSpeakers / Object.keys(demographics.age).length) * 100;
    
    // Region diversity (0-100, higher is more diverse)
    const regionValues = Object.values(demographics.region);
    const regionWithSpeakers = regionValues.filter(v => v > 0).length;
    const regionBalance = (regionWithSpeakers / Object.keys(demographics.region).length) * 100;
    
    return {
      genderBalance: Math.round(genderBalance),
      ageBalance: Math.round(ageBalance),
      regionBalance: Math.round(regionBalance)
    };
  }
  
  /**
   * Calculate deltas between two demographic states
   */
  private calculateDeltas(
    previous: DemographicsData['demographics'],
    current: DemographicsData['demographics']
  ): DemographicsData['deltas'] {
    const deltas: DemographicsData['deltas'] = {};
    
    // Gender deltas
    deltas.gender = {};
    for (const key in current.gender) {
      const k = key as keyof typeof current.gender;
      deltas.gender[key] = current.gender[k] - previous.gender[k];
    }
    
    // Age deltas
    deltas.age = {};
    for (const key in current.age) {
      const k = key as keyof typeof current.age;
      deltas.age[key] = current.age[k] - previous.age[k];
    }
    
    // Region deltas
    deltas.region = {};
    for (const key in current.region) {
      const k = key as keyof typeof current.region;
      deltas.region[key] = current.region[k] - previous.region[k];
    }
    
    return deltas;
  }
  
  /**
   * Map country to region
   */
  private mapCountryToRegion(country: string): string {
    const countryUpper = (country || '').toUpperCase();
    
    // Simple mapping - can be expanded
    const regionMap: Record<string, string> = {
      // North America
      'USA': 'northAmerica',
      'CANADA': 'northAmerica',
      'MEXICO': 'northAmerica',
      
      // Europe
      'UK': 'europe',
      'FRANCE': 'europe',
      'GERMANY': 'europe',
      'SPAIN': 'europe',
      'ITALY': 'europe',
      
      // Asia
      'CHINA': 'asia',
      'JAPAN': 'asia',
      'INDIA': 'asia',
      'KOREA': 'asia',
      
      // Africa
      'SOUTH AFRICA': 'africa',
      'NIGERIA': 'africa',
      'EGYPT': 'africa',
      
      // South America
      'BRAZIL': 'southAmerica',
      'ARGENTINA': 'southAmerica',
      'CHILE': 'southAmerica',
      
      // Oceania
      'AUSTRALIA': 'oceania',
      'NEW ZEALAND': 'oceania'
    };
    
    return regionMap[countryUpper] || 'other';
  }
  
  /**
   * Update garden state based on timing performance
   */
  async updateGardenState(sessionId: string): Promise<GardenState> {
    const client = await getClient();
    try {
      // Get speaking instance statistics
      const statsResult = await client.query(
        `SELECT 
          AVG(actual_duration) as avg_duration,
          AVG(CASE WHEN actual_duration <= allocated_time THEN 1 ELSE 0 END) * 100 as on_time_percentage,
          COUNT(*) as total_speakers
         FROM speaking_instances
         WHERE session_id = $1 AND actual_duration IS NOT NULL`,
        [sessionId]
      );
      
      const stats = statsResult.rows[0];
      const avgDuration = parseFloat(stats.avg_duration) || 0;
      const onTimePercentage = parseFloat(stats.on_time_percentage) || 0;
      
      // Calculate performance score (0-100)
      const performanceScore = Math.round(onTimePercentage);
      
      // Map to garden image index (0-32)
      const imageIndex = Math.round((performanceScore / 100) * 32);
      
      const gardenState: GardenState = {
        sessionId,
        imageIndex,
        performanceScore,
        averageTime: Math.round(avgDuration),
        onTimePercentage: Math.round(onTimePercentage)
      };
      
      // Cache the state
      this.gardenStates.set(sessionId, gardenState);
      
      return gardenState;
    } finally {
      client.release();
    }
  }
  
  /**
   * Trigger demographics update with batching
   */
  async triggerDemographicsUpdate(sessionId: string, immediate: boolean = false): Promise<void> {
    const update = async () => {
      try {
        const demographics = await this.calculateDemographics(sessionId);
        
        const event: DemographicsEvent = {
          type: 'demographics:updated',
          sessionId,
          data: demographics,
          timestamp: new Date()
        };
        
        this.eventEmitter.emit('demographics:event', event);
        logger.debug(`Demographics updated for session ${sessionId}`);
      } catch (error) {
        logger.error(`Error updating demographics for session ${sessionId}:`, error);
      }
    };
    
    if (immediate) {
      // Clear any pending batch
      const existing = this.updateBatch.get(sessionId);
      if (existing) {
        clearTimeout(existing);
        this.updateBatch.delete(sessionId);
      }
      await update();
    } else {
      // Batch rapid changes
      const existing = this.updateBatch.get(sessionId);
      if (existing) {
        clearTimeout(existing);
      }
      
      const timeout = setTimeout(() => {
        update();
        this.updateBatch.delete(sessionId);
      }, this.BATCH_DELAY);
      
      this.updateBatch.set(sessionId, timeout);
    }
  }
  
  /**
   * Trigger garden state update
   */
  async triggerGardenUpdate(sessionId: string): Promise<void> {
    try {
      const gardenState = await this.updateGardenState(sessionId);
      
      const event: DemographicsEvent = {
        type: 'garden:stateChanged',
        sessionId,
        data: gardenState,
        timestamp: new Date()
      };
      
      this.eventEmitter.emit('demographics:event', event);
      logger.debug(`Garden state updated for session ${sessionId}, index: ${gardenState.imageIndex}`);
    } catch (error) {
      logger.error(`Error updating garden state for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Get cached demographics
   */
  getCachedDemographics(sessionId: string): DemographicsData | null {
    return this.demographicsCache.get(sessionId) || null;
  }
  
  /**
   * Get cached garden state
   */
  getCachedGardenState(sessionId: string): GardenState | null {
    return this.gardenStates.get(sessionId) || null;
  }
  
  /**
   * Subscribe to demographics events
   */
  onDemographicsEvent(callback: (event: DemographicsEvent) => void): void {
    this.eventEmitter.on('demographics:event', callback);
  }
  
  /**
   * Unsubscribe from demographics events
   */
  offDemographicsEvent(callback: (event: DemographicsEvent) => void): void {
    this.eventEmitter.off('demographics:event', callback);
  }
  
  /**
   * Cleanup service (for graceful shutdown)
   */
  cleanup(): void {
    // Clear all pending batches
    for (const [sessionId, timeout] of this.updateBatch) {
      clearTimeout(timeout);
      logger.debug(`Cleared pending demographics update for session ${sessionId}`);
    }
    
    this.updateBatch.clear();
    this.demographicsCache.clear();
    this.gardenStates.clear();
    this.eventEmitter.removeAllListeners();
    
    logger.info('DemographicsService cleaned up');
  }
}

// Create singleton instance
const demographicsService = new DemographicsService();

export default demographicsService;
export { demographicsService };