// background.js

// 1. Initialization
chrome.runtime.onInstalled.addListener(() => {
    // Clear existing menus to avoid duplicate ID errors during development/reloads
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "clip_selection",
            title: "Clip Selection to Service",
            contexts: ["selection"]
        });
        chrome.contextMenus.create({
            id: "clip_page",
            title: "Clip Page to Service",
            contexts: ["page", "frame"]
        });
        // This adds the menu item when right-clicking the extension icon
        chrome.contextMenus.create({
            id: "open_settings",
            title: "Configure Services & Rules",
            contexts: ["action"]
        });
    });
});

// 2. Context Menu Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "open_settings") {
        return chrome.runtime.openOptionsPage();
    }
    const textToClip = info.selectionText || "";
    await handleClipRequest(tab, textToClip);
});

// 3. Message Handler (From Content Script Picker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "execute_service") {
        // User manually selected a service from the picker
        executeWebhook(message.service, message.data, sender.tab.id);
    }
});

// 4. Core Logic
async function handleClipRequest(tab, selectionText) {
    if (!tab) return;
    const services = (await chrome.storage.local.get('services')).services || [];
    const rules = (await chrome.storage.local.get('rules')).rules || [];

    // Get full page data if needed (title, url)
    // We already have tab.url and tab.title from the 'tab' object usually, but let's confirm
    const data = {
        text: selectionText, // Might be empty if they clicked "Clip Page" without selection
        title: tab.title,
        url: tab.url
    };

    // If no text selected, try to grab page text? 
    // Or just leave it empty and let the prompt handle it?
    // Let's grab full body text if selection is empty, as a fallback "Whole Page Clip"
    if (!data.text) {
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText
            });
            data.text = result[0].result;
        } catch (e) {
            console.warn("Could not grab page text", e);
        }
    }

    // Checking Rules
    const matchedServiceId = findServiceForRule(data.url, rules);

    if (matchedServiceId) {
        const service = services.find(s => s.id === matchedServiceId);
        if (service) {
            await executeWebhook(service, data, tab.id);
            return;
        }
    }

    // No Rule matched: Show Picker
    await showServicePicker(tab.id, services, data);
}

function findServiceForRule(url, rules) {
    for (const rule of rules) {
        try {
            const regex = new RegExp(rule.pattern, 'i');
            if (regex.test(url)) {
                return rule.serviceId;
            }
        } catch (e) {
            console.warn("Invalid Regex in rule:", rule);
        }
    }
    return null;
}

// 5. Execution
async function executeWebhook(service, data, tabId) {
    // Notify UI: Loading
    await sendMessageToTab(tabId, { action: "ui_loading" });

    try {
        // Variable Substitution
        let body = service.bodyTemplate
            .replace(/{{TEXT}}/g, escapeJSONString(data.text))
            .replace(/{{URL}}/g, escapeJSONString(data.url))
            .replace(/{{TITLE}}/g, escapeJSONString(data.title));

        // Parse to JSON to ensure validity (User provided a string template)
        // If the user's template is "{"a": "{{TEXT}}"}" -> Replaced -> parse
        // If it fails, they wrote bad JSON.
        let payload;
        try {
            payload = JSON.parse(body);
        } catch (e) {
            // Fallback: If they just want to send raw string? 
            // Usually we enforce JSON. Let's error for now.
            throw new Error("Invalid JSON Body Template after substitution. Check your quotes/escaping.");
        }

        const response = await fetch(service.url, {
            method: service.method || "POST",
            headers: {
                "Content-Type": "application/json",
                ...(service.headers || {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Service Error: ${response.status} ${response.statusText}`);
        }

        const resultText = await response.text();

        // Notify UI: Success
        await sendMessageToTab(tabId, { action: "ui_success", details: `Sent to ${service.name}` });

    } catch (e) {
        console.error(e);
        await sendMessageToTab(tabId, { action: "ui_error", message: e.message });
    }
}

// 6. Helpers
async function showServicePicker(tabId, services, data) {
    // Inject content script if not there (Manifest does this, but good to be safe?)
    // Actually manifest "matches": ["<all_urls>"] does it.

    // Send message to open modal
    await sendMessageToTab(tabId, {
        action: "open_picker",
        services: services,
        data: data
    });
}

async function sendMessageToTab(tabId, message) {
    if (!tabId) return;
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
        // Content script might not be loaded on internal chrome:// pages or if refreshing
        console.warn("Tab message failed", e);
    }
}

function escapeJSONString(str) {
    if (typeof str !== 'string') return "";
    return str
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/"/g, '\\"');
}