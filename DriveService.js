/**
 * Drive Service
 * Handles extractions of content from Google Drive links.
 */

var DriveService = {

	processContext: function (text) {
		if (!text) return '';

		// Find all links resembling Drive URLs
		const urls = this.extractDriveUrls(text);
		if (urls.length === 0) return text;

		let expandedText = text + '\n\n--- AUTO-ATTACHED DRIVE CONTENT ---\n';

		urls.forEach(url => {
			try {
				const content = this.fetchFileContent(url);
				if (content) {
					expandedText += `\nFILE: ${url}\nCONTENT:\n${content}\n-----------------------------------\n`;
				}
			} catch (e) {
				console.warn(`Failed to fetch Drive content for ${url}: ${e.toString()}`);
				expandedText += `\nFILE: ${url}\nERROR: Could not read file. ${e.toString()}\n`;
			}
		});

		return expandedText;
	},

	extractDriveUrls: function (text) {
		// Regex for Docs, Sheets, and Drive File IDs
		// Matches: docs.google.com/document/d/ID, docs.google.com/spreadsheets/d/ID, drive.google.com/file/d/ID
		const regex = /https:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|file)\/d\/([a-zA-Z0-9-_]+)/g;
		const matches = [];
		let match;
		while ((match = regex.exec(text)) !== null) {
			matches.push({ url: match[0], id: match[1] });
		}
		return matches;
	},

	fetchFileContent: function (urlObj) {
		const { url, id } = urlObj;

		if (url.includes('/document/')) {
			return this.getTextFromDoc(id);
		} else if (url.includes('/spreadsheets/')) {
			return this.getTextFromSheet(id);
		} else {
			return this.getTextFromBlob(id);
		}
	},

	getTextFromDoc: function (id) {
		const doc = DocumentApp.openById(id);
		return doc.getBody().getText();
	},

	getTextFromSheet: function (id) {
		const ss = SpreadsheetApp.openById(id);
		// Read the first visible sheet by default
		const sheet = ss.getSheets()[0];
		const data = sheet.getDataRange().getValues();

		// Convert 2D array to CSV-like string
		return data.map(row => row.join(', ')).join('\n');
	},

	getTextFromBlob: function (id) {
		const file = DriveApp.getFileById(id);
		const mime = file.getMimeType();

		// Only support text-based formats
		if (mime.includes('text') || mime.includes('json') || mime.includes('csv') || mime.includes('javascript') || mime.includes('html')) {
			return file.getBlob().getDataAsString();
		} else if (mime === MimeType.GOOGLE_DOCS) { // Should be caught by 'document' URL check, but just in case
			return this.getTextFromDoc(id);
		} else if (mime === MimeType.GOOGLE_SHEETS) {
			return this.getTextFromSheet(id);
		}

		return `[Binary or Unsupported File Type: ${mime}]`;
	}
};
