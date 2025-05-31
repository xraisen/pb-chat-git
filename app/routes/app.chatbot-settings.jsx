import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useSubmit, useActionData, useNavigate } from "@remix-run/react";
import {
  Page, Card, Layout, Button, Banner, Frame, TextField, Select, Checkbox, Text,
  BlockStack, InlineStack, RangeSlider, FormLayout, EmptyState, Box
  // ColorPicker, hsbToHex, hexToHsb, Popover, // Not using custom ColorPicker in this iteration for brevity
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getChatbotConfig, saveChatbotConfig } from "../services/chatbotConfig.server.js";
import { defaultChatbotConfig } from "../services/chatbotConfig.defaults.js";
import { useEffect, useState, useCallback, useRef } from "react";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopId = session?.shop;

  if (!shopId) {
    console.error("loader: shopId is missing from session.");
    // This might redirect to login or an error page depending on app flow
    // For now, returning an error JSON, but redirect might be better in a full app.
    return json({ error: "Unauthorized. Shop ID is missing." }, { status: 401 });
  }

  try {
    const config = await getChatbotConfig(shopId);
    return json({
      config,
      shopId,
      apiKey: process.env.SHOPIFY_API_KEY || '',
    });
  } catch (error) {
    console.error(`Error in loader for shop ${shopId}:`, error);
    return json(
      {
        config: defaultChatbotConfig, // Fallback to defaults
        shopId,
        apiKey: process.env.SHOPIFY_API_KEY || '',
        error: "Failed to load chatbot configuration. Displaying default settings.",
      },
      { status: 500 } // Internal Server Error
    );
  }
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
  // Reconstruct nested object from flat form data
  for (const key in rawUpdates) {
    if (key.startsWith('$ACTION_ID_')) continue; // Skip Remix internal data

    const parts = key.split('.');
    let currentLevel = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      currentLevel[parts[i]] = currentLevel[parts[i]] || {};
      currentLevel = currentLevel[parts[i]];
    }
    const finalKey = parts[parts.length - 1];
    const rawValue = rawUpdates[key];

    if (isBooleanField(key, defaultChatbotConfig)) {
      // For checkboxes, formData.has(key) is true if checked, false if not present (unchecked)
      // The value 'on' is also common. We check formData.has() for presence.
      currentLevel[finalKey] = formData.has(key) && rawValue === 'on';
    } else if (isNumberField(key, defaultChatbotConfig)) {
      const num = parseFloat(rawValue);
      // Use default value if parsing fails or number is invalid, instead of null
      currentLevel[finalKey] = isNaN(num) ? getNestedValue(defaultChatbotConfig, key) : num;
    } else {
      currentLevel[finalKey] = rawValue;
    }
  }

  // Ensure all boolean fields defined in defaultChatbotConfig get a value
  // This function recursively traverses defaultChatbotConfig and ensures corresponding boolean fields in 'updates' are set.
  function setMissingBooleans(targetUpdates, referenceConfig, currentPathParts = []) {
    Object.keys(referenceConfig).forEach(key => {
      const newPathParts = [...currentPathParts, key];
      const fullPathString = newPathParts.join('.');

      if (isObject(referenceConfig[key])) {
        // Ensure the path exists in targetUpdates before recursing
        let currentTargetLevel = targetUpdates;
        for(let i=0; i < newPathParts.length -1; ++i) {
            currentTargetLevel = currentTargetLevel[newPathParts[i]];
            if (!currentTargetLevel) break;
        }
        if(currentTargetLevel && !currentTargetLevel[key]) currentTargetLevel[key] = {}; // Create object if path doesn't fully exist in target
        if(currentTargetLevel && currentTargetLevel[key]) { // Recurse if path exists
             setMissingBooleans(currentTargetLevel[key], referenceConfig[key], []); // Pass empty path parts for nested call
        }

      } else if (typeof referenceConfig[key] === 'boolean') {
        // Check if the boolean field is missing in the reconstructed 'updates' object
        let valueInUpdates = targetUpdates;
        let pathExists = true;
        for(const part of newPathParts.slice(currentPathParts.length)) { // only check the sub-path from current targetUpdates level
            if(valueInUpdates && part in valueInUpdates) {
                valueInUpdates = valueInUpdates[part];
            } else {
                pathExists = false;
                break;
            }
        }

        if (!pathExists) { // If path to boolean does not exist, set to false
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
  // Initialize with top-level default config structure to ensure all sections are processed for missing booleans
  setMissingBooleans(updates, defaultChatbotConfig);


  const jsonFields = ['functionality.multiStepDialogs', 'userExperience.customInteractiveButtons'];
  for (const path of jsonFields) {
    const parts = path.split('.');
    let current = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current || !current[parts[i]]) { // If path doesn't exist, skip (or create empty structure)
        current = null; // Mark as not found
        break;
      }
      current = current[parts[i]];
    }

    if (current) {
        const finalKey = parts[parts.length - 1];
        const stringValue = current[finalKey];
        if (typeof stringValue === 'string' && stringValue.trim() !== '') {
          try {
            current[finalKey] = JSON.parse(stringValue);
          } catch (e) {
            console.warn(`Invalid JSON for ${path}: ${stringValue}`, e);
            return json({ error: `Invalid JSON format for ${path}. Please check your input.` }, { status: 400 });
          }
        } else if (typeof stringValue === 'undefined' || stringValue.trim() === '') {
          current[finalKey] = []; // Default to empty array if empty or not provided
        }
    } else { // If path up to parent didn't exist, ensure it's set to empty array if it's a JSON field
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
      // Redirect to force re-running loader and get fresh data, also clears actionData
      return redirect("/app/chatbot-settings", {
        headers: { "X-Remix-Success": "Chatbot settings saved successfully!" } // Custom header for toast, not standard
      });
      // Or return json({ success: true, message: "..." }) and handle banner display without redirect
      // return json({ success: true, message: "Chatbot settings saved successfully!" });
    } else {
      return json({ error: "Failed to save settings due to a server error." }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in action saving config:", error);
    return json({ error: "An unexpected error occurred while saving settings." }, { status: 500 });
  }
}


export default function ChatbotSettingsPage() {
  const { config: initialConfig, shopId, apiKey, error: loaderErrorMsg } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const formRef = useRef(null);
  const navigate = useNavigate();

  // --- Helper to get initial value or default ---
  const getInitial = (path, defaultValue = '') => getNestedValue(initialConfig, path) ?? defaultValue;
  const getInitialBoolean = (path, defaultValue = false) => getNestedValue(initialConfig, path) ?? defaultValue;
  const getInitialJsonString = (path, defaultValue = []) => JSON.stringify(getNestedValue(initialConfig, path) ?? defaultValue, null, 2);


  // --- Appearance State ---
  const [chatboxBackgroundColor, setChatboxBackgroundColor] = useState(getInitial('appearance.chatboxBackgroundColor', defaultChatbotConfig.appearance.chatboxBackgroundColor));
  const [chatboxBorderColor, setChatboxBorderColor] = useState(getInitial('appearance.chatboxBorderColor', defaultChatbotConfig.appearance.chatboxBorderColor));
  const [chatboxBorderRadius, setChatboxBorderRadius] = useState(getInitial('appearance.chatboxBorderRadius', defaultChatbotConfig.appearance.chatboxBorderRadius));
  const [fontFamily, setFontFamily] = useState(getInitial('appearance.fontFamily', defaultChatbotConfig.appearance.fontFamily));
  const [fontSize, setFontSize] = useState(getInitial('appearance.fontSize', defaultChatbotConfig.appearance.fontSize));
  const [chatboxBackgroundOpacity, setChatboxBackgroundOpacity] = useState(getInitial('appearance.chatboxBackgroundOpacity', defaultChatbotConfig.appearance.chatboxBackgroundOpacity));
  const [userBubbleColor, setUserBubbleColor] = useState(getInitial('appearance.userBubbleColor', defaultChatbotConfig.appearance.userBubbleColor));
  const [botBubbleColor, setBotBubbleColor] = useState(getInitial('appearance.botBubbleColor', defaultChatbotConfig.appearance.botBubbleColor));
  const [customLogoUrl, setCustomLogoUrl] = useState(getInitial('appearance.customLogoUrl'));
  const [brandAccentColor, setBrandAccentColor] = useState(getInitial('appearance.brandAccentColor', defaultChatbotConfig.appearance.brandAccentColor));
  const [inputFieldBackgroundColor, setInputFieldBackgroundColor] = useState(getInitial('appearance.inputFieldBackgroundColor', defaultChatbotConfig.appearance.inputFieldBackgroundColor));
  const [inputFieldTextColor, setInputFieldTextColor] = useState(getInitial('appearance.inputFieldTextColor', defaultChatbotConfig.appearance.inputFieldTextColor));
  const [sendButtonStyle, setSendButtonStyle] = useState(getInitial('appearance.sendButtonStyle', defaultChatbotConfig.appearance.sendButtonStyle));
  const [sendButtonHoverColor, setSendButtonHoverColor] = useState(getInitial('appearance.sendButtonHoverColor', defaultChatbotConfig.appearance.sendButtonHoverColor));
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(getInitial('appearance.customBackgroundUrl'));
  const [fontWeight, setFontWeight] = useState(getInitial('appearance.fontWeight', defaultChatbotConfig.appearance.fontWeight));


  // --- Positioning State ---
  const [screenPosition, setScreenPosition] = useState(getInitial('positioning.screenPosition', defaultChatbotConfig.positioning.screenPosition));
  const [isFixed, setIsFixed] = useState(getInitialBoolean('positioning.isFixed', defaultChatbotConfig.positioning.isFixed));
  const [popupTrigger, setPopupTrigger] = useState(getInitial('positioning.popupTrigger', defaultChatbotConfig.positioning.popupTrigger));
  const [popupDelaySeconds, setPopupDelaySeconds] = useState(getInitial('positioning.popupDelaySeconds', defaultChatbotConfig.positioning.popupDelaySeconds));


  // --- Functionality State ---
  const [chatbotName, setChatbotName] = useState(getInitial('functionality.chatbotName', defaultChatbotConfig.functionality.chatbotName));
  const [defaultGreetingMessage, setDefaultGreetingMessage] = useState(getInitial('functionality.defaultGreetingMessage', defaultChatbotConfig.functionality.defaultGreetingMessage));
  const [fallbackMessage, setFallbackMessage] = useState(getInitial('functionality.fallbackMessage', defaultChatbotConfig.functionality.fallbackMessage));
  const [multiStepDialogs, setMultiStepDialogs] = useState(getInitialJsonString('functionality.multiStepDialogs'));
  const [conversationTimeoutSeconds, setConversationTimeoutSeconds] = useState(getInitial('functionality.conversationTimeoutSeconds', defaultChatbotConfig.functionality.conversationTimeoutSeconds));
  const [idleMessage, setIdleMessage] = useState(getInitial('functionality.idleMessage', defaultChatbotConfig.functionality.idleMessage));


  // --- API Management State ---
  const [selectedAPI, setSelectedAPI] = useState(getInitial('apiManagement.selectedAPI', defaultChatbotConfig.apiManagement.selectedAPI));
  const [claudeAPIKey, setClaudeAPIKey] = useState(getInitial('apiManagement.claudeAPIKey'));
  const [geminiAPIKey, setGeminiAPIKey] = useState(getInitial('apiManagement.geminiAPIKey'));
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState(getInitial('apiManagement.shopifyStoreUrl'));
  const [shopifyAccessToken, setShopifyAccessToken] = useState(getInitial('apiManagement.shopifyAccessToken'));

  // --- Avatar State ---
  const [avatarImageUrl, setAvatarImageUrl] = useState(getInitial('avatar.avatarImageUrl'));
  const [avatarShape, setAvatarShape] = useState(getInitial('avatar.avatarShape', defaultChatbotConfig.avatar.avatarShape));
  const [avatarBorderColor, setAvatarBorderColor] = useState(getInitial('avatar.avatarBorderColor', defaultChatbotConfig.avatar.avatarBorderColor));
  const [avatarBorderSize, setAvatarBorderSize] = useState(getInitial('avatar.avatarBorderSize', defaultChatbotConfig.avatar.avatarBorderSize));

  // --- User Experience State ---
  const [speechToTextEnabled, setSpeechToTextEnabled] = useState(getInitialBoolean('userExperience.speechToTextEnabled', defaultChatbotConfig.userExperience.speechToTextEnabled));
  const [textToSpeechEnabled, setTextToSpeechEnabled] = useState(getInitialBoolean('userExperience.textToSpeechEnabled', defaultChatbotConfig.userExperience.textToSpeechEnabled));
  const [customInteractiveButtons, setCustomInteractiveButtons] = useState(getInitialJsonString('userExperience.customInteractiveButtons'));
  const [formValidationEnabled, setFormValidationEnabled] = useState(getInitialBoolean('userExperience.formValidationEnabled', defaultChatbotConfig.userExperience.formValidationEnabled));
  const [showTypingIndicator, setShowTypingIndicator] = useState(getInitialBoolean('userExperience.showTypingIndicator', defaultChatbotConfig.userExperience.showTypingIndicator));

  // --- Security & Privacy State ---
  const [endToEndEncryptionEnabled, setEndToEndEncryptionEnabled] = useState(getInitialBoolean('securityPrivacy.endToEndEncryptionEnabled', defaultChatbotConfig.securityPrivacy.endToEndEncryptionEnabled));
  const [gdprCompliant, setGdprCompliant] = useState(getInitialBoolean('securityPrivacy.gdprCompliant', defaultChatbotConfig.securityPrivacy.gdprCompliant));
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(getInitial('securityPrivacy.sessionTimeoutMinutes', defaultChatbotConfig.securityPrivacy.sessionTimeoutMinutes));
  const [dataRetentionPolicyDays, setDataRetentionPolicyDays] = useState(getInitial('securityPrivacy.dataRetentionPolicyDays', defaultChatbotConfig.securityPrivacy.dataRetentionPolicyDays));

  // --- Product Display State ---
  const [displayFormat, setDisplayFormat] = useState(getInitial('productDisplay.displayFormat', defaultChatbotConfig.productDisplay.displayFormat));
  const [productImageSize, setProductImageSize] = useState(getInitial('productDisplay.productImageSize', defaultChatbotConfig.productDisplay.productImageSize));
  const [productsPerRow, setProductsPerRow] = useState(getInitial('productDisplay.productsPerRow', defaultChatbotConfig.productDisplay.productsPerRow));
  const [showPrice, setShowPrice] = useState(getInitialBoolean('productDisplay.showPrice', defaultChatbotConfig.productDisplay.showPrice));
  const [showName, setShowName] = useState(getInitialBoolean('productDisplay.showName', defaultChatbotConfig.productDisplay.showName));
  const [showDescription, setShowDescription] = useState(getInitialBoolean('productDisplay.showDescription', defaultChatbotConfig.productDisplay.showDescription));
  const [defaultSortOrder, setDefaultSortOrder] = useState(getInitial('productDisplay.defaultSortOrder', defaultChatbotConfig.productDisplay.defaultSortOrder));
  const [addToCartButtonEnabled, setAddToCartButtonEnabled] = useState(getInitialBoolean('productDisplay.addToCartButtonEnabled', defaultChatbotConfig.productDisplay.addToCartButtonEnabled));

  // --- Analytics State ---
  const [trackAddToCart, setTrackAddToCart] = useState(getInitialBoolean('analytics.trackAddToCart', defaultChatbotConfig.analytics.trackAddToCart));
  const [trackCheckoutInitiation, setTrackCheckoutInitiation] = useState(getInitialBoolean('analytics.trackCheckoutInitiation', defaultChatbotConfig.analytics.trackCheckoutInitiation));
  const [trackProductInteractions, setTrackProductInteractions] = useState(getInitialBoolean('analytics.trackProductInteractions', defaultChatbotConfig.analytics.trackProductInteractions));
  const [trackCartAbandonment, setTrackCartAbandonment] = useState(getInitialBoolean('analytics.trackCartAbandonment', defaultChatbotConfig.analytics.trackCartAbandonment));
  const [trackConversionRates, setTrackConversionRates] = useState(getInitialBoolean('analytics.trackConversionRates', defaultChatbotConfig.analytics.trackConversionRates));
  const [trackUserFeedback, setTrackUserFeedback] = useState(getInitialBoolean('analytics.trackUserFeedback', defaultChatbotConfig.analytics.trackUserFeedback));


  // Effect to update all individual states if initialConfig changes
  useEffect(() => {
    setChatboxBackgroundColor(getInitial('appearance.chatboxBackgroundColor', defaultChatbotConfig.appearance.chatboxBackgroundColor));
    setChatboxBorderColor(getInitial('appearance.chatboxBorderColor', defaultChatbotConfig.appearance.chatboxBorderColor));
    setChatboxBorderRadius(getInitial('appearance.chatboxBorderRadius', defaultChatbotConfig.appearance.chatboxBorderRadius));
    setFontFamily(getInitial('appearance.fontFamily', defaultChatbotConfig.appearance.fontFamily));
    setFontSize(getInitial('appearance.fontSize', defaultChatbotConfig.appearance.fontSize));
    setChatboxBackgroundOpacity(getInitial('appearance.chatboxBackgroundOpacity', defaultChatbotConfig.appearance.chatboxBackgroundOpacity));
    setUserBubbleColor(getInitial('appearance.userBubbleColor', defaultChatbotConfig.appearance.userBubbleColor));
    setBotBubbleColor(getInitial('appearance.botBubbleColor', defaultChatbotConfig.appearance.botBubbleColor));
    setCustomLogoUrl(getInitial('appearance.customLogoUrl'));
    setBrandAccentColor(getInitial('appearance.brandAccentColor', defaultChatbotConfig.appearance.brandAccentColor));
    setInputFieldBackgroundColor(getInitial('appearance.inputFieldBackgroundColor', defaultChatbotConfig.appearance.inputFieldBackgroundColor));
    setInputFieldTextColor(getInitial('appearance.inputFieldTextColor', defaultChatbotConfig.appearance.inputFieldTextColor));
    setSendButtonStyle(getInitial('appearance.sendButtonStyle', defaultChatbotConfig.appearance.sendButtonStyle));
    setSendButtonHoverColor(getInitial('appearance.sendButtonHoverColor', defaultChatbotConfig.appearance.sendButtonHoverColor));
    setCustomBackgroundUrl(getInitial('appearance.customBackgroundUrl'));
    setFontWeight(getInitial('appearance.fontWeight', defaultChatbotConfig.appearance.fontWeight));

    setScreenPosition(getInitial('positioning.screenPosition', defaultChatbotConfig.positioning.screenPosition));
    setIsFixed(getInitialBoolean('positioning.isFixed', defaultChatbotConfig.positioning.isFixed));
    setPopupTrigger(getInitial('positioning.popupTrigger', defaultChatbotConfig.positioning.popupTrigger));
    setPopupDelaySeconds(getInitial('positioning.popupDelaySeconds', defaultChatbotConfig.positioning.popupDelaySeconds));

    setChatbotName(getInitial('functionality.chatbotName', defaultChatbotConfig.functionality.chatbotName));
    setDefaultGreetingMessage(getInitial('functionality.defaultGreetingMessage', defaultChatbotConfig.functionality.defaultGreetingMessage));
    setFallbackMessage(getInitial('functionality.fallbackMessage', defaultChatbotConfig.functionality.fallbackMessage));
    setMultiStepDialogs(getInitialJsonString('functionality.multiStepDialogs'));
    setConversationTimeoutSeconds(getInitial('functionality.conversationTimeoutSeconds', defaultChatbotConfig.functionality.conversationTimeoutSeconds));
    setIdleMessage(getInitial('functionality.idleMessage', defaultChatbotConfig.functionality.idleMessage));

    setSelectedAPI(getInitial('apiManagement.selectedAPI', defaultChatbotConfig.apiManagement.selectedAPI));
    setClaudeAPIKey(getInitial('apiManagement.claudeAPIKey'));
    setGeminiAPIKey(getInitial('apiManagement.geminiAPIKey'));
    setShopifyStoreUrl(getInitial('apiManagement.shopifyStoreUrl'));
    setShopifyAccessToken(getInitial('apiManagement.shopifyAccessToken'));

    setAvatarImageUrl(getInitial('avatar.avatarImageUrl'));
    setAvatarShape(getInitial('avatar.avatarShape', defaultChatbotConfig.avatar.avatarShape));
    setAvatarBorderColor(getInitial('avatar.avatarBorderColor', defaultChatbotConfig.avatar.avatarBorderColor));
    setAvatarBorderSize(getInitial('avatar.avatarBorderSize', defaultChatbotConfig.avatar.avatarBorderSize));

    setSpeechToTextEnabled(getInitialBoolean('userExperience.speechToTextEnabled', defaultChatbotConfig.userExperience.speechToTextEnabled));
    setTextToSpeechEnabled(getInitialBoolean('userExperience.textToSpeechEnabled', defaultChatbotConfig.userExperience.textToSpeechEnabled));
    setCustomInteractiveButtons(getInitialJsonString('userExperience.customInteractiveButtons'));
    setFormValidationEnabled(getInitialBoolean('userExperience.formValidationEnabled', defaultChatbotConfig.userExperience.formValidationEnabled));
    setShowTypingIndicator(getInitialBoolean('userExperience.showTypingIndicator', defaultChatbotConfig.userExperience.showTypingIndicator));

    setEndToEndEncryptionEnabled(getInitialBoolean('securityPrivacy.endToEndEncryptionEnabled', defaultChatbotConfig.securityPrivacy.endToEndEncryptionEnabled));
    setGdprCompliant(getInitialBoolean('securityPrivacy.gdprCompliant', defaultChatbotConfig.securityPrivacy.gdprCompliant));
    setSessionTimeoutMinutes(getInitial('securityPrivacy.sessionTimeoutMinutes', defaultChatbotConfig.securityPrivacy.sessionTimeoutMinutes));
    setDataRetentionPolicyDays(getInitial('securityPrivacy.dataRetentionPolicyDays', defaultChatbotConfig.securityPrivacy.dataRetentionPolicyDays));

    setDisplayFormat(getInitial('productDisplay.displayFormat', defaultChatbotConfig.productDisplay.displayFormat));
    setProductImageSize(getInitial('productDisplay.productImageSize', defaultChatbotConfig.productDisplay.productImageSize));
    setProductsPerRow(getInitial('productDisplay.productsPerRow', defaultChatbotConfig.productDisplay.productsPerRow));
    setShowPrice(getInitialBoolean('productDisplay.showPrice', defaultChatbotConfig.productDisplay.showPrice));
    setShowName(getInitialBoolean('productDisplay.showName', defaultChatbotConfig.productDisplay.showName));
    setShowDescription(getInitialBoolean('productDisplay.showDescription', defaultChatbotConfig.productDisplay.showDescription));
    setDefaultSortOrder(getInitial('productDisplay.defaultSortOrder', defaultChatbotConfig.productDisplay.defaultSortOrder));
    setAddToCartButtonEnabled(getInitialBoolean('productDisplay.addToCartButtonEnabled', defaultChatbotConfig.productDisplay.addToCartButtonEnabled));

    setTrackAddToCart(getInitialBoolean('analytics.trackAddToCart', defaultChatbotConfig.analytics.trackAddToCart));
    setTrackCheckoutInitiation(getInitialBoolean('analytics.trackCheckoutInitiation', defaultChatbotConfig.analytics.trackCheckoutInitiation));
    setTrackProductInteractions(getInitialBoolean('analytics.trackProductInteractions', defaultChatbotConfig.analytics.trackProductInteractions));
    setTrackCartAbandonment(getInitialBoolean('analytics.trackCartAbandonment', defaultChatbotConfig.analytics.trackCartAbandonment));
    setTrackConversionRates(getInitialBoolean('analytics.trackConversionRates', defaultChatbotConfig.analytics.trackConversionRates));
    setTrackUserFeedback(getInitialBoolean('analytics.trackUserFeedback', defaultChatbotConfig.analytics.trackUserFeedback));

  }, [initialConfig]);


  const handleSave = useCallback(() => {
    const submissionData = {
      // Appearance
      'appearance.chatboxBackgroundColor': chatboxBackgroundColor,
      'appearance.chatboxBorderColor': chatboxBorderColor,
      'appearance.chatboxBorderRadius': chatboxBorderRadius,
      'appearance.fontFamily': fontFamily,
      'appearance.fontSize': fontSize,
      'appearance.fontWeight': fontWeight,
      'appearance.chatboxBackgroundOpacity': String(chatboxBackgroundOpacity), // Ensure string for form data
      'appearance.userBubbleColor': userBubbleColor,
      'appearance.botBubbleColor': botBubbleColor,
      'appearance.inputFieldBackgroundColor': inputFieldBackgroundColor,
      'appearance.inputFieldTextColor': inputFieldTextColor,
      'appearance.sendButtonStyle': sendButtonStyle,
      'appearance.sendButtonHoverColor': sendButtonHoverColor,
      'appearance.customLogoUrl': customLogoUrl,
      'appearance.customBackgroundUrl': customBackgroundUrl,
      'appearance.brandAccentColor': brandAccentColor,

      // Positioning
      'positioning.screenPosition': screenPosition,
      'positioning.isFixed': isFixed ? 'on' : '', // Standard way to send checkbox data
      'positioning.popupTrigger': popupTrigger,
      'positioning.popupDelaySeconds': String(popupDelaySeconds),

      // Functionality
      'functionality.chatbotName': chatbotName,
      'functionality.defaultGreetingMessage': defaultGreetingMessage,
      'functionality.fallbackMessage': fallbackMessage,
      'functionality.multiStepDialogs': multiStepDialogs, // Sent as JSON string
      'functionality.conversationTimeoutSeconds': String(conversationTimeoutSeconds),
      'functionality.idleMessage': idleMessage,

      // API Management
      'apiManagement.selectedAPI': selectedAPI,
      'apiManagement.claudeAPIKey': claudeAPIKey,
      'apiManagement.geminiAPIKey': geminiAPIKey,
      'apiManagement.shopifyStoreUrl': shopifyStoreUrl,
      'apiManagement.shopifyAccessToken': shopifyAccessToken,

      // Avatar
      'avatar.avatarImageUrl': avatarImageUrl,
      'avatar.avatarShape': avatarShape,
      'avatar.avatarBorderColor': avatarBorderColor,
      'avatar.avatarBorderSize': avatarBorderSize,

      // User Experience
      'userExperience.speechToTextEnabled': speechToTextEnabled ? 'on' : '',
      'userExperience.textToSpeechEnabled': textToSpeechEnabled ? 'on' : '',
      'userExperience.customInteractiveButtons': customInteractiveButtons, // Sent as JSON string
      'userExperience.formValidationEnabled': formValidationEnabled ? 'on' : '',
      'userExperience.showTypingIndicator': showTypingIndicator ? 'on' : '',

      // Security & Privacy
      'securityPrivacy.endToEndEncryptionEnabled': endToEndEncryptionEnabled ? 'on' : '',
      'securityPrivacy.gdprCompliant': gdprCompliant ? 'on' : '',
      'securityPrivacy.sessionTimeoutMinutes': String(sessionTimeoutMinutes),
      'securityPrivacy.dataRetentionPolicyDays': String(dataRetentionPolicyDays),

      // Product Display
      'productDisplay.displayFormat': displayFormat,
      'productDisplay.productImageSize': productImageSize,
      'productDisplay.productsPerRow': String(productsPerRow),
      'productDisplay.showPrice': showPrice ? 'on' : '',
      'productDisplay.showName': showName ? 'on' : '',
      'productDisplay.showDescription': showDescription ? 'on' : '',
      'productDisplay.defaultSortOrder': defaultSortOrder,
      'productDisplay.addToCartButtonEnabled': addToCartButtonEnabled ? 'on' : '',

      // Analytics
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
             // Keep 'on' for checkboxes, or actual value. Action handles empty strings vs 'on'.
            if (submissionData[key] === 'on' || typeof submissionData[key] !== 'string' || submissionData[key].trim() !== '') {
                 filteredSubmissionData[key] = submissionData[key];
            }
        } else if (isBooleanField(key, defaultChatbotConfig)) {
            // Ensure boolean fields that are false (empty string from checkbox logic) are still sent if needed by action
            // The action's setMissingBooleans should handle this, so sending empty string for false is fine
            if (submissionData[key] === '') filteredSubmissionData[key] = '';
        }
    }
    submit(filteredSubmissionData, { method: "post", encType: "application/x-www-form-urlencoded" });
  }, [
    // All state variables must be listed here
    chatboxBackgroundColor, chatboxBorderColor, chatboxBorderRadius, fontFamily, fontSize, fontWeight, chatboxBackgroundOpacity, userBubbleColor, botBubbleColor, inputFieldBackgroundColor, inputFieldTextColor, sendButtonStyle, sendButtonHoverColor, customLogoUrl, customBackgroundUrl, brandAccentColor,
    screenPosition, isFixed, popupTrigger, popupDelaySeconds,
    chatbotName, defaultGreetingMessage, fallbackMessage, multiStepDialogs, conversationTimeoutSeconds, idleMessage,
    selectedAPI, claudeAPIKey, geminiAPIKey, shopifyStoreUrl, shopifyAccessToken,
    avatarImageUrl, avatarShape, avatarBorderColor, avatarBorderSize,
    speechToTextEnabled, textToSpeechEnabled, customInteractiveButtons, formValidationEnabled, showTypingIndicator,
    endToEndEncryptionEnabled, gdprCompliant, sessionTimeoutMinutes, dataRetentionPolicyDays,
    displayFormat, productImageSize, productsPerRow, showPrice, showName, showDescription, defaultSortOrder, addToCartButtonEnabled,
    trackAddToCart, trackCheckoutInitiation, trackProductInteractions, trackCartAbandonment, trackConversionRates, trackUserFeedback,
    submit
  ]);

  const dismissBanner = () => {
    // Simple navigation to self to clear actionData from URL and effectively dismiss banner
    // This also forces loader to re-run, getting fresh config.
    navigate('/app/chatbot-settings', { replace: true });
  };

  // Fallback if initialConfig is not loaded properly (e.g. Redis down and no defaults provided by loader)
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
            {/* --- Appearance Card --- */}
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
                    <TextField label="Multi-Step Dialogs (JSON format)" name="functionality.multiStepDialogs" value={multiStepDialogs} onChange={useCallback(setMultiStepDialogs, [])} multiline={5} autoComplete="off" helpText="Define complex conversation flows as a JSON array." />
                    {/* System Prompt - Assuming it's a text field for now, or a Select with predefined options */}
                    <TextField label="System Prompt (Instructions for LLM)" name="functionality.systemPrompt" value={getNestedValue(initialConfig, 'functionality.systemPrompt') || 'standardAssistant'} onChange={(val) => { /* Need a state for this if it's to be editable */ }} multiline={4} autoComplete="off" helpText="Provide instructions or context for the AI."/>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

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
              <Box paddingBlockStart="400" paddingBlockEnd="400"> {/* Added padding for visual separation */}
                <Button submit variant="primary" size="large" fullWidth>Save All Settings</Button>
              </Box>
            </Layout.Section>
          </Layout>
        </Form>
      </Frame>
    </Page>
  );
}
