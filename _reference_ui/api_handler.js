// api_handler.js

/**
 * Fetches the global chatbotConfig object.
 * Ensures config.js is loaded and chatbotConfig is available.
 * @returns {object|null} The chatbotConfig object or null if not found.
 */
function getChatbotConfig() {
    if (typeof window.chatbotConfig !== 'undefined') {
        return window.chatbotConfig;
    } else if (typeof chatbotConfig !== 'undefined') {
        return chatbotConfig; // Fallback for non-browser environments if config is somehow global
    }
    console.error("Chatbot configuration (chatbotConfig) not found. Ensure config.js is loaded before api_handler.js.");
    return null;
}

/**
 * Sends a request to the selected AI API (Claude or Gemini).
 *
 * @async
 * @param {string} userInput The text input from the user.
 * @param {string} [overrideApi] Optional. 'Claude' or 'Gemini' to override the configured API for this single call.
 * @returns {Promise<string>} A promise that resolves to the chatbot's text reply or an error message.
 */
async function sendAPIRequest(userInput, overrideApi) {
    const config = getChatbotConfig();

    if (!config || !config.apiManagement) {
        return "Error: Chatbot configuration is missing or incomplete.";
    }

    const { claudeAPIKey, geminiAPIKey } = config.apiManagement;
    let selectedAPI = overrideApi || config.apiManagement.selectedAPI; // Use override if provided

    let apiUrl = '';
    let headers = {};
    let body = {};

    try {
        if (selectedAPI === 'Claude') {
            if (!claudeAPIKey) {
                console.error("Claude API key is missing.");
                return "Error: Claude API key is not configured.";
            }
            // IMPORTANT: Verify actual Claude API endpoint and request format from official documentation.
            apiUrl = 'https://api.anthropic.com/v1/messages'; // Example Claude API URL (updated to messages API)
            headers = {
                'x-api-key': claudeAPIKey, // Common header for Anthropic API key
                'anthropic-version': '2023-06-01', // Required version header
                'Content-Type': 'application/json',
            };
            body = {
                model: "claude-3-opus-20240229", // Or other desired model
                max_tokens: 1024, // Max tokens in the response
                messages: [{ role: "user", content: userInput }],
            };
        } else if (selectedAPI === 'Gemini') {
            if (!geminiAPIKey) {
                console.error("Gemini API key is missing.");
                return "Error: Gemini API key is not configured.";
            }
            // IMPORTANT: Verify actual Gemini API endpoint and request format from official documentation.
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiAPIKey}`;
            headers = {
                'Content-Type': 'application/json',
            };
            body = {
                contents: [{
                    parts: [{ text: userInput }],
                }],
                // Optional: Add safetySettings or generationConfig if needed
                // generationConfig: {
                //   temperature: 0.9,
                //   topK: 1,
                //   topP: 1,
                //   maxOutputTokens: 2048,
                // },
            };
        } else {
            console.error(`Invalid API selected: ${selectedAPI}`);
            return "Error: Invalid AI API selected in configuration.";
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Unknown API error." }));
            console.error(`API request failed with status ${response.status}:`, errorData);
            const errorMsg = errorData.error?.message || errorData.message || `API error (${response.status})`;
            return `Error: ${selectedAPI} API request failed: ${errorMsg}.`;
        }

        const data = await response.json();

        if (selectedAPI === 'Claude') {
            // Example: Extracting text from Claude's response (verify with actual API)
            // For messages API, it's usually in data.content[0].text
            if (data.content && data.content.length > 0 && data.content[0].text) {
                return data.content[0].text.trim();
            } else {
                 console.error("Unexpected Claude API response format:", data);
                 return "Error: Could not parse Claude's response.";
            }
        } else if (selectedAPI === 'Gemini') {
            // Example: Extracting text from Gemini's response (verify with actual API)
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0 && data.candidates[0].content.parts[0].text) {
                return data.candidates[0].content.parts[0].text.trim();
            } else {
                // Check for promptFeedback if content is missing
                if (data.promptFeedback && data.promptFeedback.blockReason) {
                    console.error("Gemini API request blocked:", data.promptFeedback);
                    return `Error: Your request was blocked by Gemini due to: ${data.promptFeedback.blockReason}.`;
                }
                console.error("Unexpected Gemini API response format:", data);
                return "Error: Could not parse Gemini's response.";
            }
        }
    } catch (error) {
        console.error(`Error during API request to ${selectedAPI}:`, error);
        return `Sorry, the chatbot encountered an issue while contacting ${selectedAPI}. Please try again later. (${error.message})`;
    }
    return "Error: Should not reach here."; // Should have returned or thrown before this
}

/**
 * Sends a request to the AI API with a fallback mechanism.
 * If the primary API fails, it tries the other configured API.
 *
 * @async
 * @param {string} userInput The text input from the user.
 * @returns {Promise<string>} A promise that resolves to the chatbot's text reply or an error message if both fail.
 */
async function sendAPIRequestWithFallback(userInput) {
    const config = getChatbotConfig();
    if (!config || !config.apiManagement) {
        return "Error: Chatbot configuration is missing or incomplete.";
    }

    const primaryAPI = config.apiManagement.selectedAPI;
    let primaryResponse = await sendAPIRequest(userInput, primaryAPI);

    // Check if the response string starts with "Error:" to determine failure
    if (primaryResponse.startsWith("Error:")) {
        console.warn(`Primary API (${primaryAPI}) failed: ${primaryResponse}`);

        const fallbackAPI = primaryAPI === 'Claude' ? 'Gemini' : 'Claude';
        console.log(`Attempting fallback to ${fallbackAPI}...`);

        // Ensure the fallback API has a key configured
        if (fallbackAPI === 'Claude' && !config.apiManagement.claudeAPIKey) {
            console.error("Fallback to Claude failed: API key missing.");
            return `${primaryResponse} Fallback to Claude aborted: API key missing.`;
        }
        if (fallbackAPI === 'Gemini' && !config.apiManagement.geminiAPIKey) {
            console.error("Fallback to Gemini failed: API key missing.");
            return `${primaryResponse} Fallback to Gemini aborted: API key missing.`;
        }

        let fallbackResponse = await sendAPIRequest(userInput, fallbackAPI);

        if (fallbackResponse.startsWith("Error:")) {
            console.error(`Fallback API (${fallbackAPI}) also failed: ${fallbackResponse}`);
            return `Sorry, I'm having trouble connecting to the AI services. Both ${primaryAPI} and ${fallbackAPI} failed. Please try again later.`;
        } else {
            console.log(`Fallback to ${fallbackAPI} succeeded.`);
            return fallbackResponse;
        }
    } else {
        return primaryResponse;
    }
}

// Example Usage (for testing in browser console, assuming config.js is loaded):
// (async () => {
//     if (typeof chatbotConfig !== 'undefined') {
//         // Test with primary API
//         // console.log("Testing with primary API:", chatbotConfig.apiManagement.selectedAPI);
//         // const response1 = await sendAPIRequest("Hello, world!");
//         // console.log("Response 1:", response1);
//
//         // Test with fallback
//         // console.log("Testing with fallback logic (simulating primary failure):");
//         // const originalKey = chatbotConfig.apiManagement.geminiAPIKey; // Example: temporarily break Gemini
//         // chatbotConfig.apiManagement.geminiAPIKey = ""; // Simulate missing key for primary if Gemini
//         // const response2 = await sendAPIRequestWithFallback("Tell me a joke.");
//         // console.log("Response 2:", response2);
//         // chatbotConfig.apiManagement.geminiAPIKey = originalKey; // Restore key
//     } else {
//         console.log("chatbotConfig not loaded. Cannot run test.");
//     }
// })();
// To make functions available for import in module systems (e.g. if this were part of a larger app)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        sendAPIRequest,
        sendAPIRequestWithFallback,
        getChatbotConfig
    };
}
