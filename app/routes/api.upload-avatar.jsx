import { json, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { updateShopChatbotConfig } from "../db.server.js";
// In a real scenario, you might need the Shopify API client for file uploads
// import { shopify } from "../shopify.server"; // If using a REST or GraphQL client from shopify.server

const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // TODO: Restrict in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain, Authorization", // Authorization if using token-based auth for this endpoint
};

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405, headers: corsHeaders });
  }

  let session, shop;
  try {
    const authResult = await authenticate.admin(request);
    session = authResult.session;
    shop = session.shop;
  } catch (error) {
    // This can happen if the session is invalid or authentication fails
    console.error("Authentication error:", error);
    return json({ error: "Authentication failed." }, { status: 401, headers: corsHeaders });
  }

  const uploadHandler = unstable_createMemoryUploadHandler({
    maxPartSize: MAX_FILE_SIZE_BYTES,
    filter({ contentType }) {
      return ALLOWED_CONTENT_TYPES.includes(contentType);
    }
  });

  let formData;
  try {
    formData = await unstable_parseMultipartFormData(request, uploadHandler);
  } catch (error) {
    console.error("Error parsing multipart form data:", error);
    return json({ error: `File upload error: ${error.message}. Ensure file is a valid image type (PNG, JPG, GIF) and under ${MAX_FILE_SIZE_MB}MB.` }, { status: 400, headers: corsHeaders });
  }

  const imageFile = formData.get("avatarFile"); // Must match client-side FormData key

  if (!imageFile || typeof imageFile === 'string' || !imageFile.name || !imageFile.type) {
    return json({ error: "No file uploaded or invalid file data." }, { status: 400, headers: corsHeaders });
  }

  if (imageFile.size === 0) {
    return json({ error: "Uploaded file is empty." }, { status: 400, headers: corsHeaders });
  }

  if (!ALLOWED_CONTENT_TYPES.includes(imageFile.type)) {
    return json({ error: `Invalid file type: ${imageFile.type}. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}.` }, { status: 400, headers: corsHeaders });
  }
   if (imageFile.size > MAX_FILE_SIZE_BYTES) {
    return json({ error: `File too large. Max size is ${MAX_FILE_SIZE_MB}MB.` }, { status: 400, headers: corsHeaders });
  }

  // --- MOCK SHOPIFY FILE UPLOAD ---
  // In a real application, this section would:
  // 1. Authenticate with Shopify (e.g., using `admin.sessionToken` or an app proxy for some cases).
  // 2. Use Shopify's GraphQL API `fileCreate` mutation (possibly with `stagedUploadsCreate`).
  //    - This would involve converting the file buffer to base64 or uploading to a GCS URL.
  //    - Example: const fileBuffer = Buffer.from(await imageFile.arrayBuffer());
  //               const base64Data = fileBuffer.toString('base64');
  //               // Then use base64Data in the GraphQL mutation.
  // 3. Get the permanent URL or GID of the uploaded file from the Shopify API response.

  console.log("--- MOCKING SHOPIFY FILE UPLOAD ---");
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  // Use a placeholder shop ID or part of the shop domain for a more "realistic" mock URL
  const mockShopIdForUrl = shop.split('.')[0].replace(/[^a-zA-Z0-9-]/g, '');
  const shopifyFileUrl = `https://cdn.shopify.com/s/files/1/${mockShopIdForUrl}/files/mock_avatar_${Date.now()}.${fileExtension}`;
  console.log("Mocked Shopify File URL:", shopifyFileUrl);
  // --- END MOCK ---

  try {
    await updateShopChatbotConfig(shop, { avatarUrl: shopifyFileUrl });
    return json({
      success: true,
      avatarUrl: shopifyFileUrl,
      message: "Avatar (mock) uploaded and configuration updated."
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error updating ShopChatbotConfig with new avatar URL:", error);
    // If DB update fails, the file is "uploaded" to Shopify (mocked), but not reflected in app's config.
    // This state might need reconciliation or cleanup logic in a real app.
    return json({ error: "Failed to save avatar configuration.", detail: error.message }, { status: 500, headers: corsHeaders });
  }
}
