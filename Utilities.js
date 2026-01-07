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
			outputFormat: getIdx('Output Format'),
			maxOutputTokens: getIdx('Max Output Tokens'),
			useTrainingData: getIdx('Use Training Data'),
			model: getIdx('Model'),
			destination: getIdx('Destination Agent'),
			notifyUser: getIdx('Notify User'),
			postProcessingUrl: getIdx('Post-Processing URL')
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
					outputFormat: row[indices.outputFormat] || 'Text', // Default to Text
					maxOutputTokens: parseInt(row[indices.maxOutputTokens]) || 500, // Default to 500
					useTrainingData: getVal(indices.useTrainingData).toLowerCase() === 'yes', // Default to False
					model: row[indices.model],
					destination: row[indices.destination],
					notifyUser: getVal(indices.notifyUser),
					postProcessingUrl: getVal(indices.postProcessingUrl)
				};
			}
		}
		return configs;
	},

	/**
	 * Lightweight HTML to Markdown Converter (Regex-based)
	 */
	convertHtmlToMarkdown: function (html) {
		if (!html) return "";
		let text = html;

		// 0. Aggressive Cleaning (Scripts, Styles, SVGs, Comments)
		// Note: [\s\S]*? is used to match across newlines non-greedily
		text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
		text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "");
		text = text.replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gmi, "");
		text = text.replace(/<!--([\s\S]*?)-->/gmi, "");

		// 1. Block Elements
		text = text.replace(/<br\s*\/?>/gi, '\n');
		text = text.replace(/<\/div>/gi, '\n');
		text = text.replace(/<\/p>/gi, '\n\n');
		text = text.replace(/<\/h[1-6]>/gi, '\n\n');
		text = text.replace(/<\/li>/gi, '\n');
		text = text.replace(/<\/tr>/gi, '\n');
		text = text.replace(/<hr\s*\/?>/gi, '\n---\n');

		// 2. Headers
		text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1');
		text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1');
		text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1');

		// 3. Formatting
		text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
		text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
		text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_');
		text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_');

		// 4. Links
		text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

		// 5. Lists (Basic)
		text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1');

		// 6. Cleanup Tags
		text = text.replace(/<[^>]+>/g, ''); // Strip remaining tags

		// 7. Cleanup Entitites
		text = text.replace(/&nbsp;/g, ' ');
		text = text.replace(/&amp;/g, '&');
		text = text.replace(/&lt;/g, '<');
		text = text.replace(/&gt;/g, '>');
		text = text.replace(/&quot;/g, '"');

		// 8. Collapse Whitespace
		text = text.replace(/\n\s+\n/g, '\n\n');
		text = text.replace(/\n{3,}/g, '\n\n');

		return text.trim();
	}
};
