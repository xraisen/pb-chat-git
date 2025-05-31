// app/routes/api.chatbot-public-config.jsx
import { json } from "@remix-run/node";
// `unauthenticated` is not used based on the decision to rely on query param.
// import { unauthenticated } from "~/shopify.server";
import { getChatbotConfig } from "~/services/chatbotConfig.server.js"; // Adjusted path with ~

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopIdentifier = url.searchParams.get("shop"); // shop domain or ID

  if (!shopIdentifier) {
    return json(
      { error: "Shop identifier (shop query parameter) not found in request." },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" } // Also allow CORS for error responses
      }
    );
  }

  try {
    const config = await getChatbotConfig(shopIdentifier);

    // Construct a public-safe configuration object
    // Only include fields that are safe to be exposed publicly.
    // DO NOT include sensitive data like API keys here.
    const publicConfig = {
      appearance: config.appearance,
      positioning: config.positioning,
      functionality: {
        chatbotName: config.functionality?.chatbotName,
        defaultGreetingMessage: config.functionality?.defaultGreetingMessage,
        // selectedLLM: config.apiManagement?.selectedAPI, // Redundant, use apiManagement.selectedAPI
        systemPrompt: config.functionality?.systemPrompt, // Assuming this is safe to expose
        conversationTimeoutSeconds: config.functionality?.conversationTimeoutSeconds,
        idleMessage: config.functionality?.idleMessage,
        fallbackMessage: config.functionality?.fallbackMessage,
        multiStepDialogs: config.functionality?.multiStepDialogs, // Assuming dialog structure is safe
      },
      productDisplay: config.productDisplay, // Assuming product display settings are safe
      avatar: config.avatar,
      userExperience: { // Matched to defaultChatbotConfig structure
          speechToTextEnabled: config.userExperience?.speechToTextEnabled,
          textToSpeechEnabled: config.userExperience?.textToSpeechEnabled,
          customInteractiveButtons: config.userExperience?.customInteractiveButtons, // Assuming button actions/payloads are safe
          showTypingIndicator: config.userExperience?.showTypingIndicator,
          formValidationEnabled: config.userExperience?.formValidationEnabled, // If this controls client-side features
      },
      apiManagement: { // Only expose non-sensitive parts of API management
          selectedAPI: config.apiManagement?.selectedAPI
      },
      analytics: config.analytics // Assuming these are boolean flags and safe
      // DO NOT include:
      // - config.apiManagement.claudeAPIKey
      // - config.apiManagement.geminiAPIKey
      // - config.apiManagement.shopifyAccessToken
      // - config.securityPrivacy (unless specific fields are deemed safe, most are not)
    };

    return json(publicConfig, {
      headers: {
        "Access-Control-Allow-Origin": "*", // Consider restricting to shop domains or your app's domain in production
        "Cache-Control": "public, max-age=300, s-maxage=300" // Cache for 5 minutes on CDN and client
      },
    });

  } catch (error) {
    console.error(`Error fetching public config for shop ${shopIdentifier}:`, error);
    return json(
      { error: "Failed to retrieve chatbot configuration." },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      }
    );
  }
}

// Optional: Handle other HTTP methods if necessary, though typically a config endpoint is GET only.
// export async function action({ request }) {
//   return json({ error: "Method not allowed" }, { status: 405 });
// }
