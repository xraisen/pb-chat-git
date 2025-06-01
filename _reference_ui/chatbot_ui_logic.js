// chatbot_ui_logic.js

let activeConfig = {}; // Will hold the merged configuration

// DOM Elements
let chatbotContainer, chatbotHeader, chatbotTitle, chatbotAvatarImg, chatboxMessages, userInputField, sendMessageButton, initialGreetingMessageContainer;

// Helper to inject dynamic CSS rules
function addStyle(styles) {
    const css = document.createElement('style');
    css.type = 'text/css';
    if (css.styleSheet) css.styleSheet.cssText = styles;
    else css.appendChild(document.createTextNode(styles));
    document.getElementsByTagName("head")[0].appendChild(css);
}

function loadAndApplyConfiguration() {
    // Start with defaults from global chatbotConfig (from config.js)
    // Perform a deep copy to avoid modifying the original default object directly
    activeConfig = JSON.parse(JSON.stringify(window.chatbotConfig || {}));

    try {
        const savedConfigString = localStorage.getItem('savedChatbotConfig');
        if (savedConfigString) {
            const savedConfig = JSON.parse(savedConfigString);
            // Deep merge savedConfig into activeConfig
            // This simple merge works for one level of nesting, like 'appearance', 'positioning'
            // For deeper nesting, a recursive merge function would be more robust.
            for (const sectionKey in savedConfig) {
                if (savedConfig.hasOwnProperty(sectionKey) && activeConfig.hasOwnProperty(sectionKey)) {
                    if (typeof activeConfig[sectionKey] === 'object' && activeConfig[sectionKey] !== null && !Array.isArray(activeConfig[sectionKey])) {
                        activeConfig[sectionKey] = { ...activeConfig[sectionKey], ...savedConfig[sectionKey] };
                    } else {
                        activeConfig[sectionKey] = savedConfig[sectionKey];
                    }
                } else if (savedConfig.hasOwnProperty(sectionKey)) { // If key only in saved, add it
                    activeConfig[sectionKey] = savedConfig[sectionKey];
                }
            }
            console.log("Loaded configuration from localStorage", activeConfig);
        } else {
            console.log("No saved configuration found in localStorage, using defaults from config.js.");
        }
    } catch (e) {
        console.error("Error loading configuration from localStorage:", e);
        // Fallback to defaults if localStorage parsing fails
        activeConfig = JSON.parse(JSON.stringify(window.chatbotConfig || {}));
    }

    // Ensure all necessary config sections exist to prevent errors during application
    const ensureSections = ['appearance', 'positioning', 'functionality', 'avatar', 'productDisplay'];
    ensureSections.forEach(section => {
        if (!activeConfig[section]) activeConfig[section] = {};
    });
     if (!activeConfig.positioning.customDesktopPosition) activeConfig.positioning.customDesktopPosition = {};
     if (!activeConfig.positioning.customMobilePosition) activeConfig.positioning.customMobilePosition = {};


    // --- Apply Appearance Settings ---
    if (activeConfig.appearance) {
        const appearance = activeConfig.appearance;
        chatbotContainer.style.backgroundColor = appearance.chatboxBackgroundColor || '#FFFFFF';
        chatbotContainer.style.borderColor = appearance.chatboxBorderColor || '#CCCCCC';
        chatbotContainer.style.borderRadius = appearance.chatboxBorderRadius || '10px';
        chatbotContainer.style.opacity = appearance.chatboxBackgroundOpacity || '1';
        if (appearance.customBackgroundUrl) {
            chatbotContainer.style.backgroundImage = `url('${appearance.customBackgroundUrl}')`;
            chatbotContainer.style.backgroundSize = 'cover';
            chatbotContainer.style.backgroundPosition = 'center';
        }

        chatboxMessages.style.fontFamily = appearance.fontFamily || 'Arial, sans-serif';
        chatboxMessages.style.fontSize = appearance.fontSize || '16px';
        // fontWeight would typically be applied to .message p or similar

        userInputField.style.backgroundColor = appearance.inputFieldBackgroundColor || '#F0F0F0';
        userInputField.style.color = appearance.inputFieldTextColor || '#000000';

        // Dynamic styles for message bubbles and send button (using ::part or injected styles)
        let dynamicStyles = `
            .user-message { background-color: ${appearance.userBubbleColor || '#007AFF'}; }
            .bot-message { background-color: ${appearance.botBubbleColor || '#E5E5EA'}; }
            #sendMessageButton {
                background-color: ${appearance.brandAccentColor || '#007AFF'};
                /* Add other sendButtonStyle properties here if needed */
            }
            #sendMessageButton:hover { background-color: ${appearance.sendButtonHoverColor || '#0056b3'}; }
        `;
        if(appearance.fontWeight) {
            dynamicStyles += `.message p { font-weight: ${appearance.fontWeight}; }`;
        }
        addStyle(dynamicStyles);
    }

    // --- Apply Avatar Settings ---
    if (activeConfig.avatar) {
        const avatar = activeConfig.avatar;
        if (avatar.avatarImageUrl) {
            chatbotAvatarImg.src = avatar.avatarImageUrl;
            chatbotAvatarImg.style.display = 'block';
            chatbotAvatarImg.style.borderColor = avatar.avatarBorderColor || '#007AFF';
            if (avatar.avatarShape === 'square') {
                chatbotAvatarImg.style.borderRadius = '0';
            } else {
                chatbotAvatarImg.style.borderRadius = '50%'; // Default to round
            }
        } else {
            chatbotAvatarImg.style.display = 'none';
        }
    }

    // --- Apply Header Settings (after avatar to ensure proper layout) ---
    if (activeConfig.appearance && activeConfig.appearance.brandAccentColor) {
         chatbotHeader.style.backgroundColor = activeConfig.appearance.brandAccentColor;
    }


    // --- Apply Positioning Settings ---
    if (activeConfig.positioning) {
        const positioning = activeConfig.positioning;
        chatbotContainer.style.position = positioning.isFixed ? 'fixed' : 'absolute';
        // Reset all positions
        chatbotContainer.style.top = 'auto';
        chatbotContainer.style.bottom = 'auto';
        chatbotContainer.style.left = 'auto';
        chatbotContainer.style.right = 'auto';

        switch (positioning.screenPosition) {
            case 'bottom-left':
                chatbotContainer.style.bottom = positioning.customDesktopPosition?.y || '20px';
                chatbotContainer.style.left = positioning.customDesktopPosition?.x || '20px';
                break;
            case 'top-right':
                chatbotContainer.style.top = positioning.customDesktopPosition?.y || '20px';
                chatbotContainer.style.right = positioning.customDesktopPosition?.x || '20px';
                break;
            case 'top-left':
                chatbotContainer.style.top = positioning.customDesktopPosition?.y || '20px';
                chatbotContainer.style.left = positioning.customDesktopPosition?.x || '20px';
                break;
            case 'bottom-right':
            default:
                chatbotContainer.style.bottom = positioning.customDesktopPosition?.y || '20px';
                chatbotContainer.style.right = positioning.customDesktopPosition?.x || '20px';
                break;
        }
    }

    // --- Apply Functionality Settings ---
    if (activeConfig.functionality) {
        chatbotTitle.textContent = activeConfig.functionality.chatbotName || 'Chatbot';
        // Display initial greeting message
        const greeting = activeConfig.functionality.defaultGreetingMessage || 'Hello! How can I help you today?';
        appendMessage(greeting, 'bot-message');
    }

    // --- Product Display Settings (Conceptual) ---
    if (activeConfig.productDisplay) {
        console.log("Product display format (conceptual): " + activeConfig.productDisplay.displayFormat);
        // In a real app, this would trigger rendering of product elements.
    }
    console.log("Chatbot configuration applied.");
}

