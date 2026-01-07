# Google Sheets Agent Orchestrator - Setup Guide

This project allows you to orchestrate multi-agent workflows directly within Google Sheets using Gemini.

## Features

*   **Multi-Agent Chaining**: Pass data from one agent to another automatically.
*   **Dynamic Routing**: Agents can decide where to route data (or stop) based on their analysis.
*   **Document Generation**: Agents can output formatted **Google Docs** directly, which can then be read by subsequent agents.
*   **Context Integration**: Seamlessly attach Google Docs, Sheets, Slides, PDFs, and text files as context.
*   **Webhook Ingestion**: Securely pipe data into your agents from Zapier or other tools via HTTP.
*   **Auto-Healing Setup**: The setup script automatically fixes missing columns in your sheets.
*   **Idempotent Execution**: Re-running an agent reliably updates the existing job in the next agent's queue.

## Prerequisites

1.  **Google Account**: You need a Google account to access Google Sheets and Apps Script.
2.  **Google Cloud Project**:
    *   Create a Google Cloud Project (or use Google AI Studio).
    *   Obtain a **Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/app/apikey) or Vertex AI).

## Installation

### 1. Create the Google Sheet

1.  Create a new Google Sheet.
2.  Rename the first tab to `Agents`.
3.  **Run the Setup Script**: You don't need to manually create columns. The script will do it for you.

### 2. Add Code

1.  In the Sheet, go to **Extensions** > **Apps Script**.
2.  Delete the default `Code.gs` file content (or rename it).
3.  Create the following files in the Apps Script editor and copy the content from this repository:
    *   `Code.gs` (copy from `Code.js`)
    *   `Orchestrator.gs` (copy from `Orchestrator.js`)
    *   `AgentRunner.gs` (copy from `AgentRunner.js`)
    *   `LLMService.gs` (copy from `LLMService.js`)
    *   `DriveService.gs` (copy from `DriveService.js`)
    *   `Utilities.gs` (copy from `Utilities.js`)
    *   `BudgetManager.gs` (copy from `BudgetManager.js`)
    *   `Setup.gs` (copy from `Setup.js`)
4.  **Important**: To support PDF reading, you must enable the **Drive API** service:
    *   On the left sidebar, click `+` next to **Services**.
    *   Select **Drive API**.
    *   Click **Add**.

### 3. Configure API Key

1.  Refresh the sheet. You will see a new menu **Agent Orchestrator**.
2.  Click **Agent Orchestrator** > **Configuration** > **Configure Gemini API**.
3.  Paste your key in the dialog and click **Save**.
    *   It will be saved securely in Script Properties.

### 4. Initialize Sheets

1.  Click **Agent Orchestrator** > **Set Up Agents**.
2.  The script will automatically create the `Agents` tab structure and an example configuration.
3.  **Permissions**: Google will ask for permissions (Drive, Docs, Sheets, Slides) to fetch context. Approve them.

## Configuration

In the `Agents` tab, configure your agents:

*   **Agent Name**: Unique name (e.g., `Summarizer`).
*   **Auto-Run**: `Yes` (run automatically by trigger) or `No` (manual run only).
    *   **Note**: Agents run in the **top-to-bottom order** they typically appear in this sheet. You can reorder rows to define the execution sequence.
*   **Prompt Core**: The main instruction for the agent (e.g., "Summarize this text").
*   **Context Field**: Paste links to **Google Docs, Sheets, Slides, PDFs, or Text files** here.
*   **Pass Input to Next**: `Yes`/`No` - Pass the original input to the destination agent?
*   **Pass Agent Context to Next**: `Yes`/`No` - Pass this agent's instructions to the destination?
*   **Pass Data Context to Next**: `Yes`/`No` - Pass the attached Drive file content to the destination?
*   **Output Format**:
    *   **Text**: Default. Logic output is written to the cell.
    *   **Document**: Logic output is written to a **new Google Doc**, and the **URL** is written to the cell.
*   **Max Output Tokens**: **NEW**: Limit the response length to save costs (Default: 500).
*   **Use Training Data**: **NEW**: `Yes` to learn from "Good" examples in your sheet. `No` to ignore them (Default: `No`).
*   **Model**: Select the model (e.g., `gemini-2.5-flash`).
*   **Destination Agent**:
    *   **Static**: Enter the exact name of another agent (e.g., `EmailDraft`) to always route there.
    *   **Dynamic**: Enter instructions (e.g., "Route to Sales if qualified, otherwise Rejection"). The agent will evaluate the input and decide where to send it.

