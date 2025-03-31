// content.js

/**
 * Auto Code Filler Content Script
 * Direct approach to find and fill the correct input field
 */

// Debug level: 0=none, 1=basic, 2=verbose
const DEBUG_LEVEL = 2;

// Helper functions for logging
const logInfo = (message) => {
  if (DEBUG_LEVEL > 0) console.log(`[AutoCodeFiller] ${message}`);
};

const logDebug = (message) => {
  if (DEBUG_LEVEL > 1) console.log(`[AutoCodeFiller] ${message}`);
};

const logError = (error) => {
  console.error(`[AutoCodeFiller] Error: ${error.message || error}`);
};

// State to track if we've already filled a code in this page
let hasFilledCode = false;
let readyToFill = true;

console.log('Gmail Code Autofill: Content script loaded');

// Set up message listener immediately on script load
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'fillCode' && message.code) {
    fillVerificationCode(message.code)
      .then(success => {
        console.log(`Code fill ${success ? 'successful' : 'failed'}`);
        sendResponse({ success: success });
      })
      .catch(error => {
        console.error('Error filling code:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  } else if (message.action === 'noCodeFound') {
    // Show visual indication that no code was found
    handleNoCodeFound()
      .then(result => {
        console.log('Showed no-code-found animation');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error showing no-code animation:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // For any other message or if no code provided
  sendResponse({ success: false, error: 'Invalid request' });
  return false;
});

// Track pending code
let pendingCode = null;

// Monitor DOM changes to attempt fills on new elements
const observer = new MutationObserver((mutations) => {
  if (pendingCode) {
    // Attempt to fill any newly added inputs
    clearTimeout(window.fillDebounceTimer);
    window.fillDebounceTimer = setTimeout(() => {
      const success = forceDirectFill(pendingCode);
      if (success) {
        pendingCode = null;
      }
    }, 200); // Faster reaction to DOM changes
  }
});

// Start observing the entire document with configuration
observer.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style', 'class', 'display', 'visibility']
});

logInfo('Content script initialized with AGGRESSIVE direct approach');

/**
 * AGGRESSIVE DIRECT APPROACH: Force fill ANY visible input element
 * @param {string} code - The verification code to fill
 * @returns {boolean} Whether ANY input was successfully filled
 */
function forceDirectFill(code) {
  if (!code || code.trim() === '') {
    return false;
  }
  
  logInfo(`DIRECT FILL: Attempting to fill code: ${code}`);
  
  // Save code for future attempts with the mutation observer
  pendingCode = code;
  
  // Special case for inputtypes.com
  const hostname = window.location.hostname;
  if (hostname === 'inputtypes.com' || hostname === 'www.inputtypes.com') {
    logInfo('Detected inputtypes.com - applying special handling');
    const inputsOnSite = document.querySelectorAll('input[type="text"]');
    if (inputsOnSite.length > 0) {
      // Got it! Fill the field directly with multiple approaches
      const input = inputsOnSite[0];
      
      // Direct property assignment
        input.value = code;
      // Modify the property descriptor to ensure the value sticks
      try {
        Object.defineProperty(input, 'value', {
          value: code,
          writable: true
        });
      } catch (e) {
        // Ignore if this fails
      }
      
      // Trigger all possible events
      input.dispatchEvent(new Event('focus', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      
      logInfo(`FILLED input on inputtypes.com: ${code}`);
      return true;
    }
  }
  
  // Get ALL INPUT ELEMENTS without filtering
  const allInputs = Array.from(document.querySelectorAll('input, [contenteditable="true"], textarea'));
  
  // Find visible inputs
  const visibleInputs = allInputs.filter(input => {
    if (!input) return false;
    
    // Compute style to check visibility
    const style = window.getComputedStyle(input);
    const isVisible = style.display !== 'none' && 
                      style.visibility !== 'hidden' && 
                      style.opacity !== '0' &&
                      input.offsetWidth > 0 &&
                      input.offsetHeight > 0;
    
    if (!isVisible) return false;
    
    // Skip disabled inputs
    if (input.disabled || input.readOnly) {
      return false;
    }
    
    // Skip inputs that are checkboxes, radio buttons, submit buttons, etc.
    if (input.tagName === 'INPUT') {
      const type = input.type ? input.type.toLowerCase() : '';
      if (type === 'checkbox' || type === 'radio' || type === 'submit' || 
          type === 'button' || type === 'file' || type === 'hidden' || 
          type === 'image' || type === 'reset' || type === 'color') {
        return false;
      }
    }
    
    return true;
  });
  
  if (visibleInputs.length === 0) {
    logInfo('No visible inputs found to fill - will try again on DOM changes');
    return false;
  }
  
  logInfo(`Found ${visibleInputs.length} visible inputs to try filling`);
  
  // AGGRESSIVE APPROACH: Try to fill as many inputs as possible
  let anyFilled = false;
  
  // FIRST PRIORITY: FILL SINGLE CHARACTER INPUTS (common OTP pattern)
  const singleCharInputs = visibleInputs.filter(input => input.maxLength === 1);
  if (singleCharInputs.length >= code.length) {
    logInfo(`Found ${singleCharInputs.length} single-character inputs - likely OTP fields`);
    
    // Sort by position (left to right)
    const sortedInputs = singleCharInputs.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.left - rectB.left;
    });
    
    // These are likely character-by-character OTP inputs
    for (let i = 0; i < Math.min(code.length, sortedInputs.length); i++) {
      const input = sortedInputs[i];
      aggressiveSetValue(input, code[i]);
    }
    
    logInfo(`Filled ${Math.min(code.length, sortedInputs.length)} single-character inputs`);
    anyFilled = true;
  }
  
  // SECOND PRIORITY: Look for verification code fields specifically
  if (!anyFilled) {
    // FILL ANY INPUT THAT LOOKS LIKE A TEXT FIELD
    const textLikeInputs = visibleInputs.filter(input => {
      if (input.tagName === 'INPUT') {
        const type = input.type ? input.type.toLowerCase() : '';
        return type === 'text' || type === '' || type === 'tel' || 
              type === 'number' || type === 'password' || type === 'email';
      }
      return true; // Include contenteditable and textarea
    });
    
    // Look for verification code fields specifically
    const potentialVerificationInputs = textLikeInputs.filter(input => {
      // Check various attributes for verification keywords
      const attributes = {
        id: (input.id || '').toLowerCase(),
        name: (input.name || '').toLowerCase(),
        placeholder: (input.placeholder || '').toLowerCase(),
        className: (input.className || '').toLowerCase(),
        ariaLabel: (input.getAttribute('aria-label') || '').toLowerCase(),
        dataAttr: (input.getAttribute('data-cy') || input.getAttribute('data-test') || '').toLowerCase()
      };
      
      const verificationKeywords = [
        'code', 'verification', 'verify', 'otp', 'token', 
        'auth', 'secure', 'pin', 'confirm', 'passcode', 'tfa', '2fa'
      ];
      
      // Check if any attribute contains verification keywords
      return Object.values(attributes).some(attrValue => 
        verificationKeywords.some(keyword => attrValue.includes(keyword))
      );
    });
    
    // If we found verification inputs, use those first
    const targetInputs = potentialVerificationInputs.length > 0 
      ? potentialVerificationInputs 
      : textLikeInputs;
    
    // Sort by emptiness (prefer empty inputs) and visibility
    const sortedInputs = targetInputs.sort((a, b) => {
      // Prioritize empty inputs
      if (!a.value && b.value) return -1;
      if (a.value && !b.value) return 1;
      
      // Then prioritize inputs in view
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      
      if (isInViewport(rectA) && !isInViewport(rectB)) return -1;
      if (!isInViewport(rectA) && isInViewport(rectB)) return 1;
      
      return 0;
    });
    
    if (sortedInputs.length > 0) {
      // AGGRESSIVELY FILL THE BEST INPUT
      const bestInput = sortedInputs[0];
      logInfo(`Aggressively filling best input: ${getInputDescription(bestInput)}`);
      
      // Try multiple ways to set the value
      aggressiveSetValue(bestInput, code);
      
      // If the best input is likely an OTP input, also try to fill any other 
      // visible text inputs (some sites have multiple code inputs for redundancy)
      if (potentialVerificationInputs.length > 0 && sortedInputs.length > 1) {
        for (let i = 1; i < Math.min(3, sortedInputs.length); i++) {
          aggressiveSetValue(sortedInputs[i], code);
        }
        logInfo(`Also filled ${Math.min(2, sortedInputs.length-1)} backup inputs`);
      }
      
      anyFilled = true;
    }
  }
  
  if (anyFilled) {
    // Success! Clear the pending code
    pendingCode = null;
    return true;
  } else {
    // Keep for later DOM changes
    return false;
  }
}

/**
 * Aggressively set value on input using multiple techniques
 * @param {HTMLElement} input - The input element
 * @param {string} value - The value to set
 */
function aggressiveSetValue(input, value) {
  try {
    // 1. Direct value assignment
    input.value = value;
    
    // 2. Use property descriptor (bypasses some protections)
    try {
      Object.defineProperty(input, 'value', {
        value: value,
        writable: true
      });
    } catch (e) { /* Ignore failure */ }
    
    // 3. For contenteditable elements
    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = value;
      input.innerHTML = value;
    }
    
    // 4. Set attribute value (some frameworks track this)
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      input.setAttribute('value', value);
    }
    
    // 5. Try focus then value set
    input.focus();
    input.value = value;
    
    // 6. Trigger multiple events to ensure change detection
    const events = [
      'focus', 'input', 'change', 'keydown', 'keypress', 'keyup', 'blur'
    ];
    
    // Dispatch events in sequence
    for (const eventName of events) {
      const event = eventName.startsWith('key') 
        ? new KeyboardEvent(eventName, { bubbles: true }) 
        : new Event(eventName, { bubbles: true });
      input.dispatchEvent(event);
    }
    
    logInfo(`Set value "${value}" on input using aggressive techniques`);
  } catch (e) {
    logError(`Error in aggressiveSetValue: ${e.message}`);
  }
}

