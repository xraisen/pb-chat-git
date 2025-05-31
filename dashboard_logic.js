// dashboard_logic.js

// Ensure chatbotConfig is accessible (it should be, as config.js is loaded before this script)
if (typeof chatbotConfig === 'undefined') {
  console.error("Error: chatbotConfig is not loaded. Make sure config.js is included and loaded before dashboard_logic.js.");
  // Provide a dummy object to prevent further errors if chatbotConfig is missing
  var chatbotConfig = { appearance: {}, positioning: {}, functionality: {}, productDisplay: {}, apiManagement: {}, analytics: {}, avatar: {}, userExperience: {}, securityPrivacy: {} };
}

// Helper function to validate API key fields visually
function validateAPIKeyField(apiKeyId, isInitialLoad = false) {
    const inputElement = document.getElementById(apiKeyId);
    const statusElement = document.getElementById(apiKeyId + 'Status');

    if (!inputElement || !statusElement) {
        console.warn(`Validation elements not found for ${apiKeyId}`);
        return;
    }

    const key = inputElement.value;

    if (key && key.trim() !== '') {
        statusElement.textContent = 'Key Entered';
        statusElement.className = 'apiKeyStatus valid'; // Using 'valid' for green text, 'neutral' for just info
        inputElement.classList.add('valid');
        inputElement.classList.remove('invalid');
    } else {
        statusElement.textContent = 'No Key';
        statusElement.className = 'apiKeyStatus neutral';
        inputElement.classList.remove('valid');
        // Only mark as 'invalid' if it's not initial load and field is empty (optional, can be annoying)
        // if (!isInitialLoad) {
        //     inputElement.classList.add('invalid');
        // } else {
        //     inputElement.classList.remove('invalid');
        // }
        inputElement.classList.remove('invalid'); // Keep it neutral if empty
    }
}

// Helper function for the "Test Key" buttons (simulated test)
function testAPIKey(apiKeyId) {
    const inputElement = document.getElementById(apiKeyId);
    const statusElement = document.getElementById(apiKeyId + 'Status');
    const key = inputElement.value;

    if (!inputElement || !statusElement) {
        console.warn(`Test elements not found for ${apiKeyId}`);
        return;
    }

    if (key && key.trim() !== '') {
        // Simulate an API call success (client-side only)
        statusElement.textContent = 'Key Present (Test: OK)';
        statusElement.className = 'apiKeyStatus valid';
        inputElement.classList.add('valid');
        inputElement.classList.remove('invalid');
        // In a real scenario, you'd make an actual API call here.
        // e.g., using a lightweight endpoint from api_handler.js
        // For example:
        // try {
        //   const response = await sendAPIRequest("test_query", apiKeyId === 'claudeAPIKey' ? 'Claude' : 'Gemini');
        //   if (response && !response.startsWith("Error:")) {
        //     statusElement.textContent = 'Key Valid (Live Test: OK)';
        //   } else {
        //     statusElement.textContent = 'Key Invalid (Live Test: Failed)';
        //   }
        // } catch (e) { statusElement.textContent = 'Test Error'; }
        console.log(`Simulated test for ${apiKeyId}: Key is present. Full validation requires server-side call.`);
    } else {
        statusElement.textContent = 'Key is Missing for Test!';
        statusElement.className = 'apiKeyStatus invalid';
        inputElement.classList.add('invalid');
        inputElement.classList.remove('valid');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    loadConfiguration(); // This will now also call validateAPIKeyField for initial status

    const saveButton = document.getElementById('saveSettingsButton');
    if (saveButton) {
        saveButton.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default form submission
            saveConfiguration();
        });
    } else {
        console.error("Save button with ID 'saveSettingsButton' not found.");
    }
});

