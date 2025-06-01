// standalone-chat-logic.js

// --- Global Variables & Initialization ---
let activeConfig = {};
let shopId = window.shopifyShopId || null;
let appUrl = window.shopifyAppUrl || '';
let conversationId = null;

let chatbotRootContainer, shopAiChatBubble, chatbotContainer, chatbotHeader, chatbotTitle, chatbotAvatarImg,
    closeChatButton, chatboxMessages, quickRepliesContainer, customButtonsContainer, chatbotInputArea,
    userInputField, sendMessageButton, sttButton, ttsButton;

let currentAssistantMessageElement = null;
let lastUserMessage = null;
let messageCounter = 0;

const SESSION_STORAGE_CONVERSATION_ID_KEY = `shopAiConversationId_${shopId}`;
const SESSION_STORAGE_CHAT_OPENED_ONCE_KEY = `shopAiChatOpenedOnce_${shopId}`;
const SESSION_STORAGE_LAST_ACTIVITY_KEY = `shopAiLastActivity_${shopId}`;
let sessionTimeoutTimer = null;

let recognition;
let isRecognizing = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let lastBotMessageText = "";
let speechSynthesis = window.speechSynthesis;
let isSpeaking = false;

// --- Helper Functions ---
function isObject(item) { return item && typeof item === 'object' && !Array.isArray(item); }
function deepMerge(target, source) {
  let output = Array.isArray(target) ? [] : {};
  if (Array.isArray(target)) {
    output = target.map(item => (isObject(item) ? deepMerge({}, item) : item));
  } else if (isObject(target)) {
    for (const key of Object.keys(target)) {
      if (isObject(target[key])) { output[key] = deepMerge({}, target[key]); }
      else if (Array.isArray(target[key])) { output[key] = target[key].map(item => (isObject(item) ? deepMerge({}, item) : item)); }
      else { output[key] = target[key]; }
    }
  }
  if (isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        output[key] = (output[key] && isObject(output[key])) ? deepMerge(output[key], source[key]) : deepMerge({}, source[key]);
      } else if (Array.isArray(source[key])) {
        output[key] = source[key].map(item => (isObject(item) ? deepMerge({}, item) : item));
      } else { output[key] = source[key]; }
    }
  }
  return output;
}

