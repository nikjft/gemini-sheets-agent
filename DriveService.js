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
		// Matches: docs.google.com/document/d/ID, docs.google.com/spreadsheets/d/ID, docs.google.com/presentation/d/ID, drive.google.com/file/d/ID
		const regex = /https:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|presentation|file)\/d\/([a-zA-Z0-9-_]+)/g;
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
		} else if (url.includes('/presentation/')) {
			return this.getTextFromSlides(id);
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

	getTextFromSlides: function (id) {
		const presentation = SlidesApp.openById(id);
		const slides = presentation.getSlides();
		let textContent = `Presentation Title: ${presentation.getName()}\n\n`;

		slides.forEach((slide, index) => {
			textContent += `--- Slide ${index + 1} ---\n`;
			const shapes = slide.getShapes();
			shapes.forEach(shape => {
				if (shape.hasText()) {
					textContent += shape.getText().asString() + '\n';
				}
			});
			textContent += '\n';
		});

		return textContent;
	},

	getTextFromPdf: function (id) {
		try {
			// 1. Copy PDF to a temporary Google Doc with OCR enabled
			// NOTE: This requires the "Drive API" service to be enabled in Apps Script Editor > Services.
			const resource = {
				title: "Temp OCR Doc for " + id,
				mimeType: MimeType.GOOGLE_DOCS
			};

			// Use Drive.Files (Advanced Service)
			// If this fails, user hasn't enabled the service.
			const imageBlob = DriveApp.getFileById(id).getBlob();
			// 'convert: true' will extract embedded text from PDFs (or run OCR if it's an image)
			const tempFile = Drive.Files.insert(resource, imageBlob, { convert: true });

			// 2. Read text from the temp doc
			const doc = DocumentApp.openById(tempFile.id);
			const text = doc.getBody().getText();

			// 3. Cleanup: Delete the temp doc
			DriveApp.getFileById(tempFile.id).setTrashed(true);

			return text;

		} catch (e) {
			console.warn("PDF OCR Extraction Failed: " + e.toString());
			if (e.toString().includes("Drive is not defined")) {
				return "[ERROR: To read PDFs, you must enable the 'Drive API' in Apps Script 'Services' menu on the left.]";
			}
			return "[ERROR: Could not extract text from PDF. Ensure it is not password protected.]";
		}
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
		} else if (mime === MimeType.GOOGLE_SLIDES) {
			return this.getTextFromSlides(id);
		} else if (mime === MimeType.PDF) {
			return this.getTextFromPdf(id);
		}

		return `[Binary or Unsupported File Type: ${mime}]`;
	},

	/**
	 * Creates a new Google Doc from Markdown-style text
	 */
	createDocumentFromMarkdown: function (title, content) {
		const doc = DocumentApp.create(title);
		const body = doc.getBody();

		// Split by lines to process simple markdown
		const lines = content.split('\n');

		// Clear default text
		body.setText('');

		let inList = false;

		lines.forEach(line => {
			let text = line.trim();

			// Headers
			if (text.startsWith('# ')) {
				body.appendParagraph(text.substring(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
				inList = false;
			} else if (text.startsWith('## ')) {
				body.appendParagraph(text.substring(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
				inList = false;
			} else if (text.startsWith('### ')) {
				body.appendParagraph(text.substring(4)).setHeading(DocumentApp.ParagraphHeading.HEADING3);
				inList = false;
			}
			// Bullet Points
			else if (text.startsWith('* ') || text.startsWith('- ')) {
				// Append list item
				const listItem = body.appendListItem(text.substring(2));
				listItem.setGlyphType(DocumentApp.GlyphType.BULLET);
				inList = true;
			}
			// Normal Text
			else {
				if (text.length > 0) {
					const p = body.appendParagraph(text);
					p.setHeading(DocumentApp.ParagraphHeading.NORMAL);

					// Bold styling (simple regex for **bold**)
					// We have to scan the paragraph we just added. 
					// Apps Script styling is complex, so we'll do a simple pass.
					const boldRegex = /\*\*(.*?)\*\*/g;
					let match;
					while ((match = boldRegex.exec(text)) !== null) {
						const start = match.index;
						const end = start + match[0].length - 1;
						// Warning: `editAsText()` applies to the whole element text.
						// If we strip asterisks in valid Google Doc logic we need robust parsing.
						// For "Level 1" we will just style the asterisks as well or leave them.
						// Let's at least make the whole block bold if it's strictly **text**
						// For now, let's just keep it as text to avoid index complexity errors in Level 1.
					}
				}
				inList = false;
			}
		});

		doc.saveAndClose();
		return doc.getUrl();
	}
};
