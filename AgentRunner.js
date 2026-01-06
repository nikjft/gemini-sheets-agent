/**
 * Agent Runner
 * Executes the logic for a specific agent.
 */

var AgentRunner = {

	runAgent: function (agentName, globalStartTime, maxTime) {
		const configs = Utilities_Helper.getAgentsConfiguration();
		const config = configs[agentName];

		if (!config) {
			console.log(`Configuration not found for agent: ${agentName}`);
			return false;
		}

		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(agentName);
		if (!sheet) {
			console.log(`Sheet not found for agent: ${agentName}`);
			return false;
		}

		// Identify Headers
		const headers = Utilities_Helper.getHeadersIndices(sheet);
		const requiredHeaders = ['Job ID', 'Input', 'Output', 'Context', 'Process State', 'Quality', 'Error'];

		// Simple validation
		for (const h of requiredHeaders) {
			if (!headers[h]) {
				console.log(`Missing required header "${h}" in sheet ${agentName}`);
				return false;
			}
		}

		// Get Data
		const lastRow = sheet.getLastRow();
		if (lastRow < 2) return false; // No data

		const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
		const data = dataRange.getValues();

		// 1. Gather Examples (Few-Shot)
		// We look for rows with Quality = 2 (Good) and Quality = 0 (Bad)
		let goodExamples = [];
		let badExamples = [];

		// Limit examples to avoid massive prompt
		const MAX_EXAMPLES = 3;

		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			const q = row[headers['Quality'] - 1]; // -1 because data array is 0-indexed, headers map is 1-indexed
			const input = row[headers['Input'] - 1];
			const output = row[headers['Output'] - 1];

			if ((q === 2 || q === '2') && input && output && goodExamples.length < MAX_EXAMPLES) {
				goodExamples.push({ input: input, output: output });
			}
			if ((q === 0 || q === '0') && input && output && badExamples.length < MAX_EXAMPLES) {
				badExamples.push({ input: input, output: output });
			}
		}

		// 2. Iterate and Process
		// We modify the sheet row by row to ensure data safety if script times out
		for (let i = 0; i < data.length; i++) {

			// TIMEOUT CHECK
			if (globalStartTime && maxTime) {
				if (Date.now() - globalStartTime > maxTime) {
					console.log(`Timeout limit reached during agent: ${agentName}`);
					return true; // Return true to signal timeout
				}
			}

			const rowIndex = i + 2; // Actual sheet row number
			const row = data[i];

			const status = (row[headers['Process State'] - 1] || '').toString().toLowerCase();

			// Filter: Process only if status is NOT completed, processing, or error
			if (status === 'completed' || status === 'processing' || status === 'error') {
				continue;
			}

			// Check if Input exists
			const inputVal = row[headers['Input'] - 1];
			if (!inputVal) continue; // Skip empty rows

			// Update status to Processing
			sheet.getRange(rowIndex, headers['Process State']).setValue('Processing');
			SpreadsheetApp.flush(); // Force update UI

			// Handle Job ID
			let jobId = row[headers['Job ID'] - 1];
			if (!jobId) {
				jobId = Utilities_Helper.generateGUID();
				sheet.getRange(rowIndex, headers['Job ID']).setValue(jobId);
			}

			// Prepare Context
			const rowContext = row[headers['Context'] - 1] || '';

			// Construct Prompt
			const systemPrompt = this.constructSystemPrompt(config, goodExamples, badExamples);
			const userContent = `
CONTEXT:
${rowContext}

INPUT DATA:
${inputVal}
      `;

			// Call LLM
			const result = LLMService.callGemini(config.model, systemPrompt, userContent);

			if (result.success) {
				// Write Output
				sheet.getRange(rowIndex, headers['Output']).setValue(result.text);
				sheet.getRange(rowIndex, headers['Process State']).setValue('Completed');

				// Handoff to Next Agent
				// NOTE: We do NOT trigger the next agent recursively to avoid call stack depth / timeout issues.
				// We just append the data. The Orchestrator loop (or next trigger) will pick it up.
				if (config.destination) {
					this.handoffToNextAgent(ss, config, jobId, inputVal, rowContext, result.text);
				}

			} else {
				// Handle Error
				sheet.getRange(rowIndex, headers['Process State']).setValue('Error');
				sheet.getRange(rowIndex, headers['Error']).setValue(JSON.stringify(result.error));
			}

			// Flush every row to save progress
			SpreadsheetApp.flush();
		}

		return false; // Completed without timeout
	},

	/**
	 * Constructs the System Prompt based on configuration and examples
	 */
	constructSystemPrompt: function (config, goodExamples, badExamples) {
		let prompt = `
You are an AI agent named "${config.name}".
Your Goal: ${config.prompt}

INSTRUCTIONS:
${config.contextInstructions || ''}

INPUT DESCRIPTION:
${config.inputDesc || 'N/A'}

OUTPUT DESCRIPTION:
${config.outputDesc || 'N/A'}
    `;

		if (config.inputExample) {
			prompt += `\nGENERIC INPUT EXAMPLE:\n${config.inputExample}\n`;
		}
		if (config.outputExample) {
			prompt += `\nGENERIC OUTPUT EXAMPLE:\n${config.outputExample}\n`;
		}

		if (goodExamples.length > 0) {
			prompt += `\n\n### POSITIVE EXAMPLES (Emulate these style/logic):\n`;
			goodExamples.forEach((ex, idx) => {
				prompt += `Example ${idx + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}\n---\n`;
			});
		}

		if (badExamples.length > 0) {
			prompt += `\n\n### NEGATIVE EXAMPLES (Avoid these mistakes):\n`;
			badExamples.forEach((ex, idx) => {
				prompt += `Example ${idx + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}\n---\n`;
			});
		}

		return prompt;
	},

	/**
	 * Passes data to the destination agent
	 */
	handoffToNextAgent: function (ss, config, jobId, currentInput, currentContext, currentOutput) {
		const destName = config.destination;
		const destSheet = ss.getSheetByName(destName);

		if (!destSheet) {
			console.log(`Destination sheet ${destName} not found.`);
			return;
		}

		const headers = Utilities_Helper.getHeadersIndices(destSheet);
		if (!headers['Job ID'] || !headers['Input']) return;

		// Calculate Context to Pass
		let nextContext = '';
		const passMode = config.passContext.toLowerCase();

		if (passMode === 'agent') {
			nextContext = config.contextInstructions || '';
		} else if (passMode === 'data') {
			nextContext = currentContext;
		} else if (passMode === 'both') {
			nextContext = JSON.stringify({
				prior_agent_context: config.contextInstructions || '',
				prior_data_context: currentContext
			}, null, 2);
		}

		// Append Row
		// Mapping: JobID -> JobID, Output -> Input, Context -> Context
		// We create an array matching the sheet columns length, filling specific indices

		const lastCol = destSheet.getLastColumn();
		const newRow = new Array(lastCol).fill('');

		newRow[headers['Job ID'] - 1] = jobId;
		newRow[headers['Input'] - 1] = currentOutput; // The output of current is input of next
		if (headers['Context']) {
			newRow[headers['Context'] - 1] = nextContext;
		}

		// Add row
		destSheet.appendRow(newRow);
	}
};
