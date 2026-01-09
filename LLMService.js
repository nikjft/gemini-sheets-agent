/**
 * LLM Service - Handles Gemini API Calls
 */

var LLMService = {

	/**
	 * Main call function
	 */
	callGemini: function (modelId, systemPrompt, userMessage, temperature, maxOutputTokens) {
		const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY script property is not set.');
		}

		// Model Mapping Logic:
		// 1. If it starts with "gemini-", assume it's a valid API name and use it directly.
		// 2. Otherwise, map common friendly names.
		let apiModel = modelId.trim();

		// Strip "models/" prefix if user included it
		if (apiModel.startsWith('models/')) {
			apiModel = apiModel.replace('models/', '');
		}

		const lowerModel = apiModel.toLowerCase();

		if (!lowerModel.startsWith('gemini-')) {
			if (lowerModel.includes('flash')) apiModel = 'gemini-2.5-flash';
			else if (lowerModel.includes('pro')) apiModel = 'gemini-2.5-pro';
			else apiModel = 'gemini-2.5-flash-lite'; // Fallback
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;

		const payload = {
			system_instruction: {
				parts: [{ text: systemPrompt }]
			},
			contents: [{
				role: "user",
				parts: [{ text: userMessage }]
			}],
			generationConfig: {
				temperature: temperature || 0.7,
				maxOutputTokens: maxOutputTokens || 500 // Default 500 if undefined
			}
		};

		const options = {
			method: 'post',
			contentType: 'application/json',
			payload: JSON.stringify(payload),
			muteHttpExceptions: true
		};

		// Retry Logic with Exponential Backoff
		// Retry Logic with Exponential Backoff
		const MAX_RETRIES = 5; // Increased from 3 to 5 for large payloads
		let delay = 1000;      // Default start 1s

		for (let i = 0; i <= MAX_RETRIES; i++) {
			try {
				const response = UrlFetchApp.fetch(url, options);
				const code = response.getResponseCode();
				const text = response.getContentText();

				// Success
				if (code === 200) {
					const json = JSON.parse(text);
					if (json.candidates && json.candidates.length > 0 && json.candidates[0].content) {

						// Extract Tokens
						let usage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
						if (json.usageMetadata) {
							usage.promptTokens = json.usageMetadata.promptTokenCount || 0;
							usage.candidateTokens = json.usageMetadata.candidatesTokenCount || 0;
							usage.totalTokens = json.usageMetadata.totalTokenCount || 0;
						}

						return {
							success: true,
							text: json.candidates[0].content.parts[0].text,
							usage: usage
						};
					} else {
						return { success: false, error: 'No content in response' };
					}
				}

				// Rate Limit (429) -> Retry
				if (code === 429) {
					if (i < MAX_RETRIES) {
						// For 429s specifically, ensure we start with at least 10s to clear TPM window
						const waitTime = Math.max(delay, 10000);
						console.warn(`Rate limit hit (429). Retrying in ${waitTime / 1000}s...`);
						Utilities.sleep(waitTime);

						// Backoff logic
						if (delay < 10000) delay = 20000; // Jump to 20s next if we just did 10s
						else delay *= 2;

						continue;
					} else {
						return { success: false, error: 'Rate limit exceeded after retries.' };
					}
				}

				// Other Errors -> Abort
				return { success: false, error: `API Error ${code}: ${text}` };

			} catch (e) {
				// Network errors needing retry?
				if (i < MAX_RETRIES) {
					console.warn(`Fetch error: ${e}. Retrying...`);
					Utilities.sleep(delay);
					delay *= 2;
					continue;
				}
				return { success: false, error: e.toString() };
			}
		}
	}
};
