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

const defaultShopChatbotConfig = {
  llmProvider: null,
  geminiApiKey: null,
  claudeApiKey: null,
  botName: "Store Assistant",
  welcomeMessage: "👋 Hi there! How can I help you today?",
  systemPromptKey: "standardAssistant",
  customSystemPrompt: null,
  // UTM Default Values
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  // UI Defaults
  width: "450px",
  height: "70vh",
  zIndex: "9999",
  position: "right",
  bgColor: "#FFFFFF",
  textColor: "#333333",
  buttonColor: "#E57399",
  headerBgColor: "#E57399",
  headerTextColor: "#FFFFFF",
  userMsgBgColor: "#E57399",
  userMsgTextColor: "#FFFFFF",
  assistantMsgBgColor: "#F8F9FA",
  assistantMsgTextColor: "#333333",
  customCSS: null,
  avatarUrl: null,
  productDisplayMode: "card",
  maxProductsToDisplay: 3,
  carouselItemWidth: "180px",
  chatBubbleIcon: "default",
  customChatBubbleSVG: null,
  chatBubbleSize: "60px",
  chatBubbleColor: "#E57399",
};

export async function getShopChatbotConfig(shop) {
  if (!shop) {
    console.error("getShopChatbotConfig: shop parameter is required");
    return { ...defaultShopChatbotConfig, shop, error: "Shop parameter is required" };
  }
  try {
    const config = await prisma.shopChatbotConfig.findUnique({
      where: { shop },
    });

    if (config) {
      return {
        ...defaultShopChatbotConfig, // Ensures all fields are present
        ...config,
        geminiApiKey: decrypt(config.geminiApiKey),
        claudeApiKey: decrypt(config.claudeApiKey),
      };
    }
    // If no config exists, return all default values along with the shop
    return { ...defaultShopChatbotConfig, shop };
  } catch (error) {
    console.error(`Error fetching ShopChatbotConfig for shop ${shop}:`, error);
    return { ...defaultShopChatbotConfig, shop, error: "Failed to fetch configuration" };
  }
}

