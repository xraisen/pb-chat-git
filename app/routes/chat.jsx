/**
 * Chat API Route
 * Handles chat interactions with Claude API and tools
 */
import { json } from "@remix-run/node";
import MCPClient from "../mcp-client";
import { saveMessage, getConversationHistory, storeCustomerAccountUrl, getCustomerAccountUrl } from "../db.server";
import AppConfig from "../services/config.server"; // This might be old default config, ensure it's not conflicting
import { getChatbotConfig } from "../services/chatbotConfig.server.js"; // Import new config service
import { createSseStream } from "../services/streaming.server";
import { createClaudeService } from "../services/claude.server.js";
import { createGeminiService } from "../services/gemini.server.js";
import { createToolService } from "../services/tool.server";
import { unauthenticated } from "../shopify.server";


/**
 * Remix loader function for handling GET requests
 */
export async function loader({ request }) {
  // Handle OPTIONS requests (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  const url = new URL(request.url);

  // Handle history fetch requests - matches /chat?history=true&conversation_id=XYZ
  if (url.searchParams.has('history') && url.searchParams.has('conversation_id')) {
    return handleHistoryRequest(request, url.searchParams.get('conversation_id'));
  }

  // Handle SSE requests
  if (!url.searchParams.has('history') && request.headers.get("Accept") === "text/event-stream") {
    return handleChatRequest(request);
  }

  // API-only: reject all other requests
  return json(
    { error: AppConfig.errorMessages.apiUnsupported },
    { status: 400, headers: getCorsHeaders(request) }
  );
}

/**
 * Remix action function for handling POST requests
 */
export async function action({ request }) {
  return handleChatRequest(request);
}

/**
 * Handle history fetch requests
 * @param {Request} request - The request object
 * @param {string} conversationId - The conversation ID
 * @returns {Response} JSON response with chat history
 */
async function handleHistoryRequest(request, conversationId) {
  const messages = await getConversationHistory(conversationId);

  return json(
    { messages },
    { headers: getCorsHeaders(request) }
  );
}

/**
 * Handle chat requests (both GET and POST)
 * @param {Request} request - The request object
 * @returns {Response} Server-sent events stream
 */
