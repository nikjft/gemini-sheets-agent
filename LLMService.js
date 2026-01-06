/**
 * LLM Service - Handles Gemini API Calls
 */

var LLMService = {

	/**
	 * Main call function
	 */
	callGemini: function (modelId, systemPrompt, userMessage, temperature) {
		const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY script property is not set.');
		}

		// Map friendly names to API model names if necessary
		// E.g. "2.5 flash" -> "gemini-1.5-flash"
		// For now assuming user puts valid model string or we map simple ones
		let apiModel = modelId.trim();
		if (apiModel.includes('flash')) apiModel = 'gemini-1.5-flash';
		else if (apiModel.includes('pro')) apiModel = 'gemini-1.5-pro';

		// Default fallback
		if (!apiModel) apiModel = 'gemini-1.5-flash';

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
				temperature: temperature || 0.7
			}
		};

		const options = {
			method: 'post',
			contentType: 'application/json',
			payload: JSON.stringify(payload),
			muteHttpExceptions: true
		};

		try {
			const response = UrlFetchApp.fetch(url, options);
			const code = response.getResponseCode();
			const text = response.getContentText();

			if (code !== 200) {
				return { success: false, error: `API Error ${code}: ${text}` };
			}

			const json = JSON.parse(text);
			if (json.candidates && json.candidates.length > 0 && json.candidates[0].content) {
				return {
					success: true,
					text: json.candidates[0].content.parts[0].text
				};
			} else {
				return { success: false, error: 'No content in response' };
			}

		} catch (e) {
			return { success: false, error: e.toString() };
		}
	}
};
