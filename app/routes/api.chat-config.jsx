import { json } from "@remix-run/node";
import { 
  getShopChatbotConfig, 
  getPromotionalMessages, 
  getPromotionalProducts 
} from "../db.server.js"; // Assuming db.server.js is in the app root

// Helper to add CORS headers
function getCorsHeaders(requestOrigin) {
  // Use requestOrigin if provided and valid, otherwise allow any for broader development/testing
  // In production, you'd want to restrict this to your actual storefront domain(s)
  const allowedOrigin = requestOrigin || "*"; 
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function loader({ request }) {
  const requestUrl = new URL(request.url);
  const shopDomain = requestUrl.searchParams.get("shop");
  const requestOrigin = request.headers.get("Origin");

  // Handle OPTIONS request for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: getCorsHeaders(requestOrigin),
    });
  }

  if (!shopDomain) {
    return json(
      { error: "Shop query parameter is required." },
      { status: 400, headers: getCorsHeaders(requestOrigin) }
    );
  }

  // Basic validation for shopDomain format (optional but good practice)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shopDomain)) {
     return json(
      { error: "Invalid shop domain format." },
      { status: 400, headers: getCorsHeaders(requestOrigin) }
    );
  }

  try {
    const fullConfig = await getShopChatbotConfig(shopDomain);

    if (!fullConfig || fullConfig.error) {
      const errorMessage = fullConfig && fullConfig.error ? fullConfig.error : "Configuration not found for this shop.";
      return json(
        { error: errorMessage },
        { status: 404, headers: getCorsHeaders(requestOrigin) }
      );
    }

    const activeMessages = await getPromotionalMessages(shopDomain, true);
    const activeProducts = await getPromotionalProducts(shopDomain, true);

    // Sanitize: Select only public-safe fields
    const publicConfig = {
      shopDomain: shopDomain, 
      // llmProvider: fullConfig.llmProvider, // Client likely doesn't need to know this directly
      botName: fullConfig.botName,
      welcomeMessage: fullConfig.welcomeMessage,
      systemPromptKey: fullConfig.systemPromptKey, // Widget might use this to fetch/select a prompt
      customSystemPrompt: fullConfig.customSystemPrompt, // Or send the actual prompt if resolved by server
      width: fullConfig.width,
      height: fullConfig.height,
      zIndex: fullConfig.zIndex,
      position: fullConfig.position,
      bgColor: fullConfig.bgColor,
      textColor: fullConfig.textColor,
      buttonColor: fullConfig.buttonColor,
      headerBgColor: fullConfig.headerBgColor,
      headerTextColor: fullConfig.headerTextColor,
      userMsgBgColor: fullConfig.userMsgBgColor,
      userMsgTextColor: fullConfig.userMsgTextColor,
      assistantMsgBgColor: fullConfig.assistantMsgBgColor,
      assistantMsgTextColor: fullConfig.assistantMsgTextColor,
      customCSS: fullConfig.customCSS,
      avatarUrl: fullConfig.avatarUrl,
      productDisplayMode: fullConfig.productDisplayMode,
      maxProductsToDisplay: fullConfig.maxProductsToDisplay,
      carouselItemWidth: fullConfig.carouselItemWidth,
      chatBubbleIcon: fullConfig.chatBubbleIcon,
      customChatBubbleSVG: fullConfig.customChatBubbleSVG,
      chatBubbleSize: fullConfig.chatBubbleSize,
      chatBubbleColor: fullConfig.chatBubbleColor,
      
      // Marketing Settings
      utmConfig: {
        source: fullConfig.utmSource || null,
        medium: fullConfig.utmMedium || null,
        campaign: fullConfig.utmCampaign || null,
        term: fullConfig.utmTerm || null,
        content: fullConfig.utmContent || null,
      },
      promotionalMessages: activeMessages || [],
      promotionalProducts: activeProducts || [],
      // DO NOT include: geminiApiKey, claudeApiKey, or other sensitive internal fields
    };

    return json(
      { config: publicConfig, error: null },
      { headers: getCorsHeaders(requestOrigin) }
    );
  } catch (error) {
    console.error("Error fetching chat config:", error);
    return json(
      { error: "An internal server error occurred." },
      { status: 500, headers: getCorsHeaders(requestOrigin) }
    );
  }
}

// No default export for API routes
