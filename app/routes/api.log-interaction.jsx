import { json } from "@remix-run/node";
import prisma from "../db.server.js"; // Path to your Prisma client instance
import { Prisma } from "@prisma/client"; // For Prisma.JsonNull

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // In production, restrict this to your storefront domain
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain", // Add any other headers client might send
};

export async function action({ request }) {
  // Handle OPTIONS request for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: corsHeaders,
    });
  }

  // Ensure it's a POST request for actual logging
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
    console.error("Failed to parse request body:", error);
    return json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: corsHeaders }
    );
  }

  const { shop, conversationId, eventType, eventDetail } = body;

  // Validate required fields
  if (!shop || !conversationId || !eventType) {
    return json(
      { error: "Missing required fields: shop, conversationId, and eventType are required." },
      { status: 400, headers: corsHeaders }
    );
  }
  
  // Basic validation for shopDomain format (optional but good practice)
  // Using a simple regex here, adjust if shop can be just ID or other formats
  if (typeof shop !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop) && !/^\d+$/.test(shop) ) {
    // This regex allows for either a shopify domain or a numeric shop ID.
    // return json(
    //   { error: "Invalid shop format. Expected a valid myshopify.com domain or a shop ID." },
    //   { status: 400, headers: corsHeaders }
    // );
    // For now, we'll be more lenient as the source of 'shop' might vary (domain from client, ID from admin context later)
    console.warn(`Shop format received: ${shop}. Proceeding with logging.`);
  }


  try {
    await prisma.chatInteractionLog.create({
      data: {
        shop: shop, // Assuming shop is shopDomain string
        conversationId: conversationId,
        eventType: eventType,
        eventDetail: eventDetail || Prisma.JsonNull, // Use Prisma.JsonNull for optional Json fields
      },
    });

    return json(
      { success: true },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Failed to save chat interaction log:", error);
    // Consider more specific error logging or masking for client
    return json(
      { error: "Failed to save log." },
      { status: 500, headers: corsHeaders }
    );
  }
}

// No loader or default component export needed for this API route.
