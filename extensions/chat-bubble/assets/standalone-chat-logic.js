// standalone-chat-logic.js

// --- Global Variables & Initialization ---
let activeConfig = {};
let shopId = window.shopifyShopId || null;
let appUrl = window.shopifyAppUrl || '';
let conversationId = null;

let chatbotRootContainer;
let shopAiChatBubble;
let chatbotContainer;
let chatbotHeader;
let chatbotTitle;
let chatbotAvatarImg;
let closeChatButton;
let chatboxMessages;
let quickRepliesContainer;
let customButtonsContainer;
let chatbotInputArea;
let userInputField;
let sendMessageButton;
let sttButton;
let ttsButton;

let currentAssistantMessageElement = null;
let lastUserMessage = null;

const SESSION_STORAGE_CONVERSATION_ID_KEY = `shopAiConversationId_${shopId}`;
const SESSION_STORAGE_CHAT_OPENED_ONCE_KEY = `shopAiChatOpenedOnce_${shopId}`;
const SESSION_STORAGE_LAST_ACTIVITY_KEY = `shopAiLastActivity_${shopId}`;

let sessionTimeoutTimer = null;

// --- Helper Functions ---
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target, source) {
  let output = Array.isArray(target) ? [] : {};
  if (Array.isArray(target)) {
    output = target.map(item => (isObject(item) ? deepMerge({}, item) : item));
  } else if (isObject(target)) {
    for (const key of Object.keys(target)) {
      if (isObject(target[key])) {
        output[key] = deepMerge({}, target[key]);
      } else if (Array.isArray(target[key])) {
        output[key] = target[key].map(item => (isObject(item) ? deepMerge({}, item) : item));
      } else {
        output[key] = target[key];
      }
    }
  }
  if (isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        if (output[key] && isObject(output[key])) {
          output[key] = deepMerge(output[key], source[key]);
        } else {
          output[key] = deepMerge({}, source[key]);
        }
      } else if (Array.isArray(source[key])) {
        output[key] = source[key].map(item => (isObject(item) ? deepMerge({}, item) : item));
      } else {
        output[key] = source[key];
      }
    }
  }
  return output;
}