function loadConfiguration() {
    // In a real app, you might load saved settings from localStorage or a backend.
    // For now, we use the defaults from the global chatbotConfig object.
    console.log("Loading configuration into dashboard...", chatbotConfig);

    // Appearance
    setFormValue('chatboxBackgroundColor', chatbotConfig.appearance.chatboxBackgroundColor);
    setFormValue('chatboxBorderColor', chatbotConfig.appearance.chatboxBorderColor);
    setFormValue('chatboxBorderRadius', chatbotConfig.appearance.chatboxBorderRadius);
    setFormValue('fontFamily', chatbotConfig.appearance.fontFamily);
    setFormValue('fontSize', chatbotConfig.appearance.fontSize);
    setFormValue('fontWeight', chatbotConfig.appearance.fontWeight);
    setFormValue('chatboxBackgroundOpacity', chatbotConfig.appearance.chatboxBackgroundOpacity);
    setFormValue('userBubbleColor', chatbotConfig.appearance.userBubbleColor);
    setFormValue('botBubbleColor', chatbotConfig.appearance.botBubbleColor);
    setFormValue('inputFieldBackgroundColor', chatbotConfig.appearance.inputFieldBackgroundColor);
    setFormValue('inputFieldTextColor', chatbotConfig.appearance.inputFieldTextColor);
    setFormValue('sendButtonStyle', chatbotConfig.appearance.sendButtonStyle);
    setFormValue('sendButtonHoverColor', chatbotConfig.appearance.sendButtonHoverColor);
    setFormValue('customLogoUrl', chatbotConfig.appearance.customLogoUrl); // For file inputs, this will set the span if implemented
    setFormValue('customBackgroundUrl', chatbotConfig.appearance.customBackgroundUrl); // For file inputs
    setFormValue('brandAccentColor', chatbotConfig.appearance.brandAccentColor);

    // Positioning
    setFormValue('screenPosition', chatbotConfig.positioning.screenPosition);
    setFormValue('customDesktopPositionX', chatbotConfig.positioning.customDesktopPosition.x);
    setFormValue('customDesktopPositionY', chatbotConfig.positioning.customDesktopPosition.y);
    setFormValue('customMobilePositionX', chatbotConfig.positioning.customMobilePosition.x);
    setFormValue('customMobilePositionY', chatbotConfig.positioning.customMobilePosition.y);
    setFormValue('isFixed', chatbotConfig.positioning.isFixed);
    setFormValue('popupTrigger', chatbotConfig.positioning.popupTrigger);
    setFormValue('popupDelaySeconds', chatbotConfig.positioning.popupDelaySeconds);

    // Functionality
    setFormValue('chatbotName', chatbotConfig.functionality.chatbotName);
    setFormValue('defaultGreetingMessage', chatbotConfig.functionality.defaultGreetingMessage);
    setFormValue('conversationTimeoutSeconds', chatbotConfig.functionality.conversationTimeoutSeconds);
    setFormValue('idleMessage', chatbotConfig.functionality.idleMessage);
    setFormValue('multiStepDialogs', JSON.stringify(chatbotConfig.functionality.multiStepDialogs, null, 2));
    setFormValue('fallbackMessage', chatbotConfig.functionality.fallbackMessage);

    // Product Display
    setFormValue('displayFormat', chatbotConfig.productDisplay.displayFormat);
    setFormValue('productImageSize', chatbotConfig.productDisplay.productImageSize);
    setFormValue('productsPerRow', chatbotConfig.productDisplay.productsPerRow);
    setFormValue('showPrice', chatbotConfig.productDisplay.showPrice);
    setFormValue('showName', chatbotConfig.productDisplay.showName);
    setFormValue('showDescription', chatbotConfig.productDisplay.showDescription);
    setFormValue('defaultSortOrder', chatbotConfig.productDisplay.defaultSortOrder);
    setFormValue('addToCartButtonEnabled', chatbotConfig.productDisplay.addToCartButtonEnabled);

    // API Management
    setFormValue('selectedAPI', chatbotConfig.apiManagement.selectedAPI);
    setFormValue('claudeAPIKey', chatbotConfig.apiManagement.claudeAPIKey);
    setFormValue('geminiAPIKey', chatbotConfig.apiManagement.geminiAPIKey);
    validateAPIKeyField('geminiAPIKey', true); // Validate on load
    validateAPIKeyField('claudeAPIKey', true); // Validate on load
    setFormValue('geminiAPIKey', chatbotConfig.apiManagement.geminiAPIKey);
    setFormValue('shopifyStoreUrl', chatbotConfig.apiManagement.shopifyStoreUrl);
    setFormValue('shopifyAccessToken', chatbotConfig.apiManagement.shopifyAccessToken);

    // Analytics
    setFormValue('trackAddToCart', chatbotConfig.analytics.trackAddToCart);
    setFormValue('trackCheckoutInitiation', chatbotConfig.analytics.trackCheckoutInitiation);
    setFormValue('trackProductInteractions', chatbotConfig.analytics.trackProductInteractions);
    setFormValue('trackCartAbandonment', chatbotConfig.analytics.trackCartAbandonment);
    setFormValue('trackConversionRates', chatbotConfig.analytics.trackConversionRates);
    setFormValue('trackUserFeedback', chatbotConfig.analytics.trackUserFeedback);
    setFormValue('analyticsDashboardUrl', chatbotConfig.analytics.analyticsDashboardUrl);

    // Avatar
    setFormValue('avatarImageUrl', chatbotConfig.avatar.avatarImageUrl); // For file inputs
    setFormValue('avatarShape', chatbotConfig.avatar.avatarShape);
    setFormValue('avatarBorderColor', chatbotConfig.avatar.avatarBorderColor);

    // User Experience
    setFormValue('speechToTextEnabled', chatbotConfig.userExperience.speechToTextEnabled);
    setFormValue('textToSpeechEnabled', chatbotConfig.userExperience.textToSpeechEnabled);
    setFormValue('customInteractiveButtons', JSON.stringify(chatbotConfig.userExperience.customInteractiveButtons, null, 2));
    setFormValue('formValidationEnabled', chatbotConfig.userExperience.formValidationEnabled);

    // Security & Privacy
    setFormValue('endToEndEncryptionEnabled', chatbotConfig.securityPrivacy.endToEndEncryptionEnabled);
    setFormValue('gdprCompliant', chatbotConfig.securityPrivacy.gdprCompliant);
    setFormValue('sessionTimeoutMinutes', chatbotConfig.securityPrivacy.sessionTimeoutMinutes);
    setFormValue('dataRetentionPolicyDays', chatbotConfig.securityPrivacy.dataRetentionPolicyDays);

    console.log("Configuration loaded.");
}

