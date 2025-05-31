import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, LegacyCard, EmptyState, List, Box, Divider } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import redis from "../redis.server.js";
// import { defaultChatbotConfig } from "../services/chatbotConfig.defaults.js"; // Not strictly needed for display

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;

  if (!shopId) {
    console.error("loader: shopId is missing from session for analytics.");
    return json({ error: "Unauthorized. Shop ID is missing.", analyticsData: null }, { status: 401 });
  }

  const analyticsData = {
    shopId,
    error: null, // For loader-level errors
  };

  try {
    analyticsData.totalInteractions = parseInt(await redis.get(`analytics:${shopId}:totalInteractions`) || '0');
    analyticsData.chatInitialized = parseInt(await redis.get(`analytics:${shopId}:chatInitialized`) || '0');
    analyticsData.chatWidgetOpened = parseInt(await redis.get(`analytics:${shopId}:chatWidgetOpened`) || '0');
    analyticsData.chatWidgetClosed = parseInt(await redis.get(`analytics:${shopId}:chatWidgetClosed`) || '0');
    analyticsData.messageSent = parseInt(await redis.get(`analytics:${shopId}:messageSent`) || '0');
    analyticsData.messageReceived = parseInt(await redis.get(`analytics:${shopId}:messageReceived`) || '0'); // Assuming bot messages are tracked as received

    analyticsData.addToCartCount = parseInt(await redis.get(`analytics:${shopId}:event:addToCartClicked`) || '0'); // Key from standalone-chat-logic
    analyticsData.checkoutInitiatedCount = parseInt(await redis.get(`analytics:${shopId}:event:checkoutInitiated`) || '0'); // Example key
    analyticsData.productInteractionCount = parseInt(await redis.get(`analytics:${shopId}:event:productInteraction`) || '0'); // Example key
    analyticsData.quickReplyClicked = parseInt(await redis.get(`analytics:${shopId}:event:quickReplyClicked`) || '0'); // Example key
    analyticsData.customerAuthenticated = parseInt(await redis.get(`analytics:${shopId}:event:customerAuthenticated`) || '0'); // Example key

    const feedbackRaw = await redis.hgetall(`analytics:${shopId}:feedback`);
    analyticsData.feedback = {
      thumbsUp: parseInt(feedbackRaw?.thumbsUp || '0'),
      thumbsDown: parseInt(feedbackRaw?.thumbsDown || '0'),
    };

    const topViewedRaw = await redis.zrevrange(`analytics:${shopId}:productViewFrequency`, 0, 4, 'WITHSCORES');
    analyticsData.topViewedProducts = [];
    for (let i = 0; i < topViewedRaw.length; i += 2) {
      analyticsData.topViewedProducts.push({ name: topViewedRaw[i], score: parseInt(topViewedRaw[i + 1]) });
    }

    const topAddedRaw = await redis.zrevrange(`analytics:${shopId}:productAddToCartFrequency`, 0, 4, 'WITHSCORES');
    analyticsData.topAddedToCartProducts = [];
    for (let i = 0; i < topAddedRaw.length; i += 2) {
      analyticsData.topAddedToCartProducts.push({ name: topAddedRaw[i], score: parseInt(topAddedRaw[i + 1]) });
    }

    const dailyInteractions = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      // Assuming totalInteractions also has daily breakdown or use a specific daily event like messageSent
      dailyInteractions[dateString] = parseInt(await redis.get(`analytics:${shopId}:messageSent:${dateString}`) || '0');
    }
    analyticsData.dailyInteractions = dailyInteractions;

  } catch (error) {
    console.error(`Failed to fetch analytics data for shop ${shopId}:`, error);
    analyticsData.error = "Failed to load some or all analytics data from Redis.";
    // Set default/empty values for all fields if Redis fails globally for this loader
    // This is partially handled by the || '0' in each get, but a global error might warrant clearing all
  }

  return json({ analyticsData });
}


