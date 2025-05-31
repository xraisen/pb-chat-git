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
let quickRepliesContainer; // For LLM-suggested quick replies
let customButtonsContainer; // For persistent custom interactive buttons
let chatbotInputArea;
let userInputField;
let sendMessageButton;
let sttButton; // Speech-to-text
let ttsButton; // Text-to-speech

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
    if (!window.activeConfig || !window.activeConfig.analytics) return;
    let trackFlagKey = `track${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`;
    const eventToConfigFlagMap = {
        'addToCart': 'trackAddToCart', 'checkoutInitiated': 'trackCheckoutInitiation',
        'productCardClickedInChat': 'trackProductInteractions', 'userFeedback': 'trackUserFeedback',
    };
    if (eventToConfigFlagMap[eventType]) trackFlagKey = eventToConfigFlagMap[eventType];
    if (window.activeConfig.analytics[trackFlagKey] === false) return;

    try {
        await fetch(`${window.appUrl}/api/chat-analytics`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                shopId: window.shopifyShopId, eventType, ...eventData,
                conversationId: conversationId, timestamp: new Date().toISOString()
            })
        });
    } catch (error) {/* console.warn(`Error sending analytics event '${eventType}':`, error); */}
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

  customButtonsContainer = document.createElement('div'); // For persistent custom buttons
  customButtonsContainer.id = 'shop-ai-custom-buttons';
  chatbotContainer.appendChild(customButtonsContainer);

  quickRepliesContainer = document.createElement('div');
  quickRepliesContainer.id = 'shop-ai-quick-replies';
  chatbotContainer.appendChild(quickRepliesContainer);

  chatbotInputArea = document.createElement('div');
  chatbotInputArea.id = 'shop-ai-chat-input-area';

  // Placeholder STT/TTS buttons
  sttButton = document.createElement('button');
  sttButton.id = 'shop-ai-stt-button';
  sttButton.innerHTML = '🎤'; // Mic icon
  sttButton.style.display = 'none'; // Initially hidden
  sttButton.title = "Speech to Text (coming soon)";
  chatbotInputArea.appendChild(sttButton);

  userInputField = document.createElement('input');
  userInputField.id = 'shop-ai-user-input';
  userInputField.type = 'text';
  userInputField.placeholder = 'Type your message...';

  ttsButton = document.createElement('button');
  ttsButton.id = 'shop-ai-tts-button';
  ttsButton.innerHTML = '🔊'; // Speaker icon
  ttsButton.style.display = 'none'; // Initially hidden
  ttsButton.title = "Text to Speech (coming soon)";

  sendMessageButton = document.createElement('button');
  sendMessageButton.id = 'shop-ai-send-button';
  sendMessageButton.textContent = 'Send';

  chatbotInputArea.appendChild(userInputField);
  chatbotInputArea.appendChild(ttsButton); // Add TTS button
  chatbotInputArea.appendChild(sendMessageButton);
  chatbotContainer.appendChild(chatbotInputArea);

  chatbotRootContainer.appendChild(chatbotContainer);

  shopAiChatBubble.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  closeChatButton.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  sendMessageButton.addEventListener('click', () => { handleUserSendMessage(); recordUserActivity(); });
  userInputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') { handleUserSendMessage(); recordUserActivity(); } else { recordUserActivity(); }
  });
  userInputField.addEventListener('input', recordUserActivity); // Any typing
  chatbotContainer.addEventListener('click', recordUserActivity); // Any click within chat window
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
    recordUserActivity(); // Reset activity timer on open
  } else {
    chatbotContainer.style.display = 'none';
    shopAiChatBubble.classList.remove('active');
    chatbotContainer.classList.remove('active');
    sendAnalyticsEvent('chatWidgetClosed');
  }
}

// --- Configuration Management ---
async function fetchAndMergeConfigs() {
  activeConfig = deepMerge({}, window.chatbotConfig || defaultChatbotConfig);
  if (!shopId || !appUrl) { console.warn("Shop ID or App URL missing. Cannot fetch dynamic config."); return; }
  try {
    const response = await fetch(`${appUrl}/api/chatbot-public-config?shop=${shopId}`);
    if (!response.ok) { console.error(`Error fetching public config: ${response.status}`); return; }
    const dynamicConfig = await response.json();
    activeConfig = deepMerge(activeConfig, dynamicConfig);
    console.log('Successfully fetched and merged dynamic configuration.', activeConfig);
  } catch (error) { console.error('Failed to fetch or merge dynamic_config:', error); }
}

function applyAllConfigurations() {
  if (!activeConfig || Object.keys(activeConfig).length === 0) { console.warn("Config empty."); return; }
  if (activeConfig.appearance) applyAppearanceConfig(activeConfig.appearance);
  if (activeConfig.positioning) applyPositioningConfig(activeConfig.positioning);
  if (activeConfig.functionality) applyFunctionalityConfig(activeConfig.functionality);
  if (activeConfig.avatar) applyAvatarConfig(activeConfig.avatar);
  if (activeConfig.userExperience) applyUXConfig(activeConfig.userExperience);
  if (activeConfig.securityPrivacy) applySecurityPrivacyConfig(activeConfig.securityPrivacy);
}

