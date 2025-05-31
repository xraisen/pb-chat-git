export const defaultChatbotConfig = {
  // Appearance settings
  appearance: {
    chatboxBackgroundColor: '#FFFFFF',
    chatboxBorderColor: '#CCCCCC',
    chatboxBorderRadius: '10px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '16px',
    fontWeight: 'normal',
    chatboxBackgroundOpacity: 1,
    userBubbleColor: '#007AFF',
    botBubbleColor: '#E5E5EA',
    inputFieldBackgroundColor: '#F0F0F0',
    inputFieldTextColor: '#000000',
    sendButtonStyle: 'filled', // 'filled', 'outline'
    sendButtonHoverColor: '#0056b3',
    // Note: sendButtonColor and sendButtonTextColor would apply if sendButtonStyle is 'custom' or for more granular control.
    // For simplicity, brandAccentColor can be the primary button color for 'filled' style.
    customLogoUrl: '', // URL for custom logo in header or chatbox
    customBackgroundUrl: '', // URL for chatbox background image
    brandAccentColor: '#007AFF', // Primary color for headers, send button, important elements
  },

  // Positioning settings
  positioning: {
    screenPosition: 'bottom-right', // 'bottom-left', 'bottom-right', 'top-left', 'top-right'
    customDesktopPosition: { x: '20px', y: '20px', unit: 'px' }, // For custom screenPosition
    customMobilePosition: { x: '10px', y: '10px', unit: 'px' },  // For custom screenPosition on mobile
    isFixed: true, // Chatbox stays in place on scroll
    popupTrigger: 'delay', // 'none', 'delay', 'userAction', 'scrollDepth'
    popupDelaySeconds: 5, // If popupTrigger is 'delay'
    // scrollDepthPercent: 50, // If popupTrigger is 'scrollDepth'
    // userActionSelector: '', // CSS selector for element if popupTrigger is 'userAction'
  },

  // Functionality settings
  functionality: {
    chatbotName: 'Shopify Assistant',
    defaultGreetingMessage: 'Hello! How can I help you today?',
    conversationTimeoutSeconds: 300, // 5 minutes
    idleMessage: 'Are you still there? Your session will timeout soon.',
    multiStepDialogs: [ // Array of dialog objects
      // Example:
      // {
      //   id: 'order_status',
      //   steps: [
      //     { id: 'step1', message: 'Sure, I can help with that. What is your order number?', quickReplies: [], inputType: 'text', expectedFormat: 'order_number' },
      //     { id: 'step2', message: 'Thanks! Let me check that for you.', quickReplies: [] },
      //   ],
      // },
    ],
    fallbackMessage: "I'm sorry, I didn't understand that. Can you please rephrase?",
    // systemPrompt: 'standardAssistant', // Identifier for a default system prompt for the LLM
  },

  // Product Display settings (Conceptual for UI, actual fetching/display logic elsewhere)
  productDisplay: {
    displayFormat: 'carousel', // 'carousel', 'grid', 'list'
    productImageSize: 'medium', // 'small', 'medium', 'large'
    productsPerRow: 3, // For grid view
    showPrice: true,
    showName: true,
    showDescription: false, // Initially, can be expanded
    defaultSortOrder: 'popularity', // 'popularity', 'price_asc', 'price_desc', 'newest'
    addToCartButtonEnabled: true,
    // viewProductButtonText: "View Product",
    // addToCartButtonText: "Add to Cart",
  },

  // API Management settings
  apiManagement: {
    selectedAPI: 'Gemini', // 'Claude', 'Gemini', 'OpenAI' (if added later)
    claudeAPIKey: '',
    geminiAPIKey: '',
    // openAIAPIKey: '', // If OpenAI is an option
    shopifyStoreUrl: '', // e.g., 'your-store.myshopify.com'
    shopifyAccessToken: '', // Shopify Admin API access token (if chatbot needs direct store access)
  },

  // Analytics settings
  analytics: {
    trackAddToCart: true,
    trackCheckoutInitiation: true,
    trackProductInteractions: true, // e.g., product views, clicks
    trackCartAbandonment: true, // Conceptual, requires deeper integration
    trackConversionRates: false, // Complex, typically backend + analytics platform
    trackUserFeedback: true, // e.g., thumbs up/down on bot responses
    // analyticsDashboardUrl: '', // Link to the analytics section in the Shopify admin app
  },

  // Avatar settings
  avatar: {
    avatarImageUrl: '', // URL for chatbot avatar image
    avatarShape: 'round', // 'round', 'square'
    avatarBorderColor: '#CCCCCC', // Default border color if not overridden by brandAccentColor logic
    avatarBorderSize: '1px', // Default border size
  },

  // User Experience settings
  userExperience: {
    speechToTextEnabled: false,
    textToSpeechEnabled: false,
    customInteractiveButtons: [ // Buttons shown with greeting or at specific points
      // Example:
      // { text: 'Track My Order', action: 'trigger_dialog', payload: { dialogId: 'order_status'} },
      // { text: 'Special Offers', action: 'show_products', payload: { category: 'sale' } },
    ],
    formValidationEnabled: true, // For any forms/inputs the chatbot might present (e.g. email)
    showTypingIndicator: true, // Whether to show the "bot is typing..." indicator
    // quickReplyStyle: 'buttons', // 'buttons', 'pills'
  },

  // Security & Privacy settings
  securityPrivacy: {
    endToEndEncryptionEnabled: false, // Conceptual, as actual E2EE for LLM chats is highly complex
    gdprCompliant: false, // Placeholder; true compliance requires specific features & processes
    sessionTimeoutMinutes: 30, // Inactivity timeout for the chat UI session
    dataRetentionPolicyDays: 365, // How long chat history/data is stored (if applicable)
    // requestDataExportUrl: '', // Link for users to request data export
    // requestDataDeletionUrl: '', // Link for users to request data deletion
  },
};