// --- Analytics ---
async function sendAnalyticsEvent(eventType, eventData = {}) {
    if (!window.activeConfig?.analytics) return;
    const map = {
        'addToCart': 'trackAddToCart', 'checkoutInitiated': 'trackCheckoutInitiation',
        'productCardClickedInChat': 'trackProductInteractions', 'userFeedback': 'trackUserFeedback',
        'customButtonClicked': 'trackCustomButtonClicks', 'speechRecognized': 'trackSpeechRecognizedEvents',
        'sttButtonClicked': 'trackSttButtonClicked', 'ttsButtonClicked': 'trackTtsButtonClicked', 'ttsPlayed': 'trackTtsPlayed'
    };
    const flagKey = map[eventType] || `track${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`;
    if (window.activeConfig.analytics[flagKey] === false) return;
    try {
        const payload = { shopId: window.shopifyShopId, eventType, eventData: { ...eventData }, conversationId, timestamp: new Date().toISOString() };
        if (payload.eventData?.conversationId) delete payload.eventData.conversationId;
        await fetch(`${window.appUrl}/api/chat-analytics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (error) { /* console.warn for debug */ }
}

// --- Speech-to-Text & Text-to-Speech ---
function initializeSpeechRecognition() { /* ... (verified, no changes from Turn 81) ... */ }
function initializeSpeechSynthesis() { /* ... (verified, no changes from Turn 81) ... */ }
function stripMarkdown(text) { /* ... (verified, no changes from Turn 81) ... */ }

// --- UI Creation ---
function createChatbotUI() {
  chatbotRootContainer = document.getElementById('shop-ai-chatbot-root-container');
  if (!chatbotRootContainer) { console.error('Chatbot root container not found!'); return; }
  chatbotRootContainer.innerHTML = '';

  shopAiChatBubble = document.createElement('div'); /* ... */ chatbotRootContainer.appendChild(shopAiChatBubble);
  chatbotContainer = document.createElement('div'); /* ... */ chatbotContainer.style.display = 'none';
  chatbotHeader = document.createElement('div'); /* ... */ chatbotContainer.appendChild(chatbotHeader);
  chatboxMessages = document.createElement('div'); /* ... */ chatbotContainer.appendChild(chatboxMessages);

  customButtonsContainer = document.createElement('div');
  customButtonsContainer.id = 'shop-ai-custom-buttons';
  customButtonsContainer.style.display = 'none'; // Initially hidden
  chatbotContainer.appendChild(customButtonsContainer);

  quickRepliesContainer = document.createElement('div'); /* ... */ chatbotContainer.appendChild(quickRepliesContainer);
  chatbotInputArea = document.createElement('div'); /* ... */ chatbotContainer.appendChild(chatbotInputArea);

  // (Full element creation for bubble, header, messages, input area as in Turn 81)
  shopAiChatBubble.id = 'shopAiChatBubble';
  shopAiChatBubble.className = 'shop-ai-chat-bubble';
  shopAiChatBubble.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32px" height="32px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 11H6V9h12v4zm-2-5H6V5h10v2z"/></svg>`;
  if (window.initialChatBubbleColor) shopAiChatBubble.style.backgroundColor = window.initialChatBubbleColor;

  chatbotContainer.id = 'shop-ai-chat-window';
  chatbotContainer.className = 'shop-ai-chat-window';

  chatbotHeader.id = 'shop-ai-chat-header';
  chatbotAvatarImg = document.createElement('img'); chatbotAvatarImg.id = 'shop-ai-avatar-img'; chatbotAvatarImg.alt = 'Avatar'; chatbotAvatarImg.style.display = 'none';
  chatbotTitle = document.createElement('span'); chatbotTitle.id = 'shop-ai-chat-title'; chatbotTitle.textContent = 'Chat';
  closeChatButton = document.createElement('button'); closeChatButton.id = 'shop-ai-chat-close-button'; closeChatButton.innerHTML = '&times;';
  chatbotHeader.appendChild(chatbotAvatarImg); chatbotHeader.appendChild(chatbotTitle); chatbotHeader.appendChild(closeChatButton);

  chatboxMessages.id = 'shop-ai-chat-messages';
  quickRepliesContainer.id = 'shop-ai-quick-replies';

  chatbotInputArea.id = 'shop-ai-chat-input-area';
  sttButton = document.createElement('button'); sttButton.id = 'shop-ai-stt-button'; sttButton.innerHTML = '🎤'; sttButton.style.display = 'none'; sttButton.title = "Speak"; sttButton.type = "button";
  userInputField = document.createElement('input'); userInputField.id = 'shop-ai-user-input'; userInputField.type = 'text'; userInputField.placeholder = 'Type your message...';
  ttsButton = document.createElement('button'); ttsButton.id = 'shop-ai-tts-button'; ttsButton.innerHTML = '🔊'; ttsButton.style.display = 'none'; ttsButton.title = "Listen to last bot message"; ttsButton.type = "button";
  sendMessageButton = document.createElement('button'); sendMessageButton.id = 'shop-ai-send-button'; sendMessageButton.textContent = 'Send';
  chatbotInputArea.appendChild(sttButton); chatbotInputArea.appendChild(userInputField); chatbotInputArea.appendChild(ttsButton); chatbotInputArea.appendChild(sendMessageButton);

  chatbotRootContainer.appendChild(chatbotContainer); // Ensure this is after all appends to chatbotContainer

  shopAiChatBubble.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  closeChatButton.addEventListener('click', () => { toggleChatWindow(); recordUserActivity(); });
  sendMessageButton.addEventListener('click', () => { handleUserSendMessage(); recordUserActivity(); });
  userInputField.addEventListener('keypress', (event) => { if (event.key === 'Enter') { handleUserSendMessage(); recordUserActivity(); } else { recordUserActivity(); } });
  userInputField.addEventListener('input', recordUserActivity);
  chatbotContainer.addEventListener('click', recordUserActivity);
  sttButton.addEventListener('click', () => { /* ... (STT logic from Turn 81) ... */ });
  ttsButton.addEventListener('click', () => { /* ... (TTS logic from Turn 81) ... */ });
}

// --- UI Toggle, Config Management, Apply Config sections ---
function toggleChatWindow() { /* ... (verified, no changes needed from Turn 81) ... */ }
async function fetchAndMergeConfigs() { /* ... (verified, no changes) ... */ }
function applyAllConfigurations() { /* ... (verified, no changes) ... */ }
function applyAppearanceConfig(appearance) { /* ... (verified, no changes) ... */ }
function applyPositioningConfig(positioning) { /* ... (verified, no changes) ... */ }
function applyFunctionalityConfig(functionality) { /* ... (verified, no changes) ... */ }
function applyAvatarConfig(avatar) { /* ... (verified, no changes) ... */ }

function applyUXConfig(userExperience) {
    if (sttButton) {
        sttButton.style.display = userExperience.speechToTextEnabled ? 'inline-block' : 'none';
        sttButton.disabled = !(userExperience.speechToTextEnabled && SpeechRecognition);
        sttButton.title = userExperience.speechToTextEnabled ? (SpeechRecognition ? "Speak" : "Speech recognition not supported") : "Speech-to-text disabled";
    }
    if (ttsButton) {
        ttsButton.style.display = userExperience.textToSpeechEnabled ? 'inline-block' : 'none';
        ttsButton.disabled = !(userExperience.textToSpeechEnabled && speechSynthesis);
        ttsButton.title = userExperience.textToSpeechEnabled ? (speechSynthesis ? "Listen to last bot message" : "Speech synthesis not supported") : "Text-to-speech disabled";
    }

    if (userExperience.customInteractiveButtons && Array.isArray(userExperience.customInteractiveButtons) && userExperience.customInteractiveButtons.length > 0) {
        displayCustomInteractiveButtons(userExperience.customInteractiveButtons);
    } else {
        clearCustomInteractiveButtons();
    }
    // showTypingIndicator is handled directly in showTypingIndicatorUI
}

function applySecurityPrivacyConfig(securityPrivacy) { /* ... (verified, no changes) ... */ }
function recordUserActivity() { /* ... (verified, no changes) ... */ }
function startSessionTimeout(timeoutMinutes) { /* ... (verified, no changes) ... */ }

// --- Chat Interaction & SSE ---
async function handleUserSendMessage() { /* ... (verified, no changes from Turn 81, analytics already there) ... */ }
function handleStreamEvent(data) { /* ... (verified, no changes from Turn 81, analytics already there) ... */ }

// --- UI Helper Functions ---
function appendMessageToUI(text, senderType, isHTML = false) { /* ... (verified, feedback UI logic from Turn 81) ... */ }
function addFeedbackUI(messageElement, messageId) { /* ... (verified, no changes) ... */ }
function formatMessageContentUI(messageElement) {  /* ... (verified, feedback UI logic from Turn 81) ... */ }

function displayQuickRepliesUI(replies) { /* ... (verified, analytics call from Turn 81) ... */ }
function clearQuickRepliesUI() { if(quickRepliesContainer) quickRepliesContainer.innerHTML = ''; }

function displayCustomInteractiveButtons(buttonsArray) {
    if (!customButtonsContainer) return;
    clearCustomInteractiveButtons(); // Clear previous buttons

    if (!Array.isArray(buttonsArray) || buttonsArray.length === 0) {
        customButtonsContainer.style.display = 'none';
        return;
    }

    buttonsArray.forEach(buttonConfig => {
        if (!buttonConfig || typeof buttonConfig.text !== 'string') {
            console.warn("Invalid custom button configuration:", buttonConfig);
            return;
        }
        const button = document.createElement('button');
        button.textContent = buttonConfig.text;
        button.className = 'custom-interactive-button shop-ai-chat-button'; // Added common class

        button.addEventListener('click', () => {
            const messageToSend = buttonConfig.payload || buttonConfig.text;
            if (userInputField) {
                userInputField.value = messageToSend;
            }
            handleUserSendMessage();
            sendAnalyticsEvent('customButtonClicked', {
                text: buttonConfig.text,
                payload: messageToSend
            });
            // Buttons persist by default, not cleared on click.
        });
        customButtonsContainer.appendChild(button);
    });
    customButtonsContainer.style.display = 'flex'; // Or 'block', 'grid' depending on desired layout in CSS
}

function clearCustomInteractiveButtons() {
    if(customButtonsContainer) {
        customButtonsContainer.innerHTML = '';
        customButtonsContainer.style.display = 'none';
    }
}

function showTypingIndicatorUI() {
  if (activeConfig.userExperience?.showTypingIndicator === false) return;
  hideTypingIndicatorUI();
  const typingDiv = document.createElement('div');
  typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
  typingDiv.innerHTML = `<span></span><span></span><span></span>`;
  if (chatboxMessages) chatboxMessages.appendChild(typingDiv); // Added null check
  scrollToBottomUI();
}
function hideTypingIndicatorUI() { const el = chatboxMessages?.querySelector('.typing-indicator'); if(el) el.remove(); }
function scrollToBottomUI() { if(chatboxMessages) chatboxMessages.scrollTop = chatboxMessages.scrollHeight; }
function displayProductResultsUI(products) { /* ... (verified, analytics calls from Turn 81) ... */ }
function openAuthPopup(authUrl) { /* ... (verified, analytics call from Turn 81) ... */ }

// --- Initialization ---
async function initializeChatbot() { /* ... (verified, no changes from Turn 81) ... */ }

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', initializeChatbot);
window.addEventListener('beforeunload', () => { /* ... (verified, no changes) ... */ });

// Fallback defaultChatbotConfig (Ensure relevant analytics flags are true by default)
const defaultChatbotConfig = {
  appearance: { /* ... */ }, positioning: { /* ... */ }, functionality: { /* ... */ },
  avatar: { /* ... */ },
  userExperience: { showTypingIndicator: true, speechLanguage: 'en-US', speechToTextEnabled: false, textToSpeechEnabled: false, customInteractiveButtons: [] },
  analytics: { /* ... (all relevant flags, ensure trackCustomButtonClicks is present and true by default if desired) ... */ }
};
// Ensure all functions from Turn 81 are copied here for brevity in this diff view
// The actual `overwrite_file_with_block` will use the full content with these changes integrated.
isObject = (item) => item && typeof item === 'object' && !Array.isArray(item);
deepMerge = (target, source) => { let output = Array.isArray(target) ? [] : {}; if (Array.isArray(target)) { output = target.map(item => (isObject(item) ? deepMerge({}, item) : item)); } else if (isObject(target)) { for (const key of Object.keys(target)) { if (isObject(target[key])) { output[key] = deepMerge({}, target[key]); } else if (Array.isArray(target[key])) { output[key] = target[key].map(item => (isObject(item) ? deepMerge({}, item) : item)); } else { output[key] = target[key]; } } } if (isObject(source)) { for (const key of Object.keys(source)) { if (isObject(source[key])) { output[key] = (output[key] && isObject(output[key])) ? deepMerge(output[key], source[key]) : deepMerge({}, source[key]); } else if (Array.isArray(source[key])) { output[key] = source[key].map(item => (isObject(item) ? deepMerge({}, item) : item)); } else { output[key] = source[key]; } } } return output; };
initializeSpeechRecognition = () => { if (!SpeechRecognition) { if (sttButton) { sttButton.disabled = true; sttButton.title = "Speech recognition not supported."; } return; } recognition = new SpeechRecognition(); recognition.continuous = false; recognition.lang = window.activeConfig?.userExperience?.speechLanguage || 'en-US'; recognition.interimResults = false; recognition.onstart = () => { isRecognizing = true; if (sttButton) { sttButton.textContent = '🎙️ Listening...'; sttButton.classList.add('recognizing'); }}; recognition.onresult = (event) => { const transcript = event.results[event.results.length - 1][0].transcript.trim(); if (userInputField) { userInputField.value = transcript; userInputField.focus(); } sendAnalyticsEvent('speechRecognized', { transcriptLength: transcript.length }); }; recognition.onerror = (event) => { console.error("Speech recognition error:", event.error); let msg = "Speech error: " + event.error; if (event.error === 'no-speech') msg="No speech detected."; else if(event.error==='audio-capture') msg="Microphone error."; else if(event.error==='not-allowed') msg="Mic access denied."; if(sttButton)sttButton.title=msg;}; recognition.onend = () => { isRecognizing = false; if (sttButton) { sttButton.textContent = '🎤'; sttButton.classList.remove('recognizing'); }}; };
sttButton?.addEventListener('click', () => { if (!activeConfig.userExperience?.speechToTextEnabled || !SpeechRecognition) { sttButton.disabled = true; sttButton.title = SpeechRecognition ? "STT disabled" : "STT not supported"; return; } if (!recognition) initializeSpeechRecognition(); if (recognition) { if (isRecognizing) { recognition.stop(); } else { try { recognition.start(); sendAnalyticsEvent('sttButtonClicked'); } catch (e) { console.error("Error starting recognition:", e); isRecognizing=false; if(sttButton){sttButton.textContent='🎤';sttButton.classList.remove('recognizing');}}}}} );
fetchAndMergeConfigs = async () => { activeConfig = deepMerge({}, window.chatbotConfig || defaultChatbotConfig); if (!shopId || !appUrl) {return;} try { const response = await fetch(`${appUrl}/api/chatbot-public-config?shop=${shopId}`); if (!response.ok) {return;} const dynamicConfig = await response.json(); activeConfig = deepMerge(activeConfig, dynamicConfig); } catch (error) {console.error('Failed to fetch/merge dynamic_config:', error);} };
applyAllConfigurations = () => { if (!activeConfig || Object.keys(activeConfig).length === 0) { return; } if (activeConfig.appearance) applyAppearanceConfig(activeConfig.appearance); if (activeConfig.positioning) applyPositioningConfig(activeConfig.positioning); if (activeConfig.functionality) applyFunctionalityConfig(activeConfig.functionality); if (activeConfig.avatar) applyAvatarConfig(activeConfig.avatar); if (activeConfig.userExperience) applyUXConfig(activeConfig.userExperience); if (activeConfig.securityPrivacy) applySecurityPrivacyConfig(activeConfig.securityPrivacy); };
applyAppearanceConfig = (appearance) => { const rs=document.documentElement.style; rs.setProperty('--chatbox-bg-color',appearance.chatboxBackgroundColor||'#FFF'); rs.setProperty('--chatbox-border-color',appearance.chatboxBorderColor||'#CCC'); rs.setProperty('--user-bubble-bg-color',appearance.userBubbleColor||'#007AFF'); rs.setProperty('--bot-bubble-bg-color',appearance.botBubbleColor||'#E5E5EA'); rs.setProperty('--brand-accent-color',appearance.brandAccentColor||'#007AFF'); rs.setProperty('--input-bg-color',appearance.inputFieldBackgroundColor||'#F0F0F0'); rs.setProperty('--input-text-color',appearance.inputFieldTextColor||'#000'); if(chatbotContainer){chatbotContainer.style.borderRadius=appearance.chatboxBorderRadius||'10px'; chatbotContainer.style.opacity=appearance.chatboxBackgroundOpacity||'1'; chatbotContainer.style.backgroundImage = appearance.customBackgroundUrl?`url('${appearance.customBackgroundUrl}')`:'none';} if(chatboxMessages){chatboxMessages.style.fontFamily=appearance.fontFamily||'Arial'; chatboxMessages.style.fontSize=appearance.fontSize||'16px';} if(chatbotHeader&&appearance.brandAccentColor)chatbotHeader.style.backgroundColor=appearance.brandAccentColor; if(sendMessageButton&&appearance.brandAccentColor)sendMessageButton.style.backgroundColor=appearance.brandAccentColor; if(shopAiChatBubble&&appearance.brandAccentColor)shopAiChatBubble.style.backgroundColor=appearance.brandAccentColor; if(chatbotHeader){let l=chatbotHeader.querySelector('#shop-ai-custom-logo');if(appearance.customLogoUrl){if(!l){l=document.createElement('img');l.id='shop-ai-custom-logo';}l.src=appearance.customLogoUrl;}else if(l)l.remove();}};
applyPositioningConfig = (pos) => { if(!chatbotRootContainer||!shopAiChatBubble)return; const b=shopAiChatBubble,w=chatbotContainer; b.style.position=pos.isFixed?'fixed':'absolute'; w.style.position=pos.isFixed?'fixed':'absolute'; ['top','bottom','left','right'].forEach(p=>{b.style[p]='auto';w.style[p]='auto'}); const m=window.innerWidth<768, cP=m?pos.customMobilePosition:pos.customDesktopPosition,y=cP?.y||'20px',x=cP?.x||'20px'; switch(pos.screenPosition){case 'bottom-left':b.style.bottom=y;b.style.left=x;w.style.bottom=y;w.style.left=x;break; case 'top-right':b.style.top=y;b.style.right=x;w.style.top=y;w.style.right=x;break; case 'top-left':b.style.top=y;b.style.left=x;w.style.top=y;w.style.left=x;break; default:b.style.bottom=y;b.style.right=x;w.style.bottom=y;w.style.right=x;} if(pos.popupTrigger==='delay'&&pos.popupDelaySeconds>0&&!sessionStorage.getItem(SESSION_STORAGE_CHAT_OPENED_ONCE_KEY)){setTimeout(()=>{if(chatbotContainer.style.display==='none')toggleChatWindow();},pos.popupDelaySeconds*1000);}};
applyFunctionalityConfig = (func) => { if(chatbotTitle)chatbotTitle.textContent=func.chatbotName||'Chat'; if(userInputField)userInputField.placeholder=func.inputPlaceholder||'Type...';};
applyAvatarConfig = (av) => { if(!chatbotAvatarImg)return; const url=av.customAvatarUrl||av.avatarImageUrl; if(url){chatbotAvatarImg.src=url; chatbotAvatarImg.style.display='inline-block'; chatbotAvatarImg.style.borderColor=av.borderColor||'transparent'; chatbotAvatarImg.style.borderWidth=av.borderWidth||av.avatarBorderSize||'0px'; chatbotAvatarImg.style.borderStyle='solid'; chatbotAvatarImg.style.borderRadius=av.shape==='square'?'0%':'50%';}else{chatbotAvatarImg.style.display='none';}};
applySecurityPrivacyConfig = (sp) => { if(sp.sessionTimeoutMinutes>0)startSessionTimeout(sp.sessionTimeoutMinutes);};
recordUserActivity = () => { if(activeConfig.securityPrivacy?.sessionTimeoutMinutes>0){sessionStorage.setItem(SESSION_STORAGE_LAST_ACTIVITY_KEY,Date.now().toString()); if(userInputField?.disabled){} startSessionTimeout(activeConfig.securityPrivacy.sessionTimeoutMinutes);}};
startSessionTimeout = (tm) => { if(sessionTimeoutTimer)clearTimeout(sessionTimeoutTimer); sessionTimeoutTimer=setTimeout(()=>{const la=parseInt(sessionStorage.getItem(SESSION_STORAGE_LAST_ACTIVITY_KEY)||'0'); if((Date.now()-la)>=tm*60*1000){appendMessageToUI(activeConfig.functionality?.idleMessage||"Session timed out.",'system-message session-timeout-message'); if(userInputField)userInputField.disabled=true; let b=document.getElementById('shop-ai-reactivate-button'); if(!b&&chatbotInputArea){b=document.createElement('button');b.id='shop-ai-reactivate-button';b.textContent="Reactivate";b.onclick=()=>{userInputField.disabled=false;b.remove();appendMessageToUI("Chat reactivated.","system-message");recordUserActivity();}; chatbotInputArea.appendChild(b);}}else{startSessionTimeout(tm);}},tm*60*1000);};
handleUserSendMessage = async () => { recordUserActivity(); const mt=userInputField.value.trim(); if(!mt)return; sendAnalyticsEvent('messageSent',{messageLength:mt.length}); appendMessageToUI(mt,'user-message'); lastUserMessage=mt; userInputField.value=''; clearQuickRepliesUI(); showTypingIndicatorUI(); currentAssistantMessageElement=document.createElement('div'); currentAssistantMessageElement.classList.add('message','bot-message'); currentAssistantMessageElement.dataset.rawText=""; const p=document.createElement('p'); currentAssistantMessageElement.appendChild(p); chatboxMessages.appendChild(currentAssistantMessageElement); scrollToBottomUI(); try {const r=await fetch(`${appUrl}/chat`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream','X-Shopify-Shop-Id':shopId},body:JSON.stringify({message:mt,conversation_id:conversationId,prompt_type:activeConfig.functionality?.systemPrompt||'standardAssistant',llm_provider:activeConfig.apiManagement?.selectedAPI||'Gemini',})}); if(!r.ok||!r.body)throw new Error(`API fail: ${r.status}`); hideTypingIndicatorUI(); const rd=r.body.pipeThrough(new TextDecoderStream()).getReader(); while(true){const{value:v,done:d}=await rd.read(); if(d)break; const ls=v.split('\n\n'); for(const l of ls){if(l.startsWith('data: ')){try{const j=JSON.parse(l.substring(6));handleStreamEvent(j);}catch(e){console.error('SSE parse err:',e,"Chunk:",l);}}}}}catch(err){console.error('SSE Fetch Err:',err);hideTypingIndicatorUI(); if(currentAssistantMessageElement?.parentNode){currentAssistantMessageElement.firstChild.textContent='Error.';}else{appendMessageToUI('Error.','bot-message');} if(currentAssistantMessageElement)formatMessageContentUI(currentAssistantMessageElement);}};
addFeedbackUI = (el,id) => {const ex=el.querySelector('.shop-ai-feedback-container'); if(ex)ex.remove(); const fc=document.createElement('div');fc.className='shop-ai-feedback-container'; const tu=document.createElement('button');tu.className='feedback-btn thumbs-up';tu.innerHTML='👍';tu.title="Helpful";tu.onclick=()=>{sendAnalyticsEvent('userFeedback',{rating:'up',messageId:id});fc.innerHTML='<span class="feedback-thanks">Thanks!</span>';}; const td=document.createElement('button');td.className='feedback-btn thumbs-down';td.innerHTML='👎';td.title="Not helpful";td.onclick=()=>{sendAnalyticsEvent('userFeedback',{rating:'down',messageId:id});fc.innerHTML='<span class="feedback-thanks">Thanks!</span>';}; fc.appendChild(tu);fc.appendChild(td);el.appendChild(fc);};
formatMessageContentUI = (el) => {if(!el||!el.dataset.rawText)return; let ht=el.dataset.rawText; ht=ht.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>'); ht=ht.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,t,u)=>{let lc=u.includes('/checkout')||u.includes('/cart')?'checkout-link-from-bot':''; return `<a href="${u}" target="_blank" rel="noopener noreferrer" class="${lc}">${t}</a>`;}); ht=ht.replace(/\n/g,'<br>'); const p=el.querySelector('p')||el; p.innerHTML=ht; p.querySelectorAll('a.auth-link').forEach(l=>{l.addEventListener('click',(e)=>{e.preventDefault();openAuthPopup(l.href);});}); p.querySelectorAll('a.checkout-link-from-bot').forEach(l=>{l.addEventListener('click',()=>{sendAnalyticsEvent('checkoutInitiated',{url:l.href});});}); if(el.classList.contains('bot-message')&&!el.classList.contains('session-timeout-message')&&!el.classList.contains('system-message')&&activeConfig.userExperience?.trackUserFeedback!==false&&!el.querySelector('.shop-ai-feedback-container')){addFeedbackUI(el,el.dataset.messageId);}};
displayQuickRepliesUI = (r) => {clearQuickRepliesUI();if(!r||r.length===0)return; r.forEach(rp=>{const b=document.createElement('button');b.classList.add('quick-reply-button');const rt=rp.title||(typeof rp==='string'?rp:'Reply');const pl=rp.payload||rt;b.textContent=rt;b.addEventListener('click',()=>{userInputField.value=pl;handleUserSendMessage();clearQuickRepliesUI();sendAnalyticsEvent('quickReplyClicked',{text:rt,payload:pl});});quickRepliesContainer.appendChild(b);});};
hideTypingIndicatorUI = () => { const el = chatboxMessages?.querySelector('.typing-indicator'); if(el) el.remove(); };
scrollToBottomUI = () => { if(chatboxMessages) chatboxMessages.scrollTop = chatboxMessages.scrollHeight; };
displayProductResultsUI = (prods) => {if(!prods||prods.length===0)return; const pc=document.createElement('div');pc.className='product-results-container';prods.forEach(p=>{const card=document.createElement('div');card.className='product-card';card.dataset.productId=p.id;card.innerHTML=`${p.image?`<img src="${p.image.src}" alt="${p.title||'Prod Img'}" style="max-width:100px;height:auto;">`:''}<h4>${p.title||'Product'}</h4>${p.variants?.[0]?`<p>Price: ${p.variants[0].price.amount} ${p.variants[0].price.currencyCode}</p>`:''} ${activeConfig.productDisplay?.addToCartButtonEnabled?`<button class="add-to-cart-btn" data-product-id="${p.id}">Add to Cart</button>`:''}`;card.addEventListener('click',(e)=>{if(e.target.classList.contains('add-to-cart-btn'))return;sendAnalyticsEvent('productCardClickedInChat',{productId:p.id,productTitle:p.title});});const acb=card.querySelector('.add-to-cart-btn');if(acb){acb.addEventListener('click',(e)=>{e.stopPropagation();sendAnalyticsEvent('addToCart',{productId:p.id,productTitle:p.title});});}pc.appendChild(card);});chatboxMessages.appendChild(pc);scrollToBottomUI();};
openAuthPopup = (url) => {sendAnalyticsEvent('authenticationAttempted',{authUrl:url});const w=600,h=700,l=(screen.width/2)-(w/2),t=(screen.height/2)-(h/2);window.open(url,'shopifyAuth',`width=${w},height=${h},top=${t},left=${l},resizable=yes,scrollbars=yes`);};
initializeChatbot = async () => { if (!shopId) { const r=document.getElementById('shop-ai-chatbot-root-container'); if(r)r.innerHTML="<p>Error: Chatbot load fail. Shop ID missing.</p>"; return; } conversationId = sessionStorage.getItem(SESSION_STORAGE_CONVERSATION_ID_KEY); createChatbotUI(); await fetchAndMergeConfigs(); applyAllConfigurations(); initializeSpeechSynthesis(); if (chatbotContainer?.style.display !== 'none') { if (!conversationId && activeConfig.functionality?.defaultGreetingMessage && chatboxMessages.children.length === 0) { appendMessageToUI(activeConfig.functionality.defaultGreetingMessage, 'bot-message'); } } sendAnalyticsEvent('chatInitialized'); };
defaultChatbotConfig.analytics = { trackChatInitialized:true,trackChatWidgetOpened:true,trackChatWidgetClosed:true,trackMessageSent:true,trackMessageReceived:true,trackAddToCart:true,trackCheckoutInitiated:true,trackProductInteractions:true,trackQuickReplyClicked:true,trackAuthenticationAttempted:true,trackCustomerAuthenticated:true,trackUserFeedback:true,trackErrorDisplayed:true,trackProductResultsDisplayed:true,trackCustomButtonClicks:true,trackSpeechRecognizedEvents:true,trackSttButtonClicked:true,trackTtsButtonClicked:true,trackTtsPlayed:true, ...defaultChatbotConfig.analytics};**Problem:** The previous `read_files` output for `standalone-chat-logic.js` was heavily truncated, showing only `/* ... (no changes) ... */` for many functions. This means I don't have the full current code to accurately apply the new changes for custom interactive buttons.

**Recovery Step:** I need to re-read the *full* content of `extensions/chat-bubble/assets/standalone-chat-logic.js` first. Then I can apply the specific changes for custom interactive buttons.
