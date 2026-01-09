document.addEventListener('DOMContentLoaded', () => {
    const fields = ['geminiApiKey', 'scriptUrl', 'prompt', 'appPassword'];
    
    // NEW: Job Agent v6.3 Spec Prompt
    const DEFAULT_PROMPT = `Role: Job Data Integration Agent
Objective: Format job listing data into a precise JSON payload for the Job Agent Webhook.
Context:
You are viewing a job posting. You must extract the details and structure them for an Upsert operation (Update existing or Insert new) in the backend database.
Input Data:
- Browser URL: {{URL}}
- Page Title: {{TITLE}}
- Page Text: {{TEXT}}

Required JSON Payload Structure:
{
    "Job Title": "{{Extracted Title}}",
    "Company": "{{Extracted Company Name}}",
    "Job URL": "{{Extracted URL - CRITICAL: This is the fallback Match Key. Use the Browser URL provided, but strip session tracking params.}}",
    "Location": "{{Extracted Location or 'Remote'}}",
    "Full Job Description": "{{Full text of the job posting, formatted as clean Markdown}}",
    "Salary": "{{Extracted Salary or null}}",
    "Source": "Chrome Extension" 
}

Critical Rules:
1. Keys Case-Sensitivity: The keys MUST match the list above exactly.
2. Unique Identifier: The "Job URL" is the primary match key. Ensure it is accurate.
3. Missing Data: If a field is not found (e.g., Salary), omit the key or set it to an empty string "".
4. Return ONLY valid JSON.`;

    const statusDiv = document.getElementById('statusMsg');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');

    // 1. Load Settings
    chrome.storage.local.get(fields, (result) => {
        if (result.geminiApiKey) document.getElementById('geminiApiKey').value = result.geminiApiKey;
        if (result.scriptUrl) document.getElementById('scriptUrl').value = result.scriptUrl;
        if (result.appPassword) document.getElementById('appPassword').value = result.appPassword;
        
        // Handle Prompt: Use stored value OR default
        if (result.prompt && result.prompt.trim() !== "") {
            document.getElementById('prompt').value = result.prompt;
        } else {
            console.log("No prompt found, setting default.");
            document.getElementById('prompt').value = DEFAULT_PROMPT;
        }
    });

    // 2. Save Handler
    saveBtn.addEventListener('click', () => {
        const config = {
            geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
            scriptUrl: document.getElementById('scriptUrl').value.trim(),
            prompt: document.getElementById('prompt').value.trim(),
            appPassword: document.getElementById('appPassword').value.trim()
        };

        if (!config.geminiApiKey || !config.scriptUrl || !config.appPassword) {
            statusDiv.textContent = "Error: All fields are required.";
            statusDiv.className = "status error";
            return;
        }

        chrome.storage.local.set(config, () => {
            if (chrome.runtime.lastError) {
                statusDiv.textContent = "Error: " + chrome.runtime.lastError.message;
                statusDiv.className = "status error";
            } else {
                statusDiv.textContent = "Settings Saved!";
                statusDiv.className = "status success";
                
                // Button feedback
                saveBtn.textContent = "Saved ✓";
                saveBtn.style.backgroundColor = "#10b981"; // Green
                setTimeout(() => {
                    saveBtn.textContent = "Save Settings";
                    saveBtn.style.backgroundColor = "#4f46e5"; // Back to Indigo
                    statusDiv.textContent = "";
                }, 1500);
            }
        });
    });

    // 3. Reset Handler
    resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("Reset all settings? You will need to re-enter your keys.")) {
            chrome.storage.local.clear(() => {
                document.getElementById('geminiApiKey').value = "";
                document.getElementById('scriptUrl').value = "";
                document.getElementById('appPassword').value = "";
                document.getElementById('prompt').value = DEFAULT_PROMPT; 
                
                statusDiv.textContent = "Settings Reset.";
                statusDiv.className = "status error";
            });
        }
    });
});