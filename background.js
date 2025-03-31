// background.js
import { GmailAPI } from './services/gmail-api.js';
import { StorageManager } from './services/storage-manager.js';

// Configuration
const CLIENT_ID = "742920537082-c6ompt7qqk5c97tjut1fvbnlo546moeh.apps.googleusercontent.com";
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Class to manage all background operations
class BackgroundManager {
  constructor() {
    this.gmailApi = new GmailAPI(CLIENT_ID, SCOPES);
    this.storage = new StorageManager();
    this.lastProcessedMessageIds = new Set();
    this.lastFoundCode = null;
    this.lastCodeTimestamp = 0;
    this.isCheckingEmails = false;
    
    // Initialize extension
    this.init();
    
    // Setup message listeners
    this.setupMessageListeners();
  }
  
  async init() {
    console.log('Initializing Auto Code Filler Extension');
    
    // Check if we're already authenticated
    const isAuthenticated = await this.storage.get('isAuthenticated');
    if (isAuthenticated) {
      console.log('Previously authenticated, retrieving token');
      try {
        await this.gmailApi.getToken(false);
        console.log('Token retrieved successfully - ready for manual checking');
      } catch (error) {
        console.error('Failed to retrieve token:', error);
        // Reset authentication state if token retrieval fails
        await this.storage.set('isAuthenticated', false);
      }
    } else {
      console.log('Not authenticated yet, waiting for user interaction');
    }
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Background script received message:', request);
      
      if (request.action === 'getAuthStatus') {
        this.handleGetAuthStatus(sendResponse);
        return true; // Async response
      } else if (request.action === 'authenticate') {
        this.handleAuthenticate(sendResponse);
        return true; // Async response
      } else if (request.action === 'clearAuth') {
        this.handleClearAuth(sendResponse);
        return true; // Async response
      } else if (request.action === 'forceCheckEmails') {
        // Manual email check
        this.checkEmails();
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'contentScriptReady') {
        // Content script is reporting it's ready
        console.log(`Content script ready in tab at URL: ${request.url}`);
        sendResponse({ success: true });
        return true;
      }
    });
  }
  
  // Authentication handlers
  async handleAuthenticate(sendResponse) {
    try {
      await this.gmailApi.getToken(true);
      await this.storage.set('isAuthenticated', true);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Authentication failed:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Authentication failed' 
      });
    }
  }
  
  async handleGetAuthStatus(sendResponse) {
    try {
      const isAuthenticated = await this.storage.get('isAuthenticated');
      sendResponse({ isAuthenticated });
    } catch (error) {
      console.error('Error checking auth status:', error);
      sendResponse({ isAuthenticated: false, error: error.message });
    }
  }
  
  async handleClearAuth(sendResponse) {
    try {
      await this.gmailApi.removeToken();
      await this.storage.set('isAuthenticated', false);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error clearing authentication:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Manual check of Gmail messages
  async checkEmails() {
    // Prevent multiple simultaneous checks
    if (this.isCheckingEmails) {
      console.log('Already checking emails, skipping this request');
      return;
    }
    
    this.isCheckingEmails = true;
    
    try {
      console.log('Manually checking for new Gmail messages');
      
      // Notify popup that checking has started
      chrome.runtime.sendMessage({ 
        action: 'checkingStatus', 
        status: 'checking'
      });
      
      const messages = await this.gmailApi.getRecentMessages();
      
      if (!messages || messages.length === 0) {
        console.log('No new messages found');
        this.showNotification('No emails found', 'There are no recent emails in your inbox to check for codes.');
        
        // Notify popup that no emails were found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'noEmails'
        });
        
        this.isCheckingEmails = false;
        return;
      }
      
      console.log(`Found ${messages.length} messages, checking only the most recent one`);
      
      // Get the most recent message (first in the list)
      const mostRecentMessage = messages[0];
      
      // Process only the most recent message
      const extractedCode = await this.processMessage(mostRecentMessage.id);
      
      if (extractedCode) {
        console.log(`Found code in the most recent message, sending to tabs`);
        
        // Notify popup that code was found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'codeFound',
          code: extractedCode
        });
        
        await this.sendCodeToTabs(extractedCode);
      } else {
        console.log('No verification code found in the most recent email');
        // Show desktop notification
        this.showNotification('No verification code found', 'The most recent email does not contain a verification code.');
        
        // Notify popup that no code was found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'noCodeFound'
        });
        
        // Also send a notification to all open tabs to show the visual indicator
        await this.sendNoCodeFoundToTabs();
      }
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      
      // Notify popup about the error
      chrome.runtime.sendMessage({ 
        action: 'checkingStatus', 
        status: 'error',
        error: error.message
      });
      
      // If token issue, try to refresh
      if (error.message && error.message.includes('401')) {
        console.log('Token may have expired, attempting refresh');
        try {
          await this.gmailApi.removeToken();
          await this.gmailApi.getToken(false);
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
        }
      }
    } finally {
      this.isCheckingEmails = false;
    }
  }
  
  async processMessage(messageId) {
    try {
      console.log(`Processing message ${messageId}`);
      const message = await this.gmailApi.getMessage(messageId);
      
      if (!message || !message.payload) {
        console.log('Invalid message format, skipping');
        return null;
      }
      
      // Extract the full content including headers, subject, and body
      let fullContent = '';
      
      // Extract subject from headers
      const headers = message.payload.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      fullContent += subject + ' ';
      
      // Extract body using recursive function
      const bodyContent = this.extractBodyContent(message.payload);
      fullContent += bodyContent;
      
      console.log('Extracted email content:', fullContent.substring(0, 300) + '...');
      
      // Extract verification code from full content
      const code = this.extractCode(fullContent);
      
      if (code) {
        console.log(`Code extracted from email: ${code}`);
        
        // Store the code with a timestamp
        this.lastFoundCode = code;
        this.lastCodeTimestamp = Date.now();
        
        return code;
      } else {
        console.log('No verification code found in message');
        return null;
      }
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      return null;
    }
  }
  
  // Recursively extract all text from message parts
  extractBodyContent(part) {
    let content = '';
    
    // If this part has a body with data
    if (part.body && part.body.data) {
      content += this.decodeBase64Url(part.body.data) + ' ';
    }
    
    // If this part has child parts, recursively extract from them
    if (part.parts && part.parts.length > 0) {
      for (const childPart of part.parts) {
        content += this.extractBodyContent(childPart) + ' ';
      }
    }
    
    return content;
  }
  
  // Decode Base64Url encoded string (used for email body)
  decodeBase64Url(data) {
    try {
      // Replace URL-safe characters back to normal base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const paddedData = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
      // Decode base64
      const rawData = atob(paddedData);
      // Convert to UTF-8 string
      return decodeURIComponent(
        Array.from(rawData)
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (error) {
      console.error('Error decoding base64:', error);
      return '';
    }
  }
  
  // Send code to all open tabs
  async sendCodeToTabs(code) {
    return new Promise((resolve) => {
      chrome.tabs.query({}, async (tabs) => {
        if (!tabs || tabs.length === 0) {
          console.log('No open tabs found');
          resolve();
          return;
        }
        
        console.log(`Sending code "${code}" to ${tabs.length} tabs`);
        let successCount = 0;
        let failCount = 0;
        let tabsProcessed = 0;
        
        const processTabResults = () => {
          if (tabsProcessed === tabs.length) {
            console.log(`Code send complete: ${successCount} successes, ${failCount} failures`);
            resolve();
          }
        };
        
        for (const tab of tabs) {
          try {
            // Skip chrome:// and other restricted URLs
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
              tabsProcessed++;
              processTabResults();
              continue;
            }
            
            // First try to send the message directly
            try {
              const result = await this.sendMessageToTab(tab.id, code);
              
              if (result.success) {
                console.log(`Code successfully filled in tab: ${tab.id}`);
                successCount++;
                tabsProcessed++;
                processTabResults();
              } else if (result.needsInjection) {
                // If content script isn't running, inject it
                console.log(`Content script not found in tab ${tab.id}, injecting it now...`);
                try {
                  // Execute the content script in the tab
                  await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                  });
                  
                  // Wait a moment for the script to initialize
                  await new Promise(r => setTimeout(r, 300));
                  
                  // Try to send the code again
                  const retryResult = await this.sendMessageToTab(tab.id, code);
                  if (retryResult.success) {
                    console.log(`Successfully injected and filled code in tab: ${tab.id}`);
                    successCount++;
                  } else {
                    console.log(`Failed to fill code after injection in tab: ${tab.id}`);
                    failCount++;
                  }
                } catch (injectionError) {
                  console.error(`Failed to inject content script: ${injectionError}`);
                  failCount++;
                }
                
                tabsProcessed++;
                processTabResults();
              } else {
                console.log(`Tab ${tab.id} failed to fill code but doesn't need injection`);
                failCount++;
                tabsProcessed++;
                processTabResults();
              }
            } catch (messageError) {
              console.error(`Error in message sending: ${messageError}`);
              failCount++;
              tabsProcessed++;
              processTabResults();
            }
          } catch (error) {
            console.error(`General error processing tab ${tab.id}:`, error);
            tabsProcessed++;
            failCount++;
            processTabResults();
          }
        }
      });
    });
  }
  
  // Send notification to all tabs that no code was found
  async sendNoCodeFoundToTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({}, async (tabs) => {
        if (!tabs || tabs.length === 0) {
          console.log('No open tabs found for no-code notification');
          resolve();
          return;
        }
        
        console.log(`Sending no-code-found notification to ${tabs.length} tabs`);
        let successCount = 0;
        let failCount = 0;
        let tabsProcessed = 0;
        
        const processTabResults = () => {
          if (tabsProcessed === tabs.length) {
            console.log(`No-code notification complete: ${successCount} successes, ${failCount} failures`);
            resolve();
          }
        };
        
        for (const tab of tabs) {
          try {
            // Skip chrome:// and other restricted URLs
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
              tabsProcessed++;
              processTabResults();
              continue;
            }
            
            // First try to send the message directly
            try {
              const result = await this.sendNoCodeMessageToTab(tab.id);
              
              if (result.success) {
                console.log(`No-code notification shown in tab: ${tab.id}`);
                successCount++;
                tabsProcessed++;
                processTabResults();
              } else if (result.needsInjection) {
                // If content script isn't running, inject it
                console.log(`Content script not found in tab ${tab.id}, injecting it now...`);
                try {
                  // Execute the content script in the tab
                  await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                  });
                  
                  // Wait a moment for the script to initialize
                  await new Promise(r => setTimeout(r, 300));
                  
                  // Try to send the notification again
                  const retryResult = await this.sendNoCodeMessageToTab(tab.id);
                  if (retryResult.success) {
                    console.log(`Successfully injected and showed no-code notification in tab: ${tab.id}`);
                    successCount++;
                  } else {
                    console.log(`Failed to show no-code notification after injection in tab: ${tab.id}`);
                    failCount++;
                  }
                } catch (injectionError) {
                  console.error(`Failed to inject content script: ${injectionError}`);
                  failCount++;
                }
                
                tabsProcessed++;
                processTabResults();
              } else {
                console.log(`Tab ${tab.id} failed to show no-code notification but doesn't need injection`);
                failCount++;
                tabsProcessed++;
                processTabResults();
              }
            } catch (messageError) {
              console.error(`Error in no-code message sending: ${messageError}`);
              failCount++;
              tabsProcessed++;
              processTabResults();
            }
          } catch (error) {
            console.error(`General error processing tab ${tab.id} for no-code notification:`, error);
            tabsProcessed++;
            failCount++;
            processTabResults();
          }
        }
      });
    });
  }
  
  // Try to send a message to a tab, returns {success, needsInjection}
  async sendMessageToTab(tabId, code) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(
          tabId, 
          { action: 'fillCode', code }, 
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message || '';
              console.log(`Error sending to tab ${tabId}: ${errorMsg}`);
              
              // Check if content script is not running (common error patterns)
              if (errorMsg.includes('receiving end does not exist') ||
                  errorMsg.includes('Could not establish connection') ||
                  errorMsg.includes('port closed') ||
                  errorMsg.includes('disconnected')) {
                resolve({ success: false, needsInjection: true });
              } else {
                resolve({ success: false, needsInjection: false });
              }
            } else if (response && response.success) {
              resolve({ success: true, needsInjection: false });
            } else {
              resolve({ success: false, needsInjection: false });
            }
          }
        );
      } catch (error) {
        console.error(`Error in sendMessageToTab: ${error}`);
        resolve({ success: false, needsInjection: false });
      }
    });
  }

  // Try to send a no-code-found message to a tab
  async sendNoCodeMessageToTab(tabId) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(
          tabId, 
          { action: 'noCodeFound' }, 
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message || '';
              console.log(`Error sending no-code notification to tab ${tabId}: ${errorMsg}`);
              
              // Check if content script is not running (common error patterns)
              if (errorMsg.includes('receiving end does not exist') ||
                  errorMsg.includes('Could not establish connection') ||
                  errorMsg.includes('port closed') ||
                  errorMsg.includes('disconnected')) {
                resolve({ success: false, needsInjection: true });
              } else {
                resolve({ success: false, needsInjection: false });
              }
            } else if (response && response.success) {
              resolve({ success: true, needsInjection: false });
            } else {
              resolve({ success: false, needsInjection: false });
            }
          }
        );
      } catch (error) {
        console.error(`Error in sendNoCodeMessageToTab: ${error}`);
        resolve({ success: false, needsInjection: false });
      }
    });
  }
  
  /**
   * Show a browser notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  showNotification(title, message) {
    // Check if the browser supports notifications
    if ('Notification' in self) {
      try {
        // Create and show the notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: title,
          message: message
        });
        console.log(`Notification shown: ${title} - ${message}`);
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    } else {
      console.log(`Notification (not shown): ${title} - ${message}`);
    }
  }
  
  // Extract verification code from text using multiple patterns
  extractCode(text) {
    if (!text) return null;
    
    console.log('Extracting code from text');
    
    // Remove all HTML tags and normalize whitespace
    const cleanText = text.replace(/<\/?[^>]+(>|$)/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
    
    // Helper function to get only the numeric part of a code and ensure proper length
    const processCode = (codeString) => {
      // Extract only the numeric digits
      const numericOnly = codeString.replace(/[^0-9]/g, '');
      console.log(`Extracted numeric part: ${numericOnly} from ${codeString}`);
      
      // Determine most likely verification code format
      // Most common verification codes are 4, 5, 6, or 8 digits
      if (numericOnly.length === 6) {
        // 6-digit code (most common)
        return numericOnly;
      } else if (numericOnly.length === 4 || numericOnly.length === 5 || numericOnly.length === 8) {
        // Other common lengths
        return numericOnly;
      } else if (numericOnly.length > 8) {
        // If too long, take first 6 digits as most likely to be a verification code
        return numericOnly.substring(0, 6);
      } else if (numericOnly.length > 6) {
        // If 7 digits, likely a 6-digit code with an extra digit
        return numericOnly.substring(0, 6);
      } else {
        // Return as is for shorter codes
        return numericOnly;
      }
    };
    
    // Patterns ordered by priority (most specific first)
    const patterns = [
      // Very specific patterns for numeric codes
      /(?:verification|auth|security|confirmation|login|sign-in|2fa|authorization)\s+code(?:\s+is|\s*:\s*)([0-9]{4,8})/i,
      /(?:your|the)\s+(?:code|otp|pin)(?:\s+is|\s*:\s*)([0-9]{4,8})/i,
      /code\s*[:=]\s*([0-9]{4,8})/i,
      
      // Common formatted codes with spaces or dashes
      /\b([0-9]{3}[\s\-][0-9]{3})\b/, // 123-456 format
      
      // Search for specific formats
      /\b([0-9]{6})\b/, // 6-digit (most common)
      /\b([0-9]{5})\b/, // 5-digit
      /\b([0-9]{4})\b/, // 4-digit PIN
      /\b([0-9]{8})\b/, // 8-digit
      
      // Look for labeled codes
      /(?:code|pin|otp|token|passcode)\s*(?:is|:|\s)\s*([a-zA-Z0-9]{4,8})/i,
      
      // Special formats
      /\b([A-Z0-9]{1,2}[\s\-]+[0-9]{5,6})\b/i, // Format like "FB - 96525"
      
      // Alphanumeric codes (less common)
      /\b([a-zA-Z0-9]{6})\b/,
      /\b([a-zA-Z0-9]{8})\b/
    ];
    
    // Extra regex for Gmail preview snippets that often show "Your verification code is 123456"
    if (text.includes('verification code') || text.includes('confirmation code')) {
      // Look for codes after confirmation/verification code phrases
      const snippetMatch = text.match(/(?:verification|confirmation)\s+code\s+(?:is|:)?\s+([0-9]{4,8})/i);
      
      if (snippetMatch && snippetMatch[1]) {
        const matchedCode = snippetMatch[1].replace(/\s+/g, '');
        console.log(`Found code from verification snippet: ${matchedCode}`);
        return processCode(matchedCode);
      }
    }
    
    // Try each pattern in order
    for (const regex of patterns) {
      const match = cleanText.match(regex);
      if (match && match[1]) {
        // Remove spaces first
        const matchedCode = match[1].replace(/\s+/g, '');
        console.log(`Found code: ${matchedCode} using pattern: ${regex}`);
        return processCode(matchedCode);
      }
    }
    
    // Last resort: look for any isolated digit sequence that might be a code
    const lastResortMatch = cleanText.match(/\b([0-9]{4,8})\b/);
    if (lastResortMatch && lastResortMatch[1]) {
      const code = lastResortMatch[1];
      console.log(`Found code using last resort pattern: ${code}`);
      return processCode(code);
    }
    
    return null;
  }
}

// Create background manager instance
const backgroundManager = new BackgroundManager();

// Handle installation and startup events
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});
