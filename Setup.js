/**
 * Setup and Initialization
 * Handles first-time setup, API key management, and sheet generation.
 */

var Setup = {

	/**
	 * Main Setup Entry Point
	 */
	/**
	 * Main Setup Entry Point
	 */
	runSetup: function () {
		const ui = SpreadsheetApp.getUi();

		// 1. Agents Tab Setup
		this.ensureAgentsTab();

		// 2. Data Tabs Setup
		this.ensureDataTabs();

		// 3. Configuration Check (Warn if missing)
		const props = PropertiesService.getScriptProperties();
		const apiKey = props.getProperty('GEMINI_API_KEY');
		const webhook = props.getProperty('WEBHOOK_SECRET');

		let msg = 'Setup Complete! You can now configure your agents in the "Agents" tab.';
		if (!apiKey) {
			msg += '\n\n[!] Gemini API Key is missing. Please use "Agent Orchestrator > Configuration > Configure Gemini API".';
		}
		if (!webhook) {
			msg += '\n\n[!] Webhook Secret is not configured. use "Agent Orchestrator > Configuration > Get Webhook Config" if needed.';
		}

		ui.alert(msg);
	},

	/**
	 * Shows HTML Dialog for API Key Configuration
	 */
	showApiKeyDialog: function () {
		const ui = SpreadsheetApp.getUi();
		const props = PropertiesService.getScriptProperties();
		const currentKey = props.getProperty('GEMINI_API_KEY');

		// Mask key for display
		let displayKey = '';
		if (currentKey && currentKey.length > 4) {
			displayKey = currentKey.substring(0, 4) + '••••••••••••••••';
		}

		const template = HtmlService.createTemplate(`
      <style>
        body { font-family: sans-serif; padding: 20px; }
        .group { margin-bottom: 15px; }
        label { display: block; font-weight: bold; margin-bottom: 5px; }
        input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; cursor: pointer; }
        button.primary { background: #1a73e8; color: white; border: none; }
        .status { margin-top: 10px; font-size: 0.9em; color: green; }
      </style>
      <script>
        function save() {
          var key = document.getElementById('apiKey').value.trim();
          if (!key) {
             alert('Please enter a key.');
             return;
          }
          document.getElementById('status').innerText = 'Saving...';
          google.script.run
            .withSuccessHandler(function() {
               document.getElementById('status').innerText = 'Saved!';
               setTimeout(function() { google.script.host.close(); }, 1000);
            })
            .saveApiKey(key);
        }
        function cancel() {
          google.script.host.close();
        }
      </script>
      <div class="group">
        <label>Current Status</label>
        <div>${displayKey ? 'Key Saved: ' + displayKey : 'No Key Configured'}</div>
      </div>
      <div class="group">
        <label>Enter New API Key</label>
        <input type="text" id="apiKey" placeholder="Paste Gemini API Key here" />
      </div>
      <div class="buttons">
        <button onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">Save</button>
      </div>
      <div id="status" class="status"></div>
    `);

		ui.showModalDialog(template.evaluate().setWidth(400).setHeight(350), 'Configure Gemini API');
	},

	/**
	 * Helper to save key (called by Code.js global function)
	 */
	saveApiKey: function (key) {
		if (key) {
			PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
		}
	},

	/**
	 * Shows Notification Configuration Dialog
	 */
	showNotificationDialog: function () {
		const ui = SpreadsheetApp.getUi();
		const props = PropertiesService.getScriptProperties();
		const currentUrl = props.getProperty('NOTIFICATION_WEBHOOK') || '';

		const template = HtmlService.createTemplate(`
      <style>
        body { font-family: sans-serif; padding: 20px; }
        .group { margin-bottom: 15px; }
        label { display: block; font-weight: bold; margin-bottom: 5px; }
        input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; cursor: pointer; }
        button.primary { background: #1a73e8; color: white; border: none; }
        .status { margin-top: 10px; font-size: 0.9em; color: green; }
        .info { font-size: 0.85em; color: #666; margin-top: 5px; }
      </style>
      <script>
        function save() {
          var url = document.getElementById('webhookUrl').value.trim();
          document.getElementById('status').innerText = 'Saving...';
          google.script.run
            .withSuccessHandler(function() {
               document.getElementById('status').innerText = 'Saved!';
               setTimeout(function() { google.script.host.close(); }, 1000);
            })
            .saveNotificationWebhook(url);
        }
        function cancel() {
          google.script.host.close();
        }
      </script>
      <div class="group">
        <label>Notification Webhook URL</label>
        <input type="text" id="webhookUrl" value="<?= currentUrl ?>" placeholder="https://pushover.net/... or https://chat.googleapis.com/..." />
        <div class="info">Supported: Pushover, Google Chat, Slack, Discord, etc.</div>
      </div>
      <div class="buttons">
        <button onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">Save</button>
      </div>
      <div id="status" class="status"></div>
    `);
		template.currentUrl = currentUrl;
		ui.showModalDialog(template.evaluate().setWidth(450).setHeight(300), 'Configure Global Notifications');
	},

	saveNotificationWebhook: function (url) {
		PropertiesService.getScriptProperties().setProperty('NOTIFICATION_WEBHOOK', url);
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
			'Output Format',
			'Model',
			'Destination Agent',
			'Notify User',        // New
			'Post-Processing URL' // New
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
		setValidation('Output Format', ['Text', 'Document', 'Append to Input Doc']);
		setValidation('Notify User', ['Yes', 'No']); // New

		// Model Validation
		const models = [
			'gemini-2.5-flash',
			'gemini-2.5-pro',
			'gemini-3-flash-preview',
			'gemini-3-pro-preview',
			'gemini-2.0-flash-exp', // Keeping previous default as fallback option
			'gemini-1.5-flash'
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
	},

	/**
	 * Manages the Webhook Secret Token
	 */
	manageWebhookSecret: function () {
		const ui = SpreadsheetApp.getUi();
		const props = PropertiesService.getScriptProperties();
		let secret = props.getProperty('WEBHOOK_SECRET');

		if (!secret) {
			// Generate new if missing
			secret = Utilities_Helper.generateGUID();
			props.setProperty('WEBHOOK_SECRET', secret);
		}

		const template = HtmlService.createTemplate(`
      <style>
        body { font-family: sans-serif; padding: 10px; }
        .token { background: #f0f0f0; padding: 10px; border: 1px solid #ccc; font-family: monospace; word-break: break-all; }
        .warning { color: #d93025; font-size: 0.9em; margin-top: 10px; }
      </style>
      <h3>Webhook Configuration</h3>
      <p>Use this Secret Token to authenticate requests to your Web App.</p>
      <div class="token"><?= secret ?></div>
      <p><strong>URL:</strong> You must Deploy this script as a Web App to get the URL.</p>
      <div class="warning">Keep this token secret! Anyone with it can add data to your sheets.</div>
    `);
		template.secret = secret;

		// We use a modal dialog so they can copy/paste easily
		ui.showModalDialog(template.evaluate().setWidth(400).setHeight(300), 'Webhook Config');
	},

	/**
	 * Shows Agent-Specific Webhook Generator
	 */
	showAgentWebhookDialog: function (agentName) {
		const ui = SpreadsheetApp.getUi();
		const props = PropertiesService.getScriptProperties();

		// 1. Validate Agent
		let configs;
		try {
			configs = Utilities_Helper.getAgentsConfiguration();
		} catch (e) {
			ui.alert('Could not read agent configuration. Please run Setup first.');
			return;
		}

		if (!configs[agentName]) {
			ui.alert('Current sheet is not a configured Agent. Please select an Agent tab.');
			return;
		}

		// 2. Get Secrets & URL
		let secret = props.getProperty('WEBHOOK_SECRET');
		if (!secret) {
			ui.alert('Webhook Secret not found. Please run "Agent Orchestrator > Get Webhook Config" first.');
			return;
		}

		let url = '[your web app deployment URL]';

		// 3. Get Example Input
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(agentName);
		const headers = Utilities_Helper.getHeadersIndices(sheet);

		let exampleInput = "Example Input Data";
		// Try to get Row 2 Input
		if (sheet.getLastRow() >= 2 && headers['Input']) {
			const val = sheet.getRange(2, headers['Input']).getValue();
			if (val) exampleInput = val;
		} else if (configs[agentName].inputExample) {
			exampleInput = configs[agentName].inputExample;
		}

		// 4. Construct JSON & CURL
		// Escape quotes for JSON
		const safeInput = JSON.stringify(exampleInput).slice(1, -1); // remove surrounding quotes from stringify

		const jsonBody = JSON.stringify({
			token: secret,
			agentName: agentName,
			input: exampleInput
		}, null, 2);

		const curlCmd = `curl -L -X POST -H "Content-Type: application/json" -d '${JSON.stringify({
			token: secret,
			agentName: agentName,
			input: exampleInput
		})}' "${url}"`;

		// 5. Render HTML
		const template = HtmlService.createTemplate(`
      <style>
        body { font-family: sans-serif; padding: 15px; }
        .group { margin-bottom: 20px; }
        label { display: block; font-weight: bold; margin-bottom: 5px; color: #333; }
        textarea { width: 100%; height: 80px; padding: 10px; font-family: monospace; border: 1px solid #ccc; background: #f9f9f9; font-size: 12px; }
        .note { font-size: 0.9em; color: #666; margin-top: 5px; }
        .warning { color: #d93025; font-size: 0.9em; font-weight: bold; }
      </style>
      
      <h3>Webhook Generator: ${agentName}</h3>
      
      <div class="group">
        <label>JSON Payload (Zapier)</label>
        <textarea readonly>${jsonBody}</textarea>
        <div class="note">Use this in the "Body" of a POST request.</div>
      </div>

      <div class="group">
        <label>CURL Command (Terminal Test)</label>
        <textarea readonly>${curlCmd}</textarea>
        <div class="note">Paste into Terminal to test immediately.</div>
      </div>

      <div class="group">
        <label>Configuration Details</label>
        <div class="note"><strong>URL:</strong> ${url}</div>
        ${url.indexOf('[YOUR') !== -1 ? '<div class="warning">Warning: Script not deployed as Web App yet. URL is placeholder.</div>' : ''}
      </div>
    `);

		ui.showModalDialog(template.evaluate().setWidth(500).setHeight(450), `Webhook: ${agentName}`);
	},

	/**
	 * Shows Clipboard Input Modal
	 */
	showClipboardInput: function (sheetName, rangeA1) {
		const ui = SpreadsheetApp.getUi();

		const template = HtmlService.createTemplate(`
      <style>
        body { font-family: sans-serif; padding: 15px; display: flex; flex-direction: column; height: 90%; }
        label { font-weight: bold; margin-bottom: 5px; display: block; }
        textarea { flex: 1; width: 100%; min-height: 200px; padding: 10px; margin-bottom: 10px; box-sizing: border-box; border: 1px solid #ccc; font-family: monospace; }
        .buttons { text-align: right; }
        button { padding: 10px 20px; cursor: pointer; background: #eee; border: 1px solid #ccc; }
        button.primary { background: #1a73e8; color: white; border: none; }
        .info { font-size: 0.9em; color: #666; margin-bottom: 10px; }
        .target { font-size: 0.95em; color: #1a73e8; margin-bottom: 10px; font-weight: bold; }
        #status { margin-top: 10px; font-weight: bold; color: #1a73e8; }
        .error { color: #d93025; }
        .success { color: #188038; }
      </style>
      <script>
        function submitData() {
           var text = document.getElementById('inputData').value;
           var appendArgs = document.getElementById('chkAppend').checked;
           
           if (!text.trim()) {
             alert('Input cannot be empty.');
             return;
           }
           
           document.getElementById('status').className = '';
           document.getElementById('status').innerText = 'Processing... (This may take a moment for large files)';
           document.getElementById('btnSubmit').disabled = true;

           google.script.run
             .withSuccessHandler(function(res) {
                var st = document.getElementById('status');
                if (res.success) {
                   st.className = 'success';
                   st.innerText = res.message;
                   setTimeout(function() { google.script.host.close(); }, 2000);
                } else {
                   st.className = 'error';
                   st.innerText = 'Error: ' + res.message;
                   document.getElementById('btnSubmit').disabled = false;
                }
             })
             .withFailureHandler(function(err) {
                 var st = document.getElementById('status');
                 st.className = 'error';
                 st.innerText = 'System Error: ' + err;
                 document.getElementById('btnSubmit').disabled = false;
             })
             .handleClipboardInput('${sheetName}', '${rangeA1}', text, appendArgs);
        }
      </script>
      
      <h3>Add Input from Clipboard</h3>
      <div class="target">Target: ${sheetName}!${rangeA1}</div>
      <div class="info">Paste your text here. Large payloads (>45k chars) will be auto-cached to Drive.</div>
      
      <textarea id="inputData" placeholder="Paste data here..."></textarea>
      
      <div class="checkbox-group">
         <input type="checkbox" id="chkAppend" name="chkAppend">
         <label for="chkAppend" style="display:inline; font-weight:normal;">Append to existing cell content</label>
      </div>

      <div class="buttons">
         <button onclick="google.script.host.close()">Cancel</button>
         <button id="btnSubmit" class="primary" onclick="submitData()">Submit Input</button>
      </div>
      <div id="status"></div>
    `);

		ui.showModalDialog(template.evaluate().setWidth(600).setHeight(500), `Add Input: ${sheetName}!${rangeA1}`);
	}
};