export async function updateShopChatbotConfig(shop, data) {
  if (!shop) {
    console.error("updateShopChatbotConfig: shop parameter is required");
    throw new Error("Shop parameter is required for updating configuration.");
  }
  if (!data) {
    console.error("updateShopChatbotConfig: data parameter is required");
    throw new Error("Data parameter is required for updating configuration.");
  }

  // Destructure all expected fields from data, providing defaults for undefined optional fields
  // This ensures that even if a field is not in `data`, it doesn't become `undefined` if Prisma expects a value or null.
  const {
    llmProvider, geminiApiKey, claudeApiKey,
    botName, welcomeMessage, systemPromptKey, customSystemPrompt,
    // UTM Params
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
    // UI Params
    width, height, zIndex, position, bgColor, textColor, buttonColor,
    headerBgColor, headerTextColor, userMsgBgColor, userMsgTextColor,
    assistantMsgBgColor, assistantMsgTextColor, customCSS, avatarUrl,
    productDisplayMode, maxProductsToDisplay, carouselItemWidth,
    chatBubbleIcon, customChatBubbleSVG, chatBubbleSize, chatBubbleColor
  } = data;

  const dataToUpsert = {
    // LLM and API Keys
    llmProvider: llmProvider !== undefined ? llmProvider : defaultShopChatbotConfig.llmProvider,
    geminiApiKey: (geminiApiKey && typeof geminiApiKey === 'string') ? encrypt(geminiApiKey) : (geminiApiKey === '' || geminiApiKey === null ? null : undefined),
    claudeApiKey: (claudeApiKey && typeof claudeApiKey === 'string') ? encrypt(claudeApiKey) : (claudeApiKey === '' || claudeApiKey === null ? null : undefined),

    // Chatbot Persona & Behavior
    botName: botName !== undefined ? botName : defaultShopChatbotConfig.botName,
    welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : defaultShopChatbotConfig.welcomeMessage,
    systemPromptKey: systemPromptKey !== undefined ? systemPromptKey : defaultShopChatbotConfig.systemPromptKey,
    customSystemPrompt: customSystemPrompt !== undefined ? customSystemPrompt : defaultShopChatbotConfig.customSystemPrompt,

    // UTM Parameters
    utmSource: utmSource !== undefined ? utmSource : defaultShopChatbotConfig.utmSource,
    utmMedium: utmMedium !== undefined ? utmMedium : defaultShopChatbotConfig.utmMedium,
    utmCampaign: utmCampaign !== undefined ? utmCampaign : defaultShopChatbotConfig.utmCampaign,
    utmTerm: utmTerm !== undefined ? utmTerm : defaultShopChatbotConfig.utmTerm,
    utmContent: utmContent !== undefined ? utmContent : defaultShopChatbotConfig.utmContent,

    // Chat Widget Appearance & Positioning
    width: width !== undefined ? width : defaultShopChatbotConfig.width,
    height: height !== undefined ? height : defaultShopChatbotConfig.height,
    zIndex: zIndex !== undefined ? zIndex : defaultShopChatbotConfig.zIndex,
    position: position !== undefined ? position : defaultShopChatbotConfig.position,
    bgColor: bgColor !== undefined ? bgColor : defaultShopChatbotConfig.bgColor,
    textColor: textColor !== undefined ? textColor : defaultShopChatbotConfig.textColor,
    buttonColor: buttonColor !== undefined ? buttonColor : defaultShopChatbotConfig.buttonColor,
    headerBgColor: headerBgColor !== undefined ? headerBgColor : defaultShopChatbotConfig.headerBgColor,
    headerTextColor: headerTextColor !== undefined ? headerTextColor : defaultShopChatbotConfig.headerTextColor,
    userMsgBgColor: userMsgBgColor !== undefined ? userMsgBgColor : defaultShopChatbotConfig.userMsgBgColor,
    userMsgTextColor: userMsgTextColor !== undefined ? userMsgTextColor : defaultShopChatbotConfig.userMsgTextColor,
    assistantMsgBgColor: assistantMsgBgColor !== undefined ? assistantMsgBgColor : defaultShopChatbotConfig.assistantMsgBgColor,
    assistantMsgTextColor: assistantMsgTextColor !== undefined ? assistantMsgTextColor : defaultShopChatbotConfig.assistantMsgTextColor,
    customCSS: customCSS !== undefined ? customCSS : defaultShopChatbotConfig.customCSS,
    avatarUrl: avatarUrl !== undefined ? avatarUrl : defaultShopChatbotConfig.avatarUrl,

    // Product Display
    productDisplayMode: productDisplayMode !== undefined ? productDisplayMode : defaultShopChatbotConfig.productDisplayMode,
    maxProductsToDisplay: maxProductsToDisplay !== undefined ? (typeof maxProductsToDisplay === 'string' ? parseInt(maxProductsToDisplay, 10) : maxProductsToDisplay) : defaultShopChatbotConfig.maxProductsToDisplay,
    carouselItemWidth: carouselItemWidth !== undefined ? carouselItemWidth : defaultShopChatbotConfig.carouselItemWidth,

    // Chat Bubble Appearance
    chatBubbleIcon: chatBubbleIcon !== undefined ? chatBubbleIcon : defaultShopChatbotConfig.chatBubbleIcon,
    customChatBubbleSVG: customChatBubbleSVG !== undefined ? customChatBubbleSVG : defaultShopChatbotConfig.customChatBubbleSVG,
    chatBubbleSize: chatBubbleSize !== undefined ? chatBubbleSize : defaultShopChatbotConfig.chatBubbleSize,
    chatBubbleColor: chatBubbleColor !== undefined ? chatBubbleColor : defaultShopChatbotConfig.chatBubbleColor,
  };

  // Filter out undefined values from dataToUpsert to avoid Prisma errors for optional fields not being updated
  const updatePayload = Object.fromEntries(Object.entries(dataToUpsert).filter(([_, v]) => v !== undefined));

  try {
    const result = await prisma.shopChatbotConfig.upsert({
      where: { shop },
      update: updatePayload,
      create: {
        shop,
        ...updatePayload, // Use the processed and filtered data
      },
    });
    // Return decrypted data for consistency
    return {
        ...result, // contains all fields from DB
        geminiApiKey: decrypt(result.geminiApiKey),
        claudeApiKey: decrypt(result.claudeApiKey),
    };
  } catch (error) {
    console.error(`Error updating ShopChatbotConfig for shop ${shop}:`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

export async function getChatInteractionStats(shop) {
  if (!shop) return null;
  try {
    const totalInteractions = await prisma.chatInteractionLog.count({ where: { shop } });
    const chatOpenedCount = await prisma.chatInteractionLog.count({ where: { shop, eventType: 'CHAT_OPENED' } });
    const addToCartCount = await prisma.chatInteractionLog.count({ where: { shop, eventType: 'ADD_TO_CART_FROM_CHAT_PRODUCT' } });
    const checkoutsInitiatedCount = await prisma.chatInteractionLog.count({ where: { shop, eventType: 'CHECKOUT_INITIATED_FROM_CHAT_TOOL' } }); // Assuming this eventType will be used

    // Simplified interactionsOverTime: count by day for last 7 days (example)
    // This is a conceptual placeholder. Real daily grouping needs date part extraction.
    // For a robust solution, a raw query or more advanced Prisma features might be needed.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailyCounts = await prisma.chatInteractionLog.groupBy({
      by: ['eventType'], // This is not by date, just an example.
                        // Actual daily grouping is more complex.
      _count: {
        id: true,
      },
      where: {
        shop: shop,
        timestamp: {
          gte: sevenDaysAgo,
        },
      },
      // orderBy: { // Cannot orderBy date part directly in standard groupBy
      //   _count: {id: 'desc'}
      // }
    });

    // Mocking interactionsOverTime for now as proper aggregation is complex
    const interactionsOverTime = [
      { date: new Date(Date.now() - 6*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) + (chatOpenedCount % 5) },
      { date: new Date(Date.now() - 5*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) - (addToCartCount % 3) },
      { date: new Date(Date.now() - 4*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) + (checkoutsInitiatedCount % 2) },
      { date: new Date(Date.now() - 3*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) },
      { date: new Date(Date.now() - 2*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) + 5 },
      { date: new Date(Date.now() - 1*24*60*60*1000).toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) - 2 },
      { date: new Date().toISOString().split('T')[0], count: Math.floor(totalInteractions / 7) + 3 },
    ].map(item => ({...item, count: Math.max(0, item.count) })); // Ensure count is not negative

    return {
      totalInteractions,
      chatOpenedCount,
      addToCartCount,
      checkoutsInitiatedCount,
      interactionsOverTime, // Using mock data for this
    };
  } catch (error) {
    console.error(`Error fetching chat interaction stats for shop ${shop}:`, error);
    return { // Return default/empty stats on error
      totalInteractions: 0,
      chatOpenedCount: 0,
      addToCartCount: 0,
      checkoutsInitiatedCount: 0,
      interactionsOverTime: [],
      error: "Failed to load statistics."
    };
  }
}

