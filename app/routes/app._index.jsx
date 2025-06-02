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
  Tooltip, // Added
  Icon,    // Added
  LegacyStack // Added
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { InfoMinor } from '@shopify/polaris-icons'; // Added
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip, // Aliased import
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { authenticate } from "../../shopify.server"; 
import { 
  getChatInteractionStats, 
  getRecentChatInteractions,
  getMessageFeedbackStats,  // Added
  getRecentMessageFeedback // Added
} from "../../db.server.js"; 

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  try {
    const stats = await getChatInteractionStats(shop);
    const recentInteractions = await getRecentChatInteractions(shop, 5);
    const feedbackStats = await getMessageFeedbackStats(shop);
    const recentFeedbackWithComments = await getRecentMessageFeedback(shop, 5);

    if (stats.error || feedbackStats.error) { 
        return json({ 
            shopName: shop, 
            stats: stats.error ? { 
                totalInteractions: 0, chatOpenedCount: 0, addToCartCount: 0, checkoutsInitiatedCount: 0, interactionsOverTime: [] 
            } : stats, 
            recentInteractions: [],
            feedbackStats: feedbackStats.error ? { 
                upvotes: 0, downvotes: 0, totalFeedback: 0, positiveFeedbackPercentage: 0 
            } : feedbackStats,
            recentFeedbackWithComments: [],
            loaderError: stats.error || feedbackStats.error || "Failed to load some dashboard data."
        }, { status: 500 });
    }

    return json({
      shopName: shop,
      stats,
      recentInteractions,
      feedbackStats,
      recentFeedbackWithComments,
      loaderError: null,
    });
  } catch (error) {
    console.error("Error in dashboard loader:", error);
    return json({
      shopName: shop,
      stats: { 
        totalInteractions: 0, chatOpenedCount: 0, addToCartCount: 0, checkoutsInitiatedCount: 0, interactionsOverTime: []
      },
      recentInteractions: [],
      feedbackStats: { 
        upvotes: 0, downvotes: 0, totalFeedback: 0, positiveFeedbackPercentage: 0 
      },
      recentFeedbackWithComments: [],
      loaderError: "Failed to load dashboard data.",
    }, { status: 500 });
  }
};

export default function Index() {
  const { shopName, stats, recentInteractions, feedbackStats, recentFeedbackWithComments, loaderError } = useLoaderData();

  const renderStatCard = (title, value, helpText = null) => (
    <Card roundedAbove="sm" padding="400">
        <BlockStack gap="200">
            {typeof title === 'string' ? <Text as="h2" variant="headingMd" tone="subdued">{title}</Text> : title}
            <Text as="p" variant="headingLg">{value ?? '0'}</Text>
            {helpText && <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>}
        </BlockStack>
    </Card>
  );

  const totalInteractionsTitle = (
    <LegacyStack alignment="center" spacing="extraTight">
      <Text as="h2" variant="headingMd" tone="subdued">Total Interactions</Text>
      <Tooltip content="Sum of all logged events (messages, chat opens, tool calls, etc.).">
        <Icon source={InfoMinor} tone="base" />
      </Tooltip>
    </LegacyStack>
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
              {renderStatCard(totalInteractionsTitle, stats.totalInteractions)}
              {renderStatCard("Chats Opened", stats.chatOpenedCount)}
              {renderStatCard("Add to Carts (via Chat)", stats.addToCartCount, "Logged when 'Add to Cart' is clicked on a product in chat.")}
              {renderStatCard("Checkouts Initiated (via Chat)", stats.checkoutsInitiatedCount, "Logged when a checkout URL from a chat tool is generated.")}
            </Grid>
          </Layout.Section>

          <Layout.Section>
            <Card title="Chatbot Usage Trends">
              <BlockStack gap="400" padding="400">
                {(stats.interactionsOverTime && stats.interactionsOverTime.length > 0) ? (
                  <>
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
                        <RechartsTooltip /> {/* Updated usage */}
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} name="Interactions" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">Total logged chat interactions per day.</Text>
                  </>
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

          {/* Message Feedback Section */}
          <Layout.Section>
            <Card title="Message Feedback Overview">
              <BlockStack gap="300" padding="400">
                {feedbackStats.error && <Banner tone="warning">{feedbackStats.error}</Banner>}
                <Text as="p" variant="bodyMd">
                  Positive Feedback: <strong>{feedbackStats.positiveFeedbackPercentage ?? 'N/A'}%</strong>
                </Text>
                <Grid columns={{ xs:1, sm:3}}>
                  <Grid.Cell><Text as="p" variant="bodySm">Total Upvotes: {feedbackStats.upvotes ?? '0'}</Text></Grid.Cell>
                  <Grid.Cell><Text as="p" variant="bodySm">Total Downvotes: {feedbackStats.downvotes ?? '0'}</Text></Grid.Cell>
                  <Grid.Cell><Text as="p" variant="bodySm">Total Feedback: {feedbackStats.totalFeedback ?? '0'}</Text></Grid.Cell>
                </Grid>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card title="Recent Feedback Comments">
              <BlockStack gap="400" padding="400">
                {recentFeedbackWithComments && recentFeedbackWithComments.length > 0 ? (
                  <List>
                    {recentFeedbackWithComments.map((fb) => (
                      <List.Item key={fb.id}>
                        <BlockStack gap="150"> {/* Increased gap slightly */}
                          <Text variant="bodyMd">
                            <strong>Comment:</strong> {fb.comment ? `"${fb.comment}"` : <Text as="span" tone="subduedItalic">No comment provided.</Text>}
                          </Text>
                          <LegacyStack distribution="equalSpacing" spacing="loose">
                            <Text variant="bodySm" tone={fb.rating === "UP" ? "success" : (fb.rating === "DOWN" ? "critical" : "subdued")}>
                                Rated: <strong>{fb.rating}</strong>
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                                On: {new Date(fb.timestamp).toLocaleString()}
                            </Text>
                          </LegacyStack>
                           <Text variant="bodyXs" tone="subdued">
                                Message: "{fb.messageContent.substring(0, 100)}{fb.messageContent.length > 100 ? '...' : ''}"
                           </Text>
                           <Text variant="bodyXs" tone="subdued">
                                Conv. ID: {fb.conversationId}
                           </Text>
                        </BlockStack>
                      </List.Item>
                    ))}
                  </List>
                ) : (
                  <EmptyState
                    heading="No comments yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-files.png" 
                  >
                    <p>When users leave comments with their feedback, they will appear here.</p>
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
