/**
 * Chat API Route
 * Handles chat interactions with Claude API and tools
 */
import { json } from "@remix-run/node";
import MCPClient from "../mcp-client";
import { saveMessage, getConversationHistory, storeCustomerAccountUrl, getCustomerAccountUrl, getShopChatbotConfig } from "../db.server.js"; // getAppConfiguration changed to getShopChatbotConfig
import AppConfig from "../services/config.server";
import { createSseStream } from "../services/streaming.server";
import { createClaudeService } from "../services/claude.server.js"; 
import { createGeminiService } from "../services/gemini.server.js";
// import { getAppConfiguration } from "../db.server.js"; // Replaced by getShopChatbotConfig
import prisma from "../db.server.js"; // For logging
import { createToolService } from "../services/tool.server";
import fs from "fs"; // Using readFileSync for simplicity in this server-side route
import path from "path";
import { unauthenticated } from "../shopify.server";

// Helper function to append UTM parameters to a URL
function appendUtmParameters(urlString, utmParameters) {
  if (!urlString || Object.keys(utmParameters).length === 0) {
    return urlString;
  }
  try {
    const url = new URL(urlString);
    Object.entries(utmParameters).forEach(([key, value]) => {
      if (value) { // Ensure value is not null/undefined/empty
        url.searchParams.append(key, value);
      }
    });
    return url.toString();
  } catch (error) {
    console.error("Failed to append UTM parameters to URL:", urlString, error);
    return urlString; // Return original URL on error
  }
}

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

    // Validate required message
    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: AppConfig.errorMessages.missingMessage }),
        { status: 400, headers: getSseHeaders(request) }
      );
    }

    // Generate or use existing conversation ID
    const conversationId = body.conversation_id || Date.now().toString();
    const promptType = body.prompt_type || AppConfig.api.defaultPromptType;
    const llmProvider = body.llm_provider || 'claude'; // Default to Claude if not specified

    // Create a stream for the response
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({
        request,
        userMessage,
        conversationId,
        promptType,
        llmProvider, // Pass llmProvider
        stream
      });
    });

    return new Response(responseStream, {
      headers: getSseHeaders(request)
    });
  } catch (error) {
    console.error('Error in chat request handler:', error);
    return json({ error: error.message }, {
      status: 500,
      headers: getCorsHeaders(request)
    });
  }
}

/**
 * Handle a complete chat session
 * @param {Object} params - Session parameters
 * @param {Request} params.request - The request object
 * @param {string} params.userMessage - The user's message
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.promptType - The prompt type
 * @param {Object} params.stream - Stream manager for sending responses
 */
