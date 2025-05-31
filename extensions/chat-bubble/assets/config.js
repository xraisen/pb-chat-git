// config.js

const chatbotConfig = {
  // Appearance settings
  appearance: {
    chatboxBackgroundColor: '#FFFFFF', // Default: White
    chatboxBorderColor: '#CCCCCC',     // Default: Light Gray
    chatboxBorderRadius: '10px',       // Default: 10px rounded corners
    fontFamily: 'Arial, sans-serif',   // Default: Arial or sans-serif
    fontSize: '16px',                  // Default: 16px
    fontWeight: 'normal',              // Default: Normal weight
    chatboxBackgroundOpacity: 1,       // Default: Fully opaque
    userBubbleColor: '#007AFF',        // Default: Blue
    botBubbleColor: '#E5E5EA',         // Default: Light Gray
    inputFieldBackgroundColor: '#F0F0F0',// Default: Very Light Gray
    inputFieldTextColor: '#000000',    // Default: Black
    sendButtonStyle: 'filled',         // Default: Filled button ('filled', 'outline')
    sendButtonHoverColor: '#0056b3',   // Default: Darker Blue
    customLogoUrl: '',                 // Default: No custom logo
    customBackgroundUrl: '',           // Default: No custom background
    brandAccentColor: '#007AFF',       // Default: Blue (used for highlights, links, etc.)
  },

  // Positioning settings
  positioning: {
    screenPosition: 'bottom-right',    // Default: Bottom-right corner
    customDesktopPosition: { x: '20px', y: '20px' }, // Default: 20px from bottom, 20px from right
    customMobilePosition: { x: '10px', y: '10px' }, // Default: 10px from bottom, 10px from right
    isFixed: true,                     // Default: Chatbox stays in place on scroll
    popupTrigger: 'delay',             // Default: Pop-up after a delay ('delay', 'userAction', 'scroll')
    popupDelaySeconds: 5,              // Default: 5 seconds delay
  },

  // Functionality settings
  functionality: {
    chatbotName: 'Shopify Assistant', // Default: Shopify Assistant
    defaultGreetingMessage: 'Hello! How can I help you today?', // Default greeting
    conversationTimeoutSeconds: 300,   // Default: 5 minutes
    idleMessage: 'Are you still there?', // Default message after timeout
    multiStepDialogs: [                // Example of a multi-step dialog
      {
        id: 'order_status',
        steps: [
          { message: 'Sure, I can help with that. What is your order number?', quickReplies: [] },
          { message: 'Thanks! Let me check that for you.', quickReplies: [] },
        ],
      },
    ],
    fallbackMessage: "I'm sorry, I didn't understand that. Can you please rephrase?", // Default fallback
  },

  // Product Display settings
  productDisplay: {
    displayFormat: 'carousel',         // Default: Carousel ('carousel', 'grid', 'list')
    productImageSize: 'medium',        // Default: Medium ('small', 'medium', 'large')
    productsPerRow: 3,                 // Default: 3 products per row (for grid view)
    showPrice: true,                   // Default: Show product prices
    showName: true,                    // Default: Show product names
    showDescription: false,            // Default: Do not show product descriptions initially
    defaultSortOrder: 'popularity',    // Default: Sort by popularity ('popularity', 'price_asc', 'price_desc', 'newest')
    addToCartButtonEnabled: true,      // Default: Enable 'Add to Cart' buttons
  },

  // API Management settings
  apiManagement: {
    selectedAPI: 'Gemini',             // Default: Gemini ('Claude', 'Gemini', 'OpenAI')
    claudeAPIKey: '',                  // Placeholder for Claude API Key
    geminiAPIKey: '',                  // Placeholder for Gemini API Key
    shopifyStoreUrl: '',               // Placeholder for Shopify Store URL (e.g., 'your-store.myshopify.com')
    shopifyAccessToken: '',            // Placeholder for Shopify Admin API Access Token
  },

  // Analytics settings
  analytics: {
    trackAddToCart: true,              // Default: Track 'Add to Cart' events
    trackCheckoutInitiation: true,     // Default: Track when users start checkout
    trackProductInteractions: true,    // Default: Track views, clicks on products
    trackCartAbandonment: true,        // Default: Track when users abandon carts
    trackConversionRates: true,        // Default: Track overall conversion rates
    trackUserFeedback: true,           // Default: Track user ratings or feedback on bot interactions
    analyticsDashboardUrl: '',         // Placeholder for a link to an analytics dashboard
  },

  // Avatar settings
  avatar: {
    avatarImageUrl: '',                // Default: No custom avatar image
    avatarShape: 'round',              // Default: Round avatar ('round', 'square')
    avatarBorderColor: '#007AFF',      // Default: Blue border, matches brand accent
  },

  // User Experience settings
  userExperience: {
    speechToTextEnabled: false,        // Default: Disable speech-to-text
    textToSpeechEnabled: false,        // Default: Disable text-to-speech
    customInteractiveButtons: [        // Example custom buttons
      { text: 'Track My Order', action: 'trigger_dialog:order_status' },
      { text: 'Special Offers', action: 'show_products:category=sale' },
    ],
    formValidationEnabled: true,       // Default: Enable basic form validation (e.g., for email, order number)
  },

  // Security & Privacy settings
  securityPrivacy: {
    endToEndEncryptionEnabled: false,  // Default: Disable E2E encryption (can be complex to implement)
    gdprCompliant: true,               // Default: Assume GDPR compliance measures are in place
    sessionTimeoutMinutes: 30,         // Default: 30 minutes of inactivity before session timeout
    dataRetentionPolicyDays: 90,       // Default: Retain conversation data for 90 days
  },
};

// To make it usable in Node.js environments (e.g., for backend integration or testing)
// For client-side asset, this might not be strictly necessary unless also used by a node script.
// However, the chatbot_ui_logic.js refers to window.chatbotConfig, so this global assignment is key for that script.
// if (typeof window !== 'undefined') {
//   window.chatbotConfig = chatbotConfig;
// }
// The original config.js made chatbotConfig global by default if not in a module system.
// For standalone <script> include, chatbotConfig will be global.
// If this `config.js` is intended to be included via <script> tag along with other assets like standalone-chat-logic.js,
// then `chatbotConfig` being a global const is fine.
// The `chatbot_ui_logic.js` uses `window.chatbotConfig`, so this should work.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = chatbotConfig;
}
