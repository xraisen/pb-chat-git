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

    const genericEngagementEvents = [
        'chatWidgetOpened',
        'chatWidgetClosed',
        'messageSent',
        'messageReceived', // Assuming this means a bot response was fully generated and displayed
        'quickReplyClicked',
        'customerAuthenticated',
        // 'productInteractionCount' // This key seems too generic. Using specific product events.
    ];

    if (genericEngagementEvents.includes(eventType)) {
      await redis.incr(`analytics:${shopId}:${eventType}`);
      await redis.incr(`analytics:${shopId}:totalInteractions`);
      await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
      // Specific daily counters if needed, e.g., for messageSent:
      if (eventType === 'messageSent') {
        await redis.incr(`analytics:${shopId}:messageSent:${today}`);
      }
    }

    switch (eventType) {
      case 'chatInitialized': // This might be a page load event, not direct interaction
        await redis.incr(`analytics:${shopId}:chatInitialized`);
        // Optionally, don't count this in totalInteractions if it's just a load event
        break;

      // Generic events are handled above, specific logic below if needed:
      case 'addToCartClicked': // Specific key from standalone-chat-logic.js
        await redis.incr(`analytics:${shopId}:event:addToCartClicked`); // Use the eventType directly as key component
        await redis.incr(`analytics:${shopId}:totalInteractions`);
        await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productAddToCartFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'checkoutInitiated': // Example of a more specific conversion event
        await redis.incr(`analytics:${shopId}:event:checkoutInitiated`);
        await redis.incr(`analytics:${shopId}:totalInteractions`);
        await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        break;

      case 'productCardClickedInChat': // Or productViewed, etc.
        await redis.incr(`analytics:${shopId}:event:productCardClickedInChat`);
        await redis.incr(`analytics:${shopId}:totalInteractions`);
        await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'productInteraction': // A more generic product interaction from config
        await redis.incr(`analytics:${shopId}:event:productInteraction`);
        await redis.incr(`analytics:${shopId}:totalInteractions`);
        await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        if (eventData?.productId && eventData?.interactionType === 'view') { // Example detail
            await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'userFeedback':
        // Assuming feedback itself isn't a primary "interaction" like sending a message,
        // but you might still want to log its occurrence.
        // If it should count towards total interactions, uncomment below:
        // await redis.incr(`analytics:${shopId}:totalInteractions`);
        // await redis.incr(`analytics:${shopId}:totalInteractions:${today}`);
        if (eventData?.rating === 'up' || eventData?.rating === 'thumbsUp') {
          await redis.hincrby(`analytics:${shopId}:feedback`, 'thumbsUp', 1);
        } else if (eventData?.rating === 'down' || eventData?.rating === 'thumbsDown') {
          await redis.hincrby(`analytics:${shopId}:feedback`, 'thumbsDown', 1);
        } else {
          console.warn(`Invalid feedback rating for ${shopId}: ${eventData?.rating}`);
          // Optionally return a 400 if rating is mandatory and invalid
          return json({ error: "Invalid feedback rating provided" }, { status: 400, headers: corsHeaders(request) });
        }
        break;

      // Add cases for other genericEngagementEvents if they need more than just the generic incr logic
      // For example, 'messageSent' is already handled by generic and its specific daily counter.

      default:
        // If eventType was not one of the genericEngagementEvents and not specifically handled above
        if (!genericEngagementEvents.includes(eventType) && eventType !== 'chatInitialized') {
            console.warn(`Unknown or unhandled analytics event type for ${shopId}: ${eventType}`);
            return json({ error: "Unknown or unhandled event type" }, { status: 400, headers: corsHeaders(request) });
        }
        // If it was a genericEngagementEvent, it's already processed.
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
