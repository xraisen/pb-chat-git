import { useState, useCallback, useEffect } from 'react'; 
import {
  Page, Layout, Card, FormLayout, TextField, Select, Button, BlockStack, ChoiceList, Banner, Collapsible, Icon, LegacyStack, Tooltip, Text as PolarisText, DropZone, Thumbnail
} from '@shopify/polaris';
import { TitleBar } from "@shopify/app-bridge-react";
import { Form as RemixForm, useLoaderData, useActionData, useNavigation, json, useSubmit, useFetcher } from "@remix-run/react"; // Added useFetcher
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
  const operation = formData.get("_action"); // Used for removeAvatar

  if (operation === "removeAvatar") {
    try {
      await updateShopChatbotConfig(shop, { avatarUrl: null });
      // It's important to also clear any potential file upload fields if they were part of this form submission.
      // For now, just returning success. The client will need to update its preview.
      return json({ success: true, message: "Avatar removed.", anActionTookPlace: true }); 
    } catch (error) {
      console.error("Failed to remove avatar:", error);
      return json({ errors: { general: "Failed to remove avatar." } }, { status: 500 });
    }
  }

  // This is for the main form save. Avatar URL is handled by dedicated upload/remove actions.
  const settingsData = { 
    // avatarUrl is NOT part of the main form submission data anymore.
    // It's updated via the dedicated upload API or the removeAvatar action.
    // The main save action here could potentially save the existing avatarUrl if no new file is staged.
    // For now, it will re-save whatever is in the `avatarUrl` hidden field or state.
    // This part needs to be coordinated with the actual file upload process.
    // Let's assume avatarUrl is part of the main form data for now if it's a text field.
    // Since we are moving to DropZone, the main form save will not directly handle avatarUrl from a text field.
    // It will be set by a dedicated upload process or by the remove action.
    // The `avatarUrl` field on `settingsData` should reflect the URL *after* an upload or removal.
    // For now, we'll keep it simple: the main form saves all text-based fields.
    // `avatarUrl` will be updated by a separate mechanism (upload API or remove action).
    // We can still pass formData.get("avatarUrl") if we add a hidden input field updated by client state.

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
    // avatarUrl: formData.get("avatarUrl"), // Removed from main form data; handled by dedicated actions
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
  
  // Avatar State
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(initialSettings.avatarUrl || null);
  const [uploadError, setUploadError] = useState(null);
  // const [isRemovingAvatar, setIsRemovingAvatar] = useState(false); // Replaced by fetcher state
  const submit = useSubmit(); 
  const avatarUploadFetcher = useFetcher();
  const removeAvatarFetcher = useFetcher(); // Separate fetcher for remove action

  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [uploadStatusTone, setUploadStatusTone] = useState('info');


  // State for Collapsible sections
  const [isColorsOpen, setIsColorsOpen] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [systemPromptHelpModalOpen, setSystemPromptHelpModalOpen] = useState(false);


  const handleToggleColors = useCallback(() => setIsColorsOpen((open) => !open), []);
  const handleToggleAdvanced = useCallback(() => setIsAdvancedOpen((open) => !open), []);
  const toggleSystemPromptHelpModal = useCallback(() => setSystemPromptHelpModalOpen((active) => !active), []);
  
  // Sync avatarUrl from loader to both avatarUrl state and avatarPreviewUrl state
  useEffect(() => {
    setAvatarUrl(initialSettings.avatarUrl || ""); // Update the main avatarUrl state for the form
    setAvatarPreviewUrl(initialSettings.avatarUrl || null); // Update preview
  }, [initialSettings.avatarUrl]);

  // Handle avatar upload fetcher state
  useEffect(() => {
    if (avatarUploadFetcher.state === 'idle' && avatarUploadFetcher.data) {
      if (avatarUploadFetcher.data.success) {
        setUploadStatusMessage(avatarUploadFetcher.data.message || "Avatar uploaded successfully!");
        setUploadStatusTone("success");
        setAvatarUrl(avatarUploadFetcher.data.avatarUrl); // Update main avatarUrl state
        setAvatarPreviewUrl(avatarUploadFetcher.data.avatarUrl); 
        setAvatarFile(null); 
      } else {
        setUploadStatusMessage(avatarUploadFetcher.data.error || "Upload failed. Please try again.");
        setUploadStatusTone("critical");
      }
    } else if (avatarUploadFetcher.state === 'submitting' || avatarUploadFetcher.state === 'loading') {
      setUploadStatusMessage("Uploading avatar...");
      setUploadStatusTone("info");
    }
  }, [avatarUploadFetcher.state, avatarUploadFetcher.data, setAvatarUrl]);
  
  // Handle remove avatar fetcher state
   useEffect(() => {
    if (removeAvatarFetcher.state === 'idle' && removeAvatarFetcher.data) {
      if (removeAvatarFetcher.data.success) {
        setUploadStatusMessage(removeAvatarFetcher.data.message || "Avatar removed.");
        setUploadStatusTone("success");
        setAvatarUrl(""); // Clear main avatarUrl state
        setAvatarPreviewUrl(null);
        setAvatarFile(null);
      } else {
        setUploadStatusMessage(removeAvatarFetcher.data.error || "Failed to remove avatar.");
        setUploadStatusTone("critical");
      }
    }
  }, [removeAvatarFetcher.state, removeAvatarFetcher.data, setAvatarUrl]);


  const handleAvatarDrop = useCallback(
    (_droppedFiles, acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        setUploadError(`File rejected: ${rejectedFiles[0].errors[0].message}. Please use a valid image (PNG, JPG, GIF) under 1MB.`);
        setAvatarFile(null);
        // Do not clear avatarPreviewUrl here, user might want to keep existing if new upload fails
        return;
      }
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setAvatarFile(file); // This file should be uploaded on main form submit or dedicated button
        setAvatarPreviewUrl(URL.createObjectURL(file)); 
        setUploadError(null);
        // To include this in the main form submit, we'd need to use a file input or FormData append.
        // For now, this state is for preview. Real upload is next step.
      }
    },
    [],
  );

  const handleRemoveAvatar = useCallback(() => {
    if (!confirm("Are you sure you want to remove the avatar?")) return;
    const formData = new FormData();
    formData.append("_action", "removeAvatar");
    removeAvatarFetcher.submit(formData, { method: "post", action: "/app/settings/ui" }); // Submit to page's action
    setAvatarFile(null); // Clear any staged file immediately
  }, [removeAvatarFetcher]);

  const handleAvatarUpload = useCallback(async () => {
    if (!avatarFile) {
      setUploadError("No file selected to upload.");
      setUploadStatusMessage("No file selected.");
      setUploadStatusTone("warning");
      return;
    }
    
    setUploadStatusMessage("Uploading avatar...");
    setUploadStatusTone("info");
    setUploadError(null);

    const uploadFormData = new FormData();
    uploadFormData.append("avatarFile", avatarFile);

    avatarUploadFetcher.submit(uploadFormData, {
      method: "post",
      encType: "multipart/form-data",
      action: "/api/upload-avatar", 
    });
  }, [avatarFile, avatarUploadFetcher]);


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
                       <div style={{ marginTop: 'var(--p-space-200)' }}> {/* Adjust spacing as needed */}
                         <Button onClick={toggleSystemPromptHelpModal} variant="plain" size="slim">
                           Learn more about system prompts
                         </Button>
                       </div>
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
                                {/* Avatar URL TextField is removed in favor of DropZone */}
                            </FormLayout.Group>
                        </FormLayout>
                    </BlockStack>
                </Card>
                 <Card title="Chatbot Avatar">
                  <BlockStack gap="400" padding="400">
                    <DropZone 
                        label="Avatar Image" 
                        onDrop={handleAvatarDrop}
                        accept="image/jpeg, image/png, image/gif"
                        type="image"
                        maxSize={1024 * 1024} // 1MB
                    >
                      {avatarFile ? (
                        <LegacyStack vertical alignment="center" spacing="tight">
                          <Thumbnail size="large" alt={avatarFile.name} source={avatarPreviewUrl} />
                          <PolarisText variant="bodySm" as="p">File: {avatarFile.name} ({(avatarFile.size / 1024).toFixed(2)} KB)</PolarisText>
                          <Button variant="plain" onClick={() => { setAvatarFile(null); setAvatarPreviewUrl(initialSettings.avatarUrl || null); /* Reset to original or clear if no original */ }}>Clear selection</Button>
                        </LegacyStack>
                      ) : avatarPreviewUrl ? (
                        <LegacyStack vertical alignment="center" spacing="tight">
                          <Thumbnail size="large" alt="Current Avatar" source={avatarPreviewUrl} />
                           <PolarisText variant="bodySm" as="p">Current avatar. Upload a new file to change or remove.</PolarisText>
                        </LegacyStack>
                      ) : (
                        <DropZone.FileUpload actionHint="Accepts .png, .gif, .jpg. Max 1MB." />
                      )}
                    </DropZone>
                    {uploadError && (
                      <Banner title="Upload Error" tone="critical" onDismiss={() => setUploadError(null)}>
                        <p>{uploadError}</p>
                      </Banner>
                    )}
                    {/* <input type="hidden" name="avatarUrl" value={avatarUrl || ""} /> Removed, avatarUrl is not part of main form save */}
                    
                    <LegacyStack distribution="trailing" spacing="tight">
                       {avatarPreviewUrl && (
                        <Button 
                          onClick={handleRemoveAvatar} 
                          destructive 
                          loading={removeAvatarFetcher.state === "submitting"}
                        >
                          Remove Avatar
                        </Button>
                       )}
                       <Button 
                         primary 
                         onClick={handleAvatarUpload} 
                         loading={avatarUploadFetcher.state === "submitting"}
                         disabled={!avatarFile}
                       >
                         Upload Selected Avatar
                       </Button>
                    </LegacyStack>
                     {uploadStatusMessage && (
                      <div style={{ marginTop: '1rem', width: '100%' }}>
                        <Banner title="Avatar Upload Status" tone={uploadStatusTone} onDismiss={() => setUploadStatusMessage('')}>
                          <p>{uploadStatusMessage}</p>
                        </Banner>
                      </div>
                    )}
                  </BlockStack>
                </Card>
                <Card roundedAbove="sm">
                    <BlockStack gap="500"> {/* This Card already has padding="400" via BlockStack in its definition */}
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
      <SystemPromptHelpModal active={systemPromptHelpModalOpen} onClose={toggleSystemPromptHelpModal} />
    </Page>
  );
}

