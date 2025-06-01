import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

// Encryption/Decryption helpers
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "DefaultEncryptionKeyPlaceholder32Chars"; // Must be 32 characters for AES-256
const ALGORITHM = 'aes-256-cbc';

if (ENCRYPTION_KEY === "DefaultEncryptionKeyPlaceholder32Chars") {
  console.warn("Warning: Using default encryption key. Set ENCRYPTION_KEY environment variable for production.");
}
if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes long for aes-256-cbc.");
}

function encrypt(text) {
  if (text == null || text === '') return null;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error("Encryption failed:", error);
    // Depending on policy, you might want to return null, throw, or return the original text
    return null;
  }
}

function decrypt(text) {
  if (text == null || text === '') return null;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
      console.error("Decryption failed: Invalid format. Expected iv:encryptedData");
      return null;
    }
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error("Decryption failed:", error);
    // It's common to return null if decryption fails, e.g. due to wrong key or corrupt data
    return null;
  }
}

export async function getAppConfiguration(shop) {
  if (!shop) {
    console.error("getAppConfiguration: shop parameter is required");
    return null; // Or throw an error
  }
  try {
    const config = await prisma.appConfiguration.findUnique({
      where: { shop },
    });

    if (config) {
      return {
        ...config,
        geminiApiKey: decrypt(config.geminiApiKey),
        claudeApiKey: decrypt(config.claudeApiKey),
      };
    }
    return { llmProvider: null, geminiApiKey: null, claudeApiKey: null, shop }; // Default structure if not found
  } catch (error) {
    console.error(`Error fetching app configuration for shop ${shop}:`, error);
    // Consider what to return in case of error: null, default object, or throw
    return { llmProvider: null, geminiApiKey: null, claudeApiKey: null, shop, error: "Failed to fetch configuration" };
  }
}

export async function updateAppConfiguration(shop, data) {
  if (!shop) {
    console.error("updateAppConfiguration: shop parameter is required");
    throw new Error("Shop parameter is required for updating configuration.");
  }
  if (!data) {
    console.error("updateAppConfiguration: data parameter is required");
    throw new Error("Data parameter is required for updating configuration.");
  }

  const { llmProvider, geminiApiKey, claudeApiKey } = data;
  const encryptedData = {};

  if (llmProvider !== undefined) encryptedData.llmProvider = llmProvider;

  // Encrypt API keys only if they are provided as non-empty strings
  if (geminiApiKey && typeof geminiApiKey === 'string') {
    encryptedData.geminiApiKey = encrypt(geminiApiKey);
  } else if (geminiApiKey === '' || geminiApiKey === null) {
    encryptedData.geminiApiKey = null; // Explicitly set to null if cleared
  }

  if (claudeApiKey && typeof claudeApiKey === 'string') {
    encryptedData.claudeApiKey = encrypt(claudeApiKey);
  } else if (claudeApiKey === '' || claudeApiKey === null) {
    encryptedData.claudeApiKey = null; // Explicitly set to null if cleared
  }

  try {
    const result = await prisma.appConfiguration.upsert({
      where: { shop },
      update: encryptedData,
      create: {
        shop,
        ...encryptedData, // llmProvider might be undefined here, prisma handles it
      },
    });
    // Return decrypted data for consistency, or the raw result if preferred
    return {
        ...result,
        geminiApiKey: decrypt(result.geminiApiKey),
        claudeApiKey: decrypt(result.claudeApiKey),
    };
  } catch (error) {
    console.error(`Error updating app configuration for shop ${shop}:`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

/**
 * Store a code verifier for PKCE authentication
 * @param {string} state - The state parameter used in OAuth flow
 * @param {string} verifier - The code verifier to store
 * @returns {Promise<Object>} - The saved code verifier object
 */
export async function storeCodeVerifier(state, verifier) {
  // Calculate expiration date (10 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    return await prisma.codeVerifier.create({
      data: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

/**
 * Get a code verifier by state parameter
 * @param {string} state - The state parameter used in OAuth flow
 * @returns {Promise<Object|null>} - The code verifier object or null if not found
 */
export async function getCodeVerifier(state) {
  try {
    const verifier = await prisma.codeVerifier.findFirst({
      where: {
        state,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (verifier) {
      // Delete it after retrieval to prevent reuse
      await prisma.codeVerifier.delete({
        where: {
          id: verifier.id
        }
      });
    }

    return verifier;
  } catch (error) {
    console.error('Error retrieving code verifier:', error);
    return null;
  }
}

/**
 * Store a customer access token in the database
 * @param {string} conversationId - The conversation ID to associate with the token
 * @param {string} accessToken - The access token to store
 * @param {Date} expiresAt - When the token expires
 * @returns {Promise<Object>} - The saved customer token
 */
export async function storeCustomerToken(conversationId, accessToken, expiresAt) {
  try {
    // Check if a token already exists for this conversation
    const existingToken = await prisma.customerToken.findFirst({
      where: { conversationId }
    });

    if (existingToken) {
      // Update existing token
      return await prisma.customerToken.update({
        where: { id: existingToken.id },
        data: {
          accessToken,
          expiresAt,
          updatedAt: new Date()
        }
      });
    }

    // Create a new token record
    return await prisma.customerToken.create({
      data: {
        id: `ct_${Date.now()}`,
        conversationId,
        accessToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer token:', error);
    throw error;
  }
}

/**
 * Get a customer access token by conversation ID
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>} - The customer token or null if not found/expired
 */
export async function getCustomerToken(conversationId) {
  try {
    const token = await prisma.customerToken.findFirst({
      where: {
        conversationId,
        expiresAt: {
          gt: new Date() // Only return non-expired tokens
        }
      }
    });

    return token;
  } catch (error) {
    console.error('Error retrieving customer token:', error);
    return null;
  }
}

/**
 * Create or update a conversation in the database
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} - The created or updated conversation
 */
export async function createOrUpdateConversation(conversationId) {
  try {
    const existingConversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (existingConversation) {
      return await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date()
        }
      });
    }

    return await prisma.conversation.create({
      data: {
        id: conversationId
      }
    });
  } catch (error) {
    console.error('Error creating/updating conversation:', error);
    throw error;
  }
}

/**
 * Save a message to the database
 * @param {string} conversationId - The conversation ID
 * @param {string} role - The message role (user or assistant)
 * @param {string} content - The message content
 * @returns {Promise<Object>} - The saved message
 */
export async function saveMessage(conversationId, role, content) {
  try {
    // Ensure the conversation exists
    await createOrUpdateConversation(conversationId);

    // Create the message
    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

/**
 * Get conversation history
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>} - Array of messages in the conversation
 */
export async function getConversationHistory(conversationId) {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    return messages;
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return [];
  }
}

/**
 * Store customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {string} url - The customer account URL
 * @returns {Promise<Object>} - The saved URL object
 */
export async function storeCustomerAccountUrl(conversationId, url) {
  try {
    return await prisma.customerAccountUrl.upsert({
      where: { conversationId },
      update: {
        url,
        updatedAt: new Date()
      },
      create: {
        conversationId,
        url,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer account URL:', error);
    throw error;
  }
}

/**
 * Get customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<string|null>} - The customer account URL or null if not found
 */
export async function getCustomerAccountUrl(conversationId) {
  try {
    const record = await prisma.customerAccountUrl.findUnique({
      where: { conversationId }
    });

    return record?.url || null;
  } catch (error) {
    console.error('Error retrieving customer account URL:', error);
    return null;
  }
}
