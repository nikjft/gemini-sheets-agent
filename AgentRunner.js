/**
 * Agent Runner
 * Executes the logic for a specific agent.
 */

var AgentRunner = {

	runAgent: function (agentName, globalStartTime, maxTime, targetRowIndices) {
		const configs = Utilities_Helper.getAgentsConfiguration();
		const config = configs[agentName];

		if (!config) {
			console.log(`Configuration not found for agent: ${agentName}`);
			return false;
		}


		// Runtime API Key Check
		if (targetRowIndices && targetRowIndices.length > 0) {
			console.log(`AgentRunner: Strict Mode enabled for rows: ${JSON.stringify(targetRowIndices)}`);
		} else {
			console.log(`AgentRunner: Processing ALL pending rows.`);
		}

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
		let itemsProcessed = 0;
		let processingErrors = 0;


		// Limit examples to avoid massive prompt
		const MAX_EXAMPLES = 3;



		// --- PRE-FLIGHT BUDGET CHECK ---
		// 1. Estimate Cost
		const heuristicRates = BudgetManager.getModelRates();
		const estInputTokens = BudgetManager.estimateTokenCount(config.prompt + (goodExamples.length * 200) + 500); // Heuristic Prompt + Examples + Buffer
		// Better Heuristic: Just estimate based on known prompt length locally? 
		// Logic: constructSystemPrompt is available. Let's build it? 
		// No, constructSystemPrompt needs 'rowContext' which isn't available outside the loop.
		// We can do a General Pre-Check here (Daily/Monthly) with 0 cost to fail fast if already exceeded.
		const generalCheck = BudgetManager.checkBudgetAvailability(0);
		if (!generalCheck.safe) {
			const msg = `Budget Limit Reached: ${generalCheck.reason}. Execution stopped.`;
			console.error(msg);
			SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Budget Limit', -1);
			return false;
		}


		for (let i = 0; i < data.length; i++) {
			// Skip if Training is disabled
			if (!config.useTrainingData) break;

			const row = data[i];
			const q = row[headers['Quality'] - 1];
			let input = row[headers['Input'] - 1];
			let output = row[headers['Output'] - 1];

			// Validation: Must exist
			if (!input || !output) continue;

			input = input.toString();
			output = output.toString();

			// Filter 1: Size (~1000 tokens ≈ 4000 chars)
			if ((input.length + output.length) > 4000) continue;

			// Filter 2: External References (likely huge context or cache)
			if (input.includes('https://') || output.includes('https://') || input.includes('http://') || output.includes('http://')) {
				continue;
			}

			if ((q === 2 || q === '2') && goodExamples.length < MAX_EXAMPLES) {
				goodExamples.push({ input: input, output: output });
			}
			if ((q === 0 || q === '0') && badExamples.length < MAX_EXAMPLES) {
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

			// STRICT MODE: If specific rows are requested, skip all others
			if (targetRowIndices && targetRowIndices.length > 0) {
				if (!targetRowIndices.includes(rowIndex)) {
					continue;
				}
			}

			const row = data[i];

			const status = (row[headers['Process State'] - 1] || '').toString().toLowerCase();

			// Filter: Process only if status is NOT completed, processing, or error
			// EXCEPTION: If specific rows are requested, we Force Run even if Error? 
			// User said "Re-process selected row". Usually implies force run.
			// The Code.js clears the status to '' before calling, so the status check below passes anyway.
			if (status === 'completed' || status === 'processing' || status === 'error') {
				continue;
			}

			// Check if Input exists
			let inputVal = row[headers['Input'] - 1];
			if (!inputVal) continue; // Skip empty rows

			const originalInput = inputVal; // Capture for potential Append Mode

			// Process Input for Drive Context (e.g. if Input is a Doc URL)
			inputVal = DriveService.processContext(inputVal);

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

			// --- HEURISTIC PRE-FLIGHT ONE-OFF CHECK ---
			const fullPromptEstimate = systemPrompt + userContent;
			const estInputTok = BudgetManager.estimateTokenCount(fullPromptEstimate);
			const estOutputTok = 1000; // Safety Assumption
			const estCost = BudgetManager.calculateCost(config.model, estInputTok, estOutputTok, BudgetManager.getModelRates());

			const preFlight = BudgetManager.checkBudgetAvailability(estCost);
			if (!preFlight.safe) {
				const msg = `Stopped Row ${rowIndex}: ${preFlight.reason}`;
				console.error(msg);
				sheet.getRange(rowIndex, headers['Process State']).setValue('Budget Limit Hit');
				// Don't stop entire batch? Or Should we? 
				// If Per-Run limit hit, just stop this row? 
				// If Daily limit hit, stop everything.
				if (preFlight.reason.includes('Daily') || preFlight.reason.includes('Monthly')) {
					SpreadsheetApp.getActiveSpreadsheet().toast("Daily/Monthly Budget Hit. Stopping.", "Budget Stop", -1);
					return true; // Stop Batch
				}
				// If Per-Run limit, maybe just skip this massive row?
				sheet.getRange(rowIndex, headers['Error']).setValue(msg);
				SpreadsheetApp.flush();
				continue; // Skip this row
			}

			const result = LLMService.callGemini(config.model, systemPrompt, userContent, 0.7, config.maxOutputTokens);

			if (result.success) {
				let finalOutput = result.text;

				// --- COST & BUDGET TRACKING (New) ---
				const usage = result.usage || { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
				const rates = BudgetManager.getModelRates(); // Re-read or pass in? Reading once at top is better but let's read here for simplicity or optimization?
				// Optimization: Read rates ONCE at start of runAgent

				const estimatedCost = BudgetManager.calculateCost(config.model, usage.promptTokens, usage.candidateTokens, rates);

				// 1. Log to Processing Log Sheet
				BudgetManager.logProcessing(
					agentName,
					jobId,
					config.model,
					usage.promptTokens,
					usage.candidateTokens,
					estimatedCost
				);

				// 2. Check Budget Availability
				const budgetCheck = BudgetManager.checkBudgetAvailability(0); // Check AFTER add (log already added cost? logic check)
				// Actually checkBudgetAvailability reads the log. We just added to the log. So checkBudgetAvailability will see the new cost.
				// We just need to check if 'safe' is false.

				if (!budgetCheck.safe) {
					console.error("Budget Exceeded: " + budgetCheck.reason);
					SpreadsheetApp.getActiveSpreadsheet().toast("Budget Exceeded! Stopping execution.", "Budget Alert", -1);

					// Mark current row as completed (we paid for it)
					sheet.getRange(rowIndex, headers['Output']).setValue(finalOutput);
					sheet.getRange(rowIndex, headers['Process State']).setValue('Completed');
					SpreadsheetApp.flush();

					// STOP EXECUTION
					return true;
				}

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
				} else if (config.outputFormat === 'Append to Input Doc') {
					try {
						// Extract Doc ID from original input (must be a URL)
						const urls = DriveService.extractDriveUrls(originalInput);
						let docUrl = null;

						if (urls.length > 0 && urls[0].url.includes('/document/')) {
							const docId = urls[0].id;
							docUrl = DriveService.appendMarkdownToDocument(docId, finalOutput);
							console.log(`Appended to Document: ${docUrl}`);
							finalOutput = docUrl; // Overwrite val
						} else {
							// Fallback: Create new if input wasn't a doc
							console.warn('Output format is Append, but Input was not a Doc URL. Creating new doc instead.');
							const docTitle = `${config.name} Output - ${jobId}`;
							docUrl = DriveService.createDocumentFromMarkdown(docTitle, finalOutput);
							finalOutput = docUrl;
						}
					} catch (e) {
						console.error(`Failed to append to document: ${e.toString()}`);
						finalOutput += `\n[ERROR: Failed to append to Doc. Raw output preserved.]`;
					}
				}

				// Write Output
				sheet.getRange(rowIndex, headers['Output']).setValue(finalOutput);
				sheet.getRange(rowIndex, headers['Process State']).setValue('Completed');

				itemsProcessed++;

				// --- POST-PROCESSING WEBHOOK (Per Row) ---
				if (config.postProcessingUrl) {
					try {
						const payload = {
							agentName: agentName,
							jobId: jobId,
							output: finalOutput
						};

						UrlFetchApp.fetch(config.postProcessingUrl, {
							method: 'post',
							contentType: 'application/json',
							payload: JSON.stringify(payload)
						});
					} catch (e) {
						console.warn(`Post-processing webhook failed: ${e.toString()}`);
					}
				}

				// Handoff to Next Agent
				if (routedDestination) {
					// Need to merge config with new destination temporarily
					const routingConfig = { ...config, destination: routedDestination };
					this.handoffToNextAgent(ss, routingConfig, jobId, inputVal, rowContext, finalOutput);
				}

			} else {
				// Handle Error
				processingErrors++;
				sheet.getRange(rowIndex, headers['Process State']).setValue('Error');
				sheet.getRange(rowIndex, headers['Error']).setValue(JSON.stringify(result.error));
			}

			// Flush every row to save progress
			SpreadsheetApp.flush();
		}

		// --- POST-RUN ACTIONS ---

		// 1. Global Notification (if enabled for this agent)
		if (config.notifyUser === 'Yes' && (itemsProcessed > 0 || processingErrors > 0)) {
			this.sendNotification(agentName, itemsProcessed, processingErrors);
		}

		return false; // Completed without timeout
	},

	/* Helper for Notifications */
	sendNotification: function (agentName, count, errors) {
		let url = PropertiesService.getScriptProperties().getProperty('NOTIFICATION_WEBHOOK');
		if (!url) return;

		const message = `Agent "${agentName}" finished. Processed: ${count}. Errors: ${errors}.`;

		// Append message to URL Query String
		const separator = url.includes('?') ? '&' : '?';
		url += separator + 'message=' + encodeURIComponent(message);

		try {
			// Lightweight services often prefer URL params. We keep it as POST.
			UrlFetchApp.fetch(url, {
				method: 'post'
			});
		} catch (e) {
			console.warn("Failed to send notification: " + e.toString());
		}
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

		// Safe Payload Handoff > 45k chars
		let nextInput = currentOutput;
		if (nextInput && nextInput.length > 45000) {
			try {
				// Use the Destination Agent's name for the cache file prefix
				nextInput = DriveService.saveToCache(config.destination, currentOutput);
				console.log(`Large payload cached for handoff: ${nextInput}`);
			} catch (e) {
				console.error(`Failed to cache handoff payload: ${e.toString()}`);
				// We proceed with raw text, hoping it fits or user handles error
			}
		}

		setVal('Input', nextInput); // The output of current is input of next
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
