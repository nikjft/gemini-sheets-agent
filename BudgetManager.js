/**
 * Budget Manager
 * Handles all cost tracking, budget enforcement, and logging.
 */

var BudgetManager = {

	/**
	 * Ensuring the 'Budget Config' sheet exists and is populated.
	 * Called by Setup.js
	 */
	ensureBudgetSheet: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName('Budget Config');

		if (!sheet) {
			sheet = ss.insertSheet('Budget Config');
			// Default Content
			const defaults = [
				['General Settings', 'Value', ''],
				['Daily Budget ($)', 0.10, ''],
				['Monthly Budget ($)', 0.25, ''],
				['Per-Run Budget ($)', 0.01, ''],
				['', '', ''],
				['Model Pricing', '$/1M Input', '$/1M Output'],
				['gemini-2.5-flash-lite', 0.10, 0.40],
				['gemini-2.5-flash', 0.30, 2.50],
				['gemini-3-flash-preview', 0.50, 3.00],
				['gemini-2.5-pro', 2.50, 15.00],
				['gemini-3-pro-preview', 4.00, 18.00]
			];
			sheet.getRange(1, 1, defaults.length, 3).setValues(defaults);

			// Formatting
			sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#f3f3f3');
			sheet.getRange('A5:C5').setFontWeight('bold').setBackground('#f3f3f3');
			sheet.setColumnWidth(1, 200);
		}
	},

	/**
	 * Ensuring the 'Processing Log' sheet exists.
	 * Called by Setup.js
	 */
	ensureLogSheet: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName('Processing Log');

		if (!sheet) {
			sheet = ss.insertSheet('Processing Log');
			const headers = ['Timestamp', 'Day', 'Agent Name', 'Job ID', 'Model', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Est. Cost ($)'];
			sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
			sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e6e6e6');
			sheet.setFrozenRows(1);
		}
	},

	/**
	 * Reads Budget Settings from 'Budget Config' sheet
	 */
	getBudgetThresholds: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName('Budget Config');
		if (!sheet) return { daily: 0, monthly: 0 };

		return {
			daily: parseFloat(sheet.getRange('B2').getValue()) || 0,
			monthly: parseFloat(sheet.getRange('B3').getValue()) || 0,
			perRun: parseFloat(sheet.getRange('B4').getValue()) || 0
		};
	},

	/**
	 * Reads Model Pricing from 'Budget Config' sheet
	 * Returns Map: { 'model-name': { input: 0.10, output: 0.40 } }
	 */
	getModelRates: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName('Budget Config');
		const rates = {};
		if (!sheet) return rates;

		// Assuming table starts at Row 6 (Headers A6:C6), Data A7:C
		const lastRow = sheet.getLastRow();
		if (lastRow < 7) return rates;

		const data = sheet.getRange(7, 1, lastRow - 6, 3).getValues();
		data.forEach(row => {
			const model = row[0];
			if (model) {
				rates[model.trim().toLowerCase()] = {
					input: parseFloat(row[1]) || 0,
					output: parseFloat(row[2]) || 0
				};
			}
		});
		return rates;
	},

	/**
	 * Calculates cost based on tokens and rates
	 */
	calculateCost: function (model, inputTokens, outputTokens, rates) {
		const modelKey = (model || '').trim().toLowerCase();
		const rate = rates[modelKey];

		if (!rate) return 0;

		// input rate is per 1M tokens
		// output rate is per 1M tokens
		const costIn = (inputTokens / 1000000) * rate.input;
		const costOut = (outputTokens / 1000000) * rate.output;
		return costIn + costOut;
	},

	/**
	 * Heuristic Token Estimation
	 * Rule of Thumb: 1 Token = 4 Characters
	 */
	estimateTokenCount: function (text) {
		if (!text) return 0;
		return Math.ceil(text.length / 4);
	},

	/**
	 * Audits Usage against Limits
	 * Returns { safe: boolean, reason: string }
	 */
	checkBudgetAvailability: function (estimatedNewCost) {
		const limits = this.getBudgetThresholds();

		// 1. Per-Run Check (Immediate)
		if (limits.perRun > 0 && estimatedNewCost > limits.perRun) {
			return { safe: false, reason: `Per-Run Budget Exceeded (Est: $${estimatedNewCost.toFixed(4)}, Limit: $${limits.perRun})` };
		}

		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const logSheet = ss.getSheetByName('Processing Log');

		if (!logSheet) return { safe: true, reason: 'No Log Sheet' };

		// Read Logs
		const lastRow = logSheet.getLastRow();
		if (lastRow < 2) {
			// No logs yet
			if (estimatedNewCost > limits.daily) return { safe: false, reason: 'Exceeds Daily Limit' };
			return { safe: true };
		}

		// Optimization: Read only last 2000 rows? For now read all (simple)
		// Headers: Date, Day, ... Cost ($) (Col I / 9)
		// Day is Col 2
		const data = logSheet.getRange(2, 1, lastRow - 1, 9).getValues();

		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = String(today.getMonth() + 1).padStart(2, '0');
		const dd = String(today.getDate()).padStart(2, '0');
		const todayStr = `${yyyy}-${mm}-${dd}`;
		const monthStr = `${yyyy}-${mm}`;

		let dailySum = 0;
		let monthlySum = 0;

		for (let i = 0; i < data.length; i++) {
			const rowDay = String(data[i][1]); // Col 2: Day String YYYY-MM-DD
			const cost = parseFloat(data[i][8]) || 0; // Col 9: Est Cost

			if (rowDay === todayStr) {
				dailySum += cost;
			}
			if (rowDay.startsWith(monthStr)) {
				monthlySum += cost;
			}
		}

		if (dailySum + estimatedNewCost > limits.daily) {
			return { safe: false, reason: `Daily Budget Exceeded (Used: $${dailySum.toFixed(4)}, Limit: $${limits.daily})` };
		}
		if (monthlySum + estimatedNewCost > limits.monthly) {
			return { safe: false, reason: `Monthly Budget Exceeded (Used: $${monthlySum.toFixed(4)}, Limit: $${limits.monthly})` };
		}

		return { safe: true };
	},

	/**
	 * Logs a completed transaction
	 */
	logProcessing: function (agentName, jobId, model, inTok, outTok, cost) {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName('Processing Log');
		if (!sheet) return;

		const now = new Date();
		const yyyy = now.getFullYear();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const dayStr = `${yyyy}-${mm}-${dd}`;

		sheet.appendRow([
			now,
			dayStr,
			agentName,
			jobId,
			model,
			inTok,
			outTok,
			inTok + outTok,
			cost
		]);
	}
};
