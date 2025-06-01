import { json } from "@remix-run/node";
import redis from "../redis.server.js";
import { getChatbotConfig } from "../../services/chatbotConfig.server.js"; // Added import

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

  const { shopId, eventType, ...eventData } = payload;

  if (!shopId || !eventType) {
    return json({ error: "Missing shopId or eventType" }, { status: 400, headers: corsHeaders(request) });
  }

  // Fetch shop-specific data retention policy
  let dataRetentionDays = 0; // Default to 0 (no TTL / infinite retention)
  try {
      const shopConfig = await getChatbotConfig(shopId);
      if (shopConfig && shopConfig.securityPrivacy && typeof shopConfig.securityPrivacy.dataRetentionPolicyDays === 'number') {
          dataRetentionDays = shopConfig.securityPrivacy.dataRetentionPolicyDays;
          // console.log(`Data retention for shop ${shopId} is ${dataRetentionDays} days.`);
      }
  } catch (configError) {
      console.error(`Error fetching shop config for TTL in analytics for shop ${shopId}:`, configError);
      // Proceed without TTL if config fetch fails, dataRetentionDays remains 0
  }
  const ttlSeconds = dataRetentionDays > 0 ? dataRetentionDays * 24 * 60 * 60 : 0;


  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    const eventsToTrack = [
        'chatInitialized', 'chatWidgetOpened', 'chatWidgetClosed',
        'messageSent', 'messageReceived',
        'quickReplyClicked', 'customerAuthenticated',
        'addToCart',
        'checkoutInitiated',
        'productCardClickedInChat',
        'productInteraction',
        'productResultsDisplayed', 'errorDisplayed', 'authenticationAttempted',
        'customButtonClicked',
    ];

    if (eventsToTrack.includes(eventType)) {
        const loaderKeyMap = {
            'addToCart': `event:addToCart`,
            'checkoutInitiated': `event:checkoutInitiated`,
            'productCardClickedInChat': `event:productCardClickedInChat`,
            'quickReplyClicked': `event:quickReplyClicked`,
            'customerAuthenticated': `event:customerAuthenticated`,
            'productInteraction': `event:productInteraction`
        };
        const redisKeyForEventType = loaderKeyMap[eventType] || eventType;
        await redis.incr(`analytics:${shopId}:${redisKeyForEventType}`);

        if (eventType !== 'chatInitialized') {
             const totalInteractionsKey = `analytics:${shopId}:totalInteractions`;
             const dailyTotalInteractionsKey = `analytics:${shopId}:totalInteractions:${today}`;
             await redis.incr(totalInteractionsKey);
             await redis.incr(dailyTotalInteractionsKey);
             if (ttlSeconds > 0) {
                 try { await redis.expire(dailyTotalInteractionsKey, ttlSeconds); }
                 catch (ttlError) { console.error(`Error setting TTL for ${dailyTotalInteractionsKey} (shop ${shopId}):`, ttlError); }
             }
        }
    }

    switch (eventType) {
      case 'chatInitialized':
        // Already incremented by eventsToTrack logic if included
        break;

      case 'messageSent':
        const dailyMessageSentKey = `analytics:${shopId}:messageSent:${today}`;
        await redis.incr(dailyMessageSentKey);
        if (ttlSeconds > 0) {
            try { await redis.expire(dailyMessageSentKey, ttlSeconds); }
            catch (ttlError) { console.error(`Error setting TTL for ${dailyMessageSentKey} (shop ${shopId}):`, ttlError); }
        }
        break;

      case 'chatWidgetOpened':
        const dailyChatWidgetOpenedKey = `analytics:${shopId}:chatWidgetOpened:${today}`;
        await redis.incr(dailyChatWidgetOpenedKey);
        if (ttlSeconds > 0) {
            try { await redis.expire(dailyChatWidgetOpenedKey, ttlSeconds); }
            catch (ttlError) { console.error(`Error setting TTL for ${dailyChatWidgetOpenedKey} (shop ${shopId}):`, ttlError); }
        }
        break;

      case 'addToCart':
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productAddToCartFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'productCardClickedInChat':
        if (eventData?.productId) {
          await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'productInteraction':
        if (eventData?.productId && eventData?.interactionType === 'view') {
            await redis.zincrby(`analytics:${shopId}:productViewFrequency`, 1, String(eventData.productId));
        }
        break;

      case 'userFeedback':
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
  return json({ error: "GET method not supported for this endpoint. Use POST." }, { status: 405, headers: corsHeaders(request) });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Id",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}
