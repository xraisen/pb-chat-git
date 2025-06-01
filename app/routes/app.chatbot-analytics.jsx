import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, LegacyCard, EmptyState, List, Box, Divider } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import redis from "../redis.server.js";

import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler // Added for area fill if desired
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);


export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;

  if (!shopId) {
    console.error("loader: shopId is missing from session for analytics.");
    return json({ error: "Unauthorized. Shop ID is missing.", analyticsData: null }, { status: 401 });
  }

  const analyticsData = {
    shopId,
    error: null,
  };

  try {
    analyticsData.totalInteractions = parseInt(await redis.get(`analytics:${shopId}:totalInteractions`) || '0');
    analyticsData.chatInitialized = parseInt(await redis.get(`analytics:${shopId}:chatInitialized`) || '0');
    analyticsData.chatWidgetOpened = parseInt(await redis.get(`analytics:${shopId}:chatWidgetOpened`) || '0');
    analyticsData.chatWidgetClosed = parseInt(await redis.get(`analytics:${shopId}:chatWidgetClosed`) || '0');
    analyticsData.messageSent = parseInt(await redis.get(`analytics:${shopId}:messageSent`) || '0');
    analyticsData.messageReceived = parseInt(await redis.get(`analytics:${shopId}:messageReceived`) || '0');

    analyticsData.addToCartCount = parseInt(await redis.get(`analytics:${shopId}:event:addToCart`) || '0');
    analyticsData.checkoutInitiatedCount = parseInt(await redis.get(`analytics:${shopId}:event:checkoutInitiated`) || '0');
    analyticsData.productInteractionCount = parseInt(await redis.get(`analytics:${shopId}:event:productCardClickedInChat`) || '0');
    analyticsData.quickReplyClicked = parseInt(await redis.get(`analytics:${shopId}:event:quickReplyClicked`) || '0');
    analyticsData.customerAuthenticated = parseInt(await redis.get(`analytics:${shopId}:event:customerAuthenticated`) || '0');

    const feedbackRaw = await redis.hgetall(`analytics:${shopId}:feedback`);
    analyticsData.feedback = {
      thumbsUp: parseInt(feedbackRaw?.thumbsUp || '0'),
      thumbsDown: parseInt(feedbackRaw?.thumbsDown || '0'),
    };

    // Fetching more items for top products to ensure we have enough data if some products are obscure
    const topViewedRaw = await redis.zrevrange(`analytics:${shopId}:productViewFrequency`, 0, 9, 'WITHSCORES');
    analyticsData.topViewedProducts = [];
    for (let i = 0; i < topViewedRaw.length; i += 2) {
      // Assuming product ID is stored; actual product name would require another lookup
      analyticsData.topViewedProducts.push({ id: topViewedRaw[i], name: `Product ${topViewedRaw[i]}`, score: parseInt(topViewedRaw[i + 1]) });
    }

    const topAddedRaw = await redis.zrevrange(`analytics:${shopId}:productAddToCartFrequency`, 0, 9, 'WITHSCORES');
    analyticsData.topAddedToCartProducts = [];
    for (let i = 0; i < topAddedRaw.length; i += 2) {
      analyticsData.topAddedToCartProducts.push({ id: topAddedRaw[i], name: `Product ${topAddedRaw[i]}`, score: parseInt(topAddedRaw[i + 1]) });
    }

    const dailyInteractions = {};
    const dailyMessageSent = {};
    for (let i = 6; i >= 0; i--) { // Iterate for the last 7 days including today
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      dailyInteractions[dateString] = parseInt(await redis.get(`analytics:${shopId}:totalInteractions:${dateString}`) || '0');
      dailyMessageSent[dateString] = parseInt(await redis.get(`analytics:${shopId}:messageSent:${dateString}`) || '0');
    }
    analyticsData.dailyInteractions = dailyInteractions;
    analyticsData.dailyMessageSent = dailyMessageSent;


  } catch (error) {
    console.error(`Failed to fetch analytics data for shop ${shopId}:`, error);
    analyticsData.error = "Failed to load some or all analytics data from Redis. Ensure Redis is connected and keys exist.";
  }

  return json({ analyticsData });
}

// Helper function to parse ZSET WITHSCORES data for charts
const parseSortedSetDataForChart = (rawDataArray, datasetLabel = "Count") => {
    if (!rawDataArray || rawDataArray.length === 0) {
        return { labels: [], datasets: [{ label: 'No data available', data: [], backgroundColor: 'rgba(200, 200, 200, 0.5)' }] };
    }
    const labels = rawDataArray.map(item => item.name); // Use product name or ID
    const data = rawDataArray.map(item => item.score);
    return {
        labels,
        datasets: [{
            label: datasetLabel,
            data,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
        }]
    };
};


