/**
 * Google Sheets Agent Orchestrator
 * Entry Point: Menus and Triggers
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const configMenu = ui.createMenu('Configuration')
    .addItem('Configure Gemini API', 'menuConfigureAPI')
    .addItem('Configure Notifications', 'menuConfigureNotifications') // New
    .addItem('Get Webhook Config', 'menuWebhookConfig')
    .addItem('Generate Webhook for Current Agent', 'menuGetAgentWebhook')
    .addItem('Purge Cache', 'menuPurgeCache');

  ui.createMenu('Agent Orchestrator')
    .addItem('Run automated agents', 'menuRunAll')
    .addItem('Run current agent', 'menuRunCurrent')
    .addItem('Re-process selected row', 'menuProcessSelected')
    .addItem('Add Input from Clipboard', 'menuClipboardInput')
    .addSeparator()
    .addItem('Set Up Agents', 'menuSetup')
    .addSubMenu(configMenu)
    .addSeparator()
    .addItem('Help', 'menuHelp')
    .addToUi();
}

/**
 * Menu Handler: Setup Wizard
 */
function menuSetup() {
  Setup.runSetup();
}

/**
 * Menu Handler: Add Input from Clipboard
 */
function menuClipboardInput() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();

  if (!range) {
    SpreadsheetApp.getUi().alert('Please select a cell first.');
    return;
  }

  const sheetName = sheet.getName();
  const rangeA1 = range.getA1Notation();

  // Pass details to Setup
  Setup.showClipboardInput(sheetName, rangeA1);
}

/**
 * Client-Side Handler: Process Clipboard Input
 */
/**
 * Client-Side Handler: Process Clipboard Input
 */
/**
 * Client-Side Handler: Process Clipboard Input
 */
function handleClipboardInput(sheetName, rangeA1, text, appendMode, cleanHtml) {
  try {
    if (!text) throw new Error("Input is empty.");
    if (!sheetName || !rangeA1) throw new Error("Target cell information missing.");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

    const range = sheet.getRange(rangeA1);

    // Optional HTML Cleaning
    if (cleanHtml) {
      text = Utilities_Helper.convertHtmlToMarkdown(text);
    }

    let existingInput = '';

    // Append Logic
    if (appendMode) {
      existingInput = range.getValue().toString();
    }

    let inputVal = text;

    if (appendMode && existingInput) {
      // Combine
      const combinedText = existingInput + '\n\n' + text;

      // Cache if Combined is Large
      if (combinedText.length > 45000) {
        inputVal = DriveService.saveToCache(sheetName, combinedText);
      } else {
        inputVal = combinedText;
      }
    } else {
      // Overwrite / New Logic
      if (text.length > 45000) {
        inputVal = DriveService.saveToCache(sheetName, text);
      }
    }

    // Write to Range
    range.setValue(inputVal);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Data pasted successfully!" + (inputVal.length > 45000 || inputVal.includes('https://') ? " (Cached/Linked)" : "")
    };

  } catch (e) {
    return { success: false, message: e.toString() };
  }
}



/**
 * Menu Handler: Generate Webhook for Current Agent
 */
function menuGetAgentWebhook() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const agentName = sheet.getName();
  Setup.showAgentWebhookDialog(agentName);
}

/**
 * Menu Handler: API Key Config
 */
function menuConfigureAPI() {
  Setup.showApiKeyDialog();
}

/**
 * Client-Side Handler: Save API Key
 * Must be a global function to be called by google.script.run
 */
function saveApiKey(key) {
  Setup.saveApiKey(key);
}

/**
 * Menu Handler: Webhook Config
 */
function menuWebhookConfig() {
  Setup.manageWebhookSecret();
}

/**
 * Menu Handler: Notification Config
 */
function menuConfigureNotifications() {
  Setup.showNotificationDialog();
}

/**
 * Client-Side Handler: Save Notification Webhook
 */
function saveNotificationWebhook(url) {
  Setup.saveNotificationWebhook(url);
}

/**
 * Menu Handler: Purge Cache
 */
function menuPurgeCache() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('Purge Cache', 'Delete cache files older than X days (default 7):', ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() == ui.Button.OK) {
    const txt = result.getResponseText();
    const days = parseInt(txt) || 7;
    const count = DriveService.purgeCache(days);
    ui.alert(`Deleted ${count} file(s) from Gemini_Agents_Cache.`);
  }
}

/**
 * Web App Entry Point: POST Requests
 */
