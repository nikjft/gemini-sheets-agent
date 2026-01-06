/**
 * Setup and Initialization
 * Handles first-time setup, API key management, and sheet generation.
 */

var Setup = {

	/**
	 * Main Setup Entry Point
	 */
	runSetup: function () {
		const ui = SpreadsheetApp.getUi();

		// 1. API Key Setup
		const apiKeySet = this.manageApiKey(ui);
		if (!apiKeySet) {
			ui.alert('Setup cancelled or API Key not provided.');
			return;
		}

		// 2. Agents Tab Setup
		this.ensureAgentsTab();

		// 3. Data Tabs Setup
		this.ensureDataTabs();

		ui.alert('Setup Complete! You can now configure your agents in the "Agents" tab.');
	},

	/**
	 * Manages the API Key prompt and storage
	 */
	manageApiKey: function (ui) {
		const props = PropertiesService.getScriptProperties();
		const currentKey = props.getProperty('GEMINI_API_KEY');

		let shouldPrompt = true;

		if (currentKey) {
			const response = ui.alert(
				'API Key Configuration',
				'An API Key is already saved. Do you want to overwrite it?',
				ui.ButtonSet.YES_NO
			);
			if (response === ui.Button.NO) {
				shouldPrompt = false;
			}
		}

		if (shouldPrompt) {
			const prompt = ui.prompt(
				'Enter Gemini API Key',
				'Please paste your Vertex AI or Gemini API Key:',
				ui.ButtonSet.OK_CANCEL
			);

			if (prompt.getSelectedButton() === ui.Button.OK) {
				const key = prompt.getResponseText().trim();
				if (key) {
					props.setProperty('GEMINI_API_KEY', key);
					return true;
				} else {
					return false; // User clicked OK but entered nothing
				}
			} else {
				return false; // User clicked Cancel
			}
		}

		return true; // Key exists and user chose not to change, or key updated successfully
	},

	/**
	 * Ensures the "Agents" configuration tab exists and has headers
	 */
	ensureAgentsTab: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName('Agents');

		// Desired Headers
		const headers = [
			'Agent Name',
			'Auto-Run',
			'Prompt Core',
			'Context Field',
			'Pass Input to Next',
			'Pass Agent Context to Next',
			'Pass Data Context to Next',
			'Input Description',
			'Input Example',
			'Output Description',
			'Output Example',
			'Output Format', // New
			'Model',
			'Destination Agent'
		];

		// Logic to check and append missing headers (Auto-Repair)
		if (sheet) {
			const lastCol = sheet.getLastColumn();
			if (lastCol > 0) {
				const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
				headers.forEach(h => {
					if (!currentHeaders.includes(h)) {
						sheet.getRange(1, lastCol + 1).setValue(h).setFontWeight('bold');
						console.log(`Added missing header: ${h}`);
					}
				});
			}
		} else {
			// New Sheet Creation
			sheet = ss.insertSheet('Agents', 0);
			sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
			sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
			sheet.setFrozenRows(1);

			// Example Agent
			const exampleRow = [
				'ExampleAgent',
				'No',
				'Summarize this text.',
				'Keep it under 50 words.',
				'Yes', // Pass Input
				'No',  // Pass Agent Context
				'No',  // Pass Data Context
				'A paragraph of text',
				'Lorem ipsum...',
				'A brief summary',
				'It was a text about Lorem.',
				'Text', // Output Format
				'gemini-2.0-flash-exp',
				''
			];
			sheet.appendRow(exampleRow);
			console.log('Created Agents tab.');
		}

		// Apply Data Validation (Dynamic locations)
		const headersIndices = Utilities_Helper.getHeadersIndices(sheet);

		const setValidation = (colName, list) => {
			const colIdx = headersIndices[colName];
			if (colIdx) {
				const rule = SpreadsheetApp.newDataValidation().requireValueInList(list).setAllowInvalid(true).build();
				// Apply to rows 2-1000
				sheet.getRange(2, colIdx, 999, 1).setDataValidation(rule);
			}
		};

		setValidation('Auto-Run', ['Yes', 'No']);
		setValidation('Pass Input to Next', ['Yes', 'No']);
		setValidation('Pass Agent Context to Next', ['Yes', 'No']);
		setValidation('Pass Data Context to Next', ['Yes', 'No']);
		setValidation('Output Format', ['Text', 'Document']); // New

		// Model Validation
		const models = [
			'gemini-2.0-flash-exp',
			'gemini-1.5-flash',
			'gemini-1.5-flash-8b',
			'gemini-1.5-pro',
			'gemini-1.5-pro-002'
		];
		setValidation('Model', models);
	},

	/**
	 * Scans the Agents tab and creates missing Data tabs
	 */
	ensureDataTabs: function () {
		// We can rely on Utilities helper, but we need to cover the case where Utilities might throw if Agents doesn't exist 
		// (though we just ran ensureAgentsTab, so it should exist).

		let configs;
		try {
			configs = Utilities_Helper.getAgentsConfiguration();
		} catch (e) {
			console.error('Error reading configuration during setup: ' + e);
			return;
		}

		const ss = SpreadsheetApp.getActiveSpreadsheet();

		// Required headers for Data tabs
		const dataHeaders = ['Job ID', 'Input', 'Output', 'Context', 'Process State', 'Quality', 'Error'];

		for (const agentName in configs) {
			let sheet = ss.getSheetByName(agentName);

			if (!sheet) {
				sheet = ss.insertSheet(agentName);
				// Important: setValues requires a 2D array [[h1, h2, h3]]
				sheet.getRange(1, 1, 1, dataHeaders.length).setValues([dataHeaders]);
				sheet.getRange(1, 1, 1, dataHeaders.length).setFontWeight('bold');
				sheet.setFrozenRows(1);
				SpreadsheetApp.flush(); // Force write
				console.log(`Created data tab for agent: ${agentName}`);
			} else {
				// Auto-Repair Data Headers
				const lastCol = sheet.getLastColumn();
				if (lastCol > 0) {
					const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
					dataHeaders.forEach(h => {
						if (!currentHeaders.includes(h)) {
							sheet.getRange(1, lastCol + 1).setValue(h).setFontWeight('bold');
							console.log(`Added missing header to ${agentName}: ${h}`);
						}
					});
				}
				console.log(`Data tab for agent "${agentName}" checked/updated.`);
			}
		}
	}
};
