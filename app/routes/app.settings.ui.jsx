import { useState, useCallback, useEffect } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField, Select, Button, BlockStack, ChoiceList, Banner, Collapsible, Icon, LegacyStack, Tooltip, Text as PolarisText
} from '@shopify/polaris';
import { TitleBar } from "@shopify/app-bridge-react";
import { Form as RemixForm, useLoaderData, useActionData, useNavigation, json } from "@remix-run/react";
import { redirect } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { InfoMinor } from '@shopify/polaris-icons';
import { getShopChatbotConfig, updateShopChatbotConfig } from "../../db.server.js";
import fs from "fs/promises";
import path from "path";

const PROMPTS_PATH = path.join(process.cwd(), "app", "prompts", "prompts.json");

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  let currentConfig = await getShopChatbotConfig(shop);
  let promptKeys = [];
  let loaderPageError = null;

  try {
    const promptsFileContent = await fs.readFile(PROMPTS_PATH, "utf-8");
    const promptsData = JSON.parse(promptsFileContent);
    promptKeys = Object.keys(promptsData).map(key => ({ label: key, value: key }));
  } catch (error) {
    console.error("Failed to load or parse prompts.json:", error);
    loaderPageError = "Failed to load system prompts. Please check the server configuration.";
    // Return default prompt keys or handle error as appropriate
    promptKeys = [{ label: "Standard Assistant (Default)", value: "standardAssistant" }];
  }

  // If config has an error property from db.server.js, pass it through
  if (currentConfig.error && !loaderPageError) {
    loaderPageError = currentConfig.error;
  }

  return json({
    settings: currentConfig, // This will include defaults if no config is found
    promptKeys,
    pageError: loaderPageError,
    formErrors: null,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const formErrors = {};
  let pageError = null;

  const settingsData = {
    botName: formData.get("botName"),
    welcomeMessage: formData.get("welcomeMessage"),
    systemPromptKey: formData.get("systemPromptKey"),
    customSystemPrompt: formData.get("customSystemPrompt"),
    width: formData.get("width"),
    height: formData.get("height"),
    zIndex: formData.get("zIndex") ? parseInt(formData.get("zIndex"), 10) : null,
    position: formData.get("position"), // This comes from ChoiceList, should be a single string value
    bgColor: formData.get("bgColor"),
    textColor: formData.get("textColor"),
    buttonColor: formData.get("buttonColor"),
    headerBgColor: formData.get("headerBgColor"),
    headerTextColor: formData.get("headerTextColor"),
    userMsgBgColor: formData.get("userMsgBgColor"),
    userMsgTextColor: formData.get("userMsgTextColor"),
    assistantMsgBgColor: formData.get("assistantMsgBgColor"),
    assistantMsgTextColor: formData.get("assistantMsgTextColor"),
    customCSS: formData.get("customCSS"),
    avatarUrl: formData.get("avatarUrl"),
    productDisplayMode: formData.get("productDisplayMode"),
    maxProductsToDisplay: formData.get("maxProductsToDisplay") ? parseInt(formData.get("maxProductsToDisplay"), 10) : null,
    carouselItemWidth: formData.get("carouselItemWidth"),
    chatBubbleIcon: formData.get("chatBubbleIcon"),
    customChatBubbleSVG: formData.get("customChatBubbleSVG"),
    chatBubbleSize: formData.get("chatBubbleSize"),
    chatBubbleColor: formData.get("chatBubbleColor"),
  };

  // Basic validation example (can be expanded)
  if (!settingsData.botName) formErrors.botName = "Bot name is required.";
  if (isNaN(settingsData.zIndex)) formErrors.zIndex = "Z-index must be a number.";
  if (isNaN(settingsData.maxProductsToDisplay)) formErrors.maxProductsToDisplay = "Max products must be a number.";


  if (Object.keys(formErrors).length > 0) {
    return json({ formErrors, pageError }, { status: 400 });
  }

  try {
    await updateShopChatbotConfig(shop, settingsData);
    return redirect("/app/settings/ui");
  } catch (error) {
    console.error("Failed to update ShopChatbotConfig:", error);
    pageError = "Sorry, we couldn't save your settings. Please try again.";
    return json({ formErrors, pageError }, { status: 500 });
  }
};

export default function UISettingsPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const { settings: initialSettings, promptKeys: loadedPromptKeys, pageError: loaderPageError } = loaderData;

  // Use actionData if available (e.g., validation error), otherwise use loaderData
  const formErrors = actionData?.formErrors || {};
  const pageError = actionData?.pageError || loaderPageError;


  // Initialize state with loader data, falling back to schema defaults if a field is missing
  const [botName, setBotName] = useState(initialSettings.botName ?? "Store Assistant");
  const [welcomeMessage, setWelcomeMessage] = useState(initialSettings.welcomeMessage ?? "👋 Hi there! How can I help you today?");
  const [systemPromptKey, setSystemPromptKey] = useState(initialSettings.systemPromptKey ?? "standardAssistant");
  const [customSystemPrompt, setCustomSystemPrompt] = useState(initialSettings.customSystemPrompt ?? "");
  const [width, setWidth] = useState(initialSettings.width ?? "450px");
  const [height, setHeight] = useState(initialSettings.height ?? "70vh");
  const [zIndex, setZIndex] = useState((initialSettings.zIndex ?? 9999).toString());
  const [position, setPosition] = useState([initialSettings.position ?? "right"]);
  const [bgColor, setBgColor] = useState(initialSettings.bgColor ?? "#FFFFFF");
  const [textColor, setTextColor] = useState(initialSettings.textColor ?? "#333333");
  const [buttonColor, setButtonColor] = useState(initialSettings.buttonColor ?? "#E57399");
  const [headerBgColor, setHeaderBgColor] = useState(initialSettings.headerBgColor ?? "#E57399");
  const [headerTextColor, setHeaderTextColor] = useState(initialSettings.headerTextColor ?? "#FFFFFF");
  const [userMsgBgColor, setUserMsgBgColor] = useState(initialSettings.userMsgBgColor ?? "#E57399");
  const [userMsgTextColor, setUserMsgTextColor] = useState(initialSettings.userMsgTextColor ?? "#FFFFFF");
  const [assistantMsgBgColor, setAssistantMsgBgColor] = useState(initialSettings.assistantMsgBgColor ?? "#F8F9FA");
  const [assistantMsgTextColor, setAssistantMsgTextColor] = useState(initialSettings.assistantMsgTextColor ?? "#333333");
  const [customCSS, setCustomCSS] = useState(initialSettings.customCSS ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialSettings.avatarUrl ?? "");
  const [productDisplayMode, setProductDisplayMode] = useState(initialSettings.productDisplayMode ?? "card");
  const [maxProductsToDisplay, setMaxProductsToDisplay] = useState((initialSettings.maxProductsToDisplay ?? 3).toString());
  const [carouselItemWidth, setCarouselItemWidth] = useState(initialSettings.carouselItemWidth ?? "180px");
  const [chatBubbleIcon, setChatBubbleIcon] = useState(initialSettings.chatBubbleIcon ?? "default");
  const [customChatBubbleSVG, setCustomChatBubbleSVG] = useState(initialSettings.customChatBubbleSVG ?? "");
  const [chatBubbleSize, setChatBubbleSize] = useState(initialSettings.chatBubbleSize ?? "60px");
  const [chatBubbleColor, setChatBubbleColor] = useState(initialSettings.chatBubbleColor ?? "#E57399");

  // State for Collapsible sections
  const [isColorsOpen, setIsColorsOpen] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleToggleColors = useCallback(() => setIsColorsOpen((open) => !open), []);
  const handleToggleAdvanced = useCallback(() => setIsAdvancedOpen((open) => !open), []);

  const handleSystemPromptChange = useCallback((value) => setSystemPromptKey(value), []);
  const handlePositionChange = useCallback((value) => setPosition(value), []);
  const handleProductDisplayModeChange = useCallback((value) => setProductDisplayMode(value), []);
  const handleChatBubbleIconChange = useCallback((value) => setChatBubbleIcon(value), []);

  const systemPromptOptions = [
    { label: "Custom", value: "custom" }, // Put Custom first
    ...loadedPromptKeys,
  ];

  const positionOptions = [
    { label: "Bottom Right", value: "right" },
    { label: "Bottom Left", value: "left" },
  ];

  const chatBubbleIconOptions = [
    { label: "Default Chat Icon", value: "default" },
    { label: "Question Mark Icon", value: "question" },
    { label: "Custom SVG", value: "custom" },
  ];

  const productDisplayModeOptions = [
    { label: "Card View", value: "card" },
    { label: "Carousel View", value: "carousel" },
    { label: "Combo View (Card + Carousel)", value: "combo" },
  ];

  return (
    <Page title="Chatbot UI Settings">
      <TitleBar title="Chatbot UI Settings" />
      {pageError && (
          <Layout.Section>
            <Banner title="Error" tone="critical" onDismiss={() => { /* Potentially clear error from state */ }}>
              <p>{pageError}</p>
            </Banner>
          </Layout.Section>
      )}
      <RemixForm method="post">
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Card roundedAbove="sm">
                <BlockStack gap="500">
                  <FormLayout>
                    <FormLayout.Group title="Chatbot Persona">
                      <TextField label="Chatbot Name" name="botName" value={botName} onChange={setBotName} autoComplete="off" error={formErrors.botName} />
                      <TextField label="Welcome Message" name="welcomeMessage" value={welcomeMessage} onChange={setWelcomeMessage} multiline={3} autoComplete="off" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                       <Select
                          label="System Prompt"
                          name="systemPromptKey"
                          options={systemPromptOptions}
                          value={systemPromptKey}
                          onChange={handleSystemPromptChange}
                          helpText="Defines the AI's personality and instructions. Select 'Custom' to write your own."
                        />
                      {systemPromptKey === 'custom' && (
                        <TextField
                          label="Custom System Prompt"
                          name="customSystemPrompt"
                          value={customSystemPrompt}
                          onChange={setCustomSystemPrompt}
                          multiline={6}
                          autoComplete="off"
                          helpText="Write your detailed system prompt here. Refer to LLM documentation for best practices."
                        />
                      )}
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card roundedAbove="sm">
                <BlockStack gap="500">
                  <FormLayout>
                    <FormLayout.Group title="Widget Dimensions & Position">
                      <TextField label="Width (px or %)" name="width" value={width} onChange={setWidth} autoComplete="off" helpText="Enter width with units (e.g., 400px, 90%). Default: 450px." />
                      <TextField label="Height (px or vh)" name="height" value={height} onChange={setHeight} autoComplete="off" helpText="Enter height with units (e.g., 600px, 70vh). Default: 70vh." />
                      <TextField label="Z-index" name="zIndex" type="number" value={zIndex} onChange={setZIndex} autoComplete="off" error={formErrors.zIndex} helpText="Controls stacking order. Higher values appear on top. Default: 9999."/>
                      <ChoiceList title="Position" name="position" choices={positionOptions} selected={Array.isArray(position) ? position : [position]} onChange={(selected) => setPosition(selected)} />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300" padding="400"> {/* Padding for Card content if header is used */}
                    <div style={{display: 'flex', justifyContent: 'space-between', cursor: 'pointer'}} onClick={handleToggleColors}>
                        <PolarisText variant="headingMd" as="h2">Widget Colors</PolarisText>
                        <Button variant="plain" icon={isColorsOpen ? "ChevronUpMinor" : "ChevronDownMinor"} ariaExpanded={isColorsOpen} ariaControls="colors-collapsible" />
                    </div>
                    <Collapsible open={isColorsOpen} id="colors-collapsible">
                        <FormLayout>
                            <PolarisText tone="subdued" as="p" >Enter valid CSS colors (e.g., #RRGGBB, rgba(r,g,b,a), 'red').</PolarisText>
                            <FormLayout.Group>
                                <TextField label="Background Color (Hex)" name="bgColor" value={bgColor} onChange={setBgColor} autoComplete="off" />
                                <TextField label="Text Color (Hex)" name="textColor" value={textColor} onChange={setTextColor} autoComplete="off" />
                                <TextField label="Button Color (Hex)" name="buttonColor" value={buttonColor} onChange={setButtonColor} autoComplete="off" />
                            </FormLayout.Group>
                            <FormLayout.Group title="Header Colors">
                                <TextField label="Header Background Color (Hex)" name="headerBgColor" value={headerBgColor} onChange={setHeaderBgColor} autoComplete="off" />
                                <TextField label="Header Text Color (Hex)" name="headerTextColor" value={headerTextColor} onChange={setHeaderTextColor} autoComplete="off" />
                            </FormLayout.Group>
                            <FormLayout.Group title="Message Colors">
                                <TextField label="User Message Background (Hex)" name="userMsgBgColor" value={userMsgBgColor} onChange={setUserMsgBgColor} autoComplete="off" />
                                <TextField label="User Message Text (Hex)" name="userMsgTextColor" value={userMsgTextColor} onChange={setUserMsgTextColor} autoComplete="off" />
                                <TextField label="Assistant Message Background (Hex)" name="assistantMsgBgColor" value={assistantMsgBgColor} onChange={setAssistantMsgBgColor} autoComplete="off" />
                                <TextField label="Assistant Message Text (Hex)" name="assistantMsgTextColor" value={assistantMsgTextColor} onChange={setAssistantMsgTextColor} autoComplete="off" />
                            </FormLayout.Group>
                        </FormLayout>
                    </Collapsible>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="500">
                <Card roundedAbove="sm">
                    <BlockStack gap="500">
                        <FormLayout>
                            <FormLayout.Group title="Chat Bubble">
                                <Select label="Chat Bubble Icon" name="chatBubbleIcon" options={chatBubbleIconOptions} value={chatBubbleIcon} onChange={handleChatBubbleIconChange} />
                                {chatBubbleIcon === 'custom' && (
                                <TextField
                                  label="Custom Chat Bubble SVG"
                                  name="customChatBubbleSVG"
                                  value={customChatBubbleSVG}
                                  onChange={setCustomChatBubbleSVG}
                                  multiline={4}
                                  autoComplete="off"
                                  helpText="Paste valid SVG code. Ensure it's sized and uses `currentColor` for fill to inherit color."
                                />
                                )}
                                <TextField
                                  label="Chat Bubble Size (px)"
                                  name="chatBubbleSize"
                                  value={chatBubbleSize}
                                  onChange={setChatBubbleSize}
                                  autoComplete="off"
                                  helpText="Size of the chat bubble button (e.g., 60px)."
                                />
                                <TextField label="Chat Bubble Color (Hex)" name="chatBubbleColor" value={chatBubbleColor} onChange={setChatBubbleColor} autoComplete="off" />
                                <TextField label="Assistant Avatar URL" name="avatarUrl" value={avatarUrl} onChange={setAvatarUrl} autoComplete="off" helpText="URL for the assistant's avatar image."/>
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
                <Card roundedAbove="sm">
                    <BlockStack gap="500">
                        <FormLayout>
                            <FormLayout.Group title="Product Display">
                                <Select label="Product Display Mode" name="productDisplayMode" options={productDisplayModeOptions} value={productDisplayMode} onChange={handleProductDisplayModeChange} />
                                <TextField label="Max Products to Display" name="maxProductsToDisplay" type="number" value={maxProductsToDisplay} onChange={setMaxProductsToDisplay} autoComplete="off" error={formErrors.maxProductsToDisplay} />
                                <TextField label="Carousel Item Width (px)" name="carouselItemWidth" value={carouselItemWidth} onChange={setCarouselItemWidth} autoComplete="off" />
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
                 <Card>
                    <BlockStack gap="300" padding="400">
                         <div style={{display: 'flex', justifyContent: 'space-between', cursor: 'pointer'}} onClick={handleToggleAdvanced}>
                            <PolarisText variant="headingMd" as="h2">Advanced Customization</PolarisText>
                            <Button variant="plain" icon={isAdvancedOpen ? "ChevronUpMinor" : "ChevronDownMinor"} ariaExpanded={isAdvancedOpen} ariaControls="advanced-collapsible" />
                        </div>
                        <Collapsible open={isAdvancedOpen} id="advanced-collapsible">
                            <FormLayout>
                                <FormLayout.Group>
                                    <TextField
                                      label="Custom CSS Overrides"
                                      name="customCSS"
                                      value={customCSS}
                                      onChange={setCustomCSS}
                                      multiline={6}
                                      autoComplete="off"
                                      helpText="Apply custom CSS. Prefix selectors with your widget's main class/ID to scope styles. Use with caution."
                                    />
                                </FormLayout.Group>
                            </FormLayout>
                        </Collapsible>
                    </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
          <Layout>
            <Layout.Section>
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 'var(--p-space-400)' }}>
                    <Button submit primary loading={isSubmitting}>
                        Save UI Settings
                    </Button>
                </div>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </RemixForm>
    </Page>
  );
}
                    </FormLayout.Group>
                    <FormLayout.Group title="Header Colors">
                      <TextField label="Header Background Color (Hex)" name="headerBgColor" value={headerBgColor} onChange={setHeaderBgColor} autoComplete="off" />
                      <TextField label="Header Text Color (Hex)" name="headerTextColor" value={headerTextColor} onChange={setHeaderTextColor} autoComplete="off" />
                    </FormLayout.Group>
                    <FormLayout.Group title="Message Colors">
                      <TextField label="User Message Background (Hex)" name="userMsgBgColor" value={userMsgBgColor} onChange={setUserMsgBgColor} autoComplete="off" />
                      <TextField label="User Message Text (Hex)" name="userMsgTextColor" value={userMsgTextColor} onChange={setUserMsgTextColor} autoComplete="off" />
                      <TextField label="Assistant Message Background (Hex)" name="assistantMsgBgColor" value={assistantMsgBgColor} onChange={setAssistantMsgBgColor} autoComplete="off" />
                      <TextField label="Assistant Message Text (Hex)" name="assistantMsgTextColor" value={assistantMsgTextColor} onChange={setAssistantMsgTextColor} autoComplete="off" />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="500">
                <Card roundedAbove="sm">
                    <BlockStack gap="500">
                        <FormLayout>
                            <FormLayout.Group title="Chat Bubble">
                                <Select label="Chat Bubble Icon" name="chatBubbleIcon" options={chatBubbleIconOptions} value={chatBubbleIcon} onChange={handleChatBubbleIconChange} />
                                {chatBubbleIcon === 'custom' && (
                                <TextField label="Custom Chat Bubble SVG" name="customChatBubbleSVG" value={customChatBubbleSVG} onChange={setCustomChatBubbleSVG} multiline={4} autoComplete="off" />
                                )}
                                <TextField label="Chat Bubble Size (px)" name="chatBubbleSize" value={chatBubbleSize} onChange={setChatBubbleSize} autoComplete="off" />
                                <TextField label="Chat Bubble Color (Hex)" name="chatBubbleColor" value={chatBubbleColor} onChange={setChatBubbleColor} autoComplete="off" />
                                <TextField label="Assistant Avatar URL" name="avatarUrl" value={avatarUrl} onChange={setAvatarUrl} autoComplete="off" helpText="URL for the assistant's avatar image."/>
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
                <Card roundedAbove="sm">
                    <BlockStack gap="500">
                        <FormLayout>
                            <FormLayout.Group title="Product Display">
                                <Select label="Product Display Mode" name="productDisplayMode" options={productDisplayModeOptions} value={productDisplayMode} onChange={handleProductDisplayModeChange} />
                                <TextField label="Max Products to Display" name="maxProductsToDisplay" type="number" value={maxProductsToDisplay} onChange={setMaxProductsToDisplay} autoComplete="off" error={formErrors.maxProductsToDisplay} />
                                <TextField label="Carousel Item Width (px)" name="carouselItemWidth" value={carouselItemWidth} onChange={setCarouselItemWidth} autoComplete="off" />
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
                 <Card roundedAbove="sm">
                    <BlockStack gap="500">
                        <FormLayout>
                            <FormLayout.Group title="Advanced Customization">
                                <TextField label="Custom CSS Overrides" name="customCSS" value={customCSS} onChange={setCustomCSS} multiline={6} autoComplete="off" helpText="Apply custom styles to the chat widget." />
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
          <Layout>
            <Layout.Section>
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBlockStart: 'var(--p-space-400)' }}>
                    <Button submit primary loading={isSubmitting}>
                        Save UI Settings
                    </Button>
                </div>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </RemixForm>
    </Page>
  );
}