export default function ChatbotAnalyticsPage() {
  const { analyticsData } = useLoaderData();

  if (!analyticsData || analyticsData.error && !Object.keys(analyticsData).some(k => k !== 'error' && k !== 'shopId')) {
    // If analyticsData is null/undefined, or only contains an error and shopId, show error.
    return (
      <Page title="Chatbot Analytics & Insights">
        <Frame>
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="200" padding="400">
                  <Text variant="headingMd" as="h2">Error</Text>
                  <Text variant="bodyMd" as="p">
                    {analyticsData?.error || "Could not load analytics data. The connection to the data store might be unavailable or the shop ID is missing."}
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Frame>
      </Page>
    );
  }

  // If there's a partial error message but other data exists, display it as a banner.
  // For this version, loader error is handled by the above check primarily.

  return (
    <Page title={`Chatbot Analytics for ${analyticsData.shopId || 'Shop'}`}>
      <Frame>
        {analyticsData.error && ( // Display non-critical error as a banner if some data still loaded
             <Box paddingBlockEnd="400">
                <Banner title="Data Loading Issue" tone="warning">
                    <p>{analyticsData.error}</p>
                </Banner>
            </Box>
        )}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">General Chat Metrics</Text>
                <BlockStack gap="150">
                  <Text variant="bodyMd" as="p">Total Interactions: <strong>{analyticsData.totalInteractions ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Chat Initialized on Page Load: <strong>{analyticsData.chatInitialized ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Chat Widget Opened by User: <strong>{analyticsData.chatWidgetOpened ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Chat Widget Closed by User: <strong>{analyticsData.chatWidgetClosed ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">User Messages Sent: <strong>{analyticsData.messageSent ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Bot Messages Received/Completed: <strong>{analyticsData.messageReceived ?? 'N/A'}</strong></Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
               <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Conversion & Engagement</Text>
                <BlockStack gap="150">
                  <Text variant="bodyMd" as="p">"Add to Cart" Clicks: <strong>{analyticsData.addToCartCount ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Checkouts Initiated (via chat): <strong>{analyticsData.checkoutInitiatedCount ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Quick Replies Clicked: <strong>{analyticsData.quickReplyClicked ?? 'N/A'}</strong></Text>
                  <Text variant="bodyMd" as="p">Customers Authenticated: <strong>{analyticsData.customerAuthenticated ?? 'N/A'}</strong></Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">User Feedback</Text>
                {analyticsData.feedback ? (
                  <BlockStack gap="150">
                    <Text variant="bodyMd" as="p">Thumbs Up: <strong>{analyticsData.feedback.thumbsUp ?? '0'}</strong></Text>
                    <Text variant="bodyMd" as="p">Thumbs Down: <strong>{analyticsData.feedback.thumbsDown ?? '0'}</strong></Text>
                  </BlockStack>
                ) : <Text variant="bodyMd" as="p">No feedback data available.</Text>}
              </BlockStack>
            </Card>
          </Layout.Section>


          <Layout.Section>
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Product Interactions</Text>
                <Text variant="bodyMd" as="p">Total Product Interactions (e.g., views from chat): <strong>{analyticsData.productInteractionCount ?? 'N/A'}</strong></Text>

                <Box paddingBlockStart="400">
                    <Text variant="headingSm" as="h3">Top Viewed Products</Text>
                    {analyticsData.topViewedProducts && analyticsData.topViewedProducts.length > 0 ? (
                        <List type="bullet">
                        {analyticsData.topViewedProducts.map((product, index) => (
                            <List.Item key={`viewed-${index}`}>{product.name} (Views: {product.score})</List.Item>
                        ))}
                        </List>
                    ) : <Text variant="bodyMd" as="p">No product view data available.</Text>}
                </Box>

                <Box paddingBlockStart="400">
                    <Text variant="headingSm" as="h3">Top Added-to-Cart Products</Text>
                    {analyticsData.topAddedToCartProducts && analyticsData.topAddedToCartProducts.length > 0 ? (
                        <List type="bullet">
                        {analyticsData.topAddedToCartProducts.map((product, index) => (
                            <List.Item key={`added-${index}`}>{product.name} (Adds: {product.score})</List.Item>
                        ))}
                        </List>
                    ) : <Text variant="bodyMd" as="p">No "add to cart" data available.</Text>}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Recent Daily Activity (User Messages)</Text>
                {analyticsData.dailyInteractions && Object.keys(analyticsData.dailyInteractions).length > 0 ? (
                  <List type="bullet">
                    {Object.entries(analyticsData.dailyInteractions)
                      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) // Sort by date descending
                      .map(([date, count]) => (
                      <List.Item key={date}>{date}: <strong>{count}</strong> messages</List.Item>
                    ))}
                  </List>
                ) : (
                  <Text variant="bodyMd" as="p">No daily interaction data available for the last 7 days.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>
      </Frame>
    </Page>
  );
}