export async function getRecentChatInteractions(shop, limit = 5) {
   if (!shop) return [];
  try {
    return prisma.chatInteractionLog.findMany({
      where: { shop },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { // Select only necessary fields to avoid over-fetching, especially eventDetail
        id: true,
        eventType: true,
        timestamp: true,
        conversationId: true,
        // eventDetail: true, // Optionally include if you want to display some details
      }
    });
  } catch (error) {
    console.error(`Error fetching recent chat interactions for shop ${shop}:`, error);
    return []; // Return empty array on error
  }
}


// CRUD for PromotionalMessage
export async function createPromotionalMessage(shop, data) {
  if (!shop || !data || !data.message || !data.triggerType) {
    throw new Error("Shop, message, and triggerType are required to create a promotional message.");
  }
  try {
    return await prisma.promotionalMessage.create({
      data: {
        shop,
        message: data.message,
        triggerType: data.triggerType,
        triggerValue: data.triggerValue, // Optional
        isActive: data.isActive !== undefined ? data.isActive : true, // Default to true
      },
    });
  } catch (error) {
    console.error(`Error creating promotional message for shop ${shop}:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

export async function getPromotionalMessages(shop, activeOnly = true) {
  if (!shop) return [];
  try {
    const whereClause = { shop };
    if (activeOnly) {
      whereClause.isActive = true;
    }
    return await prisma.promotionalMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error(`Error fetching promotional messages for shop ${shop}:`, error);
    return [];
  }
}

export async function getPromotionalMessage(id, shop) {
  if (!id || !shop) return null;
  try {
    return await prisma.promotionalMessage.findFirst({ // findFirst to include shop in where
      where: { id, shop },
    });
  } catch (error) {
    console.error(`Error fetching promotional message ${id} for shop ${shop}:`, error);
    return null;
  }
}

export async function updatePromotionalMessage(id, shop, data) {
  if (!id || !shop || !data) {
    throw new Error("ID, shop, and data are required to update a promotional message.");
  }
  try {
    // First verify the message belongs to the shop
    const message = await prisma.promotionalMessage.findFirst({ where: { id, shop } });
    if (!message) {
      throw new Error(`Promotional message ${id} not found for shop ${shop}.`);
    }
    return await prisma.promotionalMessage.update({
      where: { id }, // id is unique, shop check done above
      data, // Pass through all fields from data
    });
  } catch (error) {
    console.error(`Error updating promotional message ${id} for shop ${shop}:`, error);
    throw error;
  }
}

export async function deletePromotionalMessage(id, shop) {
  if (!id || !shop) {
    throw new Error("ID and shop are required to delete a promotional message.");
  }
  try {
    // First verify the message belongs to the shop
    const message = await prisma.promotionalMessage.findFirst({ where: { id, shop } });
    if (!message) {
      throw new Error(`Promotional message ${id} not found for shop ${shop}.`);
    }
    return await prisma.promotionalMessage.delete({
      where: { id },
    });
  } catch (error) {
    console.error(`Error deleting promotional message ${id} for shop ${shop}:`, error);
    throw error;
  }
}

// CRUD for PromotionalProduct
export async function createPromotionalProduct(shop, data) {
  if (!shop || !data || !data.productId || !data.triggerType) {
    throw new Error("Shop, productId, and triggerType are required to create a promotional product.");
  }
  try {
    return await prisma.promotionalProduct.create({
      data: {
        shop,
        productId: data.productId,
        triggerType: data.triggerType,
        triggerValue: data.triggerValue, // Optional
        isActive: data.isActive !== undefined ? data.isActive : true, // Default to true
      },
    });
  } catch (error) {
    console.error(`Error creating promotional product for shop ${shop}:`, error);
    throw error;
  }
}

export async function getPromotionalProducts(shop, activeOnly = true) {
  if (!shop) return [];
  try {
    const whereClause = { shop };
    if (activeOnly) {
      whereClause.isActive = true;
    }
    return await prisma.promotionalProduct.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error(`Error fetching promotional products for shop ${shop}:`, error);
    return [];
  }
}

export async function getPromotionalProduct(id, shop) {
  if (!id || !shop) return null;
  try {
    return await prisma.promotionalProduct.findFirst({ // findFirst to include shop in where
      where: { id, shop },
    });
  } catch (error) {
    console.error(`Error fetching promotional product ${id} for shop ${shop}:`, error);
    return null;
  }
}

export async function updatePromotionalProduct(id, shop, data) {
  if (!id || !shop || !data) {
    throw new Error("ID, shop, and data are required to update a promotional product.");
  }
  try {
     // First verify the product promotion belongs to the shop
    const productPromo = await prisma.promotionalProduct.findFirst({ where: { id, shop } });
    if (!productPromo) {
      throw new Error(`Promotional product ${id} not found for shop ${shop}.`);
    }
    return await prisma.promotionalProduct.update({
      where: { id },
      data,
    });
  } catch (error) {
    console.error(`Error updating promotional product ${id} for shop ${shop}:`, error);
    throw error;
  }
}

export async function deletePromotionalProduct(id, shop) {
  if (!id || !shop) {
    throw new Error("ID and shop are required to delete a promotional product.");
  }
  try {
    // First verify the product promotion belongs to the shop
    const productPromo = await prisma.promotionalProduct.findFirst({ where: { id, shop } });
    if (!productPromo) {
      throw new Error(`Promotional product ${id} not found for shop ${shop}.`);
    }
    return await prisma.promotionalProduct.delete({
      where: { id },
    });
  } catch (error) {
    console.error(`Error deleting promotional product ${id} for shop ${shop}:`, error);
    throw error;
  }
}

// MessageFeedback Functions
export async function createMessageFeedback(shop, data) {
  try {
    const { conversationId, messageContent, rating, comment } = data;
    if (!shop || !conversationId || !messageContent || !rating) {
      throw new Error("Shop, conversationId, messageContent, and rating are required for message feedback.");
    }
    if (rating !== "UP" && rating !== "DOWN") {
      throw new Error("Invalid rating value. Must be 'UP' or 'DOWN'.");
    }
    return await prisma.messageFeedback.create({
      data: {
        shop,
        conversationId,
        messageContent,
        rating,
        comment: comment || null,
      },
    });
  } catch (error) {
    console.error(`Error creating message feedback for shop ${shop}:`, error);
    throw error;
  }
}

export async function getMessageFeedbackStats(shop) {
  if (!shop) {
    console.warn("getMessageFeedbackStats: shop parameter is required, returning default stats.");
    return { upvotes: 0, downvotes: 0, totalFeedback: 0, positiveFeedbackPercentage: 0, error: "Shop parameter required." };
  }
  try {
    const upvotes = await prisma.messageFeedback.count({
      where: { shop, rating: "UP" },
    });
    const downvotes = await prisma.messageFeedback.count({
      where: { shop, rating: "DOWN" },
    });
    const totalFeedback = upvotes + downvotes;
    const positiveFeedbackPercentage = totalFeedback > 0 ? (upvotes / totalFeedback) * 100 : 0;

    return {
      upvotes,
      downvotes,
      totalFeedback,
      positiveFeedbackPercentage: parseFloat(positiveFeedbackPercentage.toFixed(1)),
    };
  } catch (error) {
    console.error(`Error fetching message feedback stats for shop ${shop}:`, error);
    return { upvotes: 0, downvotes: 0, totalFeedback: 0, positiveFeedbackPercentage: 0, error: "Failed to load feedback stats." };
  }
}

export async function getRecentMessageFeedback(shop, limit = 10) {
  if (!shop) {
    console.warn("getRecentMessageFeedback: shop parameter is required, returning empty array.");
    return [];
  }
  try {
    return await prisma.messageFeedback.findMany({
      where: {
        shop,
        comment: { not: null },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        timestamp: true,
        rating: true,
        comment: true,
        messageContent: true,
        conversationId: true,
      }
    });
  } catch (error) {
    console.error(`Error fetching recent message feedback for shop ${shop}:`, error);
    return [];
  }
}


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
