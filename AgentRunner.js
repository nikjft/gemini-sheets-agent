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

		// Runtime API Key Check
		const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
		if (!apiKey) {
			const msg = `Gemini API Key is missing. Please select "Agent Orchestrator > Configure Gemini API" from the menu.`;
			console.error(msg);
			SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Error', 10);
			return false;
		}

		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName(agentName);
		if (!sheet) {
			const msg = `Sheet not found for agent: ${agentName}. Please run "Agent Orchestrator > Set Up Agents" to generate it.`;
			console.error(msg);
			SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Error', 10);
			return false;
		}

		// Identify Headers
		const headers = Utilities_Helper.getHeadersIndices(sheet);
		const requiredHeaders = ['Job ID', 'Input', 'Output', 'Context', 'Process State', 'Quality', 'Error'];

		// Simple validation
		for (const h of requiredHeaders) {
			if (!headers[h]) {
				const msg = `Missing required header "${h}" in sheet ${agentName}. Please run "Agent Orchestrator > Set Up Agents" to fix it.`;
				console.error(msg);
				SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Error', 10);
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
			let rowContext = row[headers['Context'] - 1] || '';
			// Expand Drive Links in Data Context
			rowContext = DriveService.processContext(rowContext);

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
				let finalOutput = result.text;
				let routedDestination = config.destination; // Default. If dynamic, this string is ignored/overwritten below.

				// Dynamic Routing Parsing & Cleanup
				// We parse the routing tag from the raw LLM output.
				// If found, we STRIP it from the output so it doesn't appear in the Document, the Sheet, or the Handoff input.
				const isStatic = configs[config.destination];
				if (config.destination && !isStatic) {
					const routeRegex = />> ROUTE: (.+)$/m;
					const match = finalOutput.match(routeRegex);

					if (match) {
						const instruction = match[1].trim();
						console.log(`Dynamic Routing Triggered: ${instruction}`);

						// GLOBAL CLEANUP: Remove tag from the text immediately
						finalOutput = finalOutput.replace(routeRegex, '').trim();

						if (instruction.toUpperCase() === 'STOP') {
							routedDestination = null;
						} else {
							if (configs[instruction]) {
								routedDestination = instruction;
							} else {
								console.warn(`Routed agent "${instruction}" not found. Falling back to default.`);
								routedDestination = null;
							}
						}
					} else {
						console.warn("Dynamic routing instruction present in usages but no ROUTE tag found.");
						// Don't route if tag is missing but required by prompt instructions? 
						// Safer to Stop or Default? Code implicitly defaults to nothing (STOP) if match fails and destination was instruction-based.
						// Logic check: if `config.destination` was an instruction string, it won't match any static map key.
						// So `routedDestination` (initially the instruction string) is NOT a valid agent name.
						// handoffToNextAgent checks `ss.getSheetByName(destName)`. If destName is a long instruction string, sheet won't exist.
						// So it effectively stops. Correct.
						routedDestination = null;
					}
				}

				// Document Creation Logic
				// Uses the CLEANED `finalOutput` text.
				if (config.outputFormat === 'Document') {
					const docTitle = `${config.name} Output - ${jobId}`;
					try {
						const docUrl = DriveService.createDocumentFromMarkdown(docTitle, finalOutput);
						console.log(`Created Document: ${docUrl}`);
						finalOutput = docUrl; // Overwrite text with URL for Sheet/Handoff
					} catch (e) {
						console.error(`Failed to create document: ${e.toString()}`);
						finalOutput += `\n[ERROR: Failed to create Google Doc. Raw output preserved.]`;
					}
				}

				// Write Output
				sheet.getRange(rowIndex, headers['Output']).setValue(finalOutput);
				sheet.getRange(rowIndex, headers['Process State']).setValue('Completed');

				// Handoff to Next Agent
				if (routedDestination) {
					// Need to merge config with new destination temporarily
					const routingConfig = { ...config, destination: routedDestination };
					this.handoffToNextAgent(ss, routingConfig, jobId, inputVal, rowContext, finalOutput);
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
		// Expand Drive Links in Agent Configuration Context
		const agentContext = DriveService.processContext(config.contextInstructions || '');

		let prompt = `
You are an AI agent named "${config.name}".
Your Goal: ${config.prompt}

INSTRUCTIONS:
${agentContext}
`;

		// Dynamic Routing Logic
		// We check if the destination is a static Agent Name or a set of Instructions
		const allConfigs = Utilities_Helper.getAgentsConfiguration();
		const isStaticDestination = allConfigs[config.destination];

		if (config.destination && !isStaticDestination) {
			// It's a dynamic instruction (e.g. "Route to X if Y...")
			const agentNames = Object.keys(allConfigs).join(', ');

			prompt += `
DETERMINE NEXT STEP:
${config.destination}

You have control over the process flow. Based on the rule above, append ONE of the following tags to the very end of your response:
1. ">> ROUTE: STOP" (If the process should end)
2. ">> ROUTE: [Agent Name]" (To pass to a specific agent)

Available Agents: ${agentNames}
`;
		}

		prompt += `
INPUT DESCRIPTION:
${config.inputDesc || 'N/A'}

OUTPUT DESCRIPTION:
${config.outputDesc || 'N/A'}
		`;

		if (config.inputExample) {
			prompt += `\nGENERIC INPUT EXAMPLE: \n${config.inputExample} \n`;
		}
		if (config.outputExample) {
			prompt += `\nGENERIC OUTPUT EXAMPLE: \n${config.outputExample} \n`;
		}

		if (goodExamples.length > 0) {
			prompt += `\n\n### POSITIVE EXAMPLES(Emulate these style / logic): \n`;
			goodExamples.forEach((ex, idx) => {
				prompt += `Example ${idx + 1}: \nInput: ${ex.input} \nOutput: ${ex.output} \n-- -\n`;
			});
		}

		if (badExamples.length > 0) {
			prompt += `\n\n### NEGATIVE EXAMPLES(Avoid these mistakes): \n`;
			badExamples.forEach((ex, idx) => {
				prompt += `Example ${idx + 1}: \nInput: ${ex.input} \nOutput: ${ex.output} \n-- -\n`;
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
		if (!headers['Job ID'] || !headers['Input']) {
			console.warn(`Destination sheet ${destName} missing required headers.`);
			return;
		}

		// 1. Calculate Context to Pass (Granular Control)
		const contextObj = {};
		let hasContext = false;

		// Pass Input
		if (config.passInput) {
			contextObj.prior_input = currentInput;
			hasContext = true;
		}
		// Pass Agent Instructions (Static)
		if (config.passAgentContext) {
			contextObj.prior_agent_instructions = config.contextInstructions || '';
			hasContext = true;
		}
		// Pass Data Context (Dynamic)
		if (config.passDataContext) {
			contextObj.prior_data_context = currentContext;
			hasContext = true;
		}

		const nextContext = hasContext ? JSON.stringify(contextObj, null, 2) : '';

		// 2. Prepare Row Data
		// Mapping: JobID -> JobID, Output -> Input, Context -> Context
		const lastCol = destSheet.getLastColumn();

		// New Row Array (1-based index logic)
		const newRowData = new Array(lastCol).fill('');

		// Helper to set value at correct index (0-based array)
		// headers map returns 1-based index
		const setVal = (headerName, val) => {
			if (headers[headerName]) {
				newRowData[headers[headerName] - 1] = val;
			}
		};

		setVal('Job ID', jobId);
		setVal('Input', currentOutput); // The output of current is input of next
		setVal('Context', nextContext);
		// Ensure Process State is empty so it gets picked up
		setVal('Process State', '');

		// 3. Idempotency Check: Overwrite if Job ID exists
		const destData = destSheet.getDataRange().getValues();
		const jobIdColIdx = headers['Job ID'] - 1;

		let foundRowIndex = -1;

		// Start from row 2 (index 1)
		for (let i = 1; i < destData.length; i++) {
			if (destData[i][jobIdColIdx] == jobId) {
				foundRowIndex = i + 1; // 1-based row index
				break;
			}
		}

		if (foundRowIndex > -1) {
			// Overwrite existing row
			destSheet.getRange(foundRowIndex, 1, 1, lastCol).setValues([newRowData]);
			console.log(`Updated existing row for Job ${jobId} in ${destName} `);
		} else {
			// Append new row
			destSheet.appendRow(newRowData);
			console.log(`Appended new row for Job ${jobId} into ${destName} `);
		}
	}
};
