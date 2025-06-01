/**
 * Shop AI Chat - Client-side implementation
 */
(function() {
  'use strict';

  const ShopAIChat = {
    State: {
      conversationId: null,
      isChatOpenedEver: false, // To log CHAT_OPENED only once per page load session if desired
    },

    Log: {
      sendInteraction: async function(eventType, eventDetail = {}) {
        const config = window.shopChatConfig || {};
        const shopDomain = config.shopDomain || (window.Shopify && window.Shopify.shop);

        if (!shopDomain) {
          console.warn("Shop AI Chat Log: Shop domain not configured/available. Cannot send interaction for event:", eventType);
          return;
        }

        // For CHAT_OPENED, conversationId might be null if it's the very first interaction.
        // The API endpoint can handle a null conversationId or generate a temporary one if needed for such events.
        let currentConversationId = ShopAIChat.State.conversationId;
        if (!currentConversationId && eventType !== "CHAT_OPENED") {
             console.warn(`Shop AI Chat Log: Conversation ID not available for event type "${eventType}".`);
             // Depending on strictness, might return or use a placeholder.
             // For now, we'll allow it to be sent as null or let backend assign a temporary if needed.
        }


        const logData = {
          shop: shopDomain,
          conversationId: currentConversationId, // Can be null for CHAT_OPENED
          eventType: eventType,
          eventDetail: eventDetail
        };

        try {
          const baseUrl = window.shopAiApiBaseUrl || '';
          const response = await fetch(`${baseUrl}/api/log-interaction`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(logData),
          });

          if (!response.ok) {
            // console.error('Shop AI Chat Log: API Error:', response.status, await response.text());
          } else {
            // console.log('Shop AI Chat Log: Interaction logged successfully', eventType);
          }
        } catch (error) {
          console.error('Shop AI Chat Log: Failed to send interaction log for event ' + eventType + ':', error);
        }
      }
    },

    UI: {
      elements: {},
      isMobile: false,

      init: function(container) {
        if (!container) return;
        const config = window.shopChatConfig || {};

        this.elements = {
          container: container,
          chatBubble: container.querySelector('.shop-ai-chat-bubble'),
          chatWindow: container.querySelector('.shop-ai-chat-window'),
          chatHeader: container.querySelector('.shop-ai-chat-header'),
          chatHeaderTitle: container.querySelector('.shop-ai-chat-header div'),
          closeButton: container.querySelector('.shop-ai-chat-close'),
          chatInput: container.querySelector('.shop-ai-chat-input input'),
          sendButton: container.querySelector('.shop-ai-chat-send'),
          messagesContainer: container.querySelector('.shop-ai-chat-messages')
        };

        this.applyDynamicStyles(config);
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.setupEventListeners();
        if (this.isMobile) {
          this.setupMobileViewport();
        }
      },

      applyDynamicStyles: function(config) {
        const { container, chatWindow, chatBubble, chatHeaderTitle, chatHeader } = this.elements;

        if (chatHeaderTitle && config.botName) {
          chatHeaderTitle.textContent = config.botName;
        }

        if (chatHeader && config.avatarUrl) {
          let avatarElement = chatHeader.querySelector('.shop-ai-chat-avatar');
          if (!avatarElement) {
            avatarElement = document.createElement('img');
            avatarElement.className = 'shop-ai-chat-avatar';
            if(chatHeaderTitle) {
                 chatHeader.insertBefore(avatarElement, chatHeaderTitle);
            } else {
                 chatHeader.prepend(avatarElement);
            }
          }
          avatarElement.src = config.avatarUrl;
          avatarElement.style.display = '';
        } else if (chatHeader) {
          const existingAvatar = chatHeader.querySelector('.shop-ai-chat-avatar');
          if (existingAvatar) existingAvatar.style.display = 'none';
        }

        if (chatWindow) {
            if (config.width) chatWindow.style.width = config.width;
            if (config.height) chatWindow.style.height = config.height;
        }
        if (container && config.zIndex) {
             container.style.zIndex = config.zIndex;
        }

        if (container && config.position) {
            container.classList.remove('chat-pos-left', 'chat-pos-right');
            container.classList.add(config.position === 'left' ? 'chat-pos-left' : 'chat-pos-right');
        }

        if (container) {
            const colorMap = {
              '--chatbot-bg-color': config.bgColor,
              '--chatbot-text-color': config.textColor,
              '--chatbot-button-color': config.buttonColor,
              '--chatbot-header-bg-color': config.headerBgColor,
              '--chatbot-header-text-color': config.headerTextColor,
              '--chatbot-user-msg-bg-color': config.userMsgBgColor,
              '--chatbot-user-msg-text-color': config.userMsgTextColor,
              '--chatbot-assistant-msg-bg-color': config.assistantMsgBgColor,
              '--chatbot-assistant-msg-text-color': config.assistantMsgTextColor,
              '--chatbot-bubble-color': config.chatBubbleColor
            };
            for (const [cssVar, value] of Object.entries(colorMap)) {
              if (value) {
                container.style.setProperty(cssVar, value);
              }
            }
        }

        if (chatBubble) {
            if (config.chatBubbleSize) {
                chatBubble.style.width = config.chatBubbleSize;
                chatBubble.style.height = config.chatBubbleSize;
            }
            if (config.chatBubbleIcon === 'custom' && config.customChatBubbleSVG) {
                chatBubble.innerHTML = config.customChatBubbleSVG;
            } else if (config.chatBubbleIcon === 'question') {
                chatBubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            } else {
                 chatBubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
            }
        }

        if (config.customCSS) {
          let styleElement = document.getElementById('shop-ai-custom-css');
          if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'shop-ai-custom-css';
            document.head.appendChild(styleElement);
          }
          styleElement.textContent = config.customCSS;
        }
      },

      setupEventListeners: function() {
        const { chatBubble, closeButton, chatInput, sendButton } = this.elements; // Removed messagesContainer as it's passed directly
        chatBubble.addEventListener('click', () => this.toggleChatWindow());
        closeButton.addEventListener('click', () => this.closeChatWindow());
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && chatInput.value.trim() !== '') {
            ShopAIChat.Message.send(chatInput, this.elements.messagesContainer); // Pass messagesContainer
            if (this.isMobile) {
              chatInput.blur();
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });
        sendButton.addEventListener('click', () => {
          if (chatInput.value.trim() !== '') {
            ShopAIChat.Message.send(chatInput, this.elements.messagesContainer); // Pass messagesContainer
            if (this.isMobile) {
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });
        window.addEventListener('resize', () => this.scrollToBottom());
        document.addEventListener('click', function(event) {
          if (event.target && event.target.classList.contains('shop-auth-trigger')) {
            event.preventDefault();
            if (window.shopAuthUrl) {
              ShopAIChat.Auth.openAuthPopup(window.shopAuthUrl);
            }
          }
        });
      },

      setupMobileViewport: function() {
        const setViewportHeight = () => {
          document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', setViewportHeight);
        setViewportHeight();
      },
      toggleChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;
        const becomingActive = !chatWindow.classList.contains('active');

        chatWindow.classList.toggle('active');

        if (becomingActive) {
          if (!ShopAIChat.State.isChatOpenedEver) {
            ShopAIChat.Log.sendInteraction("CHAT_OPENED");
            ShopAIChat.State.isChatOpenedEver = true;
          }
          if (this.isMobile) {
            document.body.classList.add('shop-ai-chat-open');
            setTimeout(() => chatInput.focus(), 500);
          } else {
            chatInput.focus();
          }
          this.scrollToBottom();
        } else {
          document.body.classList.remove('shop-ai-chat-open');
        }
      },
      closeChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;
        chatWindow.classList.remove('active');
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove('shop-ai-chat-open');
        }
      },
      scrollToBottom: function() {
        const { messagesContainer } = this.elements;
        setTimeout(() => {
          if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
      },
      showTypingIndicator: function() {
        const { messagesContainer } = this.elements;
        if(!messagesContainer) return;
        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('shop-ai-typing-indicator');
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
      },
      removeTypingIndicator: function() {
        const { messagesContainer } = this.elements;
        if(!messagesContainer) return;
        const typingIndicator = messagesContainer.querySelector('.shop-ai-typing-indicator');
        if (typingIndicator) {
          typingIndicator.remove();
        }
      },
      displayProductResults: function(products) {
        const config = window.shopChatConfig || {};
        const displayMode = config.productDisplayMode || 'card';
        const maxProducts = parseInt(config.maxProductsToDisplay, 10) || 3;
        const itemWidth = config.carouselItemWidth || '180px';

        const limitedProducts = products.slice(0, maxProducts);

        const { messagesContainer } = this.elements;
        if(!messagesContainer) return;

        let productSection = messagesContainer.querySelector('.shop-ai-product-section');
        if (productSection) {
            productSection.remove();
        }

        productSection = document.createElement('div');
        productSection.classList.add('shop-ai-product-section');
        messagesContainer.appendChild(productSection);

        const header = document.createElement('div');
        header.classList.add('shop-ai-product-header');
        header.innerHTML = '<h4>Top Matching Products</h4>';
        productSection.appendChild(header);

        const productsContainer = document.createElement('div');
        productsContainer.className = 'shop-ai-product-grid';

        if (displayMode === 'carousel') {
          productsContainer.classList.add('product-grid-carousel');
        } else if (displayMode === 'combo') {
          productsContainer.classList.add('product-grid-card');
        } else {
          productsContainer.classList.add('product-grid-card');
        }
        productSection.appendChild(productsContainer);

        if (!limitedProducts || limitedProducts.length === 0) {
          const noProductsMessage = document.createElement('p');
          noProductsMessage.textContent = "No products found";
          noProductsMessage.style.padding = "10px";
          productsContainer.appendChild(noProductsMessage);
        } else {
          limitedProducts.forEach(product => {
            const productCardElement = ShopAIChat.Product.createCard(product);
            if (displayMode === 'carousel') {
              productCardElement.style.width = itemWidth;
              productCardElement.style.flexShrink = '0';
            }
            productsContainer.appendChild(productCardElement);
          });
        }
        this.scrollToBottom();
      }
    },

    Message: {
      send: async function(chatInput, messagesContainer) {
        const userMessage = chatInput.value.trim();
        // const conversationId = ShopAIChat.State.conversationId; // Use state conversationId
        this.add(userMessage, 'user', messagesContainer);
        ShopAIChat.Log.sendInteraction("USER_MESSAGE_SENT", { messageLength: userMessage.length });
        chatInput.value = '';
        ShopAIChat.UI.showTypingIndicator();
        try {
          ShopAIChat.API.streamResponse(userMessage, ShopAIChat.State.conversationId, messagesContainer);
        } catch (error) {
          console.error('Error sending message:', error); // Changed log from Claude API to generic
          ShopAIChat.UI.removeTypingIndicator();
          this.add("Sorry, I couldn't process your request. Please try again later.", 'assistant', messagesContainer);
        }
      },
      add: function(text, sender, messagesContainer) {
        if(!messagesContainer) {
          console.error("Messages container not found for adding message:", text);
          return null;
        }
        const messageElement = document.createElement('div');
        messageElement.classList.add('shop-ai-message', sender);
        if (sender === 'assistant') {
          messageElement.dataset.rawText = text;
          ShopAIChat.Formatting.formatMessageContent(messageElement);
        } else {
          messageElement.textContent = text;
        }
        messagesContainer.appendChild(messageElement);
        ShopAIChat.UI.scrollToBottom();
        return messageElement;
      }
    },
    Formatting: {
      formatMessageContent: function(element) {
        if (!element || !element.dataset.rawText) return;
        const rawText = element.dataset.rawText;
        let processedText = rawText;
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        processedText = processedText.replace(markdownLinkRegex, (match, text, url) => {
          if (url.includes('shopify.com/authentication') &&
             (url.includes('oauth/authorize') || url.includes('authentication'))) {
            window.shopAuthUrl = url;
            return '<a href="#auth" class="shop-auth-trigger">' + text + '</a>';
          }
          else if (url.includes('/cart') || url.includes('checkout')) {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">click here to proceed to checkout</a>';
          } else {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
          }
        });
        processedText = this.convertMarkdownToHtml(processedText);
        element.innerHTML = processedText;
      },
      convertMarkdownToHtml: function(text) {
        text = text.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
        const lines = text.split('\n');
        let currentList = null;
        let listItems = [];
        let htmlContent = '';
        let startNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const unorderedMatch = line.match(/^\s*([-*])\s+(.*)/);
          const orderedMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/);
          if (unorderedMatch) {
            if (currentList !== 'ul') {
              if (currentList === 'ol') {
                htmlContent += `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
                listItems = [];
              }
              currentList = 'ul';
            }
            listItems.push('<li>' + unorderedMatch[2] + '</li>');
          } else if (orderedMatch) {
            if (currentList !== 'ol') {
              if (currentList === 'ul') {
                htmlContent += '<ul>' + listItems.join('') + '</ul>';
                listItems = [];
              }
              currentList = 'ol';
              startNumber = parseInt(orderedMatch[1], 10);
            }
            listItems.push('<li>' + orderedMatch[2] + '</li>');
          } else {
            if (currentList) {
              htmlContent += currentList === 'ul'
                ? '<ul>' + listItems.join('') + '</ul>'
                : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
              listItems = [];
              currentList = null;
            }
            if (line.trim() === '') {
              htmlContent += '<br>';
            } else {
              htmlContent += '<p>' + line + '</p>';
            }
          }
        }
        if (currentList) {
          htmlContent += currentList === 'ul'
            ? '<ul>' + listItems.join('') + '</ul>'
            : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
        }
        htmlContent = htmlContent.replace(/<\/p><p>/g, '</p>\n<p>');
        return htmlContent;
      }
    },
    API: {
      streamResponse: async function(userMessage, conversationId, messagesContainer) {
        let currentMessageElement = null;
        try {
          const config = window.shopChatConfig || {};
          const promptType = config.promptType || config.systemPromptKey || "standardAssistant";
          const llmProvider = config.llmProvider || 'claude'; // This llmProvider is for the request, server ultimately decides
          const requestBody = JSON.stringify({
            message: userMessage,
            conversation_id: conversationId, // Can be null if it's the first message and ID not set yet
            prompt_type: promptType,
            llm_provider: llmProvider
          });
          const streamUrl = '/chat';
          const shopId = window.shopId; // Assumes window.shopId is set in Liquid
          const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'X-Shopify-Shop-Id': shopId
            },
            body: requestBody
          });
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let messageElement = document.createElement('div');
          messageElement.classList.add('shop-ai-message', 'assistant');
          messageElement.textContent = '';
          messageElement.dataset.rawText = '';
          messagesContainer.appendChild(messageElement);
          currentMessageElement = messageElement;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleStreamEvent(data, currentMessageElement, messagesContainer, userMessage,
                    (newElement) => { currentMessageElement = newElement; });
                } catch (e) {
                  console.error('Error parsing event data:', e, line);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in streaming response:', error);
          ShopAIChat.UI.removeTypingIndicator();
          ShopAIChat.Message.add("Sorry, an error occurred while processing your request.",
            'assistant', messagesContainer);
        }
      },
      handleStreamEvent: function(data, currentMessageElement, messagesContainer, userMessage, updateCurrentElement) {
        switch (data.type) {
          case 'id':
            if (data.conversation_id) {
              sessionStorage.setItem('shopAiConversationId', data.conversation_id);
              ShopAIChat.State.conversationId = data.conversation_id; // Set state
            }
            break;
          case 'chunk':
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.dataset.rawText += data.chunk;
            currentMessageElement.textContent = currentMessageElement.dataset.rawText;
            ShopAIChat.UI.scrollToBottom();
            break;
          case 'message_complete':
            ShopAIChat.UI.showTypingIndicator();
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            ShopAIChat.UI.scrollToBottom();
            break;
          case 'end_turn':
            ShopAIChat.UI.removeTypingIndicator();
            break;
          case 'error':
            console.error('Stream error from server:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = data.error.message || "Sorry, an error occurred.";
            break;
          case 'rate_limit_exceeded':
            console.error('Rate limit exceeded:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = "Sorry, our servers are currently busy. Please try again later.";
            break;
          case 'auth_required':
            sessionStorage.setItem('shopAiLastMessage', userMessage || '');
            break;
          case 'product_results':
            ShopAIChat.UI.displayProductResults(data.products);
            break;
          case 'new_message':
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            const newMessageElement = document.createElement('div');
            newMessageElement.classList.add('shop-ai-message', 'assistant');
            newMessageElement.textContent = '';
            newMessageElement.dataset.rawText = '';
            messagesContainer.appendChild(newMessageElement);
            updateCurrentElement(newMessageElement);
            break;
        }
      },
      fetchChatHistory: async function(conversationId, messagesContainer) {
        try {
          const loadingMessage = document.createElement('div');
          loadingMessage.classList.add('shop-ai-message', 'assistant');
          loadingMessage.textContent = "Loading conversation history...";
          messagesContainer.appendChild(loadingMessage);
          const historyUrl = `/chat?history=true&conversation_id=${encodeURIComponent(conversationId)}`;
          const response = await fetch(historyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            mode: 'cors'
          });
          if (!response.ok) {
            console.error('History fetch failed:', response.status, response.statusText);
            throw new Error('Failed to fetch chat history: ' + response.status);
          }
          const data = await response.json();
          messagesContainer.removeChild(loadingMessage);

          const config = window.shopChatConfig || {};
          ShopAIChat.State.conversationId = conversationId; // Set state as we are loading this history

          if (!data.messages || data.messages.length === 0) {
            const welcomeMessage = config.welcomeMessage || "👋 Hi there! How can I help you today?";
            ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
            return;
          }
          data.messages.forEach(message => {
            if (message.role === 'user' && message.content.startsWith('{')) {
              try {
                const toolData = JSON.parse(message.content);
                if (toolData.type === 'tool_result') { return; }
              } catch (e) { /* Not JSON */ }
            }
            ShopAIChat.Message.add(message.content, message.role, messagesContainer);
          });
          ShopAIChat.UI.scrollToBottom();
        } catch (error) {
          console.error('Error fetching chat history:', error);
          const config = window.shopChatConfig || {};
          const loadingMessage = messagesContainer.querySelector('.shop-ai-message.assistant');
          if (loadingMessage && loadingMessage.textContent === "Loading conversation history...") {
            messagesContainer.removeChild(loadingMessage);
          }
          const welcomeMessage = config.welcomeMessage || "👋 Hi there! How can I help you today?";
          ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
          sessionStorage.removeItem('shopAiConversationId');
          ShopAIChat.State.conversationId = null; // Clear state
        }
      }
    },
    Auth: {
      openAuthPopup: function(authUrlOrElement) { /* ... (content mostly unchanged but ensure it uses ShopAIChat.State.conversationId if needed internally) ... */
        let authUrl;
        if (typeof authUrlOrElement === 'string') {
          authUrl = authUrlOrElement;
        } else {
          authUrl = authUrlOrElement.getAttribute('data-auth-url');
          if (!authUrl) { console.error('No auth URL found in element'); return; }
        }
        const width = 600, height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;
        const popup = window.open(authUrl, 'ShopifyAuth', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        if (popup) { popup.focus(); } else { alert('Please allow popups for this site to authenticate with Shopify.'); }

        const currentConversationId = ShopAIChat.State.conversationId || sessionStorage.getItem('shopAiConversationId');
        if (currentConversationId) {
          const messagesContainer = document.querySelector('.shop-ai-chat-messages');
          if(messagesContainer) ShopAIChat.Message.add("Authentication in progress...", 'assistant', messagesContainer);
          this.startTokenPolling(currentConversationId, messagesContainer);
        }
      },
      startTokenPolling: function(conversationId, messagesContainer) { /* ... (content mostly unchanged) ... */
        if (!conversationId) return;
        const pollingId = 'polling_' + Date.now();
        sessionStorage.setItem('shopAiTokenPollingId', pollingId);
        let attemptCount = 0;
        const maxAttempts = 30;
        const poll = async () => {
          if (sessionStorage.getItem('shopAiTokenPollingId') !== pollingId) { return; }
          if (attemptCount >= maxAttempts) { return; }
          attemptCount++;
          try {
            const tokenUrl = '/auth/token-status?conversation_id=' + encodeURIComponent(conversationId);
            const response = await fetch(tokenUrl);
            if (!response.ok) { throw new Error('Token status check failed: ' + response.status); }
            const data = await response.json();
            if (data.status === 'authorized') {
              const message = sessionStorage.getItem('shopAiLastMessage');
              if (message && messagesContainer) {
                sessionStorage.removeItem('shopAiLastMessage');
                setTimeout(() => {
                  ShopAIChat.Message.add("Authorization successful! Continuing...", 'assistant', messagesContainer);
                  ShopAIChat.API.streamResponse(message, conversationId, messagesContainer);
                }, 500);
              }
              sessionStorage.removeItem('shopAiTokenPollingId');
              return;
            }
            setTimeout(poll, 10000);
          } catch (error) {
            console.error('Error polling for token status:', error);
            setTimeout(poll, 10000);
          }
        };
        setTimeout(poll, 2000);
      }
    },
    Product: {
      createCard: function(product) {
        const card = document.createElement('div');
        card.classList.add('shop-ai-product-card');
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-product-image');
        const image = document.createElement('img');
        image.src = product.image_url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        image.alt = product.title;
        image.onerror = function() { this.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png'; };
        imageContainer.appendChild(image);
        card.appendChild(imageContainer);
        const info = document.createElement('div');
        info.classList.add('shop-ai-product-info');
        const title = document.createElement('h3');
        title.classList.add('shop-ai-product-title');
        title.textContent = product.title;
        if (product.url) {
          const titleLink = document.createElement('a');
          titleLink.href = product.url;
          titleLink.target = '_blank';
          titleLink.textContent = product.title;
          title.textContent = '';
          title.appendChild(titleLink);
        }
        info.appendChild(title);
        const price = document.createElement('p');
        price.classList.add('shop-ai-product-price');
        price.textContent = product.price; // Assuming price is already formatted string
        info.appendChild(price);
        const button = document.createElement('button');
        button.classList.add('shop-ai-add-to-cart');
        button.textContent = 'Add to Cart';
        button.dataset.productId = product.id; // Store product ID
        button.addEventListener('click', function() {
          ShopAIChat.Log.sendInteraction("ADD_TO_CART_FROM_CHAT_PRODUCT", {
            productId: product.id,
            productName: product.title,
            productPrice: product.price
          });
          const input = document.querySelector('.shop-ai-chat-input input');
          if (input) {
            input.value = `Add ${product.title} to my cart`;
            const sendButton = document.querySelector('.shop-ai-chat-send');
            if (sendButton) { sendButton.click(); }
          }
        });
        info.appendChild(button);
        card.appendChild(info);
        return card;
      }
    },

    init: function() {
      const container = document.querySelector('.shop-ai-chat-container');
      if (!container) {
          console.error("Shop AI Chat: Container not found. Cannot initialize.");
          return;
      }
      this.UI.init(container);

      const conversationIdFromSession = sessionStorage.getItem('shopAiConversationId');
      const config = window.shopChatConfig || {};

      if (conversationIdFromSession) {
        ShopAIChat.State.conversationId = conversationIdFromSession;
        this.API.fetchChatHistory(conversationIdFromSession, this.UI.elements.messagesContainer);
      } else {
        ShopAIChat.State.conversationId = null;
        const welcomeMessage = config.welcomeMessage || "👋 Hi there! How can I help you today?";
        this.Message.add(welcomeMessage, 'assistant', this.UI.elements.messagesContainer);
      }
    }
  };

  // Initialization is now triggered from chat-interface.liquid after config fetch.
})();
