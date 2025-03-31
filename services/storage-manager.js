/**
 * Storage Manager
 * Handles persistent browser storage for the extension
 */
class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
  }
  
  /**
   * Get a value from storage
   * @param {string} key - The key to retrieve
   * @returns {Promise<any>} The stored value
   */
  get(key) {
    return new Promise((resolve, reject) => {
      this.storage.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        resolve(result[key]);
      });
    });
  }
  
  /**
   * Set a value in storage
   * @param {string} key - The key to set
   * @param {any} value - The value to store
   * @returns {Promise<void>}
   */
  set(key, value) {
    return new Promise((resolve, reject) => {
      this.storage.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        resolve();
      });
    });
  }
  
  /**
   * Remove a value from storage
   * @param {string} key - The key to remove
   * @returns {Promise<void>}
   */
  remove(key) {
    return new Promise((resolve, reject) => {
      this.storage.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        resolve();
      });
    });
  }
}

export { StorageManager }; 