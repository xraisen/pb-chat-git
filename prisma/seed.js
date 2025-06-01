const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  const testShopDomain = 'development.shop.myshopify.com'; // Or any consistent test shop domain

  // Default ShopChatbotConfig
  const defaultConfigData = {
    // LLM and API Key settings
    llmProvider: 'gemini', // Default to gemini or claude
    geminiApiKey: 'YOUR_GEMINI_API_KEY_PLACEHOLDER',
    claudeApiKey: 'YOUR_CLAUDE_API_KEY_PLACEHOLDER',

    // Chatbot Persona & Behavior
    botName: "Store Assistant",
    welcomeMessage: "👋 Hi there! How can I help you find the perfect product today?",
    systemPromptKey: "standardAssistant", // Key for a predefined prompt
    customSystemPrompt: null,

    // Chat Widget Appearance & Positioning
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

    // Product Display
    productDisplayMode: "card",
    maxProductsToDisplay: 3,
    carouselItemWidth: "180px",

    // Chat Bubble Appearance
    chatBubbleIcon: "default",
    customChatBubbleSVG: null,
    chatBubbleSize: "60px",
    chatBubbleColor: "#E57399",

    // UTM Parameters
    utmSource: 'chatbot',
    utmMedium: 'chat',
    utmCampaign: 'storefront-assistant',
    utmTerm: null,
    utmContent: null,
  };

  const seededConfig = await prisma.shopChatbotConfig.upsert({
    where: { shop: testShopDomain },
    update: defaultConfigData, // Update with defaults if it exists
    create: {
      shop: testShopDomain,
      ...defaultConfigData,
    },
  });
  console.log(`Seeded ShopChatbotConfig for ${seededConfig.shop}`);

  // Example PromotionalMessage
  const seededPromoMsg = await prisma.promotionalMessage.upsert({
    where: { id: 'seed-promo-msg-welcome' }, // Using a fixed ID for idempotency
    update: {
        // Ensure all fields are present if you want to update them on subsequent seeds
        message: 'Welcome to our store! Let me know if you need help finding anything.',
        triggerType: 'FIRST_VISIT',
        isActive: true,
    },
    create: {
      id: 'seed-promo-msg-welcome',
      shop: testShopDomain,
      message: 'Welcome to our store! Let me know if you need help finding anything.',
      triggerType: 'FIRST_VISIT',
      isActive: true,
    },
  });
  console.log(`Seeded PromotionalMessage with ID: ${seededPromoMsg.id}`);

  // Example PromotionalProduct (Optional)
   const seededPromoProd = await prisma.promotionalProduct.upsert({
    where: { id: 'seed-promo-prod-example' },
    update: {
        productId: 'gid://shopify/Product/0000000001', // Replace with a valid placeholder GID if possible
        triggerType: 'ON_CART_PAGE',
        isActive: true,
    },
    create: {
      id: 'seed-promo-prod-example',
      shop: testShopDomain,
      productId: 'gid://shopify/Product/0000000001', // Example GID - ensure this product exists in dev store for testing
      triggerType: 'ON_CART_PAGE',
      isActive: true,
    },
  });
  console.log(`Seeded PromotionalProduct with ID: ${seededPromoProd.id}`);


  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
