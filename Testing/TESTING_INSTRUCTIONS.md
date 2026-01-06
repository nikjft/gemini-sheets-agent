# Testing Instructions

This folder contains CSV files to validate the **Gemini Sheets Agent**.

## Files
1.  `Agents.csv`: Configuration for 3 agents (Processor, ProposalWriter, RejectionSender).
2.  `InboundLeadProcessor.csv`: Sample input data (3 leads with different budgets).

## How to Test

1.  **Open your Google Sheet**.
2.  **Clear/Delete existing tabs** (or start fresh) to avoid conflicts.
3.  **Import Agents Config**:
    *   File > Import > Upload > Select `Agents.csv`.
    *   Import location: **Replace current sheet**.
    *   Rename the tab to `Agents` if it isn't already.
4.  **Run Setup**:
    *   Click **Agent Orchestrator** > **Set Up Agents**.
    *   This will create the empty data tabs for `ProposalWriter` and `RejectionSender`, and `InboundLeadProcessor` (though we will overwrite the latter).
5.  **Import Data**:
    *   Go to the `InboundLeadProcessor` tab.
    *   File > Import > Upload > Select `InboundLeadProcessor.csv`.
    *   Import location: **Replace current sheet**.
    *   **CRITICAL**: Ensure the tab name is still exactly `InboundLeadProcessor` after import.
6.  **Run**:
    *   Click **Agent Orchestrator** > **Run Automated Agents**.

## Expected Outcomes

1.  **InboundLeadProcessor**:
    *   Should process all 3 rows.
    *   **Row 1 (Acme)**: Output should mention "Qualified". Status should be "Completed".
    *   **Row 2 (Mom & Pop)**: Output should mention "Unqualified".
    *   **Row 3 (Stark)**: Output should mention "Qualified".
2.  **Handoffs (Dynamic Routing)**:
    *   **ProposalWriter** should have 2 new rows (Acme, Stark).
    *   **RejectionSender** should have 1 new row (Mom & Pop).
3.  **Document Creation & Handoff**:
    *   Run Orchestrator again.
    *   **ProposalWriter** creates a Google Doc output.
    *   **SalesAssignment** receives the Doc URL.
    *   **SalesAssignment** reads the doc content and assigns Mary or Jim.
    *   **RejectionSender** processes its row independently.
