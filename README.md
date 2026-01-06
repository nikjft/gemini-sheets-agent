# Google Sheets Agent Orchestrator - Setup Guide

This project allows you to orchestrate multi-agent workflows directly within Google Sheets using Gemini.

## Prerequisites

1.  **Google Account**: You need a Google account to access Google Sheets and Apps Script.
2.  **Google Cloud Project**:
    *   Create a Google Cloud Project.
    *   Enable the **Vertex AI API**.
    *   Obtain an **API Key** (refer to Google AI Studio or Cloud Console credentials).
    *   Alternatively, you can just use a Google AI Studio API Key for gemini-1.5-flash etc.

## Installation

### 1. Create the Google Sheet

1.  Create a new Google Sheet.
2.  Rename the first tab to `Agents`.
3.  Create the columns in the `Agents` tab with the exact following headers (order doesn't strictly matter, but this is recommended):
    *   `Agent Name`
    *   `Auto-Run` (Values: `Yes` / `No`)
    *   `Prompt Core`
    *   `Context Field`
    *   `Pass Context` (Values: `Agent`, `Data`, `Both`)
    *   `Input Description`
    *   `Input Example`
    *   `Output Description`
    *   `Output Example`
    *   `Model` (e.g., `gemini-1.5-flash`, `gemini-1.5-pro`)
    *   `Destination Agent` (Name of the next agent/sheet)

### 2. Add Code

1.  In the Sheet, go to **Extensions** > **Apps Script**.
2.  Delete the default `Code.gs` file content (or rename it).
3.  Create the following files in the Apps Script editor and copy the content from this repository:
    *   `Code.gs` (copy from `Code.js`)
    *   `Orchestrator.gs` (copy from `Orchestrator.js`)
    *   `AgentRunner.gs` (copy from `AgentRunner.js`)
    *   `LLMService.gs` (copy from `LLMService.js`)
    *   `Utilities.gs` (copy from `Utilities.js`)
4.  **Important**: To support PDF reading, you must enable the **Drive API** service:
    *   On the left sidebar, click `+` next to **Services**.
    *   Select **Drive API**.
    *   Click **Add**.

### 3. Configure API Key

1.  In the Apps Script editor, go to **Project Settings** (gear icon).
2.  Scroll to **Script Properties**.
3.  Click **Add script property**.
4.  Property: `GEMINI_API_KEY`
5.  Value: `your-api-key-here`
6.  Click **Save script property**.

## Usage

### Initial Setup

1.  Refresh the sheet after adding the code.
2.  Click **Agent Orchestrator** > **Set Up Agents**.
3.  Enter your **Gemini API Key** when prompted.
4.  The script will automatically create the `Agents` tab and an example configuration.
5.  **Important**: When running for the first time with the new Drive integration, Google will ask for permissions to access Drive, Docs, and Sheets. This is required to fetch context from your files.

### Defining an Agent

1.  In the `Agents` tab, configure your agents.
    *   **Agent Name**: `Summarizer`
    *   **Auto-Run**: `Yes`
    *   **Prompt Core**: `Summarize the input text.`
    *   **Context Field**: You can now paste links to Google Docs, Sheets, or Drive files here! The content will be automatically read and appended.
    *   **Model**: `gemini-2.0-flash-exp`
    *   **Destination Agent**: `EmailDraft` (optional)
2.  Run **Agent Orchestrator** > **Set Up Agents** again. It will detect the new agent in the config and automatically create the `Summarizer` data tab with the correct headers.

### Running Agents

*   **Manual**: Refresh the sheet. You will see a new menu **Agent Orchestrator**.
    *   **Run Automated Agents**: Runs all agents with `Auto-Run` = `Yes`.
    *   **Run Current Agent**: Runs the agent corresponding to the active tab.
    *   **Re-process Selected Row**: clear the "Process State" of the selected row and run immediately.
*   **Automated**: The script is set up to run every X minutes (default 5 or 10) if you enable the trigger. (You may need to run `createTimeBasedTriggers` function once manually from the editor).

## Troubleshooting

*   **Permissions**: The first time you run it, Google will ask for permissions. Approve them.
*   **Timeouts**: If you have hundreds of rows, the script might time out (6 mins). It is designed to pick up where it left off on the next run.