function saveConfiguration() {
    console.log("Saving configuration...");
    // Create a deep copy of the original config to avoid modifying it directly
    // until save is confirmed. This is good practice.
    const newConfig = JSON.parse(JSON.stringify(chatbotConfig));

    // Appearance
    newConfig.appearance.chatboxBackgroundColor = getFormValue('chatboxBackgroundColor');
    newConfig.appearance.chatboxBorderColor = getFormValue('chatboxBorderColor');
    newConfig.appearance.chatboxBorderRadius = getFormValue('chatboxBorderRadius');
    newConfig.appearance.fontFamily = getFormValue('fontFamily');
    newConfig.appearance.fontSize = getFormValue('fontSize');
    newConfig.appearance.fontWeight = getFormValue('fontWeight');
    newConfig.appearance.chatboxBackgroundOpacity = getFormValue('chatboxBackgroundOpacity');
    newConfig.appearance.userBubbleColor = getFormValue('userBubbleColor');
    newConfig.appearance.botBubbleColor = getFormValue('botBubbleColor');
    newConfig.appearance.inputFieldBackgroundColor = getFormValue('inputFieldBackgroundColor');
    newConfig.appearance.inputFieldTextColor = getFormValue('inputFieldTextColor');
    newConfig.appearance.sendButtonStyle = getFormValue('sendButtonStyle');
    newConfig.appearance.sendButtonHoverColor = getFormValue('sendButtonHoverColor');
    newConfig.appearance.customLogoUrl = getFormValue('customLogoUrl'); // Handles file name or existing
    newConfig.appearance.customBackgroundUrl = getFormValue('customBackgroundUrl'); // Handles file name or existing
    newConfig.appearance.brandAccentColor = getFormValue('brandAccentColor');

    // Positioning
    newConfig.positioning.screenPosition = getFormValue('screenPosition');
    newConfig.positioning.customDesktopPosition.x = getFormValue('customDesktopPositionX');
    newConfig.positioning.customDesktopPosition.y = getFormValue('customDesktopPositionY');
    newConfig.positioning.customMobilePosition.x = getFormValue('customMobilePositionX');
    newConfig.positioning.customMobilePosition.y = getFormValue('customMobilePositionY');
    newConfig.positioning.isFixed = getFormValue('isFixed');
    newConfig.positioning.popupTrigger = getFormValue('popupTrigger');
    newConfig.positioning.popupDelaySeconds = getFormValue('popupDelaySeconds');

    // Functionality
    newConfig.functionality.chatbotName = getFormValue('chatbotName');
    newConfig.functionality.defaultGreetingMessage = getFormValue('defaultGreetingMessage');
    newConfig.functionality.conversationTimeoutSeconds = getFormValue('conversationTimeoutSeconds');
    newConfig.functionality.idleMessage = getFormValue('idleMessage');
    try {
        newConfig.functionality.multiStepDialogs = JSON.parse(getFormValue('multiStepDialogs'));
    } catch (e) {
        console.error("Error parsing Multi-Step Dialogs JSON: ", e);
        alert("Error in Multi-Step Dialogs JSON. Please correct it.");
        return; // Prevent saving if JSON is invalid
    }
    newConfig.functionality.fallbackMessage = getFormValue('fallbackMessage');

    // Product Display
    newConfig.productDisplay.displayFormat = getFormValue('displayFormat');
    newConfig.productDisplay.productImageSize = getFormValue('productImageSize');
    newConfig.productDisplay.productsPerRow = getFormValue('productsPerRow');
    newConfig.productDisplay.showPrice = getFormValue('showPrice');
    newConfig.productDisplay.showName = getFormValue('showName');
    newConfig.productDisplay.showDescription = getFormValue('showDescription');
    newConfig.productDisplay.defaultSortOrder = getFormValue('defaultSortOrder');
    newConfig.productDisplay.addToCartButtonEnabled = getFormValue('addToCartButtonEnabled');

    // API Management
    newConfig.apiManagement.selectedAPI = getFormValue('selectedAPI');
    newConfig.apiManagement.claudeAPIKey = getFormValue('claudeAPIKey');
    validateAPIKeyField('claudeAPIKey'); // Validate before save
    newConfig.apiManagement.geminiAPIKey = getFormValue('geminiAPIKey');
    validateAPIKeyField('geminiAPIKey'); // Validate before save
    newConfig.apiManagement.shopifyStoreUrl = getFormValue('shopifyStoreUrl');
    newConfig.apiManagement.shopifyAccessToken = getFormValue('shopifyAccessToken');

    // Analytics
    newConfig.analytics.trackAddToCart = getFormValue('trackAddToCart');
    newConfig.analytics.trackCheckoutInitiation = getFormValue('trackCheckoutInitiation');
    newConfig.analytics.trackProductInteractions = getFormValue('trackProductInteractions');
    newConfig.analytics.trackCartAbandonment = getFormValue('trackCartAbandonment');
    newConfig.analytics.trackConversionRates = getFormValue('trackConversionRates');
    newConfig.analytics.trackUserFeedback = getFormValue('trackUserFeedback');
    newConfig.analytics.analyticsDashboardUrl = getFormValue('analyticsDashboardUrl');

    // Avatar
    newConfig.avatar.avatarImageUrl = getFormValue('avatarImageUrl'); // Handles file name or existing
    newConfig.avatar.avatarShape = getFormValue('avatarShape');
    newConfig.avatar.avatarBorderColor = getFormValue('avatarBorderColor');

    // User Experience
    newConfig.userExperience.speechToTextEnabled = getFormValue('speechToTextEnabled');
    newConfig.userExperience.textToSpeechEnabled = getFormValue('textToSpeechEnabled');
    try {
        newConfig.userExperience.customInteractiveButtons = JSON.parse(getFormValue('customInteractiveButtons'));
    } catch (e) {
        console.error("Error parsing Custom Interactive Buttons JSON: ", e);
        alert("Error in Custom Interactive Buttons JSON. Please correct it.");
        return; // Prevent saving if JSON is invalid
    }
    newConfig.userExperience.formValidationEnabled = getFormValue('formValidationEnabled');

    // Security & Privacy
    newConfig.securityPrivacy.endToEndEncryptionEnabled = getFormValue('endToEndEncryptionEnabled');
    newConfig.securityPrivacy.gdprCompliant = getFormValue('gdprCompliant');
    newConfig.securityPrivacy.sessionTimeoutMinutes = getFormValue('sessionTimeoutMinutes');
    newConfig.securityPrivacy.dataRetentionPolicyDays = getFormValue('dataRetentionPolicyDays');

    // In a real app, you would send newConfig to a backend API or save it to localStorage.
    // For now, we just log it to the console.
    console.log("Configuration saved (simulated):", newConfig);

    try {
        localStorage.setItem('savedChatbotConfig', JSON.stringify(newConfig));
        console.log("Configuration saved to localStorage.");
        alert('Settings saved and updated in localStorage!');
    } catch (e) {
        console.error("Error saving configuration to localStorage:", e);
        alert('Error saving settings to localStorage. Check console for details.');
    }

    // Optionally, update the global chatbotConfig if you want the live page to reflect changes immediately
    // This makes the current page state consistent with the "saved" data.
    Object.assign(chatbotConfig, newConfig);
}

