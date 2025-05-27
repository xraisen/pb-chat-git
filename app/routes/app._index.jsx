import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  List,
  Link,
  InlineStack,
  Button,
  Frame,
  Toast,
  Icon, // Added for visual flair
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";
import {ChatMajor, MagicMajor, SparklesMajor} from '@shopify/polaris-icons'; // Example icons

export default function Index() {
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isToastError, setIsToastError] = useState(false);

  const toggleToastActive = useCallback(() => setToastActive((active) => !active), []);

  const handleChatbotTeaserClick = useCallback(() => {
    const beautyTips = [
      "💄 Tip: Always remove makeup before bed for healthy skin!",
      "✨ Pro Tip: Hydration is key! Drink plenty of water for a natural glow.",
      "💅 Style Tip: A touch of glitter can elevate any look!",
      "🌿 Beauty Secret: Use a gentle exfoliator 2-3 times a week.",
      "☀️ Reminder: Don't forget your SPF, even on cloudy days!"
    ];
    const randomTip = beautyTips[Math.floor(Math.random() * beautyTips.length)];
    setToastMessage(randomTip);
    setIsToastError(false);
    toggleToastActive();
  }, [toggleToastActive]);

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={toggleToastActive} error={isToastError} />
  ) : null;

  return (
    <Frame>
      <Page>
        <TitleBar title="Planet Beauty AI Chat Agent">
          {/* You could add a secondary action here if needed */}
        </TitleBar>
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Welcome to Planet Beauty AI! ✨
                    </Text>
                    <Text variant="bodyMd" as="p">
                      Get ready to revolutionize your customer experience! This app adds our intelligent AI Chat Agent, powered by Claude, directly to your storefront. It's like having a 24/7 beauty expert for every visitor!
                    </Text>
                  </BlockStack>
                  <BlockStack gap="300">
                     <Text as="h3" variant="headingMd">Want a sneak peek of its charm?</Text>
                    <Button onClick={handleChatbotTeaserClick} variant="primary" tone="success" icon={SparklesMajor}>
                      Get a Beauty Tip!
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                        <InlineStack gap="200" blockAlign="center">
                            <Icon source={ChatMajor} tone="base" />
                            <span>Meet Your Planet Beauty AI Assistant</span>
                        </InlineStack>
                    </Text>
                    <Text variant="bodyMd" as="p">
                      Our AI is here to help your customers with:
                    </Text>
                    <List type="bullet" spacing="extraTight">
                        <List.Item>Personalized product recommendations 💄</List.Item>
                        <List.Item>Skincare advice and routine building 🌿</List.Item>
                        <List.Item>Makeup tips and trend spotting ✨</List.Item>
                        <List.Item>Answering FAQs about your products and brand</List.Item>
                        <List.Item>Tracking orders and handling inquiries</List.Item>
                    </List>
                     <Text variant="bodySm" as="p" tone="subdued">
                      Connects seamlessly with Shopify MCP for a smooth experience.
                    </Text>
                </BlockStack>
              </Card>

            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      App Template Specs
                    </Text>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Framework
                        </Text>
                        <Link
                          url="https://remix.run"
                          target="_blank"
                          removeUnderline
                        >
                          Remix
                        </Link>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Database
                        </Text>
                        <Link
                          url="https://www.prisma.io/"
                          target="_blank"
                          removeUnderline
                        >
                          Prisma
                        </Link>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Interface
                        </Text>
                        <span>
                          <Link
                            url="https://polaris.shopify.com"
                            target="_blank"
                            removeUnderline
                          >
                            Polaris
                          </Link>
                          {", "}
                          <Link
                            url="https://shopify.dev/docs/apps/tools/app-bridge"
                            target="_blank"
                            removeUnderline
                          >
                            App Bridge
                          </Link>
                        </span>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Power
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                           Claude AI
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          API
                        </Text>
                        <Link
                          url="https://shopify.dev/docs/api/admin-graphql"
                          target="_blank"
                          removeUnderline
                        >
                          GraphQL API
                        </Link>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                     <Text as="h2" variant="headingMd">
                        <InlineStack gap="200" blockAlign="center">
                            <Icon source={MagicMajor} tone="base" />
                            <span>Next Steps to Shine</span>
                        </InlineStack>
                    </Text>
                    <List>
                      <List.Item>
                        <strong>Enable the Planet Beauty AI</strong> theme extension in your theme editor to bring the chatbot to life on your storefront!
                      </List.Item>
                      <List.Item>
                        Customize your AI's welcome message and frequently asked questions in the app settings.
                      </List.Item>
                    </List>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>

          {/* Footer Section */}
          <Layout>
            <Layout.Section>
                <div style={{ marginTop: 'var(--p-space-800)' }}> {/* Adds some top margin */}
                    <Text as="p" variant="bodyLg" alignment="center" tone="subdued">
                      Developed with ❤️ by Jose
                    </Text>
                </div>
            </Layout.Section>
          </Layout>

        </BlockStack>
        {toastMarkup}
      </Page>
    </Frame>
  );
}