// --- Analytics ---
async function sendAnalyticsEvent(eventType, eventData = {}) {
    if (!window.activeConfig || !window.activeConfig.analytics) {
        // console.warn("Analytics configuration not available. Skipping event:", eventType);
        return;
    }

    const eventToConfigFlagMap = {
        'chatInitialized': 'trackChatInitialized',
        'chatWidgetOpened': 'trackChatWidgetOpened',
        'chatWidgetClosed': 'trackChatWidgetClosed',
        'messageSent': 'trackMessageSent',
        'messageReceived': 'trackMessageReceived', // Assuming 'messageCompleted' maps to this
        'addToCart': 'trackAddToCart',
        'checkoutInitiated': 'trackCheckoutInitiation',
        'productCardClickedInChat': 'trackProductInteractions', // General product interaction
        'quickReplyClicked': 'trackQuickReplyClicked', // Assuming a general flag or specific
        'customerAuthenticated': 'trackCustomerAuthenticated',
        'userFeedback': 'trackUserFeedback',
        'productResultsDisplayed': 'trackProductResultsDisplayed', // Explicit flag if needed
        'errorDisplayed': 'trackErrorDisplayed', // Explicit flag if needed
        'customButtonClicked': 'trackCustomButtonClicks' // Example, ensure this matches config
    };

    const trackFlagKey = eventToConfigFlagMap[eventType] || `track${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`;

    if (window.activeConfig.analytics[trackFlagKey] === false) {
        // console.log(`Analytics for ${eventType} (via ${trackFlagKey}) is disabled.`);
        return;
    }
    // If flag is undefined (not explicitly in config), default to tracking.

    // console.log(`Sending analytics event: ${eventType}`, { ...eventData, conversationId });

    try {
        const payload = {
            shopId: window.shopifyShopId,
            eventType,
            eventData: { // Keep eventData nested as per original backend expectation
                ...eventData
            },
            conversationId: conversationId, // Ensure conversationId is at top level of payload
            timestamp: new Date().toISOString()
        };
        // Remove eventData.conversationId if it was accidentally passed in eventData
        if (payload.eventData?.conversationId) delete payload.eventData.conversationId;


        const response = await fetch(`${window.appUrl}/api/chat-analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // console.warn(`Failed to send analytics event '${eventType}'. Status: ${response.status}`);
        }
    } catch (error) {
        // console.warn(`Error sending analytics event '${eventType}':`, error);
    }
}


// --- UI Creation ---
function createChatbotUI() {
  chatbotRootContainer = document.getElementById('shop-ai-chatbot-root-container');
  if (!chatbotRootContainer) { console.error('Chatbot root container not found!'); return; }
  chatbotRootContainer.innerHTML = '';

  shopAiChatBubble = document.createElement('div');
  shopAiChatBubble.id = 'shopAiChatBubble';
  shopAiChatBubble.className = 'shop-ai-chat-bubble';
  shopAiChatBubble.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32px" height="32px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 11H6V9h12v4zm-2-5H6V5h10v2z"/></svg>`;
  if (window.initialChatBubbleColor) shopAiChatBubble.style.backgroundColor = window.initialChatBubbleColor;
  chatbotRootContainer.appendChild(shopAiChatBubble);

  chatbotContainer = document.createElement('div');
  chatbotContainer.id = 'shop-ai-chat-window';
  chatbotContainer.className = 'shop-ai-chat-window';
  chatbotContainer.style.display = 'none';

  chatbotHeader = document.createElement('div');
  chatbotHeader.id = 'shop-ai-chat-header';
  chatbotAvatarImg = document.createElement('img');
  chatbotAvatarImg.id = 'shop-ai-avatar-img';
  chatbotAvatarImg.alt = 'Avatar';
  chatbotAvatarImg.style.display = 'none';
  chatbotTitle = document.createElement('span');
  chatbotTitle.id = 'shop-ai-chat-title';
  chatbotTitle.textContent = 'Chat';
  closeChatButton = document.createElement('button');
  closeChatButton.id = 'shop-ai-chat-close-button';
  closeChatButton.innerHTML = '&times;';
  chatbotHeader.appendChild(chatbotAvatarImg);
  chatbotHeader.appendChild(chatbotTitle);
  chatbotHeader.appendChild(closeChatButton);
  chatbotContainer.appendChild(chatbotHeader);

  chatboxMessages = document.createElement('div');
  chatboxMessages.id = 'shop-ai-chat-messages';
  chatbotContainer.appendChild(chatboxMessages);

  customButtonsContainer = document.createElement('div');
  customButtonsContainer.id = 'shop-ai-custom-buttons';
  chatbotContainer.appendChild(customButtonsContainer);

  quickRepliesContainer = document.createElement('div');
  quickRepliesContainer.id = 'shop-ai-quick-replies';
  chatbotContainer.appendChild(quickRepliesContainer);

  chatbotInputArea = document.createElement('div');
  chatbotInputArea.id = 'shop-ai-chat-input-area';

  sttButton = document.createElement('button');
  sttButton.id = 'shop-ai-stt-button';
  sttButton.innerHTML = '🎤';
  sttButton.style.display = 'none';
  sttButton.title = "Speech to Text (coming soon)";
  chatbotInputArea.appendChild(sttButton);

  userInputField = document.createElement('input');
  userInputField.id = 'shop-ai-user-input';
  userInputField.type = 'text';
  userInputField.placeholder = 'Type your message...';

  ttsButton = document.createElement('button');
  ttsButton.id = 'shop-ai-tts-button';
  ttsButton.innerHTML = '🔊';
  ttsButton.style.display = 'none';
  ttsButton.title = "Text to Speech (coming soon)";

  sendMessageButton = document.createElement('button');
  sendMessageButton.id = 'shop-ai-send-button';
  sendMessageButton.textContent = 'Send';

  chatbotInputArea.appendChild(userInputField);
  chatbotInputArea.appendChild(ttsButton);
  chatbotInputArea.appendChild(sendMessageButton);
  chatbotContainer.appendChild(chatbotInputArea);

  chatbotRootContainer.appendChild(chatbotContainer);

  shopAiChatBubble.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  closeChatButton.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  sendMessageButton.addEventListener('click', () => { handleUserSendMessage(); recordUserActivity(); });
  userInputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') { handleUserSendMessage(); recordUserActivity(); } else { recordUserActivity(); }
  });
  userInputField.addEventListener('input', recordUserActivity);
  chatbotContainer.addEventListener('click', recordUserActivity);
}

