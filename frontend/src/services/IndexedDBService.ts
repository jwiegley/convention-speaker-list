/**
 * IndexedDB Service for Offline Support
 * Manages local data storage and synchronization
 */

export interface PendingUpdate {
  id: string;
  timestamp: number;
  type: 'queue' | 'delegate' | 'settings';
  action: 'create' | 'update' | 'delete';
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  synced: boolean;
  retries: number;
}

export interface LocalQueueState {
  id: string;
  timestamp: number;
  queue: any[];
  currentSpeaker: any;
  settings: any;
}

export interface ConflictResolution {
  id: string;
  timestamp: number;
  localVersion: any;
  remoteVersion: any;
  resolution: 'local' | 'remote' | 'merged';
  resolvedData: any;
}

class IndexedDBService {
  private dbName = 'ConventionSpeakerListDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createSchema(db);
      };
    });
  }

  /**
   * Create database schema
   */
  private createSchema(db: IDBDatabase): void {
    // Store for pending updates
    if (!db.objectStoreNames.contains('pendingUpdates')) {
      const pendingStore = db.createObjectStore('pendingUpdates', { 
        keyPath: 'id' 
      });
      pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
      pendingStore.createIndex('synced', 'synced', { unique: false });
      pendingStore.createIndex('type', 'type', { unique: false });
    }

    // Store for queue state snapshots
    if (!db.objectStoreNames.contains('queueStates')) {
      const queueStore = db.createObjectStore('queueStates', { 
        keyPath: 'id' 
      });
      queueStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Store for delegates cache
    if (!db.objectStoreNames.contains('delegates')) {
      const delegatesStore = db.createObjectStore('delegates', { 
        keyPath: 'id' 
      });
      delegatesStore.createIndex('name', 'name', { unique: false });
      delegatesStore.createIndex('location', 'location', { unique: false });
    }

    // Store for conflict resolutions
    if (!db.objectStoreNames.contains('conflicts')) {
      const conflictsStore = db.createObjectStore('conflicts', { 
        keyPath: 'id' 
      });
      conflictsStore.createIndex('timestamp', 'timestamp', { unique: false });
      conflictsStore.createIndex('resolution', 'resolution', { unique: false });
    }

    // Store for application settings
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }

    console.log('IndexedDB schema created');
  }

  /**
   * Add a pending update to the queue
   */
  async addPendingUpdate(update: Omit<PendingUpdate, 'id' | 'timestamp' | 'synced' | 'retries'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const pendingUpdate: PendingUpdate = {
      ...update,
      id: this.generateId(),
      timestamp: Date.now(),
      synced: false,
      retries: 0
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingUpdates'], 'readwrite');
      const store = transaction.objectStore('pendingUpdates');
      const request = store.add(pendingUpdate);

      request.onsuccess = () => {
        console.log('Pending update added:', pendingUpdate.id);
        resolve(pendingUpdate.id);
      };

      request.onerror = () => {
        console.error('Failed to add pending update:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all pending updates
   */
  async getPendingUpdates(): Promise<PendingUpdate[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingUpdates'], 'readonly');
      const store = transaction.objectStore('pendingUpdates');
      const index = store.index('synced');
      const request = index.getAll(false);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to get pending updates:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Mark an update as synced
   */
  async markUpdateSynced(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingUpdates'], 'readwrite');
      const store = transaction.objectStore('pendingUpdates');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const update = getRequest.result;
        if (update) {
          update.synced = true;
          const putRequest = store.put(update);
          
          putRequest.onsuccess = () => {
            console.log('Update marked as synced:', id);
            resolve();
          };
          
          putRequest.onerror = () => {
            reject(putRequest.error);
          };
        } else {
          reject(new Error(`Update ${id} not found`));
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    });
  }

  /**
   * Save queue state snapshot
   */
  async saveQueueState(state: Omit<LocalQueueState, 'id' | 'timestamp'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const queueState: LocalQueueState = {
      ...state,
      id: this.generateId(),
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queueStates'], 'readwrite');
      const store = transaction.objectStore('queueStates');
      const request = store.add(queueState);

      request.onsuccess = () => {
        console.log('Queue state saved:', queueState.id);
        
        // Clean up old snapshots (keep last 10)
        this.cleanupOldSnapshots();
        
        resolve(queueState.id);
      };

      request.onerror = () => {
        console.error('Failed to save queue state:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get the latest queue state
   */
  async getLatestQueueState(): Promise<LocalQueueState | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queueStates'], 'readonly');
      const store = transaction.objectStore('queueStates');
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('Failed to get latest queue state:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save delegates to local cache
   */
  async saveDelegates(delegates: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['delegates'], 'readwrite');
      const store = transaction.objectStore('delegates');

      // Clear existing delegates
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        // Add new delegates
        delegates.forEach(delegate => {
          store.add(delegate);
        });
        
        transaction.oncomplete = () => {
          console.log(`Saved ${delegates.length} delegates to cache`);
          resolve();
        };
        
        transaction.onerror = () => {
          console.error('Failed to save delegates:', transaction.error);
          reject(transaction.error);
        };
      };
    });
  }

  /**
   * Get all cached delegates
   */
  async getCachedDelegates(): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['delegates'], 'readonly');
      const store = transaction.objectStore('delegates');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to get cached delegates:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Record a conflict resolution
   */
  async recordConflict(conflict: Omit<ConflictResolution, 'id' | 'timestamp'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const conflictRecord: ConflictResolution = {
      ...conflict,
      id: this.generateId(),
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conflicts'], 'readwrite');
      const store = transaction.objectStore('conflicts');
      const request = store.add(conflictRecord);

      request.onsuccess = () => {
        console.log('Conflict recorded:', conflictRecord.id);
        resolve(conflictRecord.id);
      };

      request.onerror = () => {
        console.error('Failed to record conflict:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save application setting
   */
  async saveSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onsuccess = () => {
        console.log('Setting saved:', key);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to save setting:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get application setting
   */
  async getSetting(key: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value);
      };

      request.onerror = () => {
        console.error('Failed to get setting:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const storeNames = ['pendingUpdates', 'queueStates', 'delegates', 'conflicts', 'settings'];
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeNames, 'readwrite');
      
      storeNames.forEach(storeName => {
        transaction.objectStore(storeName).clear();
      });
      
      transaction.oncomplete = () => {
        console.log('All IndexedDB data cleared');
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('Failed to clear data:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Clean up old queue snapshots
   */
  private async cleanupOldSnapshots(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['queueStates'], 'readwrite');
    const store = transaction.objectStore('queueStates');
    const index = store.index('timestamp');
    const request = index.openCursor();
    
    const snapshots: LocalQueueState[] = [];
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        snapshots.push(cursor.value);
        cursor.continue();
      } else {
        // Keep only the last 10 snapshots
        if (snapshots.length > 10) {
          const toDelete = snapshots
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(10);
          
          toDelete.forEach(snapshot => {
            store.delete(snapshot.id);
          });
          
          console.log(`Cleaned up ${toDelete.length} old snapshots`);
        }
      }
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const stats: any = {};
    const storeNames = ['pendingUpdates', 'queueStates', 'delegates', 'conflicts', 'settings'];

    for (const storeName of storeNames) {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();
      
      await new Promise((resolve) => {
        countRequest.onsuccess = () => {
          stats[storeName] = countRequest.result;
          resolve(undefined);
        };
      });
    }

    return stats;
  }
}

// Export singleton instance
export default new IndexedDBService();