async function handleChatRequest(request) {
  try {
    // Get message data from request body
    const body = await request.json();
    const userMessage = body.message;
    const conversationId = body.conversation_id || Date.now().toString();
    // Note: shopId is now fetched before this for config, ensure it's available
    const shopId = request.headers.get("X-Shopify-Shop-Id"); // Or from query for GET

    if (!shopId) {
      return json({ error: "Shop ID not provided." }, { status: 400, headers: getCorsHeaders(request) });
    }

    const shopConfig = await getChatbotConfig(shopId);

    // Handle Test Call if isTestCall is true
    if (body.isTestCall) {
      const testLLMProvider = body.llm_provider || shopConfig.apiManagement?.selectedAPI?.toLowerCase() || 'gemini';
      let testApiKey;
      if (testLLMProvider === 'claude') {
        testApiKey = shopConfig.apiManagement?.claudeAPIKey;
      } else {
        testApiKey = shopConfig.apiManagement?.geminiAPIKey;
      }

      if (!testApiKey) {
        return json({ error: true, message: `API key for ${testLLMProvider} is not configured.` }, { status: 400, headers: getCorsHeaders(request) });
      }

      // Perform a very simple test, e.g., by trying to initialize the service or a dummy call
      // This part depends on how createClaudeService/createGeminiService can be used for a quick ping
      try {
        let testService;
        if (testLLMProvider === 'claude') {
          testService = createClaudeService(testApiKey, shopConfig.functionality?.claudeModel);
        } else {
          testService = createGeminiService(testApiKey, shopConfig.functionality?.geminiModel);
        }
        // A true test would make a lightweight API call. For now, service initialization is a basic check.
        // Example: const testResponse = await testService.ping(); // if such a method exists
        // This is a placeholder for actual test logic.
        // The `api_handler.js` expects a JSON response that might contain a reply or success status.
        // For now, just confirm config could be read and service *could* be initialized.
        return json({ success: true, message: `Test setup for ${testLLMProvider} OK. API key found.`, data: { provider: testLLMProvider, apiKeyPresent: true} }, { headers: getCorsHeaders(request) });
      } catch (e) {
        console.error(`Test call service initialization error for ${testLLMProvider}:`, e);
        return json({ error: true, message: `Test call failed for ${testLLMProvider}: ${e.message}` }, { status: 500, headers: getCorsHeaders(request) });
      }
    }


    // Validate required message for actual chat
    if (!userMessage) {
      // For SSE, we need to use the stream to send the error.
      // This block might be better if handleChatRequest returns early with a normal JSON response if it's not a stream request
      // However, if this point is reached, it's assumed to be an SSE setup.
      // This specific error should ideally be caught before attempting to create an SSE stream.
      // For robustness, if it's an SSE stream:
      if (request.headers.get("Accept") === "text/event-stream") {
          const sseHeaders = getSseHeaders(request);
          const errorStream = new ReadableStream({
              start(controller) {
                  controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: { message: AppConfig.errorMessages.missingMessage } })}\n\n`);
                  controller.close();
              }
          });
          return new Response(errorStream, { status: 400, headers: sseHeaders });
      }
      // If not SSE, return JSON (though this path is less likely if entry is via loader for SSE)
      return json({ error: AppConfig.errorMessages.missingMessage }, { status: 400, headers: getCorsHeaders(request) });
    }

    // Use configured or default values
    const promptType = body.prompt_type || shopConfig.functionality?.systemPrompt || AppConfig.api.defaultPromptType;
    const llmProvider = body.llm_provider?.toLowerCase() || shopConfig.apiManagement?.selectedAPI?.toLowerCase() || 'gemini';


    // Create a stream for the response
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({
        request, // Pass the original request for headers, etc.
        shopId,  // Pass shopId explicitly
        shopConfig, // Pass the fetched shopConfig
        userMessage,
        conversationId,
        promptType, // Use resolved promptType
        llmProvider,  // Use resolved llmProvider
        stream
      });
    });

    return new Response(responseStream, {
      headers: getSseHeaders(request)
    });
  } catch (error) {
    // This top-level catch is for errors during request parsing or initial setup
    console.error('Error in chat request handler (before stream):', error);
    // Check if it's an SSE request to send error appropriately, otherwise JSON
    if (request.headers.get("Accept") === "text/event-stream") {
        const sseHeaders = getSseHeaders(request);
        const errorStream = new ReadableStream({
            start(controller) {
                controller.enqueue(`data: ${JSON.stringify({ type: 'error', error: { message: error.message || "Failed to process chat request." } })}\n\n`);
                controller.close();
            }
        });
        return new Response(errorStream, { status: 500, headers: sseHeaders });
    }
    return json({ error: error.message || "Failed to process chat request." }, {
      status: 500,
      headers: getCorsHeaders(request)
    });
  }
}


/**
 * Handle a complete chat session
 * @param {Object} params - Session parameters
 * @param {Request} params.request - The request object (for context, not direct use for body again)
 * @param {string} params.shopId - The Shop ID/domain.
 * @param {object} params.shopConfig - The shop-specific configuration.
 * @param {string} params.userMessage - The user's message
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.promptType - The prompt type (resolved from body or shopConfig)
 * @param {string} params.llmProvider - The LLM provider (resolved from body or shopConfig)
 * @param {Object} params.stream - Stream manager for sending responses
 */
async function handleChatSession({
  request, // Keep for context if needed for other headers
  shopId,
  shopConfig,
  userMessage,
  conversationId,
  promptType, // Already resolved using shopConfig if from body
  llmProvider, // Already resolved using shopConfig if from body
  stream
}) {
  let llmService;
  let apiKey;

  if (llmProvider === 'claude') {
    apiKey = shopConfig.apiManagement?.claudeAPIKey;
    if (!apiKey) {
      stream.sendMessage({ type: 'error', error: { message: `Claude API key is not configured for this shop. Please contact support.` }});
      stream.close();
      return;
    }
    // Pass model from config if available
    llmService = createClaudeService(apiKey, shopConfig.functionality?.claudeModel);
  } else { // Default or Gemini
    apiKey = shopConfig.apiManagement?.geminiAPIKey;
    if (!apiKey) {
      stream.sendMessage({ type: 'error', error: { message: `Gemini API key is not configured for this shop. Please contact support.` }});
      stream.close();
      return;
    }
    // Pass model from config if available
    llmService = createGeminiService(apiKey, shopConfig.functionality?.geminiModel);
  }

  const toolService = createToolService();

  // Initialize MCP client
  // const shopId = request.headers.get("X-Shopify-Shop-Id"); // shopId is now passed in
  const shopDomain = request.headers.get("Origin"); // Or determine from shopId if it's a domain
  const customerMcpEndpoint = await getCustomerMcpEndpoint(shopDomain, conversationId);
  const mcpClient = new MCPClient(
    shopDomain,
    conversationId,
    shopId,
    customerMcpEndpoint
  );

  try {
    // Send conversation ID to client
    stream.sendMessage({ type: 'id', conversation_id: conversationId });

    // Connect to MCP servers and get available tools
    let storefrontMcpTools = [], customerMcpTools = [];

    try {
      storefrontMcpTools = await mcpClient.connectToStorefrontServer();
      customerMcpTools = await mcpClient.connectToCustomerServer();

      console.log(`Connected to MCP with ${storefrontMcpTools.length} tools`);
      console.log(`Connected to customer MCP with ${customerMcpTools.length} tools`);
    } catch (error) {
      console.warn('Failed to connect to MCP servers, continuing without tools:', error.message);
    }

    // Prepare conversation state
    let conversationHistory = [];
    let productsToDisplay = [];

    // Save user message to the database
    await saveMessage(conversationId, 'user', userMessage);

    // Fetch all messages from the database for this conversation
    const dbMessages = await getConversationHistory(conversationId);

    // Format messages for Claude API
    conversationHistory = dbMessages.map(dbMessage => {
      let content;
      try {
        content = JSON.parse(dbMessage.content);
      } catch (e) {
        content = dbMessage.content;
      }
      return {
        role: dbMessage.role,
        content
      };
    });

    // Execute the conversation stream
    // Execute the conversation stream with Gemini
    // The streamGeminiConversation and Claude streamConversation methods are designed to directly use stream.sendMessage
    // for SSE events like 'chunk', 'id', 'message_complete', 'error', 'end_turn'.
    
    let collectedAssistantResponseText = ""; // To collect full response for saving
    const originalStreamSendMessage = stream.sendMessage;
    let currentGeminiToolCallEventData = null; // Specific for Gemini tool calls

    // Wrap stream.sendMessage to intercept and process messages before sending to client
    stream.sendMessage = (data) => {
      if (data.type === 'gemini_tool_call') { // Specific to Gemini's current implementation
        currentGeminiToolCallEventData = { name: data.name, arguments: data.arguments };
        // Do NOT forward this raw event to client. Client expects tools via LLM text or structured message.
        // The gemini.server.js should ideally send a 'message_complete' after this if it's a tool_call turn.
        return; 
      }
      
      if (data.type === 'chunk') {
        collectedAssistantResponseText += data.content; // Assuming data.content for Claude, data.chunk for Gemini
                                                 // Let's standardize on data.content from LLM services
        if (data.chunk) collectedAssistantResponseText += data.chunk; // Compatibility
      } else if (data.type === 'message_complete') {
        let messageToSaveContent = collectedAssistantResponseText;
        let messageRoleToSave = 'assistant';

        if (data.message && data.message.content) { // Claude full message object
          messageToSaveContent = data.message.content; // This can be an array of blocks (text, tool_use)
          messageRoleToSave = data.message.role || 'assistant';
        } else if (llmProvider === 'gemini' && currentGeminiToolCallEventData && !collectedAssistantResponseText) {
          // This was a Gemini tool call turn, save the tool call request itself
          messageToSaveContent = [{ type: 'function_call', name: currentGeminiToolCallEventData.name, arguments: currentGeminiToolCallEventData.arguments }];
          // currentGeminiToolCallEventData is reset after tool execution logic
        }

        if (messageToSaveContent || (llmProvider === 'gemini' && currentGeminiToolCallEventData) ) { // Save if text or Gemini tool call
          conversationHistory.push({ role: messageRoleToSave, content: messageToSaveContent });
          saveMessage(conversationId, messageRoleToSave, JSON.stringify(messageToSaveContent))
            .catch(dbError => console.error("Error saving assistant message:", dbError));
        }
        collectedAssistantResponseText = ""; // Reset for the next message from LLM
      } else if (data.type === 'end_turn') {
        if (productsToDisplay.length > 0) {
          originalStreamSendMessage({ type: 'product_results', products: productsToDisplay });
          productsToDisplay = []; // Clear after sending
        }
      }

      // Forward all events except the raw 'gemini_tool_call'
      if(data.type !== 'gemini_tool_call') {
        originalStreamSendMessage(data); // Send to client
      }
    };

    // System prompt type from shopConfig
    const systemPromptType = shopConfig.functionality?.systemPrompt || AppConfig.api.defaultPromptType;

    if (llmProvider === 'gemini') {
      await llmService.streamGeminiConversation(
        {
          messages: conversationHistory,
          promptType: systemPromptType, // Use from shopConfig
          tools: mcpClient.tools,
          conversationId
        },
        { sendMessage: stream.sendMessage }
      );

      if (currentGeminiToolCallEventData) {
        const toolName = currentGeminiToolCallEventData.name;
        const toolArgs = currentGeminiToolCallEventData.arguments;
        currentGeminiToolCallEventData = null; // Reset

        console.log(`[Chat Handler] Gemini requesting tool: ${toolName}, Args:`, toolArgs);
        const mcpResponse = await mcpClient.callTool(toolName, toolArgs);
        // ... (handle mcpResponse, errors, and then call streamGeminiResponseAfterToolExecution)
        // This part requires careful state management of conversationHistory for Gemini
        // The saveMessage logic within the wrapped stream.sendMessage should have saved the function_call.
        // Now, we need to save the function_response and continue the conversation.
        
        let toolExecutionResultForHistory; // This is what gets saved in DB
        let toolExecutionResultForLLM;    // This is what gets sent to LLM (might be slightly different format)

        if (mcpResponse.error) {
            toolExecutionResultForHistory = { tool_use_id: toolName, // Gemini doesn't use ID like Claude for response
                                       name: toolName, content: [{type: "error", text: mcpResponse.error.data || "Tool execution failed"}]};
            toolExecutionResultForLLM = { error: true, message: mcpResponse.error.data || "Tool execution failed", details: mcpResponse.error };

        } else {
            toolExecutionResultForHistory = { tool_use_id: toolName, name: toolName, content: mcpResponse /* direct JSON */ };
            toolExecutionResultForLLM = mcpResponse;
        }
        // Save tool result message
        conversationHistory.push({ role: 'function', content: JSON.stringify(toolExecutionResultForHistory) }); // Or 'tool' role for Gemini
        await saveMessage(conversationId, 'function', JSON.stringify(toolExecutionResultForHistory));

        await llmService.streamGeminiResponseAfterToolExecution({
          existingMessages: conversationHistory, // Claude-like format, service needs to adapt
          toolName: toolName, // Not strictly needed if using function_response message type
          toolResponse: toolExecutionResultForLLM,
          streamHandlers: { sendMessage: stream.sendMessage },
          conversationId,
          promptType: systemPromptType
        });
      }
    } else { // Claude provider
      await llmService.streamConversation(
        {
          messages: conversationHistory,
          promptType: systemPromptType, // Use from shopConfig
          tools: mcpClient.tools
        },
        {
          onText: (textDelta) => {
            // The wrapped stream.sendMessage will handle 'chunk' type
            stream.sendMessage({ type: 'chunk', content: textDelta });
          },
          onMessage: (message) => {
            // Wrapped stream.sendMessage handles 'message_complete'
            stream.sendMessage({ type: 'message_complete', message: message }); // Pass full Claude message obj
          },
          onToolUse: async (toolUseEvent) => { // toolUseEvent is Claude's tool_use block
            const toolName = toolUseEvent.name;
            const toolInput = toolUseEvent.input;
            const toolUseId = toolUseEvent.id;

            // The 'message_complete' from onMessage should have saved the tool_use request.
            // Now call the tool and save its result.
            const mcpResponse = await mcpClient.callTool(toolName, toolInput);
            
            let toolResultContent; // This will be an array of blocks for Claude
            if (mcpResponse.error) {
                toolResultContent = [{ type: 'text', text: `Error calling ${toolName}: ${mcpResponse.error.data || mcpResponse.error.message}` }];
            } else {
                // Format tool result for Claude. If mcpResponse is JSON, stringify it or pick parts.
                // Claude expects content to be a string or specific JSON structure for some tools.
                // For simplicity, stringify if it's an object.
                const resultText = typeof mcpResponse === 'object' ? JSON.stringify(mcpResponse) : String(mcpResponse);
                toolResultContent = [{ type: 'text', text: resultText }];

                if (mcpResponse.products && Array.isArray(mcpResponse.products)) {
                    productsToDisplay.push(...mcpResponse.products);
                }
            }

            // Construct the tool_result message for Claude
            const toolResultMessage = {
                role: 'user', // For Claude, tool results are sent as a user message
                content: [{
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: toolResultContent, // This should be an array of content blocks
                    // is_error: !!mcpResponse.error (optional)
                }]
            };

            conversationHistory.push(toolResultMessage);
            await saveMessage(conversationId, 'user', JSON.stringify(toolResultMessage.content));

            // Call Claude again with the tool result
            await llmService.streamConversation({
                messages: conversationHistory,
                promptType: systemPromptType,
                tools: mcpClient.tools
            },
            // Simplified re-entrant handlers for subsequent calls
            {
                onText: (delta) => stream.sendMessage({type: 'chunk', content: delta}),
                onMessage: (msg) => stream.sendMessage({type: 'message_complete', message: msg}),
                onToolUse: async (toolEvent) => { /* Handle further tool use if necessary, or limit depth */ }
            });
          }
        }
      );
      // Ensure end_turn is sent after Claude's interaction, if not handled by onMessage -> message_complete -> end_turn chain
      stream.sendMessage({ type: 'end_turn' });
    }

    stream.sendMessage = originalStreamSendMessage; // Restore original stream.sendMessage

  } catch (error) {
    console.error(`[handleChatSession] Error during ${llmProvider} conversation processing:`, error);
    // Ensure originalSendMessage is restored if an error occurs mid-wrapper
    stream.sendMessage = originalStreamSendMessage;
    stream.sendMessage({ type: 'error', error: { message: error.message || `Chat session failed with ${llmProvider}.` } });
    stream.sendMessage({ type: 'end_turn' });
  }
}

/**
 * Get the customer MCP endpoint for a shop
 * @param {string} shopDomain - The shop domain
 * @param {string} conversationId - The conversation ID
 * @returns {string} The customer MCP endpoint
 */
async function getCustomerMcpEndpoint(shopDomain, conversationId) {
  try {
    // Check if the customer account URL exists in the DB
    const existingUrl = await getCustomerAccountUrl(conversationId);

    // If URL exists, return early with the MCP endpoint
    if (existingUrl) {
      return `${existingUrl}/customer/api/mcp`;
    }

    // If not, query for it from the Shopify API
    const { hostname } = new URL(shopDomain);
    const { storefront } = await unauthenticated.storefront(
      hostname
    );

    const response = await storefront.graphql(
      `#graphql
      query shop {
        shop {
          customerAccountsV2 {
            url
          }
        }
      }`,
    );

    const body = await response.json();
    const customerAccountUrl = body.data.shop.customerAccountsV2.url;

    // Store the customer account URL with conversation ID in the DB
    await storeCustomerAccountUrl(conversationId, customerAccountUrl);

    return `${customerAccountUrl}/customer/api/mcp`;
  } catch (error) {
    console.error("Error getting customer MCP endpoint:", error);
    return null;
  }
}

/**
 * Gets CORS headers for the response
 * @param {Request} request - The request object
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400" // 24 hours
  };
}

/**
 * Get SSE headers for the response
 * @param {Request} request - The request object
 * @returns {Object} SSE headers object
 */
function getSseHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  };
}