// Helper function to set form values
function setFormValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        if (element.type === 'checkbox') {
            element.checked = value;
        } else if (element.type === 'file') {
            // For loading, we can't set file input value directly for security reasons.
            // Instead, we display the stored filename/URL if available.
            // Assumes a sibling span with ID elementId + "Name" for displaying the current file name.
            const fileNameDisplay = document.getElementById(elementId + "Name");
            if (fileNameDisplay) {
                fileNameDisplay.textContent = value ? (value.split('/').pop() || value) : '';
            }
            // We don't set element.value for file inputs on load.
        } else if (element.tagName === 'TEXTAREA' && typeof value === 'object') {
             element.value = JSON.stringify(value, null, 2); // Pretty print JSON
        }
         else {
            element.value = value;
        }
    } else {
        // It's possible not all config keys have corresponding HTML elements if the HTML is simplified
        // console.warn(`Element with ID ${elementId} not found in form.`);
    }
}

// Helper function to get form values
function getFormValue(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        if (element.type === 'checkbox') {
            return element.checked;
        } else if (element.type === 'number') {
            const val = parseFloat(element.value);
            return isNaN(val) ? null : val; // Return null if not a valid number
        } else if (element.type === 'file') {
            // TODO: Actual file upload requires server-side logic.
            // Here, we just get the name of the selected file.
            // If no new file is selected, we try to keep the old value.
            const currentFileNameDisplay = document.getElementById(elementId + "Name");
            let existingValue = '';
            if(currentFileNameDisplay && currentFileNameDisplay.textContent){
                // This logic assumes that if a value was loaded, it's stored in the span.
                // And if the original value was a full path/URL, we are only interested in the name part for "new" selection.
                // This part might need refinement based on how URLs vs filenames are handled.
                // For now, if a file is chosen, it takes precedence. Otherwise, keep what was displayed.
                 existingValue = chatbotConfig[element.name.split('.')[0]][element.name.split('.')[1]] || currentFileNameDisplay.textContent;
                 //This is a bit of a hack to get the original value if no new file is chosen.
                 //It reconstructs the path in chatbotConfig from element name if possible or uses the textContent.
                 //Example: if elementId is 'customLogoUrl', element.name could be 'customLogoUrl'
                 //This needs to map back to chatbotConfig.appearance.customLogoUrl
                 //A better way would be to pass the original config path to getFormValue.
                 //For simplicity now:
                 if (element.id === 'customLogoUrl') existingValue = chatbotConfig.appearance.customLogoUrl;
                 else if (element.id === 'customBackgroundUrl') existingValue = chatbotConfig.appearance.customBackgroundUrl;
                 else if (element.id === 'avatarImageUrl') existingValue = chatbotConfig.avatar.avatarImageUrl;

            }

            if (element.files && element.files.length > 0) {
                console.log(`New file selected for ${elementId}: ${element.files[0].name}`);
                // Update the span as well
                if(currentFileNameDisplay) currentFileNameDisplay.textContent = element.files[0].name;
                return element.files[0].name; // Return only the name, actual upload is separate
            } else {
                // No new file selected, return the existing value (which might be a URL or a previously selected file name)
                return existingValue;
            }
        } else if (element.tagName === 'TEXTAREA' && (elementId === 'multiStepDialogs' || elementId === 'customInteractiveButtons')) {
            try {
                return JSON.parse(element.value);
            } catch (e) {
                console.warn(`Invalid JSON in ${elementId}: ${element.value}. Returning as string.`);
                return element.value; // Or handle error more gracefully
            }
        }
        return element.value;
    }
    // console.warn(`Element with ID ${elementId} not found when trying to get value.`);
    return null; // Or undefined, or throw an error, depending on desired strictness
}
