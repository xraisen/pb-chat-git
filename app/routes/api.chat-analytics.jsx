import { json } from "@remix-run/node";
import redis from "../redis.server.js"; // Assuming redis.server.js is in app/

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    console.error("Error parsing JSON payload for analytics:", error);
    return json({ error: "Invalid JSON payload" }, { status: 400, headers: corsHeaders(request) });
  }

  const { shopId, eventType, ...eventData } = payload; // Use ...eventData for flexibility

  if (!shopId || !eventType) {
    return json({ error: "Missing shopId or eventType" }, { status: 400, headers: corsHeaders(request) });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Increment total interactions for most event types
    // Specific events like 'chatInitialized' might not always count towards daily user interactions
    // but are still valuable overall metrics.
    // We will increment totalInteractions for events that signify active engagement.

    // We will increment totalInteractions for events that signify active engagement.
    // Some events might only have a total counter and not a daily one if daily trend isn't critical.

    // Unified handling for events that contribute to total interactions and have their own main counter.
    // Specific daily counters or sorted set updates will be handled in the switch.
    const eventsToTrack = [
        'chatInitialized', 'chatWidgetOpened', 'chatWidgetClosed',
        'messageSent', 'messageReceived',
        'quickReplyClicked', 'customerAuthenticated',
        'addToCart', // Renamed from addToCartClicked for consistency with analytics config
        'checkoutInitiated',
        'productCardClickedInChat', // Specific click on a product card
        'productInteraction', // Generic product interaction
        'productResultsDisplayed', 'errorDisplayed', 'authenticationAttempted',
        'customButtonClicked', // If sent from client for custom interactive buttons
        // 'userFeedback' // userFeedback handled separately due to hincrby
    ];

    if (eventsToTrack.includes(eventType)) {
        // Use event: prefix for events that are explicitly user actions or client-side generated,
        // and direct names for more general lifecycle/metrics.
        // The loader in app.chatbot-analytics.jsx uses `event:addToCartClicked` etc.
        // Let's ensure keys here match what the loader expects or simplify.
        // For now, using `eventType` directly for main counter, and `event:${eventType}` for loader compatibility if needed.
        // The loader was: analyticsData.addToCartCount = parseInt(await redis.get(`analytics:${shopId}:event:addToCartClicked`) || '0');
        // To match that, we'd need to be specific.
        // Let's use a mapping for keys that loader expects with 'event:' prefix.

        const loaderKeyMap = {
            'addToCart': `event:addToCart`, // Client sends 'addToCart', loader looks for 'event:addToCart' (or 'event:addToCartClicked')
            'checkoutInitiated': `event:checkoutInitiated`,
            'productCardClickedInChat': `event:productCardClickedInChat`,
            'quickReplyClicked': `event:quickReplyClicked`,
            'customerAuthenticated': `event:customerAuthenticated`,
            'productInteraction': `event:productInteraction`
        };
        const redisKeyForEventType = loaderKeyMap[eventType] || eventType;
        await redis.incr(`analytics:${shopId}:${redisKeyForEventType}`);

        // Increment total interactions and daily total interactions for most of these
        if (eventType !== 'chatInitialized') { // chatInitialized might not be a "user interaction"
             await redis.incr(`analytics:${shopId}:totalInteractions`);
             await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        }
    }


    switch (eventType) {
      case 'chatInitialized':
        // Already incremented `analytics:${shopId}:chatInitialized` if in eventsToTrack
        // No daily total interaction for this one usually.
        break;

      case 'messageSent':
        await redis.incr(`analytics:${shopId}:messageSent:${today}`);
        break;

      case 'chatWidgetOpened':
        await redis.incr(`analytics:${shopId}:chatWidgetOpened:${today}`);
        break;

      // Events that were in `genericEngagementEvents` and also need specific handling (like ZSETs)
      // or whose keys need to match the loader specifically.
      case 'addToCart': // Client sends 'addToCart', loader expects 'event:addToCart'
        // Main counter `analytics:${shopId}:event:addToCart` incremented by eventsToTrack logic
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productAddToCartFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'checkoutInitiated':
        // Main counter `analytics:${shopId}:event:checkoutInitiated` incremented by eventsToTrack logic
        break;

      case 'productCardClickedInChat':
        // Main counter `analytics:${shopId}:event:productCardClickedInChat` incremented by eventsToTrack logic
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'productInteraction':
        // Main counter `analytics:${shopId}:event:productInteraction` incremented by eventsToTrack logic
        if (eventData?.productId && eventData?.interactionType === 'view') {
            await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'userFeedback':
        // This event type doesn't use a simple incr, so it's handled entirely here.
        // Not counted in totalInteractions unless desired.
        if (eventData?.rating === 'up' || eventData?.rating === 'thumbsUp') {
          await redis.hincrby(`analytics:${shopId}:feedback`, 'thumbsUp', 1);
        } else if (eventData?.rating === 'down' || eventData?.rating === 'thumbsDown') {
          await redis.hincrby(`analytics:${shopId}:feedback`, 'thumbsDown', 1);
        } else {
          console.warn(`Invalid feedback rating for ${shopId}: ${eventData?.rating}`);
          return json({ error: "Invalid feedback rating provided" }, { status: 400, headers: corsHeaders(request) });
        }
        break;

      default:
        if (!eventsToTrack.includes(eventType)) {
            console.warn(`Unknown or unhandled analytics event type for ${shopId}: ${eventType}`);
            return json({ error: "Unknown or unhandled event type" }, { status: 400, headers: corsHeaders(request) });
        }
        // If it was in eventsToTrack, its main counter and totalInteractions (if applicable) are already handled.
        break;
    }

    return json({ success: true }, { headers: corsHeaders(request) });

  } catch (error) {
    console.error(`Error processing analytics for shop ${shopId}, event ${eventType}:`, error);
    return json({ error: "Failed to process analytics event due to server error" }, { status: 500, headers: corsHeaders(request) });
  }
}

// Handle OPTIONS requests for CORS preflight
export async function loader({ request }) {
   if (request.method.toLowerCase() === "options") {
    return new Response(null, {
      status: 204, // No Content
      headers: corsHeaders(request)
    });
  }
  // For GET requests to this route, if any are expected
  return json({ error: "GET method not supported for this endpoint. Use POST." }, { status: 405, headers: corsHeaders(request) });
}


/**
 * Helper to add CORS headers to the response
 */
function corsHeaders(request) {
  // Use a specific origin instead of '*' in production if possible
  const origin = request.headers.get("Origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS", // Only POST and OPTIONS
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Id", // Specify allowed headers
    "Access-Control-Allow-Credentials": "true", // If credentials are ever sent (e.g. cookies from admin)
    "Access-Control-Max-Age": "86400" // 24 hours for preflight cache
  };
}
