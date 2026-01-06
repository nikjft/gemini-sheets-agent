# Google Sheets Agent Orchestrator - Setup Guide

This project allows you to orchestrate multi-agent workflows directly within Google Sheets using Gemini.

## Features

*   **Multi-Agent Chaining**: Pass data from one agent to another automatically.
*   **Dynamic Routing**: Agents can decide where to route data (or stop) based on their analysis.
*   **Context Integration**: Seamlessly attach Google Docs, Sheets, Slides, PDFs, and text files as context.
*   **Auto-Healing Setup**: The setup script automatically fixes missing columns in your sheets.
*   **Idempotent Execution**: Re-running an agent reliably updates the existing job in the next agent's queue.

## Prerequisites

1.  **Google Account**: You need a Google account to access Google Sheets and Apps Script.
2.  **Google Cloud Project**:
    *   Create a Google Cloud Project.
    *   Enable the **Vertex AI API**.
    *   Obtain an **API Key** (refer to Google AI Studio or Cloud Console credentials).
    *   Alternatively, you can just use a Google AI Studio API Key for gemini-2.0-flash etc.

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
4.  **Important**: To support PDF reading, you must enable the **Drive API** service:
    *   On the left sidebar, click `+` next to **Services**.
    *   Select **Drive API**.
    *   Click **Add**.

### 3. Configure API Key

1.  Refresh the sheet.
2.  Click **Agent Orchestrator** > **Set Up Agents**.
3.  Enter your **Gemini API Key** when prompted.
4.  The script will automatically create the `Agents` tab and an example configuration.
5.  **Permissions**: Google will ask for permissions (Drive, Docs, Sheets, Slides) to fetch context. Approve them.

## Configuration

In the `Agents` tab, configure your agents:

*   **Agent Name**: Unique name (e.g., `Summarizer`).
*   **Auto-Run**: `Yes` (run automatically by trigger) or `No` (manual run only).
*   **Prompt Core**: The main instruction for the agent (e.g., "Summarize this text").
*   **Context Field**: Paste links to **Google Docs, Sheets, Slides, PDFs, or Text files** here. The content will be automatically read and injected into the prompt.
*   **Pass Input to Next**: `Yes`/`No` - Pass the original input to the destination agent?
*   **Pass Agent Context to Next**: `Yes`/`No` - Pass this agent's instructions to the destination?
*   **Pass Data Context to Next**: `Yes`/`No` - Pass the attached Drive file content to the destination?
*   **Model**: Select the model (e.g., `gemini-2.0-flash-exp`).
*   **Destination Agent**:
    *   **Static**: Enter the exact name of another agent (e.g., `EmailDraft`) to always route there.
    *   **Dynamic**: Enter instructions (e.g., "Route to Sales if qualified, otherwise Rejection"). The agent will evaluate the input and decide where to send it.

## Usage

### Running Agents

*   **Manual**: Refresh the sheet. You will see a new menu **Agent Orchestrator**.
    *   **Run Automated Agents**: Runs all agents with `Auto-Run` = `Yes`.
    *   **Run Current Agent**: Runs the agent corresponding to the active tab.
    *   **Re-process Selected Row**: Clears the "Process State" of the selected row and runs immediately.
*   **Automated**: To make this script run automatically, set up a time-based trigger.
    1.  Open the Apps Script editor (**Extensions** > **Apps Script**).
    2.  Select `Code.gs` from the file list.
    3.  From the function dropdown (top bar), select `createTimeBasedTriggers`.
    4.  Click **Run**.
    5.  This will create a trigger that runs `runAllAgents` every 5 minutes.

## Advanced Features

### Dynamic Routing
If you enter instructions in the `Destination Agent` field instead of an agent name, the agent becomes a **Router**.
*   **Example**: "If sentiment is positive route to Happy Response, else route to Apology."
*   The agent will detect this, evaluate the content, and automatically route the payload to the correct agent (or `STOP` if no action is needed).

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

## License & Disclaimer

**"Vibe Coded" & Provided As-Is**

This code was created with the assistance of AI and is provided "as-is" without any warranty of any kind, express or implied. Use it at your own risk.

**License**

Values: MIT. 
You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software for both personal and commercial purposes.

See [LICENSE](LICENSE) for full details.
