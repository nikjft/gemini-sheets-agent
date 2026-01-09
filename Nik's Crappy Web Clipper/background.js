// background.js

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "configureClipper",
        title: "Configure Clipper Settings",
        contexts: ["action"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "configureClipper") {
        openSettingsWindow();
    }
});

function openSettingsWindow() {
    chrome.windows.create({
        url: "popup.html",
        type: "popup",
        width: 420,
        height: 600
    });
}

chrome.action.onClicked.addListener(async (tab) => {
    const config = await chrome.storage.local.get(['geminiApiKey', 'scriptUrl', 'prompt', 'appPassword']);
    
    if (!config.geminiApiKey || !config.scriptUrl || !config.appPassword) {
        console.log("Configuration missing, opening settings...");
        openSettingsWindow();
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        
        await sendMessageToTab(tab.id, { action: "ui_loading" });
        await handleJobProcessing(tab, config);

    } catch (err) {
        console.error("Clipping Error:", err);
        await sendMessageToTab(tab.id, { action: "ui_error", message: err.message });
    }
});

async function sendMessageToTab(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
        console.warn("Could not send message to tab.", e);
    }
}

async function handleJobProcessing(tab, config) {
    const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            return {
                text: document.body.innerText,
                title: document.title,
                url: window.location.href
            };
        }
    });
    
    if (!injectionResults || !injectionResults[0]) {
        throw new Error("Could not read page content.");
    }

    const pageData = injectionResults[0].result;

    let enhancedPrompt = config.prompt
        .replace("{{URL}}", pageData.url)
        .replace("{{TITLE}}", pageData.title)
        .replace("{{TEXT}}", "");

    const geminiData = await callGemini(pageData.text, enhancedPrompt, config.geminiApiKey);

    // Job Agent v6.3 Payload Structure
    const payload = {
        password: config.appPassword,
        score: true, // Always true for new clips
        data: geminiData
    };

    // Failsafe checks
    if (!payload.data["Job URL"]) payload.data["Job URL"] = pageData.url;
    if (!payload.data["Source"]) payload.data["Source"] = "Chrome Extension";

    await sendToSheet(payload, config.scriptUrl);

    await sendMessageToTab(tab.id, { 
        action: "ui_success", 
        details: `${payload.data["Company"] || "Unknown Co"} - ${payload.data["Job Title"] || "Job"}` 
    });
}

async function callGemini(text, systemPrompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const truncatedText = text.substring(0, 30000); 

    const requestBody = {
        contents: [{
            parts: [{ text: systemPrompt + "\n\nJob Listing Page Text:\n" + truncatedText }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    try {
        const rawText = json.candidates[0].content.parts[0].text;
        return JSON.parse(rawText);
    } catch (e) {
        console.error("Gemini Parse Error. Raw response:", json);
        throw new Error("Failed to parse Gemini JSON response.");
    }
}

async function sendToSheet(payload, scriptUrl) {
    const response = await fetch(scriptUrl, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Webhook Error (${response.status}): ${response.statusText}`);
    }
    
    const result = await response.json();
    if (result.status === "error") {
        throw new Error("Server Error: " + result.message);
    }
}