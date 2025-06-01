import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useSubmit, useActionData, useNavigate } from "@remix-run/react";
import {
  Page, Card, Layout, Button, Banner, Frame, TextField, Select, Checkbox, Text,
  BlockStack, InlineStack, RangeSlider, FormLayout, EmptyState, Box
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getChatbotConfig, saveChatbotConfig } from "../services/chatbotConfig.server.js";
import { defaultChatbotConfig } from "../services/chatbotConfig.defaults.js";
import { useEffect, useState, useCallback, useRef } from "react";
import promptsDataFromFile from "../../prompts/prompts.json"; // Import prompts

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;
  let loaderErrorMsg = null;

  if (!shopId) {
    console.error("loader: shopId is missing from session.");
    loaderErrorMsg = "Unauthorized. Shop ID is missing.";
    // Return minimal data structure consistent with successful load
    return json({
        config: defaultChatbotConfig,
        shopId: null,
        apiKey: process.env.SHOPIFY_API_KEY || "",
        promptOptions: [{ label: "Standard Assistant (Error)", value: "standardAssistant" }],
        loaderErrorMsg
    }, { status: 401 });
  }

  let config = defaultChatbotConfig; // Initialize with defaults
  try {
    config = await getChatbotConfig(shopId);
  } catch (dbError) {
    console.error(`Error in loader fetching config for shop ${shopId}:`, dbError);
    loaderErrorMsg = "Error fetching configuration from database. Displaying defaults.";
    // config remains defaultChatbotConfig
  }

  let promptOptions = [];
  try {
      promptOptions = Object.keys(promptsDataFromFile).map(key => ({
          label: promptsDataFromFile[key].name || key,
          value: key
      }));
      if (promptOptions.length === 0) { // Fallback if JSON was empty
           promptOptions = [{ label: "Standard Assistant (Default)", value: "standardAssistant" }];
           if (!loaderErrorMsg) loaderErrorMsg = "Prompts data is empty. Using fallback prompt options.";
      }
  } catch (error) {
      console.error("Failed to process prompts data (imported):", error);
      promptOptions = [{ label: "Standard Assistant (Default)", value: "standardAssistant" }];
      if (!loaderErrorMsg) loaderErrorMsg = "Error loading prompt options. Using fallback prompt options.";
  }

  return json({
    config,
    shopId,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    promptOptions,
    loaderErrorMsg // Pass error message to component
  });
}

function getNestedValue(obj, pathString) {
    const parts = pathString.split('.');
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    return current;
}

function isBooleanField(path, configObject = defaultChatbotConfig) {
    const val = getNestedValue(configObject, path);
    return typeof val === 'boolean';
}

function isNumberField(path, configObject = defaultChatbotConfig) {
    const val = getNestedValue(configObject, path);
    return typeof val === 'number';
}

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}


