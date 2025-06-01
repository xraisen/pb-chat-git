/**
 * Gemini Service
 * Manages interactions with the Google Gemini API
 */
import AppConfig from "./config.server"; // Keep for AppConfig.api.maxTokens and defaultModel
// import systemPrompts from "../prompts/prompts.json"; // No longer needed here

// Helper to map OpenAPI/Claude schema types to Gemini schema types
function mapTypeToGemini(claudeType) {
  switch (claudeType) {
    case "string":
      return "STRING";
    case "integer":
      return "INTEGER";
    case "number":
      return "NUMBER";
    case "boolean":
      return "BOOLEAN";
    // TODO: Add more type mappings if necessary (array, object etc.)
    default:
      return "STRING"; // Default to string if unknown
  }
}

// Helper to transform Claude/OpenAPI tools to Gemini's FunctionDeclaration format
function transformClaudeToolsToGemini(claudeTools) {
  if (!claudeTools || claudeTools.length === 0) {
    return [];
  }

  return claudeTools.map(tool => {
    const properties = {};
    if (tool.input_schema && tool.input_schema.properties) {
      for (const key in tool.input_schema.properties) {
        const prop = tool.input_schema.properties[key];
        properties[key] = {
          type: mapTypeToGemini(prop.type),
          description: prop.description || "",
        };
      }
    }

    return {
      name: tool.name,
      description: tool.description || "",
      parameters: {
        type: "OBJECT", // Gemini uses "OBJECT" for object type parameters
        properties: properties,
        required: tool.input_schema && tool.input_schema.required ? tool.input_schema.required : [],
      },
    };
  });
}

// Helper to transform Claude messages to Gemini format
function formatMessagesForGemini(messages, systemInstruction) {
  const geminiMessages = [];

  // Add system instruction as the first message if provided
  if (systemInstruction) {
    // Gemini typically prefers system instructions either as a separate field 
    // or as the first "model" message in a "user" initiated conversation.
    // For simplicity here, we'll add it as a "user" message, then a "model" response.
    // Or, if your prompt structure is different, adjust accordingly.
    // A common pattern is:
    // { role: "user", parts: [{ text: "System instruction here." }] },
    // { role: "model", parts: [{ text: "Okay, I understand." }] }
    // However, for direct instruction, sometimes just prepending to the first user message works,
    // or using the `system_instruction` field if supported by the specific Gemini model endpoint.
    // For gemini-pro through Vertex AI, system_instruction is a top-level field.
    // For generativelanguage.googleapis.com, it's often part of the `contents`.
    // We will add it as the first element in contents for now.
    geminiMessages.push({ role: "user", parts: [{ text: systemInstruction }] });
    geminiMessages.push({ role: "model", parts: [{ text: "Okay, I will follow these instructions." }] });
  }

  messages.forEach(msg => {
    let role = msg.role;
    if (role === "assistant") {
      role = "model";
    }
    // Skip system messages if they were already handled or are not directly translatable
    if (role !== "system") {
      geminiMessages.push({
        role: role,
        parts: [{ text: msg.content }],
      });
    }
  });
  return geminiMessages;
}


/**
 * Creates a Gemini service instance
 * @param {string} apiKey - Gemini API key
 * @param {string} [modelName] - Optional model name to use (e.g., "gemini-pro")
 * @returns {Object} Gemini service with methods for interacting with Gemini API
 */