async function handleChatSession({
  request,
  userMessage,
  conversationId,
  promptType,
  llmProvider, // This is body.llm_provider, used as a fallback/preference
  stream
}) {
  const shopDomain = request.headers.get("Origin"); // Assuming this is a reliable way to get shop domain for config
  // Log USER_MESSAGE_SENT_BACKEND
  // Note: conversationId might be new here if client didn't provide one.
  // The log function can handle temporary/generated IDs if needed.
  // promptType here is from the client request, used as a fallback if no specific config
  await logChatInteraction(shopDomain, conversationId, "USER_MESSAGE_SENT_BACKEND", { messageLength: userMessage.length, requestedPromptType: promptType });


  if (!shopDomain) {
    stream.sendMessage({ type: 'error', error: { message: "Shop domain could not be determined." } });
    stream.sendMessage({ type: 'end_turn' });
    return;
  }

  const appConfig = await getShopChatbotConfig(shopDomain); 

  // Construct Final System Prompt
  let basePromptContent = '';
  if (appConfig && appConfig.customSystemPrompt && appConfig.customSystemPrompt.trim() !== "") {
    basePromptContent = appConfig.customSystemPrompt;
    logChatInteraction(shopDomain, conversationId, "SYSTEM_PROMPT_USED_CUSTOM", { length: basePromptContent.length });
  } else {
    let keyToUse = AppConfig.api.defaultPromptType; 
    if (appConfig && appConfig.systemPromptKey) {
      keyToUse = appConfig.systemPromptKey;
    }
    try {
      const promptsFilePath = path.join(process.cwd(), "app", "prompts", "prompts.json");
      const promptsJson = JSON.parse(fs.readFileSync(promptsFilePath, "utf-8"));
      if (promptsJson.systemPrompts && promptsJson.systemPrompts[keyToUse] && promptsJson.systemPrompts[keyToUse].content) {
        basePromptContent = promptsJson.systemPrompts[keyToUse].content;
        logChatInteraction(shopDomain, conversationId, "SYSTEM_PROMPT_USED_PREDEFINED", { key: keyToUse });
      } else {
        console.warn(`System prompt key "${keyToUse}" not found in prompts.json. Using content of defaultPromptType if available.`);
        if (promptsJson.systemPrompts && promptsJson.systemPrompts[AppConfig.api.defaultPromptType] && promptsJson.systemPrompts[AppConfig.api.defaultPromptType].content) {
           basePromptContent = promptsJson.systemPrompts[AppConfig.api.defaultPromptType].content;
           logChatInteraction(shopDomain, conversationId, "SYSTEM_PROMPT_USED_DEFAULT_KEY", { key: AppConfig.api.defaultPromptType });
        } else {
           console.error(`Default system prompt key "${AppConfig.api.defaultPromptType}" also not found in prompts.json! Using hardcoded fallback.`);
           basePromptContent = "You are a helpful assistant."; 
           logChatInteraction(shopDomain, conversationId, "SYSTEM_PROMPT_USED_HARDCODED_FALLBACK");
        }
      }
    } catch (e) {
      console.error("Error loading or parsing prompts.json:", e);
      basePromptContent = "You are a helpful assistant."; // Ultimate fallback on error
      logChatInteraction(shopDomain, conversationId, "SYSTEM_PROMPT_ERROR_FALLBACK", { error: e.message });
    }
  }

  const headOverride = (appConfig && appConfig.promptHeadOverride) ? appConfig.promptHeadOverride.trim() + "\n\n" : "";
  const tailOverride = (appConfig && appConfig.promptTailOverride) ? "\n\n" + appConfig.promptTailOverride.trim() : "";
  const finalSystemPrompt = `${headOverride}${basePromptContent}${tailOverride}`;
  // End System Prompt Construction


  const utmParamsConfig = {
    utm_source: appConfig?.utmSource,
    utm_medium: appConfig?.utmMedium,
    utm_campaign: appConfig?.utmCampaign,
    utm_term: appConfig?.utmTerm,
    utm_content: appConfig?.utmContent,
  };
  const activeUtmParams = Object.entries(utmParamsConfig)
    .filter(([_, value]) => value)
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});

  let selectedLlmProvider = null;
  let apiKey = null;

  // 1. Admin settings take precedence
  if (appConfig?.llmProvider) {
    selectedLlmProvider = appConfig.llmProvider;
    if (selectedLlmProvider === "gemini" && appConfig.geminiApiKey) {
      apiKey = appConfig.geminiApiKey;
    } else if (selectedLlmProvider === "claude" && appConfig.claudeApiKey) {
      apiKey = appConfig.claudeApiKey;
    }
  }

  // 2. Request body override/fallback (if admin provider preference didn't yield a key)
  //    or if admin hasn't set a preferred provider but has stored keys.
  if (!apiKey) {
    const requestLlmProvider = llmProvider; // llmProvider is body.llm_provider from handleChatRequest
    if (requestLlmProvider === "gemini" && appConfig?.geminiApiKey) {
      selectedLlmProvider = "gemini";
      apiKey = appConfig.geminiApiKey;
    } else if (requestLlmProvider === "claude" && appConfig?.claudeApiKey) {
      selectedLlmProvider = "claude";
      apiKey = appConfig.claudeApiKey;
    }
  }
  
  // 3. If still no apiKey, and admin had a preferred provider, it means the key for that provider is missing.
  if (!apiKey && appConfig?.llmProvider) {
    console.error(`Admin preferred LLM provider (${appConfig.llmProvider}) is set for ${shopDomain}, but its API key is missing or invalid.`);
    // We will fall through to the general error "LLM provider or API key is not configured correctly."
  }


  let llmService;
  if (selectedLlmProvider === "gemini" && apiKey) {
    llmService = createGeminiService(apiKey);
  } else if (selectedLlmProvider === "claude" && apiKey) {
    llmService = createClaudeService(apiKey);
  } else {
    console.error(`LLM provider or API key is not configured correctly for shop ${shopDomain}. Admin Provider: ${appConfig?.llmProvider}, Request Provider: ${llmProvider}`);
    stream.sendMessage({ type: 'error', error: { message: "LLM provider or API key is not configured correctly. Please check admin settings." } });
    stream.sendMessage({ type: 'end_turn' });
    return;
  }

  const toolService = createToolService();

  // Initialize MCP client
  const shopId = request.headers.get("X-Shopify-Shop-Id");
  // shopDomain is already defined above
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
    // Execute the conversation stream
    // The streamGeminiConversation is designed to directly use stream.sendMessage
    // for SSE events like 'chunk', 'id', 'message_complete', 'error', 'end_turn'.
    // It does not use onText, onMessage, onToolUse callbacks in the same way Claude SDK did.
    
    // Wrap sendMessage to intercept chunks, build the full response, and handle message saving.
    let assistantResponseText = "";
    const originalSendMessage = stream.sendMessage;
    let geminiToolCallEventData = null; // To store data from gemini_tool_call event

    stream.sendMessage = (data) => {
      if (data.type === 'gemini_tool_call') {
        geminiToolCallEventData = { name: data.name, arguments: data.arguments };
        // Do not forward 'gemini_tool_call' itself to client.
        // The 'message_complete' that follows it from gemini.server.js IS important to signal end of LLM turn.
        // We let 'message_complete' pass through.
        return; 
      }
      
      if (data.type === 'chunk') {
        assistantResponseText += data.chunk;
      } else if (data.type === 'message_complete') {
        // This event now comes from both Claude (via onMessage mapped) and Gemini (after chunks or after tool_call).
        // For Gemini tool_call, assistantResponseText will be empty.
        // For Claude tool_use, data.message will contain the tool_use content.
        
        let messageToSave = assistantResponseText;
        let roleToSave = 'assistant';

        if (data.message) { // This is likely from Claude
          messageToSave = data.message; // Claude's content can be an array of blocks
          roleToSave = data.role || 'assistant';
        }

        if (messageToSave || (llmProvider === 'gemini' && geminiToolCallEventData)) { // Save if there's text OR if it was a Gemini tool call
          if (llmProvider === 'gemini' && geminiToolCallEventData && !assistantResponseText) {
            // This was a Gemini tool call turn, save the tool call request itself as the assistant's message
            messageToSave = [{ type: 'function_call', name: geminiToolCallEventData.name, arguments: geminiToolCallEventData.arguments }];
            roleToSave = 'assistant'; // Or 'model'
             // Reset geminiToolCallEventData after "using" it for saving, to ensure it's for current turn.
            // geminiToolCallEventData = null; // Resetting here might be too early if continuation logic is below.
                                        // It's reset after the continuation call.
          }

          conversationHistory.push({
            role: roleToSave,
            // Gemini's function_call is an object, Claude's tool_use is an array of blocks.
            // Regular text is string. JSON.stringify handles all.
            content: messageToSave 
          });
          
          saveMessage(conversationId, roleToSave, JSON.stringify(messageToSave))
            .then(() => {
              logChatInteraction(shopDomain, conversationId, "ASSISTANT_MESSAGE_SAVED", { 
                messageLength: typeof messageToSave === 'string' ? messageToSave.length : JSON.stringify(messageToSave).length, 
                role: roleToSave,
                llmProvider: selectedLlmProvider // Log which LLM was used
              });
            })
            .catch((error) => {
              console.error("Error saving assistant message to database:", error);
            });
        }
        assistantResponseText = ""; // Reset for next message
      } else if (data.type === 'end_turn') {
        if (productsToDisplay.length > 0) {
          originalSendMessage({
            type: 'product_results',
            products: productsToDisplay
          });
        }
      }
      // Forward all events except the raw 'gemini_tool_call'
      if(data.type !== 'gemini_tool_call') {
        originalSendMessage(data);
      }
    };

    if (selectedLlmProvider === 'gemini') { // Use selectedLlmProvider
      await llmService.streamGeminiConversation(
        {
          messages: conversationHistory,
          systemInstruction: finalSystemPrompt, // Pass constructed prompt
          // promptType, // Remove if systemInstruction replaces its role, or keep if used differently
          tools: mcpClient.tools,
          conversationId
        },
        { sendMessage: stream.sendMessage } 
      );

      // After the initial stream, check if a tool call was signaled by the wrapper
      if (geminiToolCallEventData) {
        const toolName = geminiToolCallEventData.name;
        const toolArgs = geminiToolCallEventData.arguments;
        geminiToolCallEventData = null; // Reset after use

        console.log(`[handleChatSession] Gemini requested tool: ${toolName}, Args:`, toolArgs);
        await logChatInteraction(shopDomain, conversationId, `TOOL_CALL_INITIATED_${toolName.toUpperCase()}`, { args: toolArgs, llmProvider: selectedLlmProvider });
        let toolExecutionResult;
        try {
          const mcpResponse = await mcpClient.callTool(toolName, toolArgs);
          await logChatInteraction(shopDomain, conversationId, `TOOL_CALL_COMPLETED_${toolName.toUpperCase()}`, { success: !mcpResponse.error, responseOutput: mcpResponse });
          if (mcpResponse.error) {
            console.error(`[handleChatSession] MCP Tool Error for ${toolName}:`, mcpResponse.error);
            toolExecutionResult = { error: true, message: mcpResponse.error.data || "Tool execution failed", details: mcpResponse.error };
          } else {
            toolExecutionResult = mcpResponse; 
            // Check if tool response contains a checkoutUrl and append UTMs
            if (toolExecutionResult && toolExecutionResult.checkoutUrl && typeof toolExecutionResult.checkoutUrl === 'string') {
              toolExecutionResult.checkoutUrl = appendUtmParameters(toolExecutionResult.checkoutUrl, activeUtmParams);
              logChatInteraction(shopDomain, conversationId, "CHECKOUT_URL_WITH_UTM_GENERATED", { originalUrl: mcpResponse.checkoutUrl, finalUrl: toolExecutionResult.checkoutUrl, toolName });
            }
          }
        } catch (e) {
          console.error(`[handleChatSession] Exception calling MCP Tool ${toolName}:`, e);
          toolExecutionResult = { error: true, message: e.message || "Exception during tool execution" };
        }
        
        // conversationHistory at this point already includes the 'function_call' part saved by the wrapper.
        // The gemini.server.js streamGeminiResponseAfterToolExecution expects existingMessages in Gemini Content format.
        // Our conversationHistory is in Claude format. The service needs to handle this transformation.
        // This requires a modification in gemini.server.js or a transformation here.
        // For now, let's assume gemini.server.js can handle Claude-formatted history for continuation,
        // or that its formatMessagesForGemini is reused internally.
        // The critical part is that `gemini.server.js` will add the functionResponse part.

        await llmService.streamGeminiResponseAfterToolExecution({
          existingMessages: conversationHistory, // Pass the history that led to the tool call + the tool call itself
          toolName: toolName,
            toolResponse: toolExecutionResult,
          streamHandlers: { sendMessage: stream.sendMessage }, // Use wrapped to continue streaming
          conversationId
        });
      }
    } else { // Claude provider
      await llmService.streamConversation( 
        {
          messages: conversationHistory,
          systemInstruction: finalSystemPrompt, // Pass constructed prompt
          // promptType, // Remove if systemInstruction replaces its role
          tools: mcpClient.tools
        },
        { 
          onText: (textDelta) => {
            stream.sendMessage({ type: 'chunk', chunk: textDelta });
          },
          onMessage: (message) => { // message is the full message object from Claude
            // Save Claude's message (can be text or tool_use)
            // The wrapper's 'message_complete' logic will handle saving.
            // We also need to ensure assistantResponseText is cleared if this is a full message.
            assistantResponseText = ""; // Clear any partial chunks if a full message object arrives
            stream.sendMessage({ type: 'message_complete', message: message.content, role: message.role });
          },
          onToolUse: async (toolUseContent) => { // toolUseContent is Claude's tool_use block
            const toolName = toolUseContent.name;
            const toolArgs = toolUseContent.input;
            const toolUseId = toolUseContent.id; // Claude specific
            
            // It's important that the tool_use message itself was saved.
            // The onMessage handler above should have caught it if it was part of message.content.
            await logChatInteraction(shopDomain, conversationId, `TOOL_CALL_INITIATED_${toolName.toUpperCase()}`, { args: toolArgs, llmProvider: selectedLlmProvider });
            const mcpResponse = await mcpClient.callTool(toolName, toolArgs);
            
            // Check if tool response contains a checkoutUrl and append UTMs
            let processedMcpResponse = mcpResponse;
            if (mcpResponse && !mcpResponse.error && mcpResponse.checkoutUrl && typeof mcpResponse.checkoutUrl === 'string') {
                processedMcpResponse = {
                    ...mcpResponse,
                    checkoutUrl: appendUtmParameters(mcpResponse.checkoutUrl, activeUtmParams)
                };
                logChatInteraction(shopDomain, conversationId, "CHECKOUT_URL_WITH_UTM_GENERATED", { originalUrl: mcpResponse.checkoutUrl, finalUrl: processedMcpResponse.checkoutUrl, toolName });
            }
            await logChatInteraction(shopDomain, conversationId, `TOOL_CALL_COMPLETED_${toolName.toUpperCase()}`, { success: !processedMcpResponse.error, responseOutput: processedMcpResponse });

            if (processedMcpResponse.error) { // Use processedMcpResponse here
              await toolService.handleToolError( 
                processedMcpResponse,
                toolName,
                toolUseId,
                conversationHistory, // Pass by reference, it gets mutated
                stream.sendMessage, 
                conversationId
              );
            } else {
              await toolService.handleToolSuccess( // This also updates conversationHistory
                mcpResponse,
                toolName,
                toolUseId,
                conversationHistory, // Pass by reference, it gets mutated
                productsToDisplay,
                conversationId
              );
            }
            // For Claude, the streamConversation is often called again in a loop with updated history.
            // This simplified version sends 'new_message', client might re-initiate or UI updates.
            // If a true loop is needed, this structure would need to change for Claude.
            // For now, we assume this `onToolUse` completes a turn or the client handles re-query.
            stream.sendMessage({ type: 'new_message' }); // Inform client something happened
          }
        }
      );
      // After Claude stream, explicitly send end_turn if its stream.finalMessage() was the end.
      // The Gemini service sends end_turn itself.
      // If onToolUse was the last thing, Claude's stream might not have formally "ended" in a way that triggers wrapper's end_turn.
      // This ensures client knows the turn is over from server perspective for non-Gemini.
      stream.sendMessage({ type: 'end_turn' });
    }

    stream.sendMessage = originalSendMessage; // Restore original sendMessage

  } catch (error) {
    console.error(`[handleChatSession] Error during ${selectedLlmProvider || llmProvider} conversation:`, error);
    stream.sendMessage({ type: 'error', error: { message: error.message || `Chat session failed with ${selectedLlmProvider || llmProvider}.` } });
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
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept, X-Shopify-Shop-Id"; // Added X-Shopify-Shop-Id

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
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Shopify-Shop-Id" // Added X-Shopify-Shop-Id
  };
}

// Helper function for logging interactions
async function logChatInteraction(shop, conversationId, eventType, eventDetail = {}) {
  if (!shop || !conversationId) { // Allow logs even if convId is briefly null for first message
    console.warn(`ChatLog: Missing shop or conversationId for event ${eventType}. Shop: ${shop}, ConvID: ${conversationId}`);
    // Decide if you want to proceed or not. For now, let's proceed if shop is present.
    if(!shop) return;
  }
  try {
    await prisma.chatInteractionLog.create({
      data: {
        shop,
        conversationId: conversationId || `TEMP_${Date.now()}`, // Use a temporary ID if null
        eventType,
        eventDetail,
      },
    });
  } catch (error) {
    console.error(`ChatLog: Failed to log interaction (${eventType}) for shop ${shop}, conv ${conversationId}:`, error);
  }
}
