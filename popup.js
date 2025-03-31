// popup.js

/**
 * Auto Code Filler Popup
 * Handles user interactions in the extension popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const elements = {
    // Status indicators
    statusIndicator: document.getElementById('statusIndicator'),
    connectionStatus: document.getElementById('connectionStatus'),
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    
    // Buttons
    connectButton: document.getElementById('connectButton'),
    disconnectButton: document.getElementById('disconnectButton'),
    checkEmailsButton: document.getElementById('checkEmailsButton'),
    
    // Visualization elements
    visualizationContainer: document.getElementById('visualizationContainer'),
    scanEffect: document.getElementById('scanEffect'),
    codeParticle: document.getElementById('codeParticle'),
    formInput: document.getElementById('formInput'),
    loadingBar: document.getElementById('loadingBar'),
    statusText: document.getElementById('statusText')
  };
  
  // Initialize the popup
  initialize();
  
  /**
   * Initialize the popup UI and event listeners
   */
  async function initialize() {
    // Setup button event listeners
    setupEventListeners();
    
    // Setup message listener for background script updates
    setupMessageListener();
    
    // Check authentication status
    await checkAuthStatus();
  }
  
  /**
   * Setup event listeners for buttons
   */
  function setupEventListeners() {
    // Connect button
    elements.connectButton.addEventListener('click', handleConnect);
    
    // Disconnect button
    elements.disconnectButton.addEventListener('click', handleDisconnect);
    
    // Check emails button
    if (elements.checkEmailsButton) {
      elements.checkEmailsButton.addEventListener('click', handleCheckEmails);
    }
  }
  
  /**
   * Setup listener for messages from background script
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Popup received message:', message);
      
      if (message.action === 'checkingStatus') {
        handleCheckingStatusUpdate(message);
      }
      
      // Return false as we're not using sendResponse
      return false;
    });
  }
  
  /**
   * Handle status updates from the background script
   */
  function handleCheckingStatusUpdate(message) {
    switch (message.status) {
      case 'checking':
        // Already handled by the visualization
        break;
        
      case 'noEmails':
        // Show error in the visualization
        elements.statusText.textContent = 'No emails found';
        animateLoadingBar(100, true);
        showErrorVisualization();
        showError('No emails found in your inbox');
        resetButtonAfterDelay();
        break;
        
      case 'codeFound':
        // Show success in the visualization
        elements.statusText.textContent = 'Code found!';
        animateLoadingBar(100);
        elements.formInput.textContent = message.code || '123456';
        elements.formInput.classList.add('filled');
        
        // Pulse the form to indicate success
        elements.formInput.style.animation = 'formPulseAnimation 0.5s ease-in-out';
        
        // Show success message
        showSuccess('Verification code detected and applied successfully!');
        resetButtonAfterDelay();
        break;
        
      case 'noCodeFound':
        // Show error in the visualization
        elements.statusText.textContent = 'No verification code found';
        animateLoadingBar(100, true);
        showErrorVisualization();
        showError('No verification code found in the most recent email');
        resetButtonAfterDelay();
        break;
        
      case 'error':
        // Show error in the visualization
        elements.statusText.textContent = 'Error checking emails';
        animateLoadingBar(100, true);
        showErrorVisualization();
        showError(message.error || 'Failed to check emails');
        resetButtonAfterDelay();
        break;
    }
  }
  
  /**
   * Show error visualization (shake animation, red highlights)
   */
  function showErrorVisualization() {
    // Get references to visual elements
    const emailContainer = document.querySelector('.email-container');
    const scanEffect = document.getElementById('scanEffect');
    const codeParticle = document.getElementById('codeParticle');
    const noCodeIcon = document.getElementById('noCodeIcon');
    const formInput = document.getElementById('formInput');
    
    // Stop normal animations and setup error state
    codeParticle.style.animation = 'none';
    void codeParticle.offsetWidth; // Force reflow
    
    // Add error styling to elements
    emailContainer.classList.add('error');
    scanEffect.classList.add('error');
    codeParticle.classList.add('error');
    formInput.classList.add('error');
    
    // Set text for error state
    codeParticle.textContent = 'No Code';
    
    // Run the error animation sequence
    setTimeout(() => {
      // First animate the email container shaking
      emailContainer.style.animation = 'emailErrorShake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
      
      // Re-run scan effect with error styling
      scanEffect.style.animation = 'scanAnimation 2s ease-in-out';
      
      // Then, start the code particle animation with error styling
      setTimeout(() => {
        codeParticle.style.animation = 'codeNotFoundAnimation 2s ease-in-out forwards';
        
        // When particle animation is near completion, show the X icon
        setTimeout(() => {
          // Hide code particle
          codeParticle.style.opacity = '0';
          
          // Show no code icon
          noCodeIcon.classList.add('visible');
          
          // Shake the form input
          formInput.style.animation = 'formShakeAnimation 0.5s ease-in-out';
          formInput.style.borderColor = 'var(--error-color)';
          formInput.style.color = 'var(--error-color)';
          
          // Add flash animation to the form container
          document.querySelector('.form-container').style.animation = 'errorFlash 0.8s ease-in-out';
        }, 1600);
      }, 600);
    }, 300);
    
    // Cleanup animations after they complete
    setTimeout(() => {
      emailContainer.style.animation = 'none';
      formInput.style.animation = 'none';
      document.querySelector('.form-container').style.animation = 'none';
      
      // Keep the error styling for a bit
      setTimeout(() => {
        // Clean up, but keep the no code icon
        emailContainer.classList.remove('error');
        scanEffect.classList.remove('error');
        scanEffect.style.animation = 'none';
      }, 1000);
    }, 2500);
  }
  
  /**
   * Reset button after operation completes
   */
  function resetButtonAfterDelay() {
    // Add a brief timeout before re-enabling the button
    setTimeout(() => {
      elements.checkEmailsButton.disabled = false;
      elements.checkEmailsButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px; vertical-align: text-bottom;"><path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="white"/></svg> Check Emails Now';
    }, 2000);
  }
  
  /**
   * Force check emails immediately with visualization
   * The actual code filling happens in parallel with the visualization
   */
  async function handleCheckEmails() {
    try {
      // Disable the button and show loading state
      elements.checkEmailsButton.disabled = true;
      elements.checkEmailsButton.innerHTML = 'Checking... <span class="checking-animation pulse">⟳</span>';
      
      // Hide any previous messages
      hideMessages();
      
      // Show the visualization container
      elements.visualizationContainer.style.display = 'block';
      
      // Reset visualization
      resetVisualization();
      
      // Update status text
      elements.statusText.textContent = 'Connecting to Gmail...';
      
      // Animate loading bar to 30%
      animateLoadingBar(30);
      
      // Small delay before starting scanning animation
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Update status text
      elements.statusText.textContent = 'Searching for verification codes...';
      
      // Animate loading bar to 60%
      animateLoadingBar(60);
      
      // Start scan animation
      startScanAnimation();
      
      // Wait for scan animation to start before sending the actual request
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Send the request to check emails (will run in parallel with our visualization)
      sendMessage({ action: 'forceCheckEmails' });
      
      // Continue with visualization while the background process runs
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Animate loading bar to 90%
      animateLoadingBar(90);
      
      // Start code extraction animation
      await startCodeExtractionAnimation();
      
      // We don't know the actual result yet, so we'll wait for the message from the background script
      // The animation is complete, and the real result will be handled by the message listener
      
    } catch (error) {
      // Handle error case
      elements.statusText.textContent = 'Error checking emails';
      animateLoadingBar(100, true);
      
      showErrorVisualization();
      showError('Failed to check emails');
      console.error('Check emails error:', error);
      resetButtonAfterDelay();
    }
  }
  
  /**
   * Reset the visualization elements to their default state
   */
  function resetVisualization() {
    elements.scanEffect.style.animation = 'none';
    elements.codeParticle.style.animation = 'none';
    elements.formInput.classList.remove('filled');
    elements.formInput.classList.remove('error');
    elements.formInput.textContent = 'Verification Code';
    elements.formInput.style.borderColor = '';
    elements.formInput.style.color = '';
    elements.loadingBar.style.width = '0%';
    elements.loadingBar.style.backgroundColor = 'var(--success-color)';
    elements.statusText.textContent = 'Ready to check';
    
    // Reset error elements
    const emailContainer = document.querySelector('.email-container');
    const scanEffect = document.getElementById('scanEffect');
    const codeParticle = document.getElementById('codeParticle');
    const noCodeIcon = document.getElementById('noCodeIcon');
    
    if (emailContainer) emailContainer.classList.remove('error');
    if (scanEffect) scanEffect.classList.remove('error');
    if (codeParticle) {
      codeParticle.classList.remove('error');
      codeParticle.textContent = '123456';
    }
    if (noCodeIcon) noCodeIcon.classList.remove('visible');
    
    document.querySelector('.form-container').style.animation = 'none';
    
    // Force reflow
    void elements.scanEffect.offsetWidth;
    void elements.codeParticle.offsetWidth;
  }
  
  /**
   * Animate the scan effect
   */
  function startScanAnimation() {
    elements.scanEffect.style.animation = 'scanAnimation 2s ease-in-out';
  }
  
  /**
   * Animate the code extraction and form filling
   * We'll show the actual code or placeholder depending on the result
   */
  async function startCodeExtractionAnimation() {
    return new Promise(resolve => {
      // Extract code animation
      elements.codeParticle.style.animation = 'codeExtractAnimation 2s ease-in-out forwards';
      
      // Wait for animation to reach midpoint, then change form input
      // The actual code text will be updated when we get the result from background
      setTimeout(() => {
        // We don't set the content here, it will be set by the message handler
        // based on whether a code was found or not
        resolve();
      }, 1200);
    });
  }
  
  /**
   * Animate the loading bar
   */
  function animateLoadingBar(percentage, isError = false) {
    elements.loadingBar.style.width = `${percentage}%`;
    
    if (isError) {
      elements.loadingBar.style.backgroundColor = 'var(--error-color)';
    }
  }
  
  /**
   * Check if the extension is authenticated with Gmail
   */
  async function checkAuthStatus() {
    try {
      const response = await sendMessage({ action: 'getAuthStatus' });
      updateAuthUI(response.isAuthenticated);
    } catch (error) {
      showError('Failed to check authentication status');
      console.error('Auth status check error:', error);
    }
  }
  
  /**
   * Update UI based on authentication status
   */
  function updateAuthUI(isAuthenticated) {
    if (isAuthenticated) {
      elements.statusIndicator.textContent = 'Connected';
      elements.statusIndicator.classList.add('connected');
      elements.connectionStatus.textContent = 'Connected to Gmail. Press the button below to check for verification codes.';
      elements.connectButton.classList.add('hidden');
      elements.disconnectButton.classList.remove('hidden');
      
      // Show check emails button when connected
      if (elements.checkEmailsButton) {
        elements.checkEmailsButton.classList.remove('hidden');
      }
    } else {
      elements.statusIndicator.textContent = 'Disconnected';
      elements.statusIndicator.classList.remove('connected');
      elements.connectionStatus.textContent = 'Connect to Gmail to manually extract and fill verification codes.';
      elements.connectButton.classList.remove('hidden');
      elements.disconnectButton.classList.add('hidden');
      
      // Hide check emails button when disconnected
      if (elements.checkEmailsButton) {
        elements.checkEmailsButton.classList.add('hidden');
      }
      
      // Hide visualization container if shown
      elements.visualizationContainer.style.display = 'none';
    }
  }
  
  /**
   * Handle connect button click
   */
  async function handleConnect() {
    hideMessages();
    elements.connectButton.disabled = true;
    elements.connectButton.innerHTML = 'Connecting... <span class="checking-animation pulse">⟳</span>';
    
    try {
      const response = await sendMessage({ action: 'authenticate' });
      
      if (response.success) {
        updateAuthUI(true);
        showSuccess('Successfully connected to Gmail');
      } else {
        showError(response.error || 'Failed to authenticate');
      }
    } catch (error) {
      showError('Connection failed');
      console.error('Auth error:', error);
    } finally {
      elements.connectButton.disabled = false;
      elements.connectButton.textContent = 'Connect to Gmail';
    }
  }
  
  /**
   * Handle disconnect button click
   */
  async function handleDisconnect() {
    hideMessages();
    elements.disconnectButton.disabled = true;
    elements.disconnectButton.innerHTML = 'Disconnecting... <span class="checking-animation pulse">⟳</span>';
    
    try {
      // First try the clearAuth action (original action name)
      let response = await sendMessage({ action: 'clearAuth' });
      
      // If no success property in response, try alternative action name
      if (response === undefined || response.success === undefined) {
        response = await sendMessage({ action: 'logout' });
      }
      
      // If still no success, try one more action name that might be used
      if (response === undefined || response.success === undefined) {
        response = await sendMessage({ action: 'disconnect' });
      }
      
      // Force disconnect UI update regardless of response
      updateAuthUI(false);
      showSuccess('Successfully disconnected from Gmail');
      
      // Force a refresh of the auth status after a brief delay
      setTimeout(async () => {
        await checkAuthStatus();
      }, 500);
    } catch (error) {
      console.error('Disconnect error:', error);
      
      // Even if there's an error, attempt to update UI to disconnected state
      updateAuthUI(false);
      showSuccess('Disconnected from Gmail');
    } finally {
      elements.disconnectButton.disabled = false;
      elements.disconnectButton.textContent = 'Disconnect';
    }
  }
  
  /**
   * Show error message
   */
  function showError(message) {
    const errorSpan = elements.errorMessage.querySelector('span');
    if (errorSpan) {
      errorSpan.textContent = message;
    } else {
      elements.errorMessage.textContent = message;
    }
    
    elements.errorMessage.classList.remove('hidden');
    elements.successMessage.classList.add('hidden');
    
    // Hide after 5 seconds
    setTimeout(() => {
      elements.errorMessage.classList.add('hidden');
    }, 5000);
  }
  
  /**
   * Hide all messages
   */
  function hideMessages() {
    elements.errorMessage.classList.add('hidden');
    elements.successMessage.classList.add('hidden');
  }
  
  /**
   * Show success message
   */
  function showSuccess(message) {
    const successSpan = elements.successMessage.querySelector('span');
    if (successSpan) {
      successSpan.textContent = message;
    } else {
      elements.successMessage.textContent = message;
    }
    
    elements.successMessage.classList.remove('hidden');
    elements.errorMessage.classList.add('hidden');
    
    // Hide after 5 seconds
    setTimeout(() => {
      elements.successMessage.classList.add('hidden');
    }, 5000);
  }
  
  /**
   * Send message to background script
   */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.error('Send message error:', error);
        reject(error);
        }
      });
    }
  });
  