## Usage

### Running Agents

*   **Manual**: Refresh the sheet and use the **Agent Orchestrator** menu.
    *   **Run Automated Agents**: Runs all agents with `Auto-Run` = `Yes`.
    *   **Run Current Agent**: Runs the agent corresponding to the active tab.
    *   **Re-process Selected Row**: Clears the "Process State" of the selected row and runs immediately.
*   **Automated**: To make this script run automatically, set up a time-based trigger.
    1.  Open the Apps Script editor (**Extensions** > **Apps Script**).
    2.  Select `Code.gs` from the file list.
    3.  From the function dropdown (top bar), select `createTimeBasedTriggers`.
    4.  Click **Run**.
    5.  This will create a trigger that runs `runAllAgents` every 5 minutes.

### Webhook Ingestion (Zapier/HTML)

You can insert data into your agents from external tools using a secure webhook.

#### 1. Easy Mode (Recommended)
1.  Go to the tab of the agent you want to target (e.g. `InboundLeadProcessor`).
2.  Click **Agent Orchestrator** > **Configuration** > **Generate Webhook for Current Agent**.
3.  A dialog will appear with:
    *   **JSON Payload**: Ready to copy-paste into Zapier.
    *   **CURL Command**: Ready to run in your terminal for testing.
    *   **Note**: The command includes a placeholder `[your web app deployment URL]`. You **must replace this** with your actual Web App URL from the "Deploy" dialog.
    *   It automatically includes your Secret Token and an example input from your sheet.

#### 2. Manual Setup
1.  **Get Token**: Click **Agent Orchestrator** > **Configuration** > **Get Webhook Config**.
2.  **Deploy**: In Apps Script, click **Deploy** > **New deployment** > **Web app**.
3.  **Usage**: Send a POST request to the URL with the following JSON:
    ```json
    {
      "token": "YOUR_SECRET_TOKEN",
      "agentName": "TargetAgentName",
      "input": "<div>Your HTML input</div>",
      "cleanHtml": true
    }
    ```

#### 3. Large Payloads & Caching
If you send a payload larger than **45,000 characters** (e.g. long meeting notes), the system automatically handles it:
1.  The text is saved to a specific `Gemini_Agents_Cache` folder in your Google Drive.
2.  The Google Drive Link is inserted into the Sheet instead of the raw text (avoiding the 50k cell limit).
3.  The Agent automatically reads the full content from the file at runtime.

**Maintenance**:
*   To clean up old cache files, click **Agent Orchestrator** > **Configuration** > **Purge Cache**.
*   Default is to delete files older than 7 days.