const SystemPromptHelpModal = ({ active, onClose }) => (
  <Modal
    open={active}
    onClose={onClose}
    title="Understanding System Prompts"
    primaryAction={{ content: 'Got it!', onAction: onClose }}
  >
    <Modal.Section>
      <BlockStack gap="400">
        <PolarisText as="p">
          The system prompt is a crucial piece of instruction you provide to the AI to guide its personality, tone, aversions, and overall behavior. It sets the context for the entire conversation.
        </PolarisText>
        <PolarisText as="h3" variant="headingSm">Key Considerations:</PolarisText>
        <ul style={{margin: '0 var(--p-space-400)', paddingLeft: 'var(--p-space-400)'}}>
          <li><strong>Clarity and Specificity:</strong> Be as clear and specific as possible. Ambiguous instructions can lead to unpredictable AI responses.</li>
          <li><strong>Persona Definition:</strong> Define the persona you want the AI to adopt (e.g., "You are a friendly and helpful store assistant named Sparky.").</li>
          <li><strong>Tone of Voice:</strong> Specify the desired tone (e.g., "Your tone should be enthusiastic and positive.").</li>
          <li><strong>Task and Goals:</strong> Outline what the AI should primarily help users with (e.g., "Your main goal is to help users find products and answer questions about our store.").</li>
          <li><strong>Constraints/Aversions:</strong> Specify what the AI should avoid doing or saying (e.g., "Do not make up product information. If you don't know an answer, say so politely.").</li>
          <li><strong>Formatting (Optional):</strong> You can sometimes suggest how the AI should format its responses, like using bullet points for lists.</li>
        </ul>
        <PolarisText as="h3" variant="headingSm">Example Snippet (for a helpful clothing store assistant):</PolarisText>
        <PolarisText as="p" tone="subdued">
          "You are a cheerful and knowledgeable fashion advisor for 'Chic Boutique'. Your goal is to help users discover items they'll love, provide styling tips, and answer questions about materials, fit, and shipping. Always maintain a positive and encouraging tone. Do not discuss competitor pricing. If a product is out of stock, suggest similar alternatives."
        </PolarisText>
        <PolarisText as="p">
          When you select "Custom" from the dropdown, you can write your own detailed prompt in the text area that appears. Experiment to find what works best for your brand!
        </PolarisText>
      </BlockStack>
    </Modal.Section>
  </Modal>
);
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