function appendMessage(text, type, isHTML = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const p = document.createElement('p');
    if (isHTML) {
        p.innerHTML = text;
    } else {
        p.textContent = text;
    }
    messageDiv.appendChild(p);
    chatboxMessages.appendChild(messageDiv);
    chatboxMessages.scrollTop = chatboxMessages.scrollHeight; // Scroll to bottom
}

function showTypingIndicator() {
    let typingDiv = chatboxMessages.querySelector('.typing-indicator');
    if (!typingDiv) {
        typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
        typingDiv.innerHTML = `<span></span><span></span><span></span>`;
        chatboxMessages.appendChild(typingDiv);
    }
    typingDiv.style.display = 'flex'; // Make sure it's visible
    chatboxMessages.scrollTop = chatboxMessages.scrollHeight;
}

function hideTypingIndicator() {
    const typingDiv = chatboxMessages.querySelector('.typing-indicator');
    if (typingDiv) {
        typingDiv.remove();
    }
}

async function handleSendMessage() {
    const userInput = userInputField.value.trim();
    if (!userInput) return;

    appendMessage(userInput, 'user-message');
    userInputField.value = '';
    showTypingIndicator();

    try {
        // Ensure api_handler.js is loaded and functions are available
        if (typeof sendAPIRequestWithFallback === 'function') {
            const botResponse = await sendAPIRequestWithFallback(userInput);
            hideTypingIndicator();
            appendMessage(botResponse, 'bot-message');
        } else {
            console.error("sendAPIRequestWithFallback is not defined. Make sure api_handler.js is loaded.");
            hideTypingIndicator();
            appendMessage("Error: Chatbot API handler is not available.", 'bot-message');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error("Error sending message or receiving response:", error);
        appendMessage("Sorry, I encountered an error. Please try again.", 'bot-message');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM element variables
    chatbotContainer = document.getElementById('chatbotContainer');
    chatbotHeader = document.getElementById('chatbotHeader');
    chatbotTitle = document.getElementById('chatbotTitle');
    chatbotAvatarImg = document.getElementById('chatbotAvatarImg');
    chatboxMessages = document.getElementById('chatboxMessages');
    userInputField = document.getElementById('userInputField');
    sendMessageButton = document.getElementById('sendMessageButton');
    // initialGreetingMessageContainer = document.getElementById('initialGreetingMessageContainer');


    if (!chatbotContainer || !userInputField || !sendMessageButton || !chatboxMessages) {
        console.error("Critical chatbot UI elements are missing from the DOM. Aborting initialization.");
        return;
    }

    loadAndApplyConfiguration();

    sendMessageButton.addEventListener('click', handleSendMessage);
    userInputField.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Example: Popup trigger logic (simplified)
    if (activeConfig.positioning && activeConfig.positioning.popupTrigger === 'delay' && activeConfig.positioning.popupDelaySeconds > 0) {
        // Initially hide the chatbot if it's meant to pop up
        // chatbotContainer.style.display = 'none';
        // setTimeout(() => {
        //     chatbotContainer.style.display = 'flex'; // Or 'block' depending on original display type
        //     console.log("Chatbot popped up after delay.");
        // }, activeConfig.positioning.popupDelaySeconds * 1000);
        // For this version, we assume it's always visible unless explicitly hidden by other logic not yet implemented.
    }
});