function applyAppearanceConfig(appearance) { /* ... (no changes from previous) ... */ }
function applyPositioningConfig(positioning) { /* ... (no changes from previous) ... */ }
function applyFunctionalityConfig(functionality) { /* ... (no changes from previous) ... */ }

function applyAvatarConfig(avatar) {
    if (!chatbotAvatarImg) return;
    // Use customAvatarUrl from config if available, else avatarImageUrl (for backward compatibility or different naming)
    const imageUrl = avatar.customAvatarUrl || avatar.avatarImageUrl;
    if (imageUrl) {
        chatbotAvatarImg.src = imageUrl;
        chatbotAvatarImg.style.display = 'inline-block';
        chatbotAvatarImg.style.borderColor = avatar.borderColor || 'transparent';
        chatbotAvatarImg.style.borderWidth = avatar.borderWidth || avatar.avatarBorderSize || '0px'; // Prefer borderWidth
        chatbotAvatarImg.style.borderStyle = 'solid';
        chatbotAvatarImg.style.borderRadius = avatar.shape === 'square' ? '0%' : '50%';
    } else {
        chatbotAvatarImg.style.display = 'none';
    }
}

function applyUXConfig(userExperience) {
    if (sttButton) sttButton.style.display = userExperience.speechToTextEnabled ? 'inline-block' : 'none';
    if (ttsButton) ttsButton.style.display = userExperience.textToSpeechEnabled ? 'inline-block' : 'none';

    // Display custom interactive buttons
    if (userExperience.customInteractiveButtons && userExperience.customInteractiveButtons.length > 0) {
        displayCustomInteractiveButtons(userExperience.customInteractiveButtons);
    } else {
        clearCustomInteractiveButtons();
    }
    // showTypingIndicator is handled directly in showTypingIndicatorUI
}

function applySecurityPrivacyConfig(securityPrivacy) {
    if (securityPrivacy.sessionTimeoutMinutes > 0) {
        startSessionTimeout(securityPrivacy.sessionTimeoutMinutes);
    }
}

// --- Client-Side Session Timeout ---
function recordUserActivity() {
    if (activeConfig.securityPrivacy?.sessionTimeoutMinutes > 0) {
        sessionStorage.setItem(SESSION_STORAGE_LAST_ACTIVITY_KEY, Date.now().toString());
        // console.log("User activity recorded");
        if (userInputField.disabled) { // If input was disabled due to timeout
            // Optionally allow user to click a button to re-enable, or just re-enable on activity
            // For now, let's just re-enable if they type or interact.
            // This might be too simple, a dedicated "Reactivate" button would be clearer.
            // userInputField.disabled = false;
            // const timeoutMsg = chatboxMessages.querySelector('.session-timeout-message');
            // if (timeoutMsg) timeoutMsg.remove();
        }
        startSessionTimeout(activeConfig.securityPrivacy.sessionTimeoutMinutes); // Restart timer
    }
}

function startSessionTimeout(timeoutMinutes) {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    sessionTimeoutTimer = setTimeout(() => {
        const lastActivity = parseInt(sessionStorage.getItem(SESSION_STORAGE_LAST_ACTIVITY_KEY) || '0');
        const inactivityPeriod = Date.now() - lastActivity;
        if (inactivityPeriod >= timeoutMinutes * 60 * 1000) {
            appendMessageToUI(activeConfig.functionality?.idleMessage || "Session timed out due to inactivity. Please type to reactivate.", 'system-message session-timeout-message');
            userInputField.disabled = true;
            // Could add a "Reactivate" button here.
            // For now, any new activity recorded via recordUserActivity (e.g. typing) will restart the timer.
            // A click on a "Reactivate" button would call recordUserActivity() and enable input.
            let reactivateButton = document.getElementById('shop-ai-reactivate-button');
            if (!reactivateButton && chatbotInputArea) {
                reactivateButton = document.createElement('button');
                reactivateButton.id = 'shop-ai-reactivate-button';
                reactivateButton.textContent = "Reactivate Chat";
                reactivateButton.onclick = () => {
                    userInputField.disabled = false;
                    reactivateButton.remove();
                    appendMessageToUI("Chat reactivated.", "system-message");
                    recordUserActivity(); // This will reset the timer
                };
                // Insert before or after input field
                chatbotInputArea.appendChild(reactivateButton);
            }

        } else {
            // False alarm, user was active more recently than when timer was set. Restart with remaining time.
            startSessionTimeout(timeoutMinutes);
        }
    }, timeoutMinutes * 60 * 1000);
    // console.log(`Session timeout set for ${timeoutMinutes} minutes.`);
}