### 4. Clipboard Input (Large Texts)
If you have a large text (like a transcript) on your clipboard and want to paste it into a specific cell:
1.  **Select the Target Cell** in any sheet (e.g., an Agent's Input column).
2.  Click **Agent Orchestrator** > **Add Input from Clipboard**.
3.  The modal will confirm your target (e.g. `Agents!C5`).
4.  Paste the text into the box and click **Submit**.
    *   **Large Payload**: If the text is huge (>45k chars), it is automatically cached to Drive and linked.

### 5. Training Data & Safety (New)
To prevent "runaway" costs and context windows, the agent now includes safety filters for Training Data (Few-Shot examples):
- **Use Training Data**: precise control over whether an agent uses your previous rows as examples.
- **Auto-Filtering**: Even if enabled, the agent will **ignore** examples that:
    - Are too long (> 4000 characters combined Input/Output).
    - Contain external links (http/https), to prevent recursive context explosion.

### 6. HTML Cleaning (Cost Saver)
You can now strip HTML tags and convert them to Markdown to save 30-40% on token costs.
- **Clipboard Input**: Check the "Clean HTML to Markdown" box when pasting.
- **Webhook**: Add `"cleanHtml": true` to your JSON payload.

### 7. Global Notifications (Toast)
Receive a simple notification when an Agent finishes a batch.
1.  **Configuration**: Click **Agent Orchestrator** > **Configuration** > **Configure Notifications**.
2.  **Paste URL**: Enter your webhook URL (e.g., from `ntfy.sh` or similar).
3.  **Mechanism**: The system sends a **POST** request to your URL with the message appended as a query parameter: `?message=Agent...`.
4.  **Enable per Agent**: In the **Agents** tab, set **Notify User** to `Yes`.

### 8. Post-Processing Webhook
Send the final output of each row to another service (e.g., Zapier, Make) for downstream automation.
1.  **Agents Tab**: Enter a URL in the **Post-Processing URL** column.
2.  **Payload**: The system sends a **POST** request with a JSON body:
    ```json
    {
      "agentName": "ResearchAgent",
      "jobId": "GUID-123",
      "output": "The full text output from the agent..."
    }
    ```

### 9. Structured Data Output
To get an agent to return JSON for your Post-Processing webhook, use a prompt like this:

**System Prompt Example:**
```text
You are a data extractor.
You must output ONLY valid JSON.
Do not include markdown formatting or code blocks.
Structure:
{
  "summary": "Brief summary",
  "sentiment": "Positive/Negative",
  "action_items": ["Item 1", "Item 2"]
}
```

**Result:** The `output` field in the webhook payload will contain that JSON string, which your downstream tool can parse.

## Advanced Features

### 1. Safe Handoffs (Auto-Caching)
If an agent produces a massive output (>45k chars) that needs to be passed to the next agent:
*   The system automatically saves it to Drive Cache.
*   The **File URL** is passed to the next agent.
*   The next agent automatically reads the file content.
*   **Result**: No "Cell limit exceeded" errors for complex chains.

### 2. Dynamic Routing
If you enter instructions in the `Destination Agent` field, the agent becomes a **Router**.
*   **Example**: "If sentiment is positive route to Happy Response, else route to Apology."
*   The agent output will contain a routing tag (e.g. `>> ROUTE: Apology`).
*   **Clean Handoff**: The system automatically **strips** this tag from the output before writing it to the sheet or creating a document, so your next agent receives clean data.

### Document Generation
Set **Output Format** to `Document`.
*   Ensure your prompt asks for **Markdown** content (e.g., "Output the proposal in Markdown format").
*   The system will create a formatted Google Doc (Headers, Bullets, Bold).
*   The Output cell will contain the `https://docs.google.com/...` link.
*   **Chaining**: If you route this to a next agent, the next agent will automatically **read the text content** of that Google Doc URL as its input.

### Drive Context
The system supports:
*   **Google Docs**: Full text extraction.
*   **Google Sheets**: First tab textual content.
*   **Google Slides**: Text from all slides.
*   **PDFs**: Uses OCR/Conversion to extract text (Requires Drive API Service).
*   **Code/Text**: `.js`, `.py`, `.txt`, `.csv`, `.json`, etc.

## Troubleshooting

*   **Permissions**: The first time you run it, you must approve permissions.
*   **PDF Errors**: If you see an error about Drive API, ensure you enabled the "Drive API" in the Services menu of the script editor.
*   **Timeouts**: Maximum execution time is ~6 minutes. The script picks up where it left off on the next run.

### 10. Budget & Cost Management
Prevent accidental overspending with built-in budgeting tools.
1.  **Budget Config Sheet**: Run **Setup Agents**. A new tab `Budget Config` will appear.
    *   **Daily Budget**: Set a hard daily limit (e.g. $0.10).
    *   **Monthly Budget**: Set a hard monthly limit.
    *   **Per-Run Budget**: Set a limit for a single execution row (e.g. $0.50) to prevent "mega-prompts".
    *   **Model Pricing**: The sheet comes pre-populated with Gemini pricing. You can update these rates manually as they change.
        *   **Current Pricing**: [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
2.  **Processing Log**: A `Processing Log` tab records every single agent run, including:
    *   Timestamp, Agent Name, Job ID.
    *   Tokens In/Out.
    *   **Estimated Cost** (based on your rates).
3.  **Enforcement**:
    *   **Pre-Flight Check**: The system estimates token count (Length/4) before sending data. If the estimated cost exceeds your **Per-Run**, **Daily**, or **Monthly** limit, it skips the row or stops execution.
    *   **Post-Run Check**: It audits the exact cost after execution.

## License & Disclaimer

**"Vibe Coded" & Provided As-Is**

This code was created with the assistance of AI and is provided "as-is" without any warranty of any kind, express or implied. Use it at your own risk.

**License**

Values: MIT. 
You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software for both personal and commercial purposes.

See [LICENSE](LICENSE) for full details.