export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;

  if (!shopId) {
    console.error("action: shopId is missing from session.");
    return json({ error: "Unauthorized operation. Shop ID is missing." }, { status: 401 });
  }

  const formData = await request.formData();
  const rawUpdates = Object.fromEntries(formData);

  const updates = {};
  for (const key in rawUpdates) {
    if (key.startsWith('$ACTION_ID_')) continue;
    const parts = key.split('.');
    let currentLevel = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      currentLevel[parts[i]] = currentLevel[parts[i]] || {};
      currentLevel = currentLevel[parts[i]];
    }
    const finalKey = parts[parts.length - 1];
    const rawValue = rawUpdates[key];

    if (isBooleanField(key, defaultChatbotConfig)) {
      currentLevel[finalKey] = formData.has(key) && rawValue === 'on';
    } else if (isNumberField(key, defaultChatbotConfig)) {
      const num = parseFloat(rawValue);
      currentLevel[finalKey] = isNaN(num) ? getNestedValue(defaultChatbotConfig, key) : num;
    } else {
      currentLevel[finalKey] = rawValue;
    }
  }

  function setMissingBooleans(targetUpdates, referenceConfig, currentPathParts = []) {
    Object.keys(referenceConfig).forEach(key => {
      const newPathParts = [...currentPathParts, key];
      if (isObject(referenceConfig[key])) {
        let currentTargetLevel = targetUpdates;
        for(let i=0; i < newPathParts.length -1; ++i) {
            currentTargetLevel = currentTargetLevel[newPathParts[i]];
            if (!currentTargetLevel) break;
        }
        if(currentTargetLevel && !currentTargetLevel[key]) currentTargetLevel[key] = {};
        if(currentTargetLevel && currentTargetLevel[key]) {
             setMissingBooleans(currentTargetLevel[key], referenceConfig[key], []);
        }
      } else if (typeof referenceConfig[key] === 'boolean') {
        let valueInUpdates = targetUpdates;
        let pathExists = true;
        for(const part of newPathParts.slice(currentPathParts.length)) {
            if(valueInUpdates && part in valueInUpdates) {
                valueInUpdates = valueInUpdates[part];
            } else { pathExists = false; break; }
        }
        if (!pathExists) {
            let currentTargetLevel = targetUpdates;
            for(let i=0; i < newPathParts.length -1; ++i) {
                const part = newPathParts[i];
                currentTargetLevel[part] = currentTargetLevel[part] || {};
                currentTargetLevel = currentTargetLevel[part];
            }
            currentTargetLevel[newPathParts[newPathParts.length-1]] = false;
        }
      }
    });
  }
  setMissingBooleans(updates, defaultChatbotConfig);

  const jsonFields = ['functionality.multiStepDialogs', 'userExperience.customInteractiveButtons'];
  for (const path of jsonFields) {
    const parts = path.split('.');
    let current = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current || !current[parts[i]]) { current = null; break; }
      current = current[parts[i]];
    }
    if (current) {
        const finalKey = parts[parts.length - 1];
        const stringValue = current[finalKey];
        if (typeof stringValue === 'string' && stringValue.trim() !== '') {
          try { current[finalKey] = JSON.parse(stringValue); }
          catch (e) { return json({ error: `Invalid JSON for ${path}.` }, { status: 400 }); }
        } else if (typeof stringValue === 'undefined' || stringValue.trim() === '') {
          current[finalKey] = [];
        }
    } else {
        let createPath = updates;
        for(let i=0; i < parts.length -1; ++i) {
            createPath[parts[i]] = createPath[parts[i]] || {};
            createPath = createPath[parts[i]];
        }
        createPath[parts[parts.length-1]] = [];
    }
  }

  try {
    const saved = await saveChatbotConfig(shopId, updates);
    if (saved) {
      return redirect("/app/chatbot-settings"); // Let success banner show from loader data after redirect
    } else {
      return json({ error: "Failed to save settings due to a server error." }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in action saving config:", error);
    return json({ error: "An unexpected error occurred while saving settings." }, { status: 500 });
  }
}

export default function ChatbotSettingsPage() {
  const { config: initialConfig, shopId, apiKey, promptOptions, error: loaderErrorMsg } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const formRef = useRef(null);
  const navigate = useNavigate();

  const getInitial = (path, defaultValue = '') => getNestedValue(initialConfig, path) ?? defaultValue;
  const getInitialBoolean = (path, defaultValue = false) => getNestedValue(initialConfig, path) ?? defaultValue;
  const getInitialJsonString = (path, defaultValue = []) => JSON.stringify(getNestedValue(initialConfig, path) ?? defaultValue, null, 2);

  const [chatboxBackgroundColor, setChatboxBackgroundColor] = useState(getInitial('appearance.chatboxBackgroundColor'));
  const [chatboxBorderColor, setChatboxBorderColor] = useState(getInitial('appearance.chatboxBorderColor'));
  const [chatboxBorderRadius, setChatboxBorderRadius] = useState(getInitial('appearance.chatboxBorderRadius'));
  const [fontFamily, setFontFamily] = useState(getInitial('appearance.fontFamily'));
  const [fontSize, setFontSize] = useState(getInitial('appearance.fontSize'));
  const [chatboxBackgroundOpacity, setChatboxBackgroundOpacity] = useState(getInitial('appearance.chatboxBackgroundOpacity'));
  const [userBubbleColor, setUserBubbleColor] = useState(getInitial('appearance.userBubbleColor'));
  const [botBubbleColor, setBotBubbleColor] = useState(getInitial('appearance.botBubbleColor'));
  const [customLogoUrl, setCustomLogoUrl] = useState(getInitial('appearance.customLogoUrl'));
  const [brandAccentColor, setBrandAccentColor] = useState(getInitial('appearance.brandAccentColor'));
  const [inputFieldBackgroundColor, setInputFieldBackgroundColor] = useState(getInitial('appearance.inputFieldBackgroundColor'));
  const [inputFieldTextColor, setInputFieldTextColor] = useState(getInitial('appearance.inputFieldTextColor'));
  const [sendButtonStyle, setSendButtonStyle] = useState(getInitial('appearance.sendButtonStyle'));
  const [sendButtonHoverColor, setSendButtonHoverColor] = useState(getInitial('appearance.sendButtonHoverColor'));
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(getInitial('appearance.customBackgroundUrl'));
  const [fontWeight, setFontWeight] = useState(getInitial('appearance.fontWeight'));

  const [screenPosition, setScreenPosition] = useState(getInitial('positioning.screenPosition'));
  const [isFixed, setIsFixed] = useState(getInitialBoolean('positioning.isFixed'));
  const [popupTrigger, setPopupTrigger] = useState(getInitial('positioning.popupTrigger'));
  const [popupDelaySeconds, setPopupDelaySeconds] = useState(getInitial('positioning.popupDelaySeconds'));

  const [chatbotName, setChatbotName] = useState(getInitial('functionality.chatbotName'));
  const [defaultGreetingMessage, setDefaultGreetingMessage] = useState(getInitial('functionality.defaultGreetingMessage'));
  const [fallbackMessage, setFallbackMessage] = useState(getInitial('functionality.fallbackMessage'));
  const [multiStepDialogs, setMultiStepDialogs] = useState(getInitialJsonString('functionality.multiStepDialogs'));
  const [conversationTimeoutSeconds, setConversationTimeoutSeconds] = useState(getInitial('functionality.conversationTimeoutSeconds'));
  const [idleMessage, setIdleMessage] = useState(getInitial('functionality.idleMessage'));
  const [functionalitySystemPrompt, setFunctionalitySystemPrompt] = useState(getInitial('functionality.systemPrompt', defaultChatbotConfig.functionality.systemPrompt));

  const [selectedAPI, setSelectedAPI] = useState(getInitial('apiManagement.selectedAPI'));
  const [claudeAPIKey, setClaudeAPIKey] = useState(getInitial('apiManagement.claudeAPIKey'));
  const [geminiAPIKey, setGeminiAPIKey] = useState(getInitial('apiManagement.geminiAPIKey'));
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState(getInitial('apiManagement.shopifyStoreUrl'));
  const [shopifyAccessToken, setShopifyAccessToken] = useState(getInitial('apiManagement.shopifyAccessToken'));

  const [avatarImageUrl, setAvatarImageUrl] = useState(getInitial('avatar.avatarImageUrl'));
  const [avatarShape, setAvatarShape] = useState(getInitial('avatar.avatarShape'));
  const [avatarBorderColor, setAvatarBorderColor] = useState(getInitial('avatar.avatarBorderColor'));
  const [avatarBorderSize, setAvatarBorderSize] = useState(getInitial('avatar.avatarBorderSize'));

  const [speechToTextEnabled, setSpeechToTextEnabled] = useState(getInitialBoolean('userExperience.speechToTextEnabled'));
  const [textToSpeechEnabled, setTextToSpeechEnabled] = useState(getInitialBoolean('userExperience.textToSpeechEnabled'));
  const [customInteractiveButtons, setCustomInteractiveButtons] = useState(getInitialJsonString('userExperience.customInteractiveButtons'));
  const [formValidationEnabled, setFormValidationEnabled] = useState(getInitialBoolean('userExperience.formValidationEnabled'));
  const [showTypingIndicator, setShowTypingIndicator] = useState(getInitialBoolean('userExperience.showTypingIndicator'));

  const [endToEndEncryptionEnabled, setEndToEndEncryptionEnabled] = useState(getInitialBoolean('securityPrivacy.endToEndEncryptionEnabled'));
  const [gdprCompliant, setGdprCompliant] = useState(getInitialBoolean('securityPrivacy.gdprCompliant'));
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(getInitial('securityPrivacy.sessionTimeoutMinutes'));
  const [dataRetentionPolicyDays, setDataRetentionPolicyDays] = useState(getInitial('securityPrivacy.dataRetentionPolicyDays'));

  const [displayFormat, setDisplayFormat] = useState(getInitial('productDisplay.displayFormat'));
  const [productImageSize, setProductImageSize] = useState(getInitial('productDisplay.productImageSize'));
  const [productsPerRow, setProductsPerRow] = useState(getInitial('productDisplay.productsPerRow'));
  const [showPrice, setShowPrice] = useState(getInitialBoolean('productDisplay.showPrice'));
  const [showName, setShowName] = useState(getInitialBoolean('productDisplay.showName'));
  const [showDescription, setShowDescription] = useState(getInitialBoolean('productDisplay.showDescription'));
  const [defaultSortOrder, setDefaultSortOrder] = useState(getInitial('productDisplay.defaultSortOrder'));
  const [addToCartButtonEnabled, setAddToCartButtonEnabled] = useState(getInitialBoolean('productDisplay.addToCartButtonEnabled'));

  const [trackAddToCart, setTrackAddToCart] = useState(getInitialBoolean('analytics.trackAddToCart'));
  const [trackCheckoutInitiation, setTrackCheckoutInitiation] = useState(getInitialBoolean('analytics.trackCheckoutInitiation'));
  const [trackProductInteractions, setTrackProductInteractions] = useState(getInitialBoolean('analytics.trackProductInteractions'));
  const [trackCartAbandonment, setTrackCartAbandonment] = useState(getInitialBoolean('analytics.trackCartAbandonment'));
  const [trackConversionRates, setTrackConversionRates] = useState(getInitialBoolean('analytics.trackConversionRates'));
  const [trackUserFeedback, setTrackUserFeedback] = useState(getInitialBoolean('analytics.trackUserFeedback'));

  useEffect(() => {
    setChatboxBackgroundColor(getInitial('appearance.chatboxBackgroundColor'));
    setChatboxBorderColor(getInitial('appearance.chatboxBorderColor'));
    setChatboxBorderRadius(getInitial('appearance.chatboxBorderRadius'));
    setFontFamily(getInitial('appearance.fontFamily'));
    setFontSize(getInitial('appearance.fontSize'));
    setChatboxBackgroundOpacity(getInitial('appearance.chatboxBackgroundOpacity'));
    setUserBubbleColor(getInitial('appearance.userBubbleColor'));
    setBotBubbleColor(getInitial('appearance.botBubbleColor'));
    setCustomLogoUrl(getInitial('appearance.customLogoUrl'));
    setBrandAccentColor(getInitial('appearance.brandAccentColor'));
    setInputFieldBackgroundColor(getInitial('appearance.inputFieldBackgroundColor'));
    setInputFieldTextColor(getInitial('appearance.inputFieldTextColor'));
    setSendButtonStyle(getInitial('appearance.sendButtonStyle'));
    setSendButtonHoverColor(getInitial('appearance.sendButtonHoverColor'));
    setCustomBackgroundUrl(getInitial('appearance.customBackgroundUrl'));
    setFontWeight(getInitial('appearance.fontWeight'));
    setScreenPosition(getInitial('positioning.screenPosition'));
    setIsFixed(getInitialBoolean('positioning.isFixed'));
    setPopupTrigger(getInitial('positioning.popupTrigger'));
    setPopupDelaySeconds(getInitial('positioning.popupDelaySeconds'));
    setChatbotName(getInitial('functionality.chatbotName'));
    setDefaultGreetingMessage(getInitial('functionality.defaultGreetingMessage'));
    setFallbackMessage(getInitial('functionality.fallbackMessage'));
    setMultiStepDialogs(getInitialJsonString('functionality.multiStepDialogs'));
    setConversationTimeoutSeconds(getInitial('functionality.conversationTimeoutSeconds'));
    setIdleMessage(getInitial('functionality.idleMessage'));
    setFunctionalitySystemPrompt(getInitial('functionality.systemPrompt', defaultChatbotConfig.functionality.systemPrompt));
    setSelectedAPI(getInitial('apiManagement.selectedAPI'));
    setClaudeAPIKey(getInitial('apiManagement.claudeAPIKey'));
    setGeminiAPIKey(getInitial('apiManagement.geminiAPIKey'));
    setShopifyStoreUrl(getInitial('apiManagement.shopifyStoreUrl'));
    setShopifyAccessToken(getInitial('apiManagement.shopifyAccessToken'));
    setAvatarImageUrl(getInitial('avatar.avatarImageUrl'));
    setAvatarShape(getInitial('avatar.avatarShape'));
    setAvatarBorderColor(getInitial('avatar.avatarBorderColor'));
    setAvatarBorderSize(getInitial('avatar.avatarBorderSize'));
    setSpeechToTextEnabled(getInitialBoolean('userExperience.speechToTextEnabled'));
    setTextToSpeechEnabled(getInitialBoolean('userExperience.textToSpeechEnabled'));
    setCustomInteractiveButtons(getInitialJsonString('userExperience.customInteractiveButtons'));
    setFormValidationEnabled(getInitialBoolean('userExperience.formValidationEnabled'));
    setShowTypingIndicator(getInitialBoolean('userExperience.showTypingIndicator'));
    setEndToEndEncryptionEnabled(getInitialBoolean('securityPrivacy.endToEndEncryptionEnabled'));
    setGdprCompliant(getInitialBoolean('securityPrivacy.gdprCompliant'));
    setSessionTimeoutMinutes(getInitial('securityPrivacy.sessionTimeoutMinutes'));
    setDataRetentionPolicyDays(getInitial('securityPrivacy.dataRetentionPolicyDays'));
    setDisplayFormat(getInitial('productDisplay.displayFormat'));
    setProductImageSize(getInitial('productDisplay.productImageSize'));
    setProductsPerRow(getInitial('productDisplay.productsPerRow'));
    setShowPrice(getInitialBoolean('productDisplay.showPrice'));
    setShowName(getInitialBoolean('productDisplay.showName'));
    setShowDescription(getInitialBoolean('productDisplay.showDescription'));
    setDefaultSortOrder(getInitial('productDisplay.defaultSortOrder'));
    setAddToCartButtonEnabled(getInitialBoolean('productDisplay.addToCartButtonEnabled'));
    setTrackAddToCart(getInitialBoolean('analytics.trackAddToCart'));
    setTrackCheckoutInitiation(getInitialBoolean('analytics.trackCheckoutInitiation'));
    setTrackProductInteractions(getInitialBoolean('analytics.trackProductInteractions'));
    setTrackCartAbandonment(getInitialBoolean('analytics.trackCartAbandonment'));
    setTrackConversionRates(getInitialBoolean('analytics.trackConversionRates'));
    setTrackUserFeedback(getInitialBoolean('analytics.trackUserFeedback'));
  }, [initialConfig]);

  const handleSave = useCallback(() => {
    const submissionData = {
      'appearance.chatboxBackgroundColor': chatboxBackgroundColor,
      'appearance.chatboxBorderColor': chatboxBorderColor,
      'appearance.chatboxBorderRadius': chatboxBorderRadius,
      'appearance.fontFamily': fontFamily,
      'appearance.fontSize': fontSize,
      'appearance.fontWeight': fontWeight,
      'appearance.chatboxBackgroundOpacity': String(chatboxBackgroundOpacity),
      'appearance.userBubbleColor': userBubbleColor,
      'appearance.botBubbleColor': botBubbleColor,
      'appearance.inputFieldBackgroundColor': inputFieldBackgroundColor,
      'appearance.inputFieldTextColor': inputFieldTextColor,
      'appearance.sendButtonStyle': sendButtonStyle,
      'appearance.sendButtonHoverColor': sendButtonHoverColor,
      'appearance.customLogoUrl': customLogoUrl,
      'appearance.customBackgroundUrl': customBackgroundUrl,
      'appearance.brandAccentColor': brandAccentColor,
      'positioning.screenPosition': screenPosition,
      'positioning.isFixed': isFixed ? 'on' : '',
      'positioning.popupTrigger': popupTrigger,
      'positioning.popupDelaySeconds': String(popupDelaySeconds),
      'functionality.chatbotName': chatbotName,
      'functionality.defaultGreetingMessage': defaultGreetingMessage,
      'functionality.fallbackMessage': fallbackMessage,
      'functionality.multiStepDialogs': multiStepDialogs,
      'functionality.conversationTimeoutSeconds': String(conversationTimeoutSeconds),
      'functionality.idleMessage': idleMessage,
      'functionality.systemPrompt': functionalitySystemPrompt,
      'apiManagement.selectedAPI': selectedAPI,
      'apiManagement.claudeAPIKey': claudeAPIKey,
      'apiManagement.geminiAPIKey': geminiAPIKey,
      'apiManagement.shopifyStoreUrl': shopifyStoreUrl,
      'apiManagement.shopifyAccessToken': shopifyAccessToken,
      'avatar.avatarImageUrl': avatarImageUrl,
      'avatar.avatarShape': avatarShape,
      'avatar.avatarBorderColor': avatarBorderColor,
      'avatar.avatarBorderSize': avatarBorderSize,
      'userExperience.speechToTextEnabled': speechToTextEnabled ? 'on' : '',
      'userExperience.textToSpeechEnabled': textToSpeechEnabled ? 'on' : '',
      'userExperience.customInteractiveButtons': customInteractiveButtons,
      'userExperience.formValidationEnabled': formValidationEnabled ? 'on' : '',
      'userExperience.showTypingIndicator': showTypingIndicator ? 'on' : '',
      'securityPrivacy.endToEndEncryptionEnabled': endToEndEncryptionEnabled ? 'on' : '',
      'securityPrivacy.gdprCompliant': gdprCompliant ? 'on' : '',
      'securityPrivacy.sessionTimeoutMinutes': String(sessionTimeoutMinutes),
      'securityPrivacy.dataRetentionPolicyDays': String(dataRetentionPolicyDays),
      'productDisplay.displayFormat': displayFormat,
      'productDisplay.productImageSize': productImageSize,
      'productDisplay.productsPerRow': String(productsPerRow),
      'productDisplay.showPrice': showPrice ? 'on' : '',
      'productDisplay.showName': showName ? 'on' : '',
      'productDisplay.showDescription': showDescription ? 'on' : '',
      'productDisplay.defaultSortOrder': defaultSortOrder,
      'productDisplay.addToCartButtonEnabled': addToCartButtonEnabled ? 'on' : '',
      'analytics.trackAddToCart': trackAddToCart ? 'on' : '',
      'analytics.trackCheckoutInitiation': trackCheckoutInitiation ? 'on' : '',
      'analytics.trackProductInteractions': trackProductInteractions ? 'on' : '',
      'analytics.trackCartAbandonment': trackCartAbandonment ? 'on' : '',
      'analytics.trackConversionRates': trackConversionRates ? 'on' : '',
      'analytics.trackUserFeedback': trackUserFeedback ? 'on' : '',
    };
    const filteredSubmissionData = {};
    for (const key in submissionData) {
        if (submissionData[key] !== undefined && submissionData[key] !== null && submissionData[key] !== '') {
            if (submissionData[key] === 'on' || typeof submissionData[key] !== 'string' || submissionData[key].trim() !== '') {
                 filteredSubmissionData[key] = submissionData[key];
            }
        } else if (isBooleanField(key, defaultChatbotConfig)) {
            if (submissionData[key] === '') filteredSubmissionData[key] = '';
        }
    }
    submit(filteredSubmissionData, { method: "post", encType: "application/x-www-form-urlencoded" });
  }, [
    chatboxBackgroundColor, chatboxBorderColor, chatboxBorderRadius, fontFamily, fontSize, fontWeight, chatboxBackgroundOpacity, userBubbleColor, botBubbleColor, inputFieldBackgroundColor, inputFieldTextColor, sendButtonStyle, sendButtonHoverColor, customLogoUrl, customBackgroundUrl, brandAccentColor,
    screenPosition, isFixed, popupTrigger, popupDelaySeconds,
    chatbotName, defaultGreetingMessage, fallbackMessage, multiStepDialogs, conversationTimeoutSeconds, idleMessage, functionalitySystemPrompt,
    selectedAPI, claudeAPIKey, geminiAPIKey, shopifyStoreUrl, shopifyAccessToken,
    avatarImageUrl, avatarShape, avatarBorderColor, avatarBorderSize,
    speechToTextEnabled, textToSpeechEnabled, customInteractiveButtons, formValidationEnabled, showTypingIndicator,
    endToEndEncryptionEnabled, gdprCompliant, sessionTimeoutMinutes, dataRetentionPolicyDays,
    displayFormat, productImageSize, productsPerRow, showPrice, showName, showDescription, defaultSortOrder, addToCartButtonEnabled,
    trackAddToCart, trackCheckoutInitiation, trackProductInteractions, trackCartAbandonment, trackConversionRates, trackUserFeedback,
    submit
  ]);

  const dismissBanner = () => {
    navigate('/app/chatbot-settings', { replace: true });
  };

  if (!initialConfig || Object.keys(initialConfig).length === 0 && !loaderErrorMsg) {
      return (
          <Page title="Chatbot Configuration">
              <Frame>
                  <EmptyState heading="Configuration Unavailable" image="https://cdn.shopify.com/s/files/1/0262/4074/files/empty-state.svg">
                      <p>There was an issue loading the chatbot settings. Default settings may not be available. Please try again later.</p>
                  </EmptyState>
              </Frame>
          </Page>
      );
  }

  return (
    <Page fullWidth title="Chatbot Configuration & Settings">
      <Frame>
        {loaderErrorMsg && <Banner title="Error Loading Settings" status="critical" onDismiss={dismissBanner}>{loaderErrorMsg}</Banner>}
        {actionData?.success && <Banner title="Success" status="success" onDismiss={dismissBanner}>{actionData.message}</Banner>}
        {actionData?.error && <Banner title="Error" status="critical" onDismiss={dismissBanner}>{actionData.error}</Banner>}

        <Form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Layout>
            {/* ... (Appearance Card and other sections) ... */}
            <Layout.Section>
              <Card>
                <BlockStack gap="500" padding="400">
                  <Text variant="headingMd" as="h2">Appearance & Branding</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField label="Chatbox Background Color" name="appearance.chatboxBackgroundColor" type="color" value={chatboxBackgroundColor} onChange={useCallback(setChatboxBackgroundColor, [])} autoComplete="off" />
                      <TextField label="Chatbox Border Color" name="appearance.chatboxBorderColor" type="color" value={chatboxBorderColor} onChange={useCallback(setChatboxBorderColor, [])} autoComplete="off" />
                    </FormLayout.Group>
                    <TextField label="Chatbox Border Radius (e.g., 10px)" name="appearance.chatboxBorderRadius" value={chatboxBorderRadius} onChange={useCallback(setChatboxBorderRadius, [])} autoComplete="off" />
                    <Select label="Font Family" name="appearance.fontFamily" options={['Arial, sans-serif', 'Helvetica, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Times New Roman, serif']} value={fontFamily} onChange={useCallback(setFontFamily, [])} />
                    <TextField label="Font Size (e.g., 16px)" name="appearance.fontSize" value={fontSize} onChange={useCallback(setFontSize, [])} autoComplete="off" />
                    <Select label="Font Weight" name="appearance.fontWeight" options={['normal', 'bold', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900']} value={fontWeight} onChange={useCallback(setFontWeight, [])} />
                    <RangeSlider label="Chatbox Opacity" name="appearance.chatboxBackgroundOpacity" value={chatboxBackgroundOpacity} onChange={useCallback(setChatboxBackgroundOpacity, [])} min={0} max={1} step={0.01} output />
                    <FormLayout.Group>
                        <TextField label="User Message Bubble Color" name="appearance.userBubbleColor" type="color" value={userBubbleColor} onChange={useCallback(setUserBubbleColor, [])} autoComplete="off" />
                        <TextField label="Bot Message Bubble Color" name="appearance.botBubbleColor" type="color" value={botBubbleColor} onChange={useCallback(setBotBubbleColor, [])} autoComplete="off" />
                    </FormLayout.Group>
                     <FormLayout.Group>
                        <TextField label="Input Field Background Color" name="appearance.inputFieldBackgroundColor" type="color" value={inputFieldBackgroundColor} onChange={useCallback(setInputFieldBackgroundColor, [])} autoComplete="off" />
                        <TextField label="Input Field Text Color" name="appearance.inputFieldTextColor" type="color" value={inputFieldTextColor} onChange={useCallback(setInputFieldTextColor, [])} autoComplete="off" />
                    </FormLayout.Group>
                    <Select label="Send Button Style" name="appearance.sendButtonStyle" options={['filled', 'outline']} value={sendButtonStyle} onChange={useCallback(setSendButtonStyle, [])} />
                    <TextField label="Send Button Hover Color" name="appearance.sendButtonHoverColor" type="color" value={sendButtonHoverColor} onChange={useCallback(setSendButtonHoverColor, [])} autoComplete="off" />
                    <TextField label="Custom Logo URL" name="appearance.customLogoUrl" value={customLogoUrl} onChange={useCallback(setCustomLogoUrl, [])} autoComplete="off" helpText="Link to your brand's logo."/>
                    <TextField label="Custom Chatbox Background URL" name="appearance.customBackgroundUrl" value={customBackgroundUrl} onChange={useCallback(setCustomBackgroundUrl, [])} autoComplete="off" helpText="Image URL for chatbox background."/>
                    <TextField label="Brand Accent Color" name="appearance.brandAccentColor" type="color" value={brandAccentColor} onChange={useCallback(setBrandAccentColor, [])} autoComplete="off" helpText="Primary color for UI elements." />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- Positioning Card --- */}
            <Layout.Section>
              <Card>
                 <BlockStack gap="500" padding="400">
                  <Text variant="headingMd" as="h2">Positioning</Text>
                  <FormLayout>
                    <Select label="Screen Position" name="positioning.screenPosition" options={['bottom-right', 'bottom-left', 'top-right', 'top-left']} value={screenPosition} onChange={useCallback(setScreenPosition, [])} />
                    <Checkbox label="Is Fixed (sticks to screen edge)" name="positioning.isFixed" checked={isFixed} onChange={useCallback(setIsFixed, [])} />
                    <Select label="Popup Trigger" name="positioning.popupTrigger" options={['none', 'delay', 'scrollDepth', 'userAction']} value={popupTrigger} onChange={useCallback(setPopupTrigger, [])} />
                    <TextField label="Popup Delay (seconds, if trigger is 'delay')" name="positioning.popupDelaySeconds" type="number" value={popupDelaySeconds} onChange={useCallback((val) => setPopupDelaySeconds(parseFloat(val)), [])} autoComplete="off" />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- Functionality Card --- */}
            <Layout.Section>
              <Card>
                 <BlockStack gap="500" padding="400">
                  <Text variant="headingMd" as="h2">Core Functionality</Text>
                  <FormLayout>
                    <TextField label="Chatbot Name" name="functionality.chatbotName" value={chatbotName} onChange={useCallback(setChatbotName, [])} autoComplete="off" />
                    <TextField label="Default Greeting Message" name="functionality.defaultGreetingMessage" value={defaultGreetingMessage} onChange={useCallback(setDefaultGreetingMessage, [])} multiline={3} autoComplete="off" />
                    <TextField label="Fallback Message (if bot doesn't understand)" name="functionality.fallbackMessage" value={fallbackMessage} onChange={useCallback(setFallbackMessage, [])} multiline={3} autoComplete="off" />
                    <TextField label="Idle Message (if user inactive)" name="functionality.idleMessage" value={idleMessage} onChange={useCallback(setIdleMessage, [])} multiline={2} autoComplete="off" />
                    <TextField label="Conversation Timeout (seconds)" name="functionality.conversationTimeoutSeconds" type="number" value={conversationTimeoutSeconds} onChange={useCallback((val) => setConversationTimeoutSeconds(parseFloat(val)), [])} autoComplete="off" />
                    <TextField
                        label="Multi-Step Dialogs (JSON format)"
                        name="functionality.multiStepDialogs"
                        value={multiStepDialogs}
                        onChange={useCallback(setMultiStepDialogs, [])}
                        multiline={8} // Increased line count
                        autoComplete="off"
                        helpText={`Define structured conversation flows as a JSON array. Each object in the array represents a dialog. Example:
[
  {
    "id": "dialog_1",
    "triggerIntent": "intent_name",
    "initialStepId": "step_1_1",
    "steps": [
      {
        "id": "step_1_1", "message": "Bot message 1", "expectedInputType": "text", "variableName": "var1", "nextStepId": "step_1_2"
      },
      {
        "id": "step_1_2", "message": "Bot message 2 (uses {var1})", "expectedInputType": "options",
        "options": [{"text": "Option A", "payload": "payload_a", "nextStepId": "step_1_3_a"}],
        "variableName": "var2"
      }
    ]
  }
]`}
                    />
                    <Select
                        label="System Prompt (Personality)"
                        name="functionality.systemPrompt"
                        options={promptOptions || [{ label: "Standard Assistant (Default)", value: "standardAssistant" }]}
                        value={functionalitySystemPrompt}
                        onChange={useCallback(setFunctionalitySystemPrompt, [])}
                        helpText="Select the AI's personality and instruction set."
                    />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* ... (Other sections like API Management, Avatar, etc. are assumed to be similarly structured) ... */}
             {/* --- API Management Card --- */}
            <Layout.Section>
              <Card>
                 <BlockStack gap="500" padding="400">
                  <Text variant="headingMd" as="h2">AI & Integrations</Text>
                  <FormLayout>
                    <Select label="Selected AI API" name="apiManagement.selectedAPI" options={['Gemini', 'Claude']} value={selectedAPI} onChange={useCallback(setSelectedAPI, [])} />
                    <TextField label="Claude API Key" name="apiManagement.claudeAPIKey" type="password" value={claudeAPIKey} onChange={useCallback(setClaudeAPIKey, [])} autoComplete="off" />
                    <TextField label="Gemini API Key" name="apiManagement.geminiAPIKey" type="password" value={geminiAPIKey} onChange={useCallback(setGeminiAPIKey, [])} autoComplete="off" />
                    <TextField label="Shopify Store URL" name="apiManagement.shopifyStoreUrl" value={shopifyStoreUrl} onChange={useCallback(setShopifyStoreUrl, [])} autoComplete="off" helpText="e.g., your-store.myshopify.com"/>
                    <TextField label="Shopify Access Token" name="apiManagement.shopifyAccessToken" type="password" value={shopifyAccessToken} onChange={useCallback(setShopifyAccessToken, [])} autoComplete="off" helpText="If chatbot needs direct store API access."/>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- Avatar Card --- */}
            <Layout.Section>
              <Card>
                <BlockStack gap="500" padding="400">
                    <Text variant="headingMd" as="h2">Chatbot Avatar</Text>
                    <FormLayout>
                        <TextField label="Avatar Image URL" name="avatar.avatarImageUrl" value={avatarImageUrl} onChange={useCallback(setAvatarImageUrl, [])} autoComplete="off" />
                        <Select label="Avatar Shape" name="avatar.avatarShape" options={['round', 'square']} value={avatarShape} onChange={useCallback(setAvatarShape, [])} />
                        <TextField label="Avatar Border Color" name="avatar.avatarBorderColor" type="color" value={avatarBorderColor} onChange={useCallback(setAvatarBorderColor, [])} autoComplete="off" />
                        <TextField label="Avatar Border Size (e.g., 1px)" name="avatar.avatarBorderSize" value={avatarBorderSize} onChange={useCallback(setAvatarBorderSize, [])} autoComplete="off" />
                    </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* --- User Experience Card --- */}
            <Layout.Section>
                <Card>
                    <BlockStack gap="500" padding="400">
                        <Text variant="headingMd" as="h2">User Experience Enhancements</Text>
                        <FormLayout>
                            <Checkbox label="Enable Speech-to-Text" name="userExperience.speechToTextEnabled" checked={speechToTextEnabled} onChange={useCallback(setSpeechToTextEnabled, [])} helpText="(Browser dependent, may require user permission)" />
                            <Checkbox label="Enable Text-to-Speech" name="userExperience.textToSpeechEnabled" checked={textToSpeechEnabled} onChange={useCallback(setTextToSpeechEnabled, [])} helpText="(Browser dependent, may require user permission)" />
                            <Checkbox label="Enable Form Validation in Chat" name="userExperience.formValidationEnabled" checked={formValidationEnabled} onChange={useCallback(setFormValidationEnabled, [])} />
                            <Checkbox label="Show Bot Typing Indicator" name="userExperience.showTypingIndicator" checked={showTypingIndicator} onChange={useCallback(setShowTypingIndicator, [])} />
                            <TextField label="Custom Interactive Buttons (JSON format)" name="userExperience.customInteractiveButtons" value={customInteractiveButtons} onChange={useCallback(setCustomInteractiveButtons, [])} multiline={4} autoComplete="off" helpText="e.g., [{text: 'Track Order', action: 'dialog:order_status'}]" />
                        </FormLayout>
                    </BlockStack>
                </Card>
            </Layout.Section>

            {/* --- Product Display Card --- */}
            <Layout.Section>
                <Card>
                    <BlockStack gap="500" padding="400">
                        <Text variant="headingMd" as="h2">Product Display</Text>
                        <FormLayout>
                            <Select label="Display Format" name="productDisplay.displayFormat" options={['carousel', 'grid', 'list']} value={displayFormat} onChange={useCallback(setDisplayFormat, [])} />
                            <Select label="Product Image Size" name="productDisplay.productImageSize" options={['small', 'medium', 'large']} value={productImageSize} onChange={useCallback(setProductImageSize, [])} />
                            <TextField label="Products Per Row (for grid)" name="productDisplay.productsPerRow" type="number" value={productsPerRow} onChange={useCallback((val) => setProductsPerRow(parseFloat(val)), [])} autoComplete="off" />
                            <Checkbox label="Show Product Price" name="productDisplay.showPrice" checked={showPrice} onChange={useCallback(setShowPrice, [])} />
                            <Checkbox label="Show Product Name" name="productDisplay.showName" checked={showName} onChange={useCallback(setShowName, [])} />
                            <Checkbox label="Show Product Description" name="productDisplay.showDescription" checked={showDescription} onChange={useCallback(setShowDescription, [])} />
                            <Select label="Default Sort Order" name="productDisplay.defaultSortOrder" options={['popularity', 'price_asc', 'price_desc', 'newest']} value={defaultSortOrder} onChange={useCallback(setDefaultSortOrder, [])} />
                            <Checkbox label="Enable 'Add to Cart' Button" name="productDisplay.addToCartButtonEnabled" checked={addToCartButtonEnabled} onChange={useCallback(setAddToCartButtonEnabled, [])} />
                        </FormLayout>
                    </BlockStack>
                </Card>
            </Layout.Section>

            {/* --- Analytics Card --- */}
            <Layout.Section>
                <Card>
                    <BlockStack gap="500" padding="400">
                        <Text variant="headingMd" as="h2">Analytics Tracking</Text>
                        <FormLayout>
                            <Checkbox label="Track 'Add to Cart' Events" name="analytics.trackAddToCart" checked={trackAddToCart} onChange={useCallback(setTrackAddToCart, [])} />
                            <Checkbox label="Track Checkout Initiation" name="analytics.trackCheckoutInitiation" checked={trackCheckoutInitiation} onChange={useCallback(setTrackCheckoutInitiation, [])} />
                            <Checkbox label="Track Product Interactions (views, clicks)" name="analytics.trackProductInteractions" checked={trackProductInteractions} onChange={useCallback(setTrackProductInteractions, [])} />
                            <Checkbox label="Track Cart Abandonment (conceptual)" name="analytics.trackCartAbandonment" checked={trackCartAbandonment} onChange={useCallback(setTrackCartAbandonment, [])} />
                            <Checkbox label="Track Conversion Rates (conceptual)" name="analytics.trackConversionRates" checked={trackConversionRates} onChange={useCallback(setTrackConversionRates, [])} />
                            <Checkbox label="Track User Feedback (e.g., on bot responses)" name="analytics.trackUserFeedback" checked={trackUserFeedback} onChange={useCallback(setTrackUserFeedback, [])} />
                        </FormLayout>
                    </BlockStack>
                </Card>
            </Layout.Section>

            {/* --- Security & Privacy Card --- */}
            <Layout.Section>
                <Card>
                    <BlockStack gap="500" padding="400">
                        <Text variant="headingMd" as="h2">Security & Privacy</Text>
                        <FormLayout>
                            <Checkbox label="Enable End-to-End Encryption (Conceptual)" name="securityPrivacy.endToEndEncryptionEnabled" checked={endToEndEncryptionEnabled} onChange={useCallback(setEndToEndEncryptionEnabled, [])} />
                            <Checkbox label="GDPR Compliant Features Enabled (Conceptual)" name="securityPrivacy.gdprCompliant" checked={gdprCompliant} onChange={useCallback(setGdprCompliant, [])} />
                            <TextField label="Session Timeout (minutes)" name="securityPrivacy.sessionTimeoutMinutes" type="number" value={sessionTimeoutMinutes} onChange={useCallback((val) => setSessionTimeoutMinutes(parseFloat(val)), [])} autoComplete="off" />
                            <TextField label="Data Retention Policy (days for chat history)" name="securityPrivacy.dataRetentionPolicyDays" type="number" value={dataRetentionPolicyDays} onChange={useCallback((val) => setDataRetentionPolicyDays(parseFloat(val)), [])} autoComplete="off" />
                        </FormLayout>
                    </BlockStack>
                </Card>
            </Layout.Section>


            <Layout.Section>
              <Box paddingBlockStart="400" paddingBlockEnd="400">
                <Button submit variant="primary" size="large" fullWidth>Save All Settings</Button>
              </Box>
            </Layout.Section>
          </Layout>
        </Form>
      </Frame>
    </Page>
  );
}

[end of app/routes/app.chatbot-settings.jsx]
