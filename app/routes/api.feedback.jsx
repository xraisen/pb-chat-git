import { json } from "@remix-run/node";
import { createMessageFeedback } from "../db.server.js"; // Adjust path if your db.server.js is elsewhere

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // IMPORTANT: Restrict this in production to your actual storefront domain(s)
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain", // Include any custom headers your client might send
};

export async function action({ request }) {
  // Handle OPTIONS request for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: corsHeaders,
    });
  }

  // Ensure it's a POST request for actual feedback submission
  if (request.method !== "POST") {
    return json(
      { error: "Method not allowed." },
      { status: 405, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    console.error("API Feedback: Failed to parse request body:", error);
    return json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: corsHeaders }
    );
  }

  const { shop, conversationId, messageId, messageContent, rating, comment } = body;
  // Note: messageId from client might be useful for linking feedback to a specific message in a more granular way if needed,
  // but the current MessageFeedback model doesn't have a direct messageId field, only conversationId.
  // messageContent is used for context.

  // Validate required fields
  if (!shop || !conversationId || !messageContent || !rating) {
    return json(
      { error: "Missing required fields: shop, conversationId, messageContent, and rating are required." },
      { status: 400, headers: corsHeaders }
    );
  }

  if (rating !== "UP" && rating !== "DOWN") {
    return json(
      { error: "Invalid rating value. Must be 'UP' or 'DOWN'." },
      { status: 400, headers: corsHeaders }
    );
  }
  
  // Basic validation for shopDomain format (optional but good practice)
   if (typeof shop !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop) && !/^\d+$/.test(shop) ) {
    // This regex allows for either a shopify domain or a numeric shop ID.
    // Depending on how 'shop' is sourced client-side, this might need adjustment.
    console.warn(`API Feedback: Received shop format: ${shop}. Proceeding.`);
  }


  try {
    const feedbackData = {
      conversationId,
      messageContent, // Storing the message content that received feedback
      rating,
      comment: comment || null, // Ensure comment is null if empty/undefined
    };

    await createMessageFeedback(shop, feedbackData);

    return json(
      { success: true, message: "Feedback submitted successfully." },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("API Feedback: Error saving feedback:", error);
    // The createMessageFeedback function already throws specific errors for validation,
    // otherwise it might be a general DB error.
    return json(
      { error: "Failed to save feedback.", detail: error.message }, // Be cautious about exposing error.message directly
      { status: 500, headers: corsHeaders }
    );
  }
}

// No loader or default component export needed for this API route.
