// content.js
// Handles the UI feedback (Loading, Success, Error)

let clipperModal = null;
let clipperTimer = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action.startsWith("ui_")) {
        showClipperStatus(request);
    }
});

function getOrCreateModal() {
    let div = document.getElementById('gemini-clipper-modal');
    
    if (!div) {
        div = document.createElement('div');
        div.id = 'gemini-clipper-modal';
        // Reset styles to prevent website CSS from bleeding in
        div.style.cssText = `
            all: initial;
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 2147483647; /* Max Z-Index */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #1f2937;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 300px;
            max-width: 450px;
            border-left: 6px solid #e5e7eb;
            font-size: 14px;
            line-height: 1.5;
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            box-sizing: border-box;
        `;
        
        // Inner Content Container
        const content = document.createElement('div');
        content.id = 'clipper-content';
        content.style.flex = '1';
        div.appendChild(content);

        // Close Button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            all: initial;
            background: transparent;
            border: none;
            color: #9ca3af;
            font-size: 20px;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
        `;
        closeBtn.onmouseenter = () => closeBtn.style.color = '#4b5563';
        closeBtn.onmouseleave = () => closeBtn.style.color = '#9ca3af';
        closeBtn.onclick = removeModal;
        div.appendChild(closeBtn);

        document.body.appendChild(div);

        // Trigger animation
        requestAnimationFrame(() => {
            div.style.opacity = '1';
            div.style.transform = 'translateY(0)';
        });
    }
    return div;
}

function removeModal() {
    const div = document.getElementById('gemini-clipper-modal');
    if (div) {
        div.style.opacity = '0';
        div.style.transform = 'translateY(-10px)';
        setTimeout(() => div.remove(), 300);
    }
    if (clipperTimer) clearTimeout(clipperTimer);
}

function showClipperStatus(req) {
    const modal = getOrCreateModal();
    const content = modal.querySelector('#clipper-content');
    
    // Clear auto-hide timer if new message comes in
    if (clipperTimer) clearTimeout(clipperTimer);

    if (req.action === "ui_loading") {
        modal.style.borderLeftColor = "#6366f1"; // Indigo
        content.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 500;">
                <svg class="spinner" viewBox="0 0 50 50" style="width: 18px; height: 18px; animation: spin 1s linear infinite;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="#6366f1" stroke-width="5"></circle>
                </svg>
                <span>Clipping job posting...</span>
            </div>
            <style>
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spinner circle { stroke-dasharray: 80; stroke-dashoffset: 0; }
            </style>
        `;
    } 
    else if (req.action === "ui_success") {
        modal.style.borderLeftColor = "#10b981"; // Green
        content.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px; color: #059669; font-weight: 600;">
                    <span>✓ Success</span>
                </div>
                <div style="color: #4b5563; margin-top: 2px;">
                    ${req.details}
                </div>
            </div>
        `;
        
        // Auto-dismiss after 3 seconds (increased slightly for readability)
        clipperTimer = setTimeout(removeModal, 3000);
    } 
    else if (req.action === "ui_error") {
        modal.style.borderLeftColor = "#ef4444"; // Red
        content.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px; color: #dc2626; font-weight: 600;">
                    <span>⚠ Clipping Failed</span>
                </div>
                <div style="color: #4b5563; margin-top: 2px; font-size: 13px;">
                    ${req.message}
                </div>
            </div>
        `;
        // Errors stick around until closed by user
    }
}