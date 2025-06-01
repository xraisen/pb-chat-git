/**
 * Claude Service
 * Manages interactions with the Claude API
 */
import { Anthropic } from "@anthropic-ai/sdk";
import AppConfig from "./config.server"; // Keep for AppConfig.api.maxTokens and defaultModel if needed

/**
 * Creates a Claude service instance
 * @param {string} apiKey - Claude API key
 * @param {string} [modelName] - Optional model name to use
 * @returns {Object} Claude service with methods for interacting with Claude API
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY, modelName = AppConfig.api.defaultClaudeModel || "claude-3-haiku-20240307") {
  // Initialize Claude client
  const anthropic = new Anthropic({ apiKey });

  /**
   * Streams a conversation with Claude
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.system - The full system prompt content.
   * @param {Array} params.tools - Available tools for Claude
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @param {Function} streamHandlers.onToolUse - Handles tool use requests
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({ 
    messages, 
    system, // Changed from promptType to system (full content)
    tools 
  }, streamHandlers) => {
    // System prompt content is now passed directly as 'system'

    // Create stream
    const stream = await anthropic.messages.stream({
      model: modelName, // Use modelName passed to createClaudeService
      max_tokens: AppConfig.api.maxTokens || 4096, // Ensure a default for maxTokens
      system: system, // Use the passed system prompt content
      messages,
      tools: tools && tools.length > 0 ? tools : undefined
    });

    // Set up event handlers
    if (streamHandlers.onText) {
      stream.on('text', streamHandlers.onText);
    }

    if (streamHandlers.onMessage) {
      stream.on('message', streamHandlers.onMessage);
    }

    // Wait for final message
    const finalMessage = await stream.finalMessage();
    
    // Process tool use requests
    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  // getSystemPrompt is no longer needed here as the content is passed from chat.jsx
  // If other functions in this file were to use it, it could remain.
  // For now, assuming only streamConversation used it for system prompt resolution.

  return {
    streamConversation
    // getSystemPrompt // Can be removed if not used elsewhere by this service
  };
}

export default {
  createClaudeService
};