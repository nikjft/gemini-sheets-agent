/**
 * Google Sheets Agent Orchestrator
 * Entry Point: Menus and Triggers
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Agent Orchestrator')
    .addItem('Run automated agents', 'menuRunAll')
    .addItem('Run current agent', 'menuRunCurrent')
    .addItem('Re-process selected row', 'menuProcessSelected')
    .addSeparator() // Optional separator for UI cleanliness
    .addItem('Set Up Agents', 'menuSetup')
    .addToUi();
}

/**
 * Menu Handler: Setup Wizard
 */
function menuSetup() {
  Setup.runSetup();
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

  // Reset status to empty for selected rows
  // This is a simplified approach; ideally we check row by row. 
  // Apps Script ranges are 1-indexed.
  ranges.forEach(range => {
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    // Headers are row 1, so data starts row 2. ensure we don't edit header.
    if (startRow < 2 && numRows === 1) return; // just header selected

    const safeStart = Math.max(2, startRow);
    const safeNumRows = (startRow < 2) ? numRows - 1 : numRows;

    if (safeNumRows > 0) {
      sheet.getRange(safeStart, headers['Process State'], safeNumRows).setValue('');
    }
  });

  // Now run the agent. It will pick up the blank status rows.
  // Note: This runs the WHOLE agent scan again, picking up these rows.
  // Add 5 minute timeout safety
  AgentRunner.runAgent(agentName, Date.now(), 1000 * 60 * 5);
  SpreadsheetApp.getActiveSpreadsheet().toast('Processing complete.', 'Success');
}