/**
 * Checks if element is in viewport
 * @param {DOMRect} rect - Element bounding rect
 * @returns {boolean} Whether element is in viewport
 */
function isInViewport(rect) {
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Get a human-readable description of an input element
 * @param {HTMLElement} input - The input element
 * @returns {string} - Description of the input
 */
function getInputDescription(input) {
  const tag = input.tagName.toLowerCase();
  const id = input.id ? `id="${input.id}"` : '';
  const name = input.name ? `name="${input.name}"` : '';
  const type = input.type ? `type="${input.type}"` : '';
  const placeholder = input.placeholder ? `placeholder="${input.placeholder}"` : '';
  
  const parts = [tag, id, name, type, placeholder].filter(p => p !== '');
  return parts.length > 0 ? parts.join(' ') : 'unnamed input';
}

/**
 * Send a ready signal to the background script
 */
function sendReadySignal() {
  try {
    chrome.runtime.sendMessage({ action: 'contentScriptReady', url: window.location.href }, 
      response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending ready signal (this is normal on first load)');
        } else if (response && response.success) {
          console.log('Background script acknowledged ready signal');
        }
      }
    );
  } catch (error) {
    console.error('Failed to send ready signal:', error);
  }
}

/**
 * Fill verification code into appropriate form fields
 * @param {string} code - The verification code to fill
 * @returns {Promise<boolean>} Whether filling was successful
 */
