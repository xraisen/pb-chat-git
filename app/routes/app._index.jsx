import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Grid, // Added Grid
  Banner, // For displaying errors
  List,
  EmptyState, // For empty states in cards if needed
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { authenticate } from "../../shopify.server"; // Corrected path
import { getChatInteractionStats, getRecentChatInteractions } from "../../db.server.js"; // Corrected path

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  try {
    const stats = await getChatInteractionStats(shop);
    const recentInteractions = await getRecentChatInteractions(shop, 5); // Fetch 5 recent interactions

    if (stats.error) { // Check if stats itself has an error property from db helper
        return json({
            shopName: shop,
            stats: {
                totalInteractions: 0,
                chatOpenedCount: 0,
                addToCartCount: 0,
                checkoutsInitiatedCount: 0,
                interactionsOverTime: []
            },
            recentInteractions: [],
            loaderError: stats.error
        }, { status: 500 });
    }

    return json({
      shopName: shop,
      stats,
      recentInteractions,
      loaderError: null,
    });
  } catch (error) {
    console.error("Error in dashboard loader:", error);
    return json({
      shopName: shop,
      stats: { // Provide default structure on error
        totalInteractions: 0,
        chatOpenedCount: 0,
        addToCartCount: 0,
        checkoutsInitiatedCount: 0,
        interactionsOverTime: [],
      },
      recentInteractions: [],
      loaderError: "Failed to load dashboard data.",
    }, { status: 500 });
  }
};

export default function Index() {
  const { shopName, stats, recentInteractions, loaderError } = useLoaderData();

  const renderStatCard = (title, value) => (
    <Card roundedAbove="sm" padding="400">
        <BlockStack gap="200">
            <Text as="h2" variant="headingMd" tone="subdued">{title}</Text>
            <Text as="p" variant="headingLg">{value ?? '0'}</Text>
        </BlockStack>
    </Card>
  );

  if (loaderError) {
    return (
        <Page>
            <TitleBar title="Dashboard" />
            <Layout>
                <Layout.Section>
                    <Banner title="Error" tone="critical">
                        <p>{loaderError}</p>
                    </Banner>
                </Layout.Section>
            </Layout>
        </Page>
    );
  }

  return (
    <Page title="Dashboard">
      <TitleBar title={`Chatbot Dashboard - ${shopName}`} />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Grid columns={{ xs: 1, sm: 2, md: 2, lg:4 }}>
              {renderStatCard("Total Interactions", stats.totalInteractions)}
              {renderStatCard("Chats Opened", stats.chatOpenedCount)}
              {renderStatCard("Add to Carts (via Chat)", stats.addToCartCount)}
              {renderStatCard("Checkouts Initiated (via Chat)", stats.checkoutsInitiatedCount)}
            </Grid>
          </Layout.Section>

          <Layout.Section>
            <Card title="Chatbot Usage Trends">
              <BlockStack gap="400" padding="400">
                {(stats.interactionsOverTime && stats.interactionsOverTime.length > 0) ? (
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                      <LineChart
                        data={stats.interactionsOverTime}
                        margin={{
                          top: 5, right: 30, left: 0, bottom: 5, // Adjusted left margin
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          // tickFormatter={(tickItem) => new Date(tickItem).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} name="Interactions" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Text as="p" tone="subdued">Not enough data to display usage trends yet.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card title="Recent Chat Interactions">
                <BlockStack gap="400" padding="400">
                    {recentInteractions && recentInteractions.length > 0 ? (
                        <List>
                        {recentInteractions.map((interaction) => (
                            <List.Item key={interaction.id}>
                                <BlockStack gap="100">
                                    <Text variant="bodyMd">
                                        <strong>Event:</strong> {interaction.eventType}
                                    </Text>
                                    <Text variant="bodySm" tone="subdued">
                                        <strong>Time:</strong> {new Date(interaction.timestamp).toLocaleString()}
                                    </Text>
                                    <Text variant="bodySm" tone="subdued">
                                        <strong>Conv. ID:</strong> {interaction.conversationId}
                                    </Text>
                                </BlockStack>
                            </List.Item>
                        ))}
                        </List>
                    ) : (
                        <EmptyState
                            heading="No recent interactions"
                            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-files.png"
                        >
                            <p>There are no recent chat interactions to display.</p>
                        </EmptyState>
                    )}
                </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
