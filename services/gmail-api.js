/**
 * Gmail API Service
 * Handles authentication and API calls to Gmail
 */
class GmailAPI {
  constructor(clientId, scopes) {
    this.clientId = clientId;
    this.scopes = scopes;
    this.tokenKey = 'gmail_access_token';
    this.lastCheckTime = Date.now() - (2 * 60 * 1000); // Start by checking last 2 minutes
  }
  
  /**
   * Get or refresh OAuth token
   * @param {boolean} interactive - Whether to show interactive login
   * @returns {Promise<string>} Access token
   */
  async getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Token error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!token) {
          reject(new Error('Failed to get token'));
          return;
        }
        
        console.log('Successfully obtained Gmail auth token');
        resolve(token);
      });
    });
  }
  
  /**
   * Ensures that the user is authenticated before making API calls
   * @param {boolean} interactive - Whether to show interactive login if needed
   * @returns {Promise<string>} Access token
   */
  async ensureAuthenticated(interactive = false) {
    try {
      return await this.getToken(interactive);
    } catch (error) {
      console.error('Authentication error:', error);
      
      // If we failed and it wasn't interactive, try again with interactive = true if requested
      if (!interactive) {
        console.log('Attempting interactive authentication...');
        return this.getToken(true);
      }
      
      throw error;
    }
  }
  
  /**
   * Remove the current OAuth token
   * @returns {Promise<void>}
   */
  async removeToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (!token) {
          resolve(); // No token to remove
          return;
        }
        
        // Clear token from Chrome's cache
        chrome.identity.removeCachedAuthToken({ token }, async () => {
          try {
            // Revoke token on Google's servers using fetch instead of XMLHttpRequest
            const response = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
            
            if (response.ok) {
              console.log('Token revoked successfully');
            } else {
              console.warn('Token revocation returned status:', response.status);
              // Continue anyway since we already removed from Chrome's cache
            }
            
            resolve();
          } catch (error) {
            console.error('Failed to revoke token:', error);
            // Still resolve, as we've removed it from Chrome's cache
            resolve();
          }
        });
      });
    });
  }
  
  /**
   * Get recent Gmail messages
   * @returns {Promise<Array>} List of recent message objects
   */
  async getRecentMessages() {
    try {
      const token = await this.ensureAuthenticated(false);
      
      // Calculate time window - only look at emails from the last 5 minutes
      // This helps reduce the API load and focuses on the most recent verification emails
      const currentTime = Date.now();
      const fiveMinutesAgo = new Date(currentTime - (5 * 60 * 1000)).getTime() / 1000;
      
      // Construct a query for newer messages only, prioritizing unread messages
      // Gmail search operators: https://support.google.com/mail/answer/7190
      const query = `after:${Math.floor(fiveMinutesAgo)} OR is:unread`;
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gmail API error:', errorText);
        throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      // Update the last check time for next query
      this.lastCheckTime = currentTime;
      
      if (!data.messages) {
        console.log('No messages in the response');
        return [];
      }
      
      console.log(`Found ${data.messages.length} recent Gmail messages`);
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific Gmail message with full content
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<Object>} Message object with details
   */
  async getMessage(messageId) {
    try {
      const token = await this.ensureAuthenticated(false);
      
      // Request the full message with complete details to improve parsing reliability
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gmail API error when fetching message:', errorText);
        throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
      }
      
      const message = await response.json();
      
      // Quick validation to ensure we have message payload
      if (!message || !message.payload) {
        console.error('Invalid message format received from Gmail API');
        throw new Error('Invalid message format received');
      }
      
      return message;
    } catch (error) {
      console.error(`Error fetching Gmail message ${messageId}:`, error);
      throw error;
    }
  }
}

export { GmailAPI }; 