function doPost(e) {
  const output = { status: 'error', message: '' };

  try {
    // 1. Parse Payload
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST data received.');
    }

    // Support both JSON and URL-encoded, but prefer JSON
    const json = JSON.parse(e.postData.contents);
    const token = json.token;
    const agentName = json.agentName;
    let input = json.input;

    // 2. Security Check & Validation
    const savedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!savedSecret || token !== savedSecret) {
      throw new Error('Unauthorized: Invalid or missing Token.');
    }

    if (!agentName) throw new Error('Missing "agentName".');
    if (!input) throw new Error('Missing "input".');

    // Optional: Clean HTML
    if (json.cleanHtml) {
      input = Utilities_Helper.convertHtmlToMarkdown(input);
    }

    // Handle Large Payloads (>45k chars) to avoid Cell Limit (50k)
    // Note: After markdown conversion, it might be smaller!
    if (input.length > 45000) {
      try {
        const cacheUrl = DriveService.saveToCache(agentName, input);
        input = cacheUrl; // Replace raw content with Drive URL
      } catch (e) {
        console.error(`Failed to cache large payload: ${e.toString()}`);
        throw new Error('Payload too large and caching failed.');
      }
    }

    // 3. Insert into Sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(agentName);

    if (!sheet) {
      throw new Error(`Agent sheet "${agentName}" not found.`);
    }

    // Get Headers to find columns
    const headers = Utilities_Helper.getHeadersIndices(sheet);
    if (!headers['Job ID'] || !headers['Input']) {
      throw new Error('Sheet missing required headers (Job ID, Input).');
    }

    // Prepare Row
    const lastCol = sheet.getLastColumn();
    const newRowData = new Array(lastCol).fill('');

    const jobId = Utilities_Helper.generateGUID();

    // Map fields
    // NOTE: headers indices are 1-based, array is 0-based
    const setVal = (name, val) => {
      if (headers[name]) newRowData[headers[name] - 1] = val;
    };

    setVal('Job ID', jobId);
    setVal('Input', input);
    setVal('Process State', ''); // Empty state triggers processing

    // Append
    sheet.appendRow(newRowData);
    SpreadsheetApp.flush();

    // 4. Success Response
    output.status = 'success';
    output.jobId = jobId;
    output.message = `Row inserted into ${agentName}.`;

  } catch (error) {
    output.message = error.toString();
    console.error('Webhook Error: ' + error.toString());
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Creates a time-driven trigger to run automated agents every 5 minutes.
 * Run this once manually.
 */
function createTimeBasedTriggers() {
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runAllAgents') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('runAllAgents')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Trigger created for runAllAgents every 5 minutes.');
}

/**
 * Menu Handler: Run all agents marked as Auto-Run
 */
function menuRunAll() {
  Orchestrator.runAllAgents();
}

/**
 * Menu Handler: Run only the agent for the currently active sheet
 */
function menuRunCurrent() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const agentName = sheet.getName();

  if (Orchestrator.isAgent(agentName)) {
    SpreadsheetApp.getActiveSpreadsheet().toast(`Starting agent: ${agentName}`, 'Info', 3);
    // Add 5 minute timeout safety
    AgentRunner.runAgent(agentName, Date.now(), 1000 * 60 * 5);
    SpreadsheetApp.getActiveSpreadsheet().toast(`Completed agent: ${agentName}`, 'Success', 3);
  } else {
    SpreadsheetApp.getUi().alert('Current sheet is not a configured Agent.');
  }
}

/**
 * Menu Handler: Clear status and run specific selected rows
 */
function menuProcessSelected() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const agentName = sheet.getName();

  if (!Orchestrator.isAgent(agentName)) {
    SpreadsheetApp.getUi().alert('Current sheet is not a configured Agent.');
    return;
  }

  const selection = sheet.getSelection();
  const ranges = selection.getActiveRangeList().getRanges();

  // We need to identify the "Process State" column index
  const headers = Utilities_Helper.getHeadersIndices(sheet);
  if (!headers['Process State']) {
    SpreadsheetApp.getUi().alert('Could not find "Process State" header.');
    return;
  }

  // For visual feedback
  SpreadsheetApp.getActiveSpreadsheet().toast('Resetting status for selected rows...', 'Processing');

  const targetIndices = [];

  ranges.forEach(range => {
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    // Headers are row 1, so data starts row 2. ensure we don't edit header.
    if (startRow < 2 && numRows === 1) return; // just header selected

    const safeStart = Math.max(2, startRow);
    const safeNumRows = (startRow < 2) ? numRows - 1 : numRows;

    if (safeNumRows > 0) {
      sheet.getRange(safeStart, headers['Process State'], safeNumRows).setValue('');

      // Collect Indices
      for (let r = 0; r < safeNumRows; r++) {
        targetIndices.push(safeStart + r);
      }
    }
  });

  // Now run the agent. It will pick up the blank status rows.
  // Note: This runs the WHOLE agent scan again, picking up these rows.
  // Add 5 minute timeout safety
  if (targetIndices.length > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(`Processing ${targetIndices.length} specific row(s)...`, 'Starting');
    AgentRunner.runAgent(agentName, Date.now(), 1000 * 60 * 5, targetIndices);
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('No valid rows selected.', 'Warning');
  }
  SpreadsheetApp.getActiveSpreadsheet().toast('Processing complete.', 'Success');
}

/**
 * Menu Handler: Help
 */
function menuHelp() {
  const html = HtmlService.createHtmlOutput(`
    <style>body { font-family: sans-serif; padding: 15px; text-align: center; }</style>
    <h3>Gemini Sheets Agent</h3>
    <p>View source code, documentation, and report issues on GitHub:</p>
    <p><a href="https://github.com/nikjft/gemini-sheets-agent" target="_blank">https://github.com/nikjft/gemini-sheets-agent</a></p>
    <div style="margin-top: 20px;">
      <button onclick="google.script.host.close()">Close</button>
    </div>
  `)
    .setWidth(400)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Help');
}