export default function ChatbotAnalyticsPage() {
  const { analyticsData } = useLoaderData();

  if (!analyticsData || (analyticsData.error && !Object.keys(analyticsData).some(k => k !== 'error' && k !== 'shopId' && analyticsData[k] !== null && analyticsData[k] !== 0 && (typeof analyticsData[k] !== 'object' || Object.keys(analyticsData[k]).length > 0)))) {
    return (
      <Page title="Chatbot Analytics & Insights">
        <Frame> <Layout> <Layout.Section>
          <Card> <BlockStack gap="200" padding="400">
            <Text variant="headingMd" as="h2">Error Loading Analytics</Text>
            <Text variant="bodyMd" as="p">{analyticsData?.error || "Could not load analytics data."}</Text>
          </BlockStack> </Card>
        </Layout.Section> </Layout> </Frame>
      </Page>
    );
  }

  // Prepare data for Daily Interactions Line Chart
  let dailyInteractionsChartData = { labels: [], datasets: [] };
  if (analyticsData?.dailyInteractions) {
      const sortedDates = Object.keys(analyticsData.dailyInteractions).sort((a,b) => new Date(a) - new Date(b));
      dailyInteractionsChartData = {
          labels: sortedDates,
          datasets: [
              {
                  label: 'Total Interactions per Day (Last 7 Days)',
                  data: sortedDates.map(date => analyticsData.dailyInteractions[date]),
                  borderColor: 'rgb(75, 192, 192)',
                  backgroundColor: 'rgba(75, 192, 192, 0.2)',
                  tension: 0.1,
                  fill: true,
              },
              {
                  label: 'User Messages Sent per Day (Last 7 Days)',
                  data: sortedDates.map(date => analyticsData.dailyMessageSent[date]),
                  borderColor: 'rgb(255, 99, 132)',
                  backgroundColor: 'rgba(255, 99, 132, 0.2)',
                  tension: 0.1,
                  fill: true,
              }
          ]
      };
  }
  const dailyChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, title: { display: true, text: 'Daily Activity Trends (Last 7 Days)' }},
      scales: { y: { beginAtZero: true, suggestedMax: 10 } } // Suggest a max if counts are low
  };

  // Prepare data for Bar Charts
  const topViewedProductsChartData = parseSortedSetDataForChart(analyticsData?.topViewedProducts, "Views");
  const topAddedToCartChartData = parseSortedSetDataForChart(analyticsData?.topAddedToCartProducts, "Adds to Cart");

  const barChartOptions = (titleText) => ({
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false }, title: { display: true, text: titleText }},
    scales: { x: { beginAtZero: true } }
  });


  return (
    <Page fullWidth title={`Chatbot Analytics for ${analyticsData.shopId || 'Shop'}`}>
      <Frame>
        {analyticsData.error && (
             <Box paddingBlockEnd="400">
                <Banner title="Data Loading Issue" tone="warning"><p>{analyticsData.error}</p></Banner>
            </Box>
        )}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">General Chat Metrics</Text>
                <BlockStack gap="150">
                  <Text>Total Interactions: <strong>{analyticsData.totalInteractions ?? 'N/A'}</strong></Text>
                  <Text>Chat Initialized (Page Loads): <strong>{analyticsData.chatInitialized ?? 'N/A'}</strong></Text>
                  <Text>Chat Widget Opened: <strong>{analyticsData.chatWidgetOpened ?? 'N/A'}</strong></Text>
                  <Text>Chat Widget Closed: <strong>{analyticsData.chatWidgetClosed ?? 'N/A'}</strong></Text>
                  <Text>User Messages Sent: <strong>{analyticsData.messageSent ?? 'N/A'}</strong></Text>
                  <Text>Bot Responses Completed: <strong>{analyticsData.messageReceived ?? 'N/A'}</strong></Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
               <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Conversion & Engagement</Text>
                <BlockStack gap="150">
                  <Text>"Add to Cart" Clicks (from chat): <strong>{analyticsData.addToCartCount ?? 'N/A'}</strong></Text>
                  <Text>Checkouts Initiated (from chat): <strong>{analyticsData.checkoutInitiatedCount ?? 'N/A'}</strong></Text>
                  <Text>Quick Replies Clicked: <strong>{analyticsData.quickReplyClicked ?? 'N/A'}</strong></Text>
                  <Text>Customers Authenticated: <strong>{analyticsData.customerAuthenticated ?? 'N/A'}</strong></Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">User Feedback</Text>
                {analyticsData.feedback ? (
                  <BlockStack gap="150">
                    <Text>Thumbs Up: <strong>{analyticsData.feedback.thumbsUp ?? '0'}</strong></Text>
                    <Text>Thumbs Down: <strong>{analyticsData.feedback.thumbsDown ?? '0'}</strong></Text>
                  </BlockStack>
                ) : <Text>No feedback data available.</Text>}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Daily Activity Chart</Text>
                <Box minHeight="300px">
                {analyticsData.dailyInteractions && Object.keys(analyticsData.dailyInteractions).length > 0 ? (
                    <Line options={dailyChartOptions} data={dailyInteractionsChartData} />
                ) : (
                    <Text>No daily interaction data available for the last 7 days.</Text>
                )}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section oneHalf>
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Top Viewed Products (from Chat)</Text>
                <Box minHeight="300px">
                {analyticsData.topViewedProducts && analyticsData.topViewedProducts.length > 0 ? (
                    <Bar options={barChartOptions('Top 5 Viewed Products')} data={topViewedProductsChartData} />
                ) : <Text>No product view data available.</Text>}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section oneHalf>
            <Card>
                <BlockStack gap="500" padding="400">
                <Text variant="headingMd" as="h2">Top Added-to-Cart Products (from Chat)</Text>
                <Box minHeight="300px">
                {analyticsData.topAddedToCartProducts && analyticsData.topAddedToCartProducts.length > 0 ? (
                     <Bar options={barChartOptions('Top 5 Added-to-Cart Products')} data={topAddedToCartChartData} />
                ) : <Text>No "add to cart" data available.</Text>}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>
      </Frame>
    </Page>
  );
}
