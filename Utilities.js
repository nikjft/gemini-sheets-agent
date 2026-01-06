/**
 * Utilities and Helpers
 */

var Utilities_Helper = {

	/**
	 * Generates a UUID-like string
	 */
	generateGUID: function () {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	},

	/**
	 * Returns a map of Header Name -> Column Index (1-based)
	 * Assumes headers are in Row 1.
	 */
	getHeadersIndices: function (sheet) {
		const map = {};
		const lastCol = sheet.getLastColumn();
		if (lastCol === 0) return map;

		const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
		const seen = new Set();

		headers.forEach((header, index) => {
			if (header) {
				const cleanName = header.trim();
				if (seen.has(cleanName)) {
					console.warn(`Duplicate header found in sheet "${sheet.getName()}": "${cleanName}". Using the last occurrence.`);
				}
				seen.add(cleanName);
				map[cleanName] = index + 1;
			}
		});
		return map;
	},

	/**
	 * Reads the "Agents" configuration tab and returns an object keyed by Agent Name
	 */
	getAgentsConfiguration: function () {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const sheet = ss.getSheetByName('Agents');
		if (!sheet) {
			throw new Error('Agents tab not found.');
		}

		const data = sheet.getDataRange().getValues();
		const headers = data[0];
		const configs = {};

		// Helper to find index by name case-insensitive
		const getIdx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

		const indices = {
			name: getIdx('Agent Name'),
			autoRun: getIdx('Auto-Run'),
			prompt: getIdx('Prompt Core'),
			contextInstructions: getIdx('Context Field'),
			passInput: getIdx('Pass Input to Next'),
			passAgentContext: getIdx('Pass Agent Context to Next'),
			passDataContext: getIdx('Pass Data Context to Next'),
			inputDesc: getIdx('Input Description'),
			inputExample: getIdx('Input Example'),
			outputDesc: getIdx('Output Description'),
			outputExample: getIdx('Output Example'),
			model: getIdx('Model'),
			destination: getIdx('Destination Agent')
		};

		for (let i = 1; i < data.length; i++) {
			const row = data[i];
			const name = row[indices.name];
			if (name) {
				// Safe access helper
				const getVal = (idx) => (idx >= 0 && row[idx] !== undefined) ? row[idx].toString() : '';

				configs[name] = {
					name: name,
					autoRun: getVal(indices.autoRun).toLowerCase() === 'yes',
					prompt: row[indices.prompt],
					contextInstructions: row[indices.contextInstructions],
					passInput: getVal(indices.passInput).toLowerCase() === 'yes',
					passAgentContext: getVal(indices.passAgentContext).toLowerCase() === 'yes',
					passDataContext: getVal(indices.passDataContext).toLowerCase() === 'yes',
					inputDesc: row[indices.inputDesc],
					inputExample: row[indices.inputExample],
					outputDesc: row[indices.outputDesc],
					outputExample: row[indices.outputExample],
					model: row[indices.model],
					destination: row[indices.destination]
				};
			}
		}
		return configs;
	}
};