export function createGeminiService(apiKey = process.env.GEMINI_API_KEY, modelName = AppConfig.api.defaultGeminiModel || "gemini-pro") {
  /**
   * Streams a conversation with Gemini
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history (Claude format)
   * @param {string} params.systemInstruction - The full system prompt content.
   * @param {Array} params.tools - Available tools (Claude format)
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.sendMessage - Handles sending SSE messages to client
   * @param {string} params.conversationId - The current conversation ID (optional, for event emulation)
   * @returns {Promise<void>} Resolves when streaming is complete
   */
  const streamGeminiConversation = async ({
    messages,
    systemInstruction, // Changed from promptType
    tools,
    conversationId
  }, streamHandlers) => {
    
    if (!apiKey) {
      console.error("Gemini API key is missing.");
      streamHandlers.sendMessage({ type: 'error', error: { message: "Gemini API key is missing." } });
      streamHandlers.sendMessage({ type: 'end_turn' });
      return;
    }

    // systemInstruction is now passed directly.
    const formattedMessages = formatMessagesForGemini(messages, systemInstruction);
    
    let geminiToolsPayload = null;
    if (tools && tools.length > 0) {
      const transformedSchemas = transformClaudeToolsToGemini(tools);
      if (transformedSchemas.length > 0) {
        geminiToolsPayload = [{ functionDeclarations: transformedSchemas }];
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}`;

    const requestBody = {
      contents: formattedMessages,
      generationConfig: {
        maxOutputTokens: AppConfig.api.maxTokens || 2048,
        // Other configs like temperature, topP, topK can be added here
      },
      // safetySettings: [], // Add safety settings if needed
    };

    if (geminiToolsPayload) {
      requestBody.tools = geminiToolsPayload;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => response.text()); // Try to parse as JSON, fallback to text
        console.error('Gemini API Error:', response.status, errorBody);
        streamHandlers.sendMessage({ type: 'error', error: { message: `Gemini API Error: ${response.status}`, data: errorBody } });
        streamHandlers.sendMessage({ type: 'end_turn' });
        return;
      }

      // Emulate 'id' event if conversationId is available
      if (conversationId) {
        streamHandlers.sendMessage({ type: 'id', conversation_id: conversationId });
      }
      
      let accumulatedText = "";
      let toolCallDetectedThisTurn = false;

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done || toolCallDetectedThisTurn) { // Stop if tool call detected
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim() === "" || toolCallDetectedThisTurn) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.candidates && parsed.candidates.length > 0) {
                const candidate = parsed.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                  const part = candidate.content.parts[0];
                  if (part.functionCall) {
                    console.log("[Gemini Service] Function call detected:", part.functionCall);
                    streamHandlers.sendMessage({
                      type: 'gemini_tool_call',
                      name: part.functionCall.name,
                      arguments: part.functionCall.args
                    });
                    // Signal message (the tool call itself) is complete for this turn
                    streamHandlers.sendMessage({ type: 'message_complete' });
                    toolCallDetectedThisTurn = true; 
                    break; // Stop processing further parts/lines in this chunk
                  } else if (part.text && !toolCallDetectedThisTurn) {
                    streamHandlers.sendMessage({ type: 'chunk', chunk: part.text });
                    accumulatedText += part.text;
                  }
                }
                // TODO: Check for finishReason if needed, e.g. candidate.finishReason
                // Could be 'TOOL_CALLS' or 'STOP' etc.
              }
            } catch (e) {
              console.warn('[Gemini Service] Failed to parse JSON chunk part:', line, e);
            }
          }
        }
      }
      
      // If no tool call was detected and we have accumulated text, send message_complete for the text response.
      if (!toolCallDetectedThisTurn && accumulatedText.length > 0) {
        streamHandlers.sendMessage({ type: 'message_complete' });
      }

    } catch (error) {
      console.error('Error streaming Gemini conversation:', error);
      streamHandlers.sendMessage({ type: 'error', error: { message: error.message || "Unknown streaming error" } });
    } finally {
      streamHandlers.sendMessage({ type: 'end_turn' });
    }
  };

  // getSystemPrompt is no longer needed here if systemInstruction is always passed.
  // const getSystemPrompt = (promptType) => { ... };

  return {
    streamGeminiConversation,
    // getSystemPrompt, // Can be removed if not used by other methods in this service
    streamGeminiResponseAfterToolExecution,
  };
}


// New function to handle streaming response after a tool execution
const streamGeminiResponseAfterToolExecution = async ({
  apiKey = process.env.GEMINI_API_KEY,
  existingMessages,
  toolName,
  toolResponse,
  streamHandlers,
  conversationId,
  systemInstruction // Added systemInstruction here for consistency if needed by formatMessagesForGemini
}) => {
  if (!apiKey) {
    console.error("[Gemini Service] API key is missing for tool response call.");
    streamHandlers.sendMessage({ type: 'error', error: { message: "Gemini API key is missing." } });
    streamHandlers.sendMessage({ type: 'end_turn' });
    return;
  }

  // Construct the function response message part for Gemini
  // Gemini expects the function response to be from the "user" role (or "function" role)
  const functionResponseMessage = {
    role: "user", // Using "user" as per common practice for function responses to Gemini
    parts: [
      {
        functionResponse: {
          name: toolName,
          response: toolResponse, // Pass the raw toolResponse; Gemini expects an object.
                                  // If toolResponse is a string, it might need to be wrapped e.g. { content: toolResponse }
                                  // For now, assuming toolResponse is structured as the LLM expects.
        }
      }
    ]
  };
  
  const updatedMessages = [...existingMessages, functionResponseMessage];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}`;
  const requestBody = {
    contents: updatedMessages,
    generationConfig: {
      maxOutputTokens: AppConfig.api.maxTokens || 2048,
    },
    // Tools (function declarations) are omitted here, assuming a simple "tool -> result -> final text answer" flow.
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => response.text());
      console.error('[Gemini Service] API Error after tool execution:', response.status, errorBody);
      streamHandlers.sendMessage({ type: 'error', error: { message: `Gemini API Error: ${response.status}`, data: errorBody } });
      streamHandlers.sendMessage({ type: 'end_turn' });
      return;
    }

    if (conversationId) {
      streamHandlers.sendMessage({ type: 'id', conversation_id: conversationId });
    }

    let accumulatedText = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.candidates && parsed.candidates.length > 0) {
              const candidate = parsed.candidates[0];
              // After a tool response, we expect only text parts, not another functionCall (since tools were omitted)
              if (candidate.content && candidate.content.parts && candidate.content.parts[0].text) {
                const textChunk = candidate.content.parts[0].text;
                streamHandlers.sendMessage({ type: 'chunk', chunk: textChunk });
                accumulatedText += textChunk;
              }
            }
          } catch (e) {
            console.warn('[Gemini Service] Failed to parse JSON chunk part after tool exec:', line, e);
          }
        }
      }
    }

    if (accumulatedText.length > 0) {
      streamHandlers.sendMessage({ type: 'message_complete' });
    }

  } catch (error) {
    console.error('Error streaming Gemini response after tool execution:', error);
    streamHandlers.sendMessage({ type: 'error', error: { message: error.message || "Unknown streaming error after tool execution" } });
  } finally {
    streamHandlers.sendMessage({ type: 'end_turn' });
  }
};


export default {
  createGeminiService,
};
