// extensions/chat-bubble/assets/api_handler.js

/**
 * Returns the active chatbot configuration.
 * Assumes standalone-chat-logic.js has initialized and merged configs into window.activeConfig.
 * @returns {object} The active chatbotConfig object.
 */
function getChatbotConfig() {
    if (typeof window.activeConfig !== 'undefined' && Object.keys(window.activeConfig).length > 0) {
        // console.log("api_handler.js: Using window.activeConfig");
        return window.activeConfig;
    }
    // Fallback to default if activeConfig isn't ready or empty
    console.warn("api_handler.js: window.activeConfig not found or empty, falling back to window.chatbotConfig (defaults). This might indicate an issue if called before standalone-chat-logic.js fully initializes activeConfig, or if standalone-chat-logic.js itself is not loaded/run.");
    return window.chatbotConfig || {}; // Default from config.js (which should be loaded before this)
}

/**
 * Makes a simple, non-streaming test call to the backend's /chat endpoint
 * to validate an API key or basic connectivity for a given LLM provider.
 * This is NOT for the main chat streaming.
 *
 * @async
 * @param {string} testMessage A simple message like "Hello".
 * @param {string} llmProviderToTest 'Claude' or 'Gemini' (case should match config values).
 * @returns {Promise<object>} A promise that resolves to an object:
 *                            { success: true, data: responseData } or
 *                            { error: true, message: errorMessage, status?: number }
 */
async function testLLMConnection(testMessage = "Hello", llmProviderToTest) {
    const config = getChatbotConfig(); // Gets merged activeConfig or defaults
    const shopId = window.shopifyShopId; // Set by Liquid template
    const appUrl = window.shopifyAppUrl; // Set by Liquid template

    if (!shopId || !appUrl) {
        const errorMsg = "Shop ID or App URL missing. Cannot perform LLM connection test.";
        console.error(`testLLMConnection: ${errorMsg}`);
        return { error: true, message: errorMsg };
    }

    // Ensure llmProviderToTest is valid, otherwise use from config
    const provider = (llmProviderToTest === 'Claude' || llmProviderToTest === 'Gemini')
                     ? llmProviderToTest
                     : config.apiManagement?.selectedAPI;

    if (!provider) {
        const errorMsg = "LLM provider not specified or found in config for testLLMConnection.";
        console.error(`testLLMConnection: ${errorMsg}`);
        return { error: true, message: errorMsg };
    }

    const requestBody = {
        message: testMessage,
        conversation_id: `test_${Date.now()}`, // Temporary ID for test
        // Ensure 'functionality' key matches the structure in defaultChatbotConfig and activeConfig
        prompt_type: config.functionality?.systemPrompt || 'standardAssistant',
        llm_provider: provider,
        isTestCall: true // Flag for backend to potentially handle differently (e.g., not save history)
    };

    console.log(`testLLMConnection: Sending test request to ${provider} via ${appUrl}/chat for shop ${shopId}`);

    try {
        const response = await fetch(`${appUrl}/chat`, { // Hits your Remix /chat endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Shop-Id': shopId,
                'Accept': 'application/json' // Expecting JSON for this test call, not text/event-stream
            },
            body: JSON.stringify(requestBody)
        });

        const responseData = await response.json(); // Assuming /chat can return JSON for non-stream test

        if (!response.ok) {
            // Log more details from responseData if available
            const serverErrorMessage = responseData?.error?.message || responseData?.message || responseData?.error || (typeof responseData === 'string' ? responseData : `API test failed with status ${response.status}`);
            console.error(`testLLMConnection: Test call to ${provider} failed with status ${response.status}:`, serverErrorMessage, responseData);
            return { error: true, status: response.status, message: serverErrorMessage };
        }

        // For a simple test, we might just check if we get any valid-looking response.
        // The backend /chat endpoint should ideally return a small piece of data for isTestCall: true.
        // For example, it could return the first chunk of a test message or a success status.
        console.log(`testLLMConnection: Test call to ${provider} successful. Response:`, responseData);
        return { success: true, data: responseData };

    } catch (error) {
        console.error(`testLLMConnection: Error during network request or JSON parsing for ${provider}:`, error);
        return { error: true, message: `Connection test failed: ${error.message}` };
    }
}

// Expose functions on a global object for potential use by other scripts or for debugging.
// standalone-chat-logic.js is the primary consumer of config and handles its own chat logic (SSE).
window.ChatAPIHandler = {
    getChatbotConfig,
    testLLMConnection
    // Old sendAPIRequest and sendAPIRequestWithFallback are removed as main chat is SSE.
};

console.log("extensions/chat-bubble/assets/api_handler.js loaded and window.ChatAPIHandler initialized.");

// Note: The original sendAPIRequest and sendAPIRequestWithFallback functions were removed
// as the primary chat functionality is now handled by standalone-chat-logic.js using SSE.
// This refactored api_handler.js focuses on providing configuration access (via activeConfig)
// and a dedicated test function for LLM connectivity.
