/**
 * Orchestrator
 * High-level management of the multi-agent system.
 */

var Orchestrator = {

	/**
	 * Iterate all configured agents and run those with Auto-Run = Yes
	 */
	runAllAgents: function () {
		// 1. Prevent concurrent executions using LockService
		const lock = LockService.getScriptLock();
		try {
			// Wait for up to 30 seconds for other executions to finish
			if (!lock.tryLock(30000)) {
				console.log('Could not obtain lock. Another execution is running.');
				return;
			}

			// 2. Set strict time limit (e.g., 5 minutes to be safe)
			const startTime = Date.now();
			const MAX_EXECUTION_TIME = 1000 * 60 * 5; // 5 minutes

			const ss = SpreadsheetApp.getActiveSpreadsheet();
			const sheet = ss.getSheetByName('Agents');
			const data = sheet.getDataRange().getValues();
			const headers = data[0];

			const nameIdx = headers.findIndex(h => h.toLowerCase() === 'agent name');
			const autoRunIdx = headers.findIndex(h => h.toLowerCase() === 'auto-run');

			for (let i = 1; i < data.length; i++) {
				// Check for global timeout before starting next agent
				if (Date.now() - startTime > MAX_EXECUTION_TIME) {
					console.log('Global execution time limit reached. Stopping.');
					break;
				}

				const row = data[i];
				const name = row[nameIdx];
				const autoRun = (row[autoRunIdx] || '').toString().toLowerCase();

				if (name && autoRun === 'yes') {
					console.log(`Auto-running agent: ${name}`);
					try {
						// Pass startTime to allow agent to self-regulate
						// We expect AgentRunner to return true/false or void, but if it returns true (timedOut), we break
						const timedOut = AgentRunner.runAgent(name, startTime, MAX_EXECUTION_TIME);
						if (timedOut) {
							console.log(`Agent ${name} signal timeout. Stopping orchestration.`);
							break;
						}
					} catch (e) {
						console.error(`Failed to run agent ${name}: ${e.toString()}`);
					}
				}
			}

		} catch (e) {
			console.error('Orchestrator Error: ' + e.toString());
		} finally {
			lock.releaseLock();
		}
	},

	/**
	 * Check if a name corresponds to a configured agent
	 */
	isAgent: function (name) {
		const configs = Utilities_Helper.getAgentsConfiguration();
		return !!configs[name];
	}
};