async function fillVerificationCode(code) {
  if (!code || !readyToFill) {
    return false;
  }
  
  // Prevent multiple fills at once
  readyToFill = false;
  
  try {
    console.log(`Attempting to fill code: ${code}`);
    
    // Find all visible input fields that might be verification code inputs
    const inputs = findVerificationInputs();
    
    if (inputs.length === 0) {
      console.log('No suitable input fields found');
      readyToFill = true;
      return false;
    }
    
    // Fill the inputs
    let fillSuccess = false;
    
    if (inputs.length === 1) {
      // Single input field - fill the whole code
      fillSuccess = fillSingleInput(inputs[0], code);
    } else if (inputs.length > 1 && code.length === inputs.length) {
      // Multiple inputs for individual digits
      fillSuccess = fillMultipleInputs(inputs, code);
    } else {
      // Try to find the best input
      fillSuccess = fillBestInput(inputs, code);
    }
    
    if (fillSuccess) {
      hasFilledCode = true;
      // Flash a subtle highlight to show success
      showFillAnimation(inputs);
      // Show a success toast
      showToast('Verification code detected and applied successfully', 'success');
    }
    
    readyToFill = true;
    return fillSuccess;
  } catch (error) {
    console.error('Error in fillVerificationCode:', error);
    readyToFill = true;
    return false;
  }
}

/**
 * Find input fields that look like verification code inputs
 * @returns {Array<HTMLElement>} Array of input elements
 */
function findVerificationInputs() {
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="image"]):not([type="range"]):not([type="color"]):not([type="date"]):not([type="datetime-local"]):not([type="month"]):not([type="time"]):not([type="week"])');
  
  // Filter for visible inputs
  const visibleInputs = Array.from(allInputs).filter(input => {
    const style = window.getComputedStyle(input);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           input.offsetParent !== null;
  });
  
  // Sort inputs by relevance
  return visibleInputs.sort((a, b) => {
    // Prioritize inputs with verification-related attributes or nearby text
    const aScore = getVerificationScore(a);
    const bScore = getVerificationScore(b);
    return bScore - aScore; // Higher score first
  });
}

