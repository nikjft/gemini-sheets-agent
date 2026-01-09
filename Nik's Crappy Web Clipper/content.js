// content.js
// Handles the Service Picker Modal AND the UI feedback

let clipperModal = null;
let clipperTimer = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "open_picker") {
        showServicePicker(request.services, request.data);
    } else if (request.action.startsWith("ui_")) {
        showClipperStatus(request);
    }
});

function showServicePicker(services, data) {
    // Remove existing if any
    const existing = document.getElementById('clipper-picker-modal');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'clipper-picker-modal';
    div.style.cssText = `
        all: initial;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2147483647;
        font-family: -apple-system, sans-serif;
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        width: 320px;
        max-width: 90vw;
        border: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    // Title
    const title = document.createElement('h3');
    title.textContent = "Clip to Service";
    title.style.cssText = "margin: 0; font-size: 18px; font-weight: 600; color: #111827; text-align: center;";
    div.appendChild(title);

    // Subtitle
    if (data.text) {
        const preview = document.createElement('p');
        preview.textContent = `Selection: "${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}"`;
        preview.style.cssText = "margin: 0; font-size: 12px; color: #6b7280; text-align: center; font-style: italic;";
        div.appendChild(preview);
    }

    // Service Buttons
    services.forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s.name;
        btn.style.cssText = `
            padding: 10px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        `;
        btn.onmouseenter = () => btn.style.background = "#4338ca";
        btn.onmouseleave = () => btn.style.background = "#4f46e5";

        btn.onclick = () => {
            div.remove();
            chrome.runtime.sendMessage({
                action: "execute_service",
                service: s,
                data: data
            });
        };
        div.appendChild(btn);
    });

    // Cancel Button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
        padding: 8px;
        background: transparent;
        color: #6b7280;
        border: none;
        cursor: pointer;
        font-size: 13px;
        margin-top: 4px;
    `;
    cancelBtn.onmouseenter = () => cancelBtn.style.color = "#374151";
    cancelBtn.onmouseleave = () => cancelBtn.style.color = "#6b7280";
    cancelBtn.onclick = () => div.remove();
    div.appendChild(cancelBtn);

    document.body.appendChild(div);
}

// Reuse existing status modal logic
function getOrCreateStatusModal() {
    let div = document.getElementById('gemini-clipper-modal');
    if (!div) {
        div = document.createElement('div');
        div.id = 'gemini-clipper-modal';
        div.style.cssText = `
            all: initial;
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 2147483647;
            font-family: -apple-system, sans-serif;
            background: white;
            color: #1f2937;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 300px;
            border-left: 6px solid #e5e7eb;
            font-size: 14px;
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.3s, transform 0.3s;
        `;

        const content = document.createElement('div');
        content.id = 'clipper-content';
        content.style.flex = '1';
        div.appendChild(content);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `background:none; border:none; color:#9ca3af; font-size:20px; cursor:pointer;`;
        closeBtn.onclick = removeStatusModal;
        div.appendChild(closeBtn);

        document.body.appendChild(div);

        requestAnimationFrame(() => {
            div.style.opacity = '1';
            div.style.transform = 'translateY(0)';
        });
    }
    return div;
}

function removeStatusModal() {
    const div = document.getElementById('gemini-clipper-modal');
    if (div) {
        div.style.opacity = '0';
        div.style.transform = 'translateY(-10px)';
        setTimeout(() => div.remove(), 300);
    }
    if (clipperTimer) clearTimeout(clipperTimer);
}

function showClipperStatus(req) {
    const modal = getOrCreateStatusModal();
    const content = modal.querySelector('#clipper-content');
    if (clipperTimer) clearTimeout(clipperTimer);

    if (req.action === "ui_loading") {
        modal.style.borderLeftColor = "#6366f1";
        content.innerHTML = `Scanning...`;
    }
    else if (req.action === "ui_success") {
        modal.style.borderLeftColor = "#10b981";
        content.innerHTML = `
            <div style="font-weight:600; color:#059669;">Success</div>
            <div style="color:#6b7280; font-size:12px;">${req.details}</div>
        `;
        clipperTimer = setTimeout(removeStatusModal, 3000);
    }
    else if (req.action === "ui_error") {
        modal.style.borderLeftColor = "#ef4444";
        content.innerHTML = `
            <div style="font-weight:600; color:#dc2626;">Error</div>
            <div style="color:#6b7280; font-size:12px;">${req.message}</div>
        `;
    }
}