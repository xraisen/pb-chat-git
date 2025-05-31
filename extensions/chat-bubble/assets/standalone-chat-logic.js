// standalone-chat-logic.js

// --- Global Variables & Initialization ---
let activeConfig = {}; // Holds the merged configuration (defaults + fetched public config)
let shopId = window.shopifyShopId || null; // From Liquid template
let appUrl = window.shopifyAppUrl || ''; // From Liquid template
let conversationId = null; // Will be fetched from sessionStorage or API

// DOM element variables (will be assigned in createChatbotUI)
let chatbotRootContainer; // The main div provided in Liquid: #shop-ai-chatbot-root-container
let shopAiChatBubble;
let chatbotContainer; // Main chat window: #shop-ai-chat-window
let chatbotHeader;
let chatbotTitle;
let chatbotAvatarImg;
let closeChatButton;
let chatboxMessages; // Message area: #shop-ai-chat-messages
let quickRepliesContainer; // #shop-ai-quick-replies
let chatbotInputArea;
let userInputField; // #shop-ai-user-input
let sendMessageButton; // #shop-ai-send-button

let currentAssistantMessageElement = null; // To stream content into
let lastUserMessage = null; // For retrying after auth

const SESSION_STORAGE_CONVERSATION_ID_KEY = `shopAiConversationId_${shopId}`;
const SESSION_STORAGE_CHAT_OPENED_ONCE_KEY = `shopAiChatOpenedOnce_${shopId}`;

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

// --- UI Creation ---
function createChatbotUI() {
  chatbotRootContainer = document.getElementById('shop-ai-chatbot-root-container');
  if (!chatbotRootContainer) {
    console.error('Chatbot root container #shop-ai-chatbot-root-container not found!');
    return;
  }
  chatbotRootContainer.innerHTML = ''; // Clear any existing content

  // 1. Create Chat Bubble
  shopAiChatBubble = document.createElement('div');
  shopAiChatBubble.id = 'shopAiChatBubble';
  shopAiChatBubble.className = 'shop-ai-chat-bubble';
  // Simple bubble design, can be enhanced with SVG or image from config
  shopAiChatBubble.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32px" height="32px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 11H6V9h12v4zm-2-5H6V5h10v2z"/></svg>`;
  // Apply initial color from Liquid if available
  if (window.initialChatBubbleColor) {
      shopAiChatBubble.style.backgroundColor = window.initialChatBubbleColor;
  }
  chatbotRootContainer.appendChild(shopAiChatBubble);

  // 2. Create Main Chat Window (initially hidden)
  chatbotContainer = document.createElement('div');
  chatbotContainer.id = 'shop-ai-chat-window'; // Matches #chatbotContainer in CSS
  chatbotContainer.className = 'shop-ai-chat-window'; // Initially hidden via CSS
  chatbotContainer.style.display = 'none';


  // Header
  chatbotHeader = document.createElement('div');
  chatbotHeader.id = 'shop-ai-chat-header'; // Matches #chatbotHeader
  chatbotAvatarImg = document.createElement('img');
  chatbotAvatarImg.id = 'shop-ai-avatar-img'; // Matches #chatbotAvatarImg
  chatbotAvatarImg.alt = 'Avatar';
  chatbotAvatarImg.style.display = 'none'; // Hidden until src is set
  chatbotTitle = document.createElement('span');
  chatbotTitle.id = 'shop-ai-chat-title'; // Matches #chatbotTitle
  chatbotTitle.textContent = 'Chat'; // Default title
  closeChatButton = document.createElement('button');
  closeChatButton.id = 'shop-ai-chat-close-button';
  closeChatButton.innerHTML = '&times;'; // Simple close icon
  chatbotHeader.appendChild(chatbotAvatarImg);
  chatbotHeader.appendChild(chatbotTitle);
  chatbotHeader.appendChild(closeChatButton);
  chatbotContainer.appendChild(chatbotHeader);

  // Messages Area
  chatboxMessages = document.createElement('div');
  chatboxMessages.id = 'shop-ai-chat-messages'; // Matches #chatboxMessages
  chatbotContainer.appendChild(chatboxMessages);

  // Quick Replies Container
  quickRepliesContainer = document.createElement('div');
  quickRepliesContainer.id = 'shop-ai-quick-replies'; // Matches #quickRepliesContainer
  chatbotContainer.appendChild(quickRepliesContainer);

  // Input Area
  chatbotInputArea = document.createElement('div');
  chatbotInputArea.id = 'shop-ai-chat-input-area'; // Matches #chatbotInputArea
  userInputField = document.createElement('input');
  userInputField.id = 'shop-ai-user-input'; // Matches #userInputField
  userInputField.type = 'text';
  userInputField.placeholder = 'Type your message...';
  sendMessageButton = document.createElement('button');
  sendMessageButton.id = 'shop-ai-send-button'; // Matches #sendMessageButton
  sendMessageButton.textContent = 'Send';
  chatbotInputArea.appendChild(userInputField);
  chatbotInputArea.appendChild(sendMessageButton);
  chatbotContainer.appendChild(chatbotInputArea);

  chatbotRootContainer.appendChild(chatbotContainer);

  // Event Listeners
  shopAiChatBubble.addEventListener('click', toggleChatWindow);
  closeChatButton.addEventListener('click', toggleChatWindow);
  sendMessageButton.addEventListener('click', handleUserSendMessage);
  userInputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') handleUserSendMessage();
  });
}

// --- UI Toggle ---
function toggleChatWindow() {
  const isOpening = chatbotContainer.style.display === 'none';
  if (isOpening) {
    chatbotContainer.style.display = 'flex'; // Or 'block' depending on final CSS
    shopAiChatBubble.classList.add('active'); // For potential bubble animation/state change
    chatbotContainer.classList.add('active');

    const openedOnce = sessionStorage.getItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY);
    if (!openedOnce && activeConfig.functionality?.defaultGreetingMessage && chatboxMessages.children.length === 0) {
        // Display greeting only if no messages (e.g. from history) and not opened before in this session
        appendMessageToUI(activeConfig.functionality.defaultGreetingMessage, 'bot-message');
    }
    sessionStorage.setItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY, 'true');
    userInputField.focus();
    sendAnalyticsEvent('chatWidgetOpened', {});
  } else {
    chatbotContainer.style.display = 'none';
    shopAiChatBubble.classList.remove('active');
    chatbotContainer.classList.remove('active');
    sendAnalyticsEvent('chatWidgetClosed', {});
  }
}

// --- Configuration Management ---
async function fetchAndMergeConfigs() {
  // 1. Start with defaults from config.js (already loaded into window.chatbotConfig)
  activeConfig = deepMerge({}, window.chatbotConfig || defaultChatbotConfig); // Ensure defaultChatbotConfig exists if window.chatbotConfig fails

  // 2. Fetch dynamic/public config from the new API endpoint
  if (!shopId || !appUrl) {
    console.warn("Shop ID or App URL is missing. Cannot fetch dynamic config.");
    return;
  }
  try {
    const response = await fetch(`${appUrl}/api/chatbot-public-config?shop=${shopId}`);
    if (!response.ok) {
      console.error(`Error fetching public config: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error("Error body:", errorBody);
      return;
    }
    const dynamicConfig = await response.json();
    activeConfig = deepMerge(activeConfig, dynamicConfig); // Merge fetched config into activeConfig
    console.log('Successfully fetched and merged dynamic configuration.', activeConfig);
  } catch (error) {
    console.error('Failed to fetch or merge dynamic_config:', error);
  }
}

function applyAllConfigurations() {
  if (!activeConfig || Object.keys(activeConfig).length === 0) {
    console.warn("Active configuration is empty. Cannot apply settings.");
    return;
  }
  if (activeConfig.appearance) applyAppearanceConfig(activeConfig.appearance);
  if (activeConfig.positioning) applyPositioningConfig(activeConfig.positioning);
  if (activeConfig.functionality) applyFunctionalityConfig(activeConfig.functionality); // Changed from behavior
  if (activeConfig.avatar) applyAvatarConfig(activeConfig.avatar);
  if (activeConfig.userExperience) applyUXConfig(activeConfig.userExperience); // Changed from uxEnhancements
}

function applyAppearanceConfig(appearance) {
    const rootStyle = document.documentElement.style;
    // CSS Variables for broader application
    rootStyle.setProperty('--chatbox-bg-color', appearance.chatboxBackgroundColor || '#FFFFFF');
    rootStyle.setProperty('--chatbox-border-color', appearance.chatboxBorderColor || '#CCCCCC');
    rootStyle.setProperty('--user-bubble-bg-color', appearance.userBubbleColor || '#007AFF');
    rootStyle.setProperty('--bot-bubble-bg-color', appearance.botBubbleColor || '#E5E5EA');
    rootStyle.setProperty('--brand-accent-color', appearance.brandAccentColor || '#007AFF');
    rootStyle.setProperty('--input-bg-color', appearance.inputFieldBackgroundColor || '#F0F0F0');
    rootStyle.setProperty('--input-text-color', appearance.inputFieldTextColor || '#000000');

    // Direct styles
    if(chatbotContainer) {
        chatbotContainer.style.borderRadius = appearance.chatboxBorderRadius || '10px';
        chatbotContainer.style.opacity = appearance.chatboxBackgroundOpacity || '1';
        if (appearance.customBackgroundUrl) {
            chatbotContainer.style.backgroundImage = `url('${appearance.customBackgroundUrl}')`;
        } else {
            chatbotContainer.style.backgroundImage = 'none';
        }
    }
    if(chatboxMessages) {
        chatboxMessages.style.fontFamily = appearance.fontFamily || 'Arial, sans-serif';
        chatboxMessages.style.fontSize = appearance.fontSize || '16px';
         // Font weight applied via dynamic CSS rule if needed, or to individual messages
    }
    if(chatbotHeader && appearance.brandAccentColor) {
        chatbotHeader.style.backgroundColor = appearance.brandAccentColor;
    }
    if(sendMessageButton && appearance.brandAccentColor) {
        sendMessageButton.style.backgroundColor = appearance.brandAccentColor;
        // TODO: Handle sendButtonStyle, sendButtonHoverColor via dynamic CSS or classes
    }
    if(shopAiChatBubble && appearance.brandAccentColor) { // Apply to initial bubble too
        shopAiChatBubble.style.backgroundColor = appearance.brandAccentColor;
    }


    // Custom Logo
    if (chatbotHeader) {
        let logoImg = chatbotHeader.querySelector('#shop-ai-custom-logo');
        if (appearance.customLogoUrl) {
            if (!logoImg) {
                logoImg = document.createElement('img');
                logoImg.id = 'shop-ai-custom-logo';
                // chatbotHeader.insertBefore(logoImg, chatbotTitle); // Or append, depending on desired layout
            }
            logoImg.src = appearance.customLogoUrl;
            // Add styles for logoImg as needed
        } else if (logoImg) {
            logoImg.remove();
        }
    }
}

function applyPositioningConfig(positioning) {
    if (!chatbotRootContainer || !shopAiChatBubble) return;

    const containerToPosition = shopAiChatBubble; // Position the bubble initially
    const chatWindow = chatbotContainer; // Chat window position relative to bubble or screen edge

    containerToPosition.style.position = positioning.isFixed ? 'fixed' : 'absolute';
    chatWindow.style.position = positioning.isFixed ? 'fixed' : 'absolute';

    // Reset positions
    ['top', 'bottom', 'left', 'right'].forEach(prop => {
        containerToPosition.style[prop] = 'auto';
        chatWindow.style[prop] = 'auto';
    });

    // Determine if mobile view (simple check)
    const isMobile = window.innerWidth < 768; // Example breakpoint
    const customPos = isMobile ? positioning.customMobilePosition : positioning.customDesktopPosition;

    switch (positioning.screenPosition) {
        case 'bottom-left':
            containerToPosition.style.bottom = customPos?.y || '20px';
            containerToPosition.style.left = customPos?.x || '20px';
            chatWindow.style.bottom = customPos?.y || '20px'; // Adjust based on bubble height if needed
            chatWindow.style.left = customPos?.x || '20px';
            break;
        case 'top-right':
            containerToPosition.style.top = customPos?.y || '20px';
            containerToPosition.style.right = customPos?.x || '20px';
            chatWindow.style.top = customPos?.y || '20px';
            chatWindow.style.right = customPos?.x || '20px';
            break;
        case 'top-left':
            containerToPosition.style.top = customPos?.y || '20px';
            containerToPosition.style.left = customPos?.x || '20px';
            chatWindow.style.top = customPos?.y || '20px';
            chatWindow.style.left = customPos?.x || '20px';
            break;
        case 'bottom-right':
        default:
            containerToPosition.style.bottom = customPos?.y || '20px';
            containerToPosition.style.right = customPos?.x || '20px';
            chatWindow.style.bottom = customPos?.y || '20px';
            chatWindow.style.right = customPos?.x || '20px';
            break;
    }

    // Popup Trigger Logic (Simplified)
    if (positioning.popupTrigger === 'delay' && positioning.popupDelaySeconds > 0) {
        const chatOpenedSession = sessionStorage.getItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY);
        if (!chatOpenedSession) { // Only trigger if chat hasn't been manually opened this session
            setTimeout(() => {
                if (chatbotContainer.style.display === 'none') { // Check if not already open
                    toggleChatWindow(); // Open the chat window
                }
            }, positioning.popupDelaySeconds * 1000);
        }
    }
}

function applyFunctionalityConfig(functionality) {
    if(chatbotTitle) chatbotTitle.textContent = functionality.chatbotName || 'Chat Support';
    if(userInputField) userInputField.placeholder = functionality.inputPlaceholder || 'Type your message...';
    // Initial greeting message is handled by toggleChatWindow or fetchChatHistory
}

function applyAvatarConfig(avatar) {
    if (!chatbotAvatarImg) return;
    if (avatar.avatarImageUrl) {
        chatbotAvatarImg.src = avatar.avatarImageUrl;
        chatbotAvatarImg.style.display = 'inline-block'; // or 'block'
        chatbotAvatarImg.style.borderColor = avatar.avatarBorderColor || 'transparent';
        chatbotAvatarImg.style.borderWidth = avatar.avatarBorderSize || '0px';
        chatbotAvatarImg.style.borderStyle = 'solid';
        chatbotAvatarImg.style.borderRadius = avatar.avatarShape === 'square' ? '0%' : '50%';
    } else {
        chatbotAvatarImg.style.display = 'none';
    }
}

function applyUXConfig(userExperience) { // Renamed from uxEnhancements
    // Logic for speech-to-text, text-to-speech buttons (if they exist in UI)
    // Logic to render customInteractiveButtons (if any)
    // Typing indicator is handled by show/hide functions directly.
    // Form validation is more conceptual for now unless forms are dynamically rendered by chat.
    if(userExperience.customInteractiveButtons && userExperience.customInteractiveButtons.length > 0) {
        // displayQuickRepliesUI(userExperience.customInteractiveButtons, true); // true if these are "permanent" buttons
    }
}


// --- Chat Interaction & SSE ---
async function handleUserSendMessage() {
  const messageText = userInputField.value.trim();
  if (!messageText) return;

  appendMessageToUI(messageText, 'user-message');
  lastUserMessage = messageText; // Store for potential retry after auth
  userInputField.value = '';
  clearQuickRepliesUI();
  showTypingIndicatorUI();

  currentAssistantMessageElement = document.createElement('div');
  currentAssistantMessageElement.classList.add('message', 'bot-message');
  currentAssistantMessageElement.dataset.rawText = ""; // Store raw text for streaming
  const p = document.createElement('p');
  currentAssistantMessageElement.appendChild(p); // Add paragraph for content
  chatboxMessages.appendChild(currentAssistantMessageElement);
  scrollToBottomUI();

  try {
    const response = await fetch(`${appUrl}/chat`, { // Assuming /chat is your SSE endpoint in Remix
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-Shopify-Shop-Id': shopId, // Send shopId for backend context
      },
      body: JSON.stringify({
        message: messageText,
        conversation_id: conversationId,
        prompt_type: activeConfig.functionality?.systemPrompt || 'standardAssistant',
        llm_provider: activeConfig.apiManagement?.selectedAPI || 'Gemini', // Ensure this is from activeConfig
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    hideTypingIndicatorUI(); // Hide indicator once stream starts or first chunk arrives

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Process each line, as events are separated by double newlines
      const lines = value.split('\n\n');
      for (const line of lines) {
          if (line.startsWith('data: ')) {
              try {
                const jsonData = JSON.parse(line.substring(6));
                handleStreamEvent(jsonData);
              } catch (e) {
                console.error('Error parsing SSE data chunk:', e, "Chunk:", line);
              }
          }
      }
    }
  } catch (error) {
    console.error('SSE Fetch Error:', error);
    hideTypingIndicatorUI();
    if (currentAssistantMessageElement && currentAssistantMessageElement.parentNode) {
        currentAssistantMessageElement.firstChild.textContent = 'Error connecting to assistant. Please try again.';
    } else {
        appendMessageToUI('Error connecting to assistant. Please try again.', 'bot-message');
    }
    formatMessageContentUI(currentAssistantMessageElement); // Format error message too
  }
}

function handleStreamEvent(data) {
  if (!data || !data.type) return;

  if (currentAssistantMessageElement && !currentAssistantMessageElement.parentNode) {
      // If element was removed (e.g. by message_complete and then another event came for same message)
      // Re-append or create a new one. For simplicity, let's assume it should generally exist.
      // This case might indicate an issue in stream handling logic or event order.
      console.warn("currentAssistantMessageElement not in DOM, event:", data.type);
  }

  // Ensure the paragraph element exists
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
        console.log("Conversation ID updated:", conversationId);
      }
      break;
    case 'chunk':
      if (p) {
        currentAssistantMessageElement.dataset.rawText += data.content;
        p.textContent = currentAssistantMessageElement.dataset.rawText; // Simple text update for now
        scrollToBottomUI();
      }
      break;
    case 'message_complete': // LLM finished generating this specific message
      hideTypingIndicatorUI(); // Should be hidden before this, but good to ensure
      if (currentAssistantMessageElement) {
        formatMessageContentUI(currentAssistantMessageElement);
        currentAssistantMessageElement = null; // Reset for next bot message
      }
      if (data.quick_replies && data.quick_replies.length > 0) {
          displayQuickRepliesUI(data.quick_replies);
      }
      sendAnalyticsEvent('messageCompleted', { conversationId, source: 'bot' });
      break;
    case 'end_turn': // Conversation turn ended, display quick replies if any
      hideTypingIndicatorUI();
      if (currentAssistantMessageElement && currentAssistantMessageElement.dataset.rawText) {
         // If there was content streamed before end_turn without message_complete
        formatMessageContentUI(currentAssistantMessageElement);
        currentAssistantMessageElement = null;
      }
      if (data.quick_replies && data.quick_replies.length > 0) {
        displayQuickRepliesUI(data.quick_replies);
      }
      // Potentially resend last user message if auth was required and now completed.
      break;
    case 'product_results':
      hideTypingIndicatorUI();
      if (data.products && data.products.length > 0) {
        displayProductResultsUI(data.products);
      }
      break;
    case 'auth_required':
      hideTypingIndicatorUI();
      appendMessageToUI(`Please <a href="${data.auth_url}" class="auth-link" target="_blank" rel="noopener noreferrer">authenticate here</a> to continue. I'll wait for you!`, 'bot-message', true);
      // openAuthPopup(data.auth_url); // Could open programmatically
      // startTokenPolling(); // If using polling
      break;
    case 'error':
      hideTypingIndicatorUI();
      appendMessageToUI(data.message || 'An error occurred.', 'bot-message');
      break;
    // 'new_message' type could be used if backend sends fully formed messages instead of chunks
    // case 'new_message':
    //   hideTypingIndicatorUI();
    //   appendMessageToUI(data.content, 'bot-message');
    //   if (data.quick_replies && data.quick_replies.length > 0) {
    //     displayQuickRepliesUI(data.quick_replies);
    //   }
    //   break;
    default:
      console.log('Unknown SSE event type:', data.type, data);
  }
}

// --- UI Helper Functions ---
function appendMessageToUI(text, senderType, isHTML = false) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', senderType); // e.g. 'user-message' or 'bot-message'

  const p = document.createElement('p');
  if (isHTML) {
    p.innerHTML = text; // Be cautious with HTML from untrusted sources
    // Add event listeners for auth links if any
    p.querySelectorAll('a.auth-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openAuthPopup(link.href);
        });
    });
  } else {
    p.textContent = text;
  }
  messageDiv.appendChild(p);

  chatboxMessages.appendChild(messageDiv);
  scrollToBottomUI();
  if (senderType === 'user-message') {
    sendAnalyticsEvent('messageSent', { conversationId, source: 'user' });
  }
}

function formatMessageContentUI(messageElement) {
    if (!messageElement || !messageElement.dataset.rawText) return;
    let htmlContent = messageElement.dataset.rawText;
    // Basic Markdown: **bold** -> <b>bold</b>, *italic* -> <i>italic</i>
    htmlContent = htmlContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    htmlContent = htmlContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Basic Markdown: [link text](url) -> <a href="url" target="_blank">link text</a>
    htmlContent = htmlContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Convert newlines to <br>
    htmlContent = htmlContent.replace(/\n/g, '<br>');

    const p = messageElement.querySelector('p') || messageElement; // If p doesn't exist, use messageElement itself
    p.innerHTML = htmlContent;

     p.querySelectorAll('a.auth-link').forEach(link => { // Ensure auth links are interactive
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openAuthPopup(link.href);
        });
    });
}

function displayQuickRepliesUI(replies) {
  clearQuickRepliesUI();
  if (!replies || replies.length === 0) return;

  replies.forEach(reply => {
    const button = document.createElement('button');
    button.classList.add('quick-reply-button');
    button.textContent = reply.title || reply; // Assuming reply can be string or {title: "...", payload: "..."}
    button.addEventListener('click', () => {
      userInputField.value = reply.payload || reply.title || reply; // Use payload if available
      handleUserSendMessage();
      clearQuickRepliesUI();
    });
    quickRepliesContainer.appendChild(button);
  });
}

function clearQuickRepliesUI() {
    if(quickRepliesContainer) quickRepliesContainer.innerHTML = '';
}

function showTypingIndicatorUI() {
  hideTypingIndicatorUI(); // Clear any existing one first
  const typingDiv = document.createElement('div');
  typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
  // Simple 3-dot animation via CSS (ensure styles are in standalone-chat.css)
  typingDiv.innerHTML = `<span></span><span></span><span></span>`;
  chatboxMessages.appendChild(typingDiv);
  scrollToBottomUI();
}

function hideTypingIndicatorUI() {
  const typingDiv = chatboxMessages.querySelector('.typing-indicator');
  if (typingDiv) {
    typingDiv.remove();
  }
}

function scrollToBottomUI() {
  if(chatboxMessages) chatboxMessages.scrollTop = chatboxMessages.scrollHeight;
}

function displayProductResultsUI(products) {
    if (!products || products.length === 0) return;
    const productContainer = document.createElement('div');
    productContainer.className = 'product-results-container'; // Style this container

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card'; // Style this card
        // Basic structure, to be enhanced with config.productDisplay settings
        card.innerHTML = `
            ${product.image ? `<img src="${product.image.src}" alt="${product.title}" style="max-width:100px; height:auto;">` : ''}
            <h4>${product.title}</h4>
            ${product.variants && product.variants.length > 0 ? `<p>Price: ${product.variants[0].price.amount} ${product.variants[0].price.currencyCode}</p>` : ''}
            <button class="add-to-cart-btn" data-product-id="${product.id}">Add to Cart</button>
        `;
        // Add to cart button listener
        card.querySelector('.add-to-cart-btn')?.addEventListener('click', (e) => {
            const productId = e.target.dataset.productId;
            appendMessageToUI(`I'd like to add product ID ${productId} (${product.title}) to my cart.`, 'user-message');
            // Actual add to cart logic would be more complex (e.g., direct AJAX to Shopify or prompt for LLM to guide)
            sendAnalyticsEvent('addToCartClicked', { productId, productTitle: product.title });
        });
        productContainer.appendChild(card);
    });
    chatboxMessages.appendChild(productContainer);
    scrollToBottomUI();
}

// --- Authentication Popup ---
let authWindow = null;
function openAuthPopup(authUrl) {
    const width = 600, height = 700;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    authWindow = window.open(authUrl, 'shopifyAuth',
      `width=${width},height=${height},top=${top},left=${left},toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );
    // Potentially start polling for auth status after popup opens
    // startTokenPolling();
}

// --- Analytics ---
async function sendAnalyticsEvent(eventType, eventData = {}) {
  if (!activeConfig.analytics || !activeConfig.analytics[eventType]) { // Check if specific event tracking is enabled
    // console.log(`Analytics: Tracking for '${eventType}' is disabled.`);
    return;
  }
  if (!appUrl || !shopId) {
      console.warn("Analytics: App URL or Shop ID missing.");
      return;
  }
  try {
    await fetch(`${appUrl}/api/chat-analytics`, { // Assuming this is your analytics endpoint
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Id': shopId },
      body: JSON.stringify({ eventType, ...eventData, conversationId, shopId, timestamp: new Date().toISOString() }),
    });
  } catch (error) {
    console.error('Error sending analytics event:', eventType, error);
  }
}

// --- Initialization ---
async function initializeChatbot() {
  if (!shopId) {
      console.error("Shopify Shop ID not found. Chatbot cannot initialize.");
      // Display error in UI or disable chat functionality
      const rootEl = document.getElementById('shop-ai-chatbot-root-container');
      if(rootEl) rootEl.innerHTML = "<p>Error: Chatbot cannot load. Shop ID missing.</p>";
      return;
  }

  conversationId = sessionStorage.getItem(SESSION_STORAGE_CONVERSATION_ID_KEY);

  createChatbotUI(); // Build the basic structure
  await fetchAndMergeConfigs(); // Fetch dynamic config and merge with defaults
  applyAllConfigurations(); // Apply styles, positioning, text, etc.

  // Fetch chat history or display greeting
  // if (conversationId) {
  //   await fetchChatHistory(); // Implement this if history is needed
  // } else if (chatbotContainer.style.display !== 'none' && activeConfig.functionality?.defaultGreetingMessage) {
  //   // If chat is open by default and no history, show greeting
  //   // This case is less likely if chat starts hidden and greeting is shown on first open.
  //   appendMessageToUI(activeConfig.functionality.defaultGreetingMessage, 'bot-message');
  // }

  // Analytics event for when chatbot is loaded and ready on page
  sendAnalyticsEvent('chatInitialized', { shopId });
}

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', initializeChatbot);

// Fallback defaultChatbotConfig if window.chatbotConfig (from config.js) isn't loaded for some reason
const defaultChatbotConfig = {
  appearance: { chatboxBackgroundColor: '#FFFFFF', chatboxBorderColor: '#CCCCCC', userBubbleColor: '#007AFF', botBubbleColor: '#E5E5EA', brandAccentColor: '#007AFF' },
  positioning: { isFixed: true, screenPosition: 'bottom-right' },
  functionality: { chatbotName: 'Chat', defaultGreetingMessage: 'Hello!', inputPlaceholder: 'Type here...' },
  avatar: { avatarImageUrl: '', avatarShape: 'round' },
  userExperience: { showTypingIndicator: true },
  analytics: {} // Default all analytics to false/undefined if not specified
};