/**
 * Calculate a "verification input" score based on attributes and nearby text
 * @param {HTMLElement} input - The input element to score
 * @returns {number} Score (higher is more likely to be a verification input)
 */
function getVerificationScore(input) {
  let score = 0;
  const inputAttrs = input.outerHTML.toLowerCase();
  const nearbyText = getNearbyText(input).toLowerCase();
  
  // Check attributes and nearby text for verification-related terms
  const verificationTerms = [
    'verification', 'verify', 'code', 'otp', 'one-time', 'onetime', 
    'confirm', 'confirmation', 'security', 'auth', 'authenticate', 
    'validation', 'pin', 'passcode', 'token'
  ];
  
  verificationTerms.forEach(term => {
    if (inputAttrs.includes(term)) score += 3;
    if (nearbyText.includes(term)) score += 2;
  });
  
  // Check input properties
  if (input.maxLength >= 4 && input.maxLength <= 8) score += 4;
  if (input.type === 'tel' || input.type === 'number') score += 2;
  if (input.pattern && input.pattern.includes('\\d')) score += 2;
  if (input.autocomplete === 'one-time-code') score += 5;
  
  // Input with numeric restrictions
  if (input.pattern === '[0-9]*') score += 3;
  
  // Check for digit-sized input (for separate digit inputs)
  if (input.maxLength === 1) score += 2;
  
  return score;
}

/**
 * Get text surrounding an input element
 * @param {HTMLElement} input - The input element
 * @returns {string} Nearby text content
 */
function getNearbyText(input) {
  let text = '';
  
  // Check label
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) text += ' ' + label.textContent;
  }
  
  // Check parent elements up to 3 levels
  let parent = input.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    text += ' ' + parent.textContent;
    parent = parent.parentElement;
  }
  
  // Check siblings
  const siblings = input.parentElement ? Array.from(input.parentElement.children) : [];
  siblings.forEach(sibling => {
    if (sibling !== input && sibling.tagName !== 'INPUT') {
      text += ' ' + sibling.textContent;
    }
  });
  
  return text;
}

/**
 * Fill a single input with the verification code
 * @param {HTMLElement} input - The input element to fill
 * @param {string} code - The verification code
 * @returns {boolean} Whether filling was successful
 */
function fillSingleInput(input, code) {
  try {
    // Set input value
    input.value = code;
    
    // Trigger input and change events
    triggerInputEvents(input);
    
    return true;
  } catch (error) {
    console.error('Error filling single input:', error);
    return false;
  }
}

/**
 * Fill multiple inputs with individual digits
 * @param {Array<HTMLElement>} inputs - The input elements to fill
 * @param {string} code - The verification code
 * @returns {boolean} Whether filling was successful
 */
function fillMultipleInputs(inputs, code) {
  try {
    const digits = code.split('');
    let successCount = 0;
    
    // Only fill up to the number of digits we have
    const inputsToFill = inputs.slice(0, digits.length);
    
    inputsToFill.forEach((input, index) => {
      input.value = digits[index];
      triggerInputEvents(input);
      successCount++;
    });
    
    return successCount > 0;
  } catch (error) {
    console.error('Error filling multiple inputs:', error);
    return false;
  }
}

/**
 * Find the best input to fill with the code
 * @param {Array<HTMLElement>} inputs - Available input elements
 * @param {string} code - The verification code
 * @returns {boolean} Whether filling was successful
 */
function fillBestInput(inputs, code) {
  // Try to find the best input field
  for (const input of inputs) {
    // If input has maxLength close to code length, it's likely the right one
    if (input.maxLength >= code.length || 
        (input.maxLength === 0 && input.size >= code.length)) {
      return fillSingleInput(input, code);
    }
  }
  
  // If we didn't find a good match, use the first input
  return fillSingleInput(inputs[0], code);
}

/**
 * Trigger input events to simulate user typing
 * @param {HTMLElement} input - The input element
 */