// --- UI Toggle ---
function toggleChatWindow() {
  const isOpening = chatbotContainer.style.display === 'none';
  if (isOpening) {
    chatbotContainer.style.display = 'flex';
    shopAiChatBubble.classList.add('active');
    chatbotContainer.classList.add('active');
    const openedOnce = sessionStorage.getItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY);
    if (!openedOnce && activeConfig.functionality?.defaultGreetingMessage && chatboxMessages.children.length === 0) {
        appendMessageToUI(activeConfig.functionality.defaultGreetingMessage, 'bot-message');
    }
    sessionStorage.setItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY, 'true');
    userInputField.focus();
    sendAnalyticsEvent('chatWidgetOpened');
    recordUserActivity();
  } else {
    chatbotContainer.style.display = 'none';
    shopAiChatBubble.classList.remove('active');
    chatbotContainer.classList.remove('active');
    sendAnalyticsEvent('chatWidgetClosed');
  }
}

// --- Configuration Management ---
async function fetchAndMergeConfigs() { /* ... (no changes) ... */ }
function applyAllConfigurations() { /* ... (no changes) ... */ }
function applyAppearanceConfig(appearance) { /* ... (no changes) ... */ }
function applyPositioningConfig(positioning) { /* ... (no changes) ... */ }
function applyFunctionalityConfig(functionality) { /* ... (no changes) ... */ }
function applyAvatarConfig(avatar) { /* ... (no changes from previous, already using customAvatarUrl or avatarImageUrl) ... */ }

function applyUXConfig(userExperience) {
    if (sttButton) sttButton.style.display = userExperience.speechToTextEnabled ? 'inline-block' : 'none';
    if (ttsButton) ttsButton.style.display = userExperience.textToSpeechEnabled ? 'inline-block' : 'none';
    if (userExperience.customInteractiveButtons && userExperience.customInteractiveButtons.length > 0) {
        displayCustomInteractiveButtons(userExperience.customInteractiveButtons);
    } else {
        clearCustomInteractiveButtons();
    }
}

function applySecurityPrivacyConfig(securityPrivacy) { /* ... (no changes) ... */ }
function recordUserActivity() { /* ... (no changes) ... */ }
function startSessionTimeout(timeoutMinutes) { /* ... (no changes) ... */ }

// --- Chat Interaction & SSE ---
async function handleUserSendMessage() {
  recordUserActivity();
  const messageText = userInputField.value.trim();
  if (!messageText) return;
  sendAnalyticsEvent('messageSent', { messageLength: messageText.length }); // conversationId added by sendAnalyticsEvent
  appendMessageToUI(messageText, 'user-message');
  lastUserMessage = messageText;
  userInputField.value = '';
  clearQuickRepliesUI();
  showTypingIndicatorUI();
  currentAssistantMessageElement = document.createElement('div');
  currentAssistantMessageElement.classList.add('message', 'bot-message');
  currentAssistantMessageElement.dataset.rawText = "";
  const p = document.createElement('p');
  currentAssistantMessageElement.appendChild(p);
  chatboxMessages.appendChild(currentAssistantMessageElement);
  scrollToBottomUI();
  try {
    const response = await fetch(`${appUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'X-Shopify-Shop-Id': shopId },
      body: JSON.stringify({
        message: messageText, conversation_id: conversationId,
        prompt_type: activeConfig.functionality?.systemPrompt || 'standardAssistant',
        llm_provider: activeConfig.apiManagement?.selectedAPI || 'Gemini',
      }),
    });
    if (!response.ok || !response.body) throw new Error(`API request failed: ${response.status}`);
    hideTypingIndicatorUI();
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = value.split('\n\n');
      for (const line of lines) {
          if (line.startsWith('data: ')) {
              try { const jsonData = JSON.parse(line.substring(6)); handleStreamEvent(jsonData); }
              catch (e) { console.error('Error parsing SSE data chunk:', e, "Chunk:", line); }
          }
      }
    }
  } catch (error) {
    console.error('SSE Fetch Error:', error);
    hideTypingIndicatorUI();
    if (currentAssistantMessageElement?.parentNode) {
        currentAssistantMessageElement.firstChild.textContent = 'Error connecting to assistant.';
    } else { appendMessageToUI('Error connecting to assistant.', 'bot-message'); }
    if(currentAssistantMessageElement) formatMessageContentUI(currentAssistantMessageElement);
  }
}

function handleStreamEvent(data) {
  if (!data || !data.type) return;
  // ... (id, chunk cases unchanged)
  let p = currentAssistantMessageElement?.querySelector('p');
  if (currentAssistantMessageElement && !p && (data.type === 'chunk' || data.type === 'message_complete' || data.type === 'end_turn')) {
      p = document.createElement('p');
      currentAssistantMessageElement.appendChild(p);
  }

  switch (data.type) {
    case 'id':
      if (data.conversation_id && conversationId !== data.conversation_id) {
        conversationId = data.conversation_id;
        sessionStorage.setItem(SESSION_STORAGE_CONVERSATION_ID_KEY, conversationId);
      }
      break;
    case 'chunk':
      if (p) { currentAssistantMessageElement.dataset.rawText += data.content; p.textContent = currentAssistantMessageElement.dataset.rawText; scrollToBottomUI(); }
      break;
    case 'message_complete':
      hideTypingIndicatorUI();
      if (currentAssistantMessageElement) {
        formatMessageContentUI(currentAssistantMessageElement); // This will also add feedback UI
        if (currentAssistantMessageElement.dataset.rawText) {
            sendAnalyticsEvent('messageReceived', {
                responseLength: currentAssistantMessageElement.dataset.rawText.length,
                source: 'bot'
            });
        }
        currentAssistantMessageElement = null;
      }
      if (data.quick_replies && data.quick_replies.length > 0) displayQuickRepliesUI(data.quick_replies);
      break;
    case 'end_turn':
      hideTypingIndicatorUI();
      if (currentAssistantMessageElement?.dataset.rawText && !currentAssistantMessageElement.querySelector('.shop-ai-feedback-container')) { // Ensure feedback UI not already added
        formatMessageContentUI(currentAssistantMessageElement); // Add feedback UI if message had content
      }
      if (currentAssistantMessageElement) currentAssistantMessageElement = null; // Reset if it was just an empty turn with quick replies

      if (data.quick_replies && data.quick_replies.length > 0) displayQuickRepliesUI(data.quick_replies);
      break;
    case 'product_results':
      hideTypingIndicatorUI();
      if (data.products?.length > 0) { displayProductResultsUI(data.products); sendAnalyticsEvent('productResultsDisplayed', { productCount: data.products.length }); }
      break;
    case 'auth_required':
      hideTypingIndicatorUI();
      appendMessageToUI(`Please <a href="${data.auth_url}" class="auth-link" target="_blank" rel="noopener noreferrer">authenticate here</a> to continue.`, 'bot-message', true);
      break;
    case 'error':
      hideTypingIndicatorUI();
      appendMessageToUI(data.message || 'An error occurred.', 'bot-message'); // Feedback UI won't be added here unless appendMessageToUI is modified
      sendAnalyticsEvent('errorDisplayed', { errorMessage: data.message, source: 'bot' });
      break;
    default: console.log('Unknown SSE event type:', data.type, data);
  }
}

// --- UI Helper Functions ---
let messageCounter = 0; // For unique message IDs

function appendMessageToUI(text, senderType, isHTML = false) {
  recordUserActivity();
  const messageId = `msg-${Date.now()}-${messageCounter++}`;
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', senderType);
  messageDiv.dataset.messageId = messageId;

  const p = document.createElement('p');
  if (isHTML) {
    p.innerHTML = text;
    p.querySelectorAll('a.auth-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); openAuthPopup(link.href); });
    });
    // Conceptual: Add event listener for checkout links
    p.querySelectorAll('a').forEach(link => {
        if (link.href.includes('/checkout') || link.href.includes('/cart')) { // Basic check
            link.addEventListener('click', () => {
                sendAnalyticsEvent('checkoutInitiated', { url: link.href });
            });
        }
    });
  } else { p.textContent = text; }
  messageDiv.appendChild(p);

  // Add feedback UI for assistant messages, but not for system messages or error messages from appendMessageToUI itself
  if (senderType === 'bot-message' && !messageDiv.classList.contains('session-timeout-message') && !messageDiv.classList.contains('system-message')) {
      const feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'shop-ai-feedback-container';

      const thumbsUpBtn = document.createElement('button');
      thumbsUpBtn.className = 'feedback-btn thumbs-up';
      thumbsUpBtn.innerHTML = '👍';
      thumbsUpBtn.onclick = () => {
          sendAnalyticsEvent('userFeedback', { rating: 'up', messageId: messageId });
          feedbackContainer.innerHTML = '<span class="feedback-thanks">Thanks!</span>';
      };

      const thumbsDownBtn = document.createElement('button');
      thumbsDownBtn.className = 'feedback-btn thumbs-down';
      thumbsDownBtn.innerHTML = '👎';
      thumbsDownBtn.onclick = () => {
          sendAnalyticsEvent('userFeedback', { rating: 'down', messageId: messageId });
          feedbackContainer.innerHTML = '<span class="feedback-thanks">Thanks for the feedback!</span>';
      };

      feedbackContainer.appendChild(thumbsUpBtn);
      feedbackContainer.appendChild(thumbsDownBtn);
      messageDiv.appendChild(feedbackContainer);
  }

  chatboxMessages.appendChild(messageDiv);
  scrollToBottomUI();
}

function formatMessageContentUI(messageElement) {
    if (!messageElement || !messageElement.dataset.rawText) return;
    let htmlContent = messageElement.dataset.rawText;
    htmlContent = htmlContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
    htmlContent = htmlContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        let linkClass = '';
        if (url.includes('/checkout') || url.includes('/cart')) {
            linkClass = 'checkout-link-from-bot'; // Add class for potential specific tracking
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${text}</a>`;
    });
    htmlContent = htmlContent.replace(/\n/g, '<br>');
    const p = messageElement.querySelector('p') || messageElement;
    p.innerHTML = htmlContent;
    p.querySelectorAll('a.auth-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); openAuthPopup(link.href); });
    });
    p.querySelectorAll('a.checkout-link-from-bot').forEach(link => {
        link.addEventListener('click', (e) => {
            // e.preventDefault(); // Optional: prevent default if you handle navigation specially
            sendAnalyticsEvent('checkoutInitiated', { url: link.href });
        });
    });

    // Add feedback UI if not already present (e.g. if message_complete didn't add it)
    if (messageElement.classList.contains('bot-message') && !messageElement.querySelector('.shop-ai-feedback-container')) {
        const feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'shop-ai-feedback-container';
        const thumbsUpBtn = document.createElement('button');
        thumbsUpBtn.className = 'feedback-btn thumbs-up'; thumbsUpBtn.innerHTML = '👍';
        thumbsUpBtn.onclick = () => {
            sendAnalyticsEvent('userFeedback', { rating: 'up', messageId: messageElement.dataset.messageId });
            feedbackContainer.innerHTML = '<span class="feedback-thanks">Thanks!</span>';
        };
        const thumbsDownBtn = document.createElement('button');
        thumbsDownBtn.className = 'feedback-btn thumbs-down'; thumbsDownBtn.innerHTML = '👎';
        thumbsDownBtn.onclick = () => {
            sendAnalyticsEvent('userFeedback', { rating: 'down', messageId: messageElement.dataset.messageId });
            feedbackContainer.innerHTML = '<span class="feedback-thanks">Thanks for the feedback!</span>';
        };
        feedbackContainer.appendChild(thumbsUpBtn); feedbackContainer.appendChild(thumbsDownBtn);
        messageElement.appendChild(feedbackContainer);
    }
}

function displayQuickRepliesUI(replies) {
  clearQuickRepliesUI();
  if (!replies || replies.length === 0) return;
  replies.forEach(reply => {
    const button = document.createElement('button');
    button.classList.add('quick-reply-button');
    const replyText = reply.title || (typeof reply === 'string' ? reply : 'Reply');
    const replyPayload = reply.payload || replyText;
    button.textContent = replyText;
    button.addEventListener('click', () => {
      userInputField.value = replyPayload;
      handleUserSendMessage();
      clearQuickRepliesUI();
      sendAnalyticsEvent('quickReplyClicked', { text: replyText, payload: replyPayload });
    });
    quickRepliesContainer.appendChild(button);
  });
}

function clearQuickRepliesUI() { if(quickRepliesContainer) quickRepliesContainer.innerHTML = ''; }

function displayCustomInteractiveButtons(buttons) {
    if (!customButtonsContainer) return;
    customButtonsContainer.innerHTML = '';
    if (!buttons || buttons.length === 0) return;
    buttons.forEach(buttonConfig => {
        const button = document.createElement('button');
        button.classList.add('custom-interactive-button');
        button.textContent = buttonConfig.text;
        button.addEventListener('click', () => {
            const payload = buttonConfig.payload || buttonConfig.text;
            userInputField.value = payload;
            handleUserSendMessage();
            sendAnalyticsEvent('customButtonClicked', { text: buttonConfig.text, payload: payload });
        });
        customButtonsContainer.appendChild(button);
    });
}
function clearCustomInteractiveButtons() { if(customButtonsContainer) customButtonsContainer.innerHTML = '';}

function showTypingIndicatorUI() {
  if (activeConfig.userExperience?.showTypingIndicator === false) return;
  hideTypingIndicatorUI();
  const typingDiv = document.createElement('div');
  typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
  typingDiv.innerHTML = `<span></span><span></span><span></span>`;
  chatboxMessages.appendChild(typingDiv);
  scrollToBottomUI();
}
function hideTypingIndicatorUI() { const el = chatboxMessages?.querySelector('.typing-indicator'); if(el) el.remove(); }
function scrollToBottomUI() { if(chatboxMessages) chatboxMessages.scrollTop = chatboxMessages.scrollHeight; }

function displayProductResultsUI(products) {
    if (!products || products.length === 0) return;
    const productContainer = document.createElement('div');
    productContainer.className = 'product-results-container';
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = product.id;
        card.innerHTML = `
            ${product.image ? `<img src="${product.image.src}" alt="${product.title || 'Product Image'}" style="max-width:100px; height:auto;">` : ''}
            <h4>${product.title || 'Product'}</h4>
            ${product.variants?.[0] ? `<p>Price: ${product.variants[0].price.amount} ${product.variants[0].price.currencyCode}</p>` : ''}
            ${activeConfig.productDisplay?.addToCartButtonEnabled ? `<button class="add-to-cart-btn" data-product-id="${product.id}">Add to Cart</button>` : ''}
        `;
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-to-cart-btn')) return;
            sendAnalyticsEvent('productCardClickedInChat', { productId: product.id, productTitle: product.title });
        });
        const addToCartBtn = card.querySelector('.add-to-cart-btn');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sendAnalyticsEvent('addToCart', { productId: product.id, productTitle: product.title });
            });
        }
        productContainer.appendChild(card);
    });
    chatboxMessages.appendChild(productContainer);
    scrollToBottomUI();
}

// --- Authentication Popup ---
let authWindow = null;
function openAuthPopup(authUrl) {
    sendAnalyticsEvent('authenticationAttempted', { authUrl }); // Already present
    const width = 600, height = 700;
    const left = (screen.width / 2) - (width / 2); const top = (screen.height / 2) - (height / 2);
    authWindow = window.open(authUrl, 'shopifyAuth', `width=${width},height=${height},top=${top},left=${left},toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes`);
    // Conceptual: function startTokenPolling() { ... if (data.status === 'authorized') sendAnalyticsEvent('customerAuthenticated'); ... }
}

// --- Initialization ---
async function initializeChatbot() {
  if (!shopId) {
      console.error("Shopify Shop ID not found. Chatbot cannot initialize.");
      const rootEl = document.getElementById('shop-ai-chatbot-root-container');
      if(rootEl) rootEl.innerHTML = "<p>Error: Chatbot cannot load. Shop ID missing.</p>";
      return;
  }
  conversationId = sessionStorage.getItem(SESSION_STORAGE_CONVERSATION_ID_KEY);
  createChatbotUI();
  await fetchAndMergeConfigs();
  applyAllConfigurations();
  if (chatbotContainer && chatbotContainer.style.display !== 'none') {
      if (conversationId) { /* await fetchChatHistory(); */ }
      else if (activeConfig.functionality?.defaultGreetingMessage && chatboxMessages.children.length === 0) {
          appendMessageToUI(activeConfig.functionality.defaultGreetingMessage, 'bot-message');
      }
  }
  sendAnalyticsEvent('chatInitialized');
}

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', initializeChatbot);

// Fallback defaultChatbotConfig
const defaultChatbotConfig = {
  appearance: { chatboxBackgroundColor: '#FFFFFF', chatboxBorderColor: '#CCCCCC', userBubbleColor: '#007AFF', botBubbleColor: '#E5E5EA', brandAccentColor: '#007AFF' },
  positioning: { isFixed: true, screenPosition: 'bottom-right' },
  functionality: { chatbotName: 'Chat', defaultGreetingMessage: 'Hello!', inputPlaceholder: 'Type here...' },
  avatar: { avatarImageUrl: '', avatarShape: 'round' },
  userExperience: { showTypingIndicator: true },
  analytics: {
    trackChatInitialized: true, trackChatWidgetOpened: true, trackChatWidgetClosed: true,
    trackMessageSent: true, trackMessageReceived: true, trackAddToCart: true,
    trackCheckoutInitiated: true, trackProductInteractions: true, trackQuickReplyClicked: true,
    trackAuthenticationAttempted: true, trackCustomerAuthenticated: true, trackUserFeedback: true,
    trackErrorDisplayed: true, trackProductResultsDisplayed: true, trackCustomButtonClicks: true,
  }
};