// --- Chat Interaction & SSE --- (handleUserSendMessage, handleStreamEvent largely same)
async function handleUserSendMessage() {
  recordUserActivity(); // Record activity before sending
  const messageText = userInputField.value.trim();
  if (!messageText) return;
  sendAnalyticsEvent('messageSent', { messageLength: messageText.length });
  appendMessageToUI(messageText, 'user-message');
  lastUserMessage = messageText;
  userInputField.value = '';
  clearQuickRepliesUI(); // Clear LLM quick replies
  // Custom interactive buttons usually remain unless explicitly cleared or managed
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

function handleStreamEvent(data) { /* ... (largely same, ensure analytics calls are correct) ... */
  if (!data || !data.type) return;
  if (currentAssistantMessageElement && !currentAssistantMessageElement.parentNode) {
      console.warn("currentAssistantMessageElement not in DOM, event:", data.type);
  }
  let p = currentAssistantMessageElement?.querySelector('p');
  if (currentAssistantMessageElement && !p) {
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
        formatMessageContentUI(currentAssistantMessageElement);
        if (currentAssistantMessageElement.dataset.rawText) {
            sendAnalyticsEvent('messageReceived', { responseLength: currentAssistantMessageElement.dataset.rawText.length, source: 'bot' });
        }
        currentAssistantMessageElement = null;
      }
      if (data.quick_replies && data.quick_replies.length > 0) displayQuickRepliesUI(data.quick_replies);
      break;
    case 'end_turn':
      hideTypingIndicatorUI();
      if (currentAssistantMessageElement?.dataset.rawText) {
        formatMessageContentUI(currentAssistantMessageElement); currentAssistantMessageElement = null;
      }
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
      appendMessageToUI(data.message || 'An error occurred.', 'bot-message');
      sendAnalyticsEvent('errorDisplayed', { errorMessage: data.message, source: 'bot' });
      break;
    default: console.log('Unknown SSE event type:', data.type, data);
  }
}

// --- UI Helper Functions ---
function appendMessageToUI(text, senderType, isHTML = false) { /* ... (largely same) ... */
  recordUserActivity(); // Any message appended is activity
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', senderType);
  const p = document.createElement('p');
  if (isHTML) {
    p.innerHTML = text;
    p.querySelectorAll('a.auth-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); openAuthPopup(link.href); });
    });
  } else { p.textContent = text; }
  messageDiv.appendChild(p);
  chatboxMessages.appendChild(messageDiv);
  scrollToBottomUI();
}

function formatMessageContentUI(messageElement) { /* ... (largely same) ... */
    if (!messageElement || !messageElement.dataset.rawText) return;
    let htmlContent = messageElement.dataset.rawText;
    htmlContent = htmlContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
    htmlContent = htmlContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        // Conceptual: Add class for checkout link analytics
        // let linkClass = url.includes('/checkout') || url.includes('/cart') ? 'checkout-link-from-bot' : '';
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    htmlContent = htmlContent.replace(/\n/g, '<br>');
    const p = messageElement.querySelector('p') || messageElement;
    p.innerHTML = htmlContent;
    p.querySelectorAll('a.auth-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); openAuthPopup(link.href); });
    });
}

function displayQuickRepliesUI(replies) { /* ... (largely same, ensure analytics call is correct) ... */
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
      clearQuickRepliesUI(); // Clear LLM replies after click
      // Custom interactive buttons might remain, handled by displayCustomInteractiveButtons
      sendAnalyticsEvent('quickReplyClicked', { text: replyText, payload: replyPayload });
    });
    quickRepliesContainer.appendChild(button);
  });
}

function clearQuickRepliesUI() { if(quickRepliesContainer) quickRepliesContainer.innerHTML = ''; }

function displayCustomInteractiveButtons(buttons) {
    if (!customButtonsContainer) return;
    customButtonsContainer.innerHTML = ''; // Clear existing
    if (!buttons || buttons.length === 0) return;

    buttons.forEach(buttonConfig => {
        const button = document.createElement('button');
        button.classList.add('custom-interactive-button'); // Add distinct class for styling
        button.textContent = buttonConfig.text;
        button.addEventListener('click', () => {
            const payload = buttonConfig.payload || buttonConfig.text; // Use payload or text
            userInputField.value = payload;
            handleUserSendMessage();
            // These buttons are usually persistent, so don't clear them here unless specified by config
            sendAnalyticsEvent('customButtonClicked', { text: buttonConfig.text, payload: payload });
        });
        customButtonsContainer.appendChild(button);
    });
}
function clearCustomInteractiveButtons() { if(customButtonsContainer) customButtonsContainer.innerHTML = '';}


function showTypingIndicatorUI() {
  if (activeConfig.userExperience?.showTypingIndicator === false) return; // Check config
  hideTypingIndicatorUI();
  const typingDiv = document.createElement('div');
  typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
  typingDiv.innerHTML = `<span></span><span></span><span></span>`;
  chatboxMessages.appendChild(typingDiv);
  scrollToBottomUI();
}
function hideTypingIndicatorUI() { /* ... (no changes) ... */ }
function scrollToBottomUI() { /* ... (no changes) ... */ }

function displayProductResultsUI(products) { /* ... (largely same, ensure analytics calls are correct) ... */
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
function openAuthPopup(authUrl) { /* ... (no changes from previous, analytics already added) ... */ }

// --- Initialization ---
async function initializeChatbot() { /* ... (no changes from previous, analytics already added) ... */ }

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', initializeChatbot);

// Fallback defaultChatbotConfig
const defaultChatbotConfig = { /* ... (no changes from previous) ... */ };