function triggerInputEvents(input) {
  // Focus the input first
  input.focus();
  
  // Trigger events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  // For React and other frameworks
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, input.value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Show a subtle animation to indicate the code was filled
 * @param {Array<HTMLElement>} inputs - The filled input elements
 */
function showFillAnimation(inputs) {
  inputs.forEach(input => {
    const originalBg = window.getComputedStyle(input).backgroundColor;
    const originalBorder = window.getComputedStyle(input).border;
    
    input.style.transition = 'all 0.3s ease';
    input.style.backgroundColor = 'rgba(84, 105, 212, 0.1)';
    input.style.borderColor = 'rgba(84, 105, 212, 0.8)';
    
    setTimeout(() => {
      input.style.backgroundColor = originalBg;
      input.style.border = originalBorder;
    }, 1000);
  });
}

/**
 * Show a subtle animation to indicate no code was found
 * @param {Array<HTMLElement>} inputs - The input elements that would have been filled
 */
function showNoCodeAnimation(inputs) {
  inputs.forEach(input => {
    const originalBg = window.getComputedStyle(input).backgroundColor;
    const originalBorder = window.getComputedStyle(input).border;
    const originalOutline = window.getComputedStyle(input).outline;
    
    input.style.transition = 'all 0.4s ease';
    input.style.backgroundColor = 'rgba(255, 99, 71, 0.08)'; // Tomato with low opacity
    input.style.borderColor = 'rgba(255, 99, 71, 0.5)';
    input.style.outline = '1px solid rgba(255, 99, 71, 0.8)';
    
    // Subtle shake animation
    const originalPosition = input.style.position;
    const originalTransform = input.style.transform;
    
    input.style.position = 'relative';
    
    // Small left-right shake
    setTimeout(() => { input.style.transform = 'translateX(-2px)'; }, 0);
    setTimeout(() => { input.style.transform = 'translateX(2px)'; }, 100);
    setTimeout(() => { input.style.transform = 'translateX(-2px)'; }, 200);
    setTimeout(() => { input.style.transform = 'translateX(0)'; }, 300);
    
    // Reset everything after animation completes
    setTimeout(() => {
      input.style.backgroundColor = originalBg;
      input.style.border = originalBorder;
      input.style.outline = originalOutline;
      input.style.position = originalPosition;
      input.style.transform = originalTransform;
    }, 1200);
  });
  
  // Also show a toast notification
  showToast('No verification code found in the most recent email');
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success', 'error', 'info')
 */
function showToast(message, type = 'error') {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('auto-code-filler-toast');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'auto-code-filler-toast';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '20px';
    toastContainer.style.right = '20px';
    toastContainer.style.zIndex = '99999';
    document.body.appendChild(toastContainer);
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.style.backgroundColor = type === 'success' ? '#4CAF50' : 
                               type === 'error' ? '#F44336' : '#2196F3';
  toast.style.color = 'white';
  toast.style.padding = '12px 16px';
  toast.style.borderRadius = '4px';
  toast.style.marginTop = '10px';
  toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.minWidth = '250px';
  toast.style.maxWidth = '350px';
  toast.style.animation = 'auto-code-filler-fadein 0.5s, auto-code-filler-fadeout 0.5s 3s';
  toast.style.animationFillMode = 'forwards';
  
  // Add icon based on type
  const icon = document.createElement('div');
  icon.style.marginRight = '12px';
  icon.innerHTML = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  icon.style.fontSize = '18px';
  toast.appendChild(icon);
  
  // Add message
  const text = document.createElement('div');
  text.textContent = message;
  text.style.flex = '1';
  text.style.fontSize = '14px';
  toast.appendChild(text);
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Add CSS for animations if not already added
  if (!document.getElementById('auto-code-filler-toast-style')) {
    const style = document.createElement('style');
    style.id = 'auto-code-filler-toast-style';
    style.textContent = `
      @keyframes auto-code-filler-fadein {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes auto-code-filler-fadeout {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove toast after animation
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3500);
}

/**
 * Handle the case when no verification code was found
 * @returns {Promise<boolean>} Whether the animation was shown
 */
async function handleNoCodeFound() {
  try {
    // Find input fields that would have been filled
    const inputs = findVerificationInputs();
    
    if (inputs.length === 0) {
      // If no inputs found, just show a toast
      showToast('No verification code found in the most recent email');
      return true;
    }
    
    // Show animation on the inputs
    showNoCodeAnimation(inputs);
    return true;
  } catch (error) {
    console.error('Error in handleNoCodeFound:', error);
    // Try to show at least a toast notification
    try {
      showToast('No verification code found');
    } catch (e) {
      // Last resort - just log it
      console.error('Failed to show any no-code-found indication:', e);
    }
    return false;
  }
}

// Let the background script know we're ready
sendReadySignal();
  