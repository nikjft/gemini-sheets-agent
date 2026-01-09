// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    // State
    let services = [];
    let rules = [];
    let editingServiceId = null;
    let editingRuleId = null;

    // Elements
    const tabServices = document.querySelector('[data-tab="tab-services"]');
    const tabRules = document.querySelector('[data-tab="tab-rules"]');
    const contentServices = document.getElementById('tab-services');
    const contentRules = document.getElementById('tab-rules');

    // Initial Load
    await loadData();
    renderServices();
    renderRules();

    // --- Tab Switching ---
    tabServices.addEventListener('click', () => switchTab('services'));
    tabRules.addEventListener('click', () => switchTab('rules'));

    function switchTab(tab) {
        if (tab === 'services') {
            tabServices.classList.add('active');
            tabRules.classList.remove('active');
            contentServices.classList.add('active');
            contentRules.classList.remove('active');
        } else {
            tabRules.classList.add('active');
            tabServices.classList.remove('active');
            contentRules.classList.add('active');
            contentServices.classList.remove('active');
        }
    }

    // --- Services Logic ---

    // Open Add Modal
    document.getElementById('addServiceBtn').addEventListener('click', () => {
        editingServiceId = null;
        document.getElementById('editorTitle').textContent = "Add New Service";
        document.getElementById('editName').value = "";
        document.getElementById('editUrl').value = "";
        document.getElementById('editMethod').value = "POST";
        document.getElementById('editHeaders').value = "";
        // Default Template
        document.getElementById('editBody').value = JSON.stringify({
            text: "{{TEXT}}",
            url: "{{URL}}",
            title: "{{TITLE}}"
        }, null, 2);

        document.getElementById('deleteServiceBtn').classList.add('hidden');
        document.getElementById('serviceEditor').classList.remove('hidden');
    });

    // Save Service
    document.getElementById('saveServiceBtn').addEventListener('click', async () => {
        const name = document.getElementById('editName').value.trim();
        const url = document.getElementById('editUrl').value.trim();
        const method = document.getElementById('editMethod').value;
        const headersStr = document.getElementById('editHeaders').value.trim();
        const bodyStr = document.getElementById('editBody').value.trim();

        if (!name || !url) return alert("Name and URL are required.");

        let headers = {};
        if (headersStr) {
            try { headers = JSON.parse(headersStr); } catch (e) { return alert("Invalid Headers JSON"); }
        }

        // Validate Body JSON structure (it's a template, but should be valid json structure)
        // Actually, since it contains {{VAR}} which might break JSON if not careful, we usually just store string.
        // But let's check basic syntax.

        const newService = {
            id: editingServiceId || crypto.randomUUID(),
            name,
            url,
            method,
            headers,
            bodyTemplate: bodyStr
        };

        if (editingServiceId) {
            const idx = services.findIndex(s => s.id === editingServiceId);
            if (idx !== -1) services[idx] = newService;
        } else {
            services.push(newService);
        }

        await saveData();
        renderServices();
        document.getElementById('serviceEditor').classList.add('hidden');
    });

    // Delete Service
    document.getElementById('deleteServiceBtn').addEventListener('click', async () => {
        if (!confirm("Delete this service?")) return;
        services = services.filter(s => s.id !== editingServiceId);
        // Also remove rules using this service
        rules = rules.filter(r => r.serviceId !== editingServiceId);
        await saveData();
        renderServices();
        renderRules(); // Update rules list in case some were removed
        document.getElementById('serviceEditor').classList.add('hidden');
    });

    // Cancel Edit
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        document.getElementById('serviceEditor').classList.add('hidden');
    });

    // Edit Existing Service
    window.editService = (id) => {
        const s = services.find(x => x.id === id);
        if (!s) return;
        editingServiceId = id;
        document.getElementById('editorTitle').textContent = "Edit Service";
        document.getElementById('editName').value = s.name;
        document.getElementById('editUrl').value = s.url;
        document.getElementById('editMethod').value = s.method || "POST";
        document.getElementById('editHeaders').value = JSON.stringify(s.headers || {}, null, 2);
        document.getElementById('editBody').value = s.bodyTemplate || "";

        document.getElementById('deleteServiceBtn').classList.remove('hidden');
        document.getElementById('serviceEditor').classList.remove('hidden');
    };


    // --- Rules Logic ---

    // Open Add Rule
    document.getElementById('addRuleBtn').addEventListener('click', () => {
        editingRuleId = null;
        populateServiceDropdown();
        document.getElementById('editPattern').value = "";
        document.getElementById('editRuleService').value = services[0] ? services[0].id : "";
        document.getElementById('deleteRuleBtn').classList.add('hidden');
        document.getElementById('ruleEditor').classList.remove('hidden');
    });

    // Save Rule
    document.getElementById('saveRuleBtn').addEventListener('click', async () => {
        const pattern = document.getElementById('editPattern').value.trim();
        const serviceId = document.getElementById('editRuleService').value;

        if (!pattern || !serviceId) return alert("Pattern and Service required.");

        const newRule = {
            id: editingRuleId || crypto.randomUUID(),
            pattern,
            serviceId
        };

        if (editingRuleId) {
            const idx = rules.findIndex(r => r.id === editingRuleId);
            if (idx !== -1) rules[idx] = newRule;
        } else {
            rules.push(newRule);
        }

        await saveData();
        renderRules();
        document.getElementById('ruleEditor').classList.add('hidden');
    });

    // Delete Rule
    document.getElementById('deleteRuleBtn').addEventListener('click', async () => {
        if (!confirm("Delete this rule?")) return;
        rules = rules.filter(r => r.id !== editingRuleId);
        await saveData();
        renderRules();
        document.getElementById('ruleEditor').classList.add('hidden');
    });

    // Cancel Rule
    document.getElementById('cancelRuleBtn').addEventListener('click', () => {
        document.getElementById('ruleEditor').classList.add('hidden');
    });

    window.editRule = (id) => {
        const r = rules.find(x => x.id === id);
        if (!r) return;
        editingRuleId = id;
        populateServiceDropdown();
        document.getElementById('editPattern').value = r.pattern;
        document.getElementById('editRuleService').value = r.serviceId;

        document.getElementById('deleteRuleBtn').classList.remove('hidden');
        document.getElementById('ruleEditor').classList.remove('hidden');
    };


    // --- Persistence ---
    async function loadData() {
        const data = await chrome.storage.local.get(['services', 'rules']);
        services = data.services || [];
        rules = data.rules || [];
    }

    async function saveData() {
        await chrome.storage.local.set({ services, rules });
    }

    // --- Rendering ---
    function renderServices() {
        const list = document.getElementById('servicesList');
        list.innerHTML = "";
        if (services.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 py-4">No services configured.</div>`;
            return;
        }
        services.forEach(s => {
            const div = document.createElement('div');
            div.className = "card flex justify-between items-center cursor-pointer hover:shadow-md transition";
            div.onclick = () => window.editService(s.id);
            div.innerHTML = `
                <div>
                    <div class="font-bold text-gray-800">${escapeHtml(s.name)}</div>
                    <div class="text-xs text-gray-500 truncate w-64">${escapeHtml(s.url)}</div>
                </div>
                <div class="text-gray-400">›</div>
            `;
            list.appendChild(div);
        });
    }

    function renderRules() {
        const list = document.getElementById('rulesList');
        list.innerHTML = "";
        if (rules.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 py-4">No rules defined.</div>`;
            return;
        }
        rules.forEach(r => {
            const serviceName = services.find(s => s.id === r.serviceId)?.name || "?";
            const div = document.createElement('div');
            div.className = "card flex justify-between items-center cursor-pointer hover:shadow-md transition";
            div.onclick = () => window.editRule(r.id);
            div.innerHTML = `
                <div>
                    <div class="font-mono text-sm text-indigo-600">${escapeHtml(r.pattern)}</div>
                    <div class="text-xs text-gray-500">→ ${escapeHtml(serviceName)}</div>
                </div>
                <div class="text-gray-400">›</div>
            `;
            list.appendChild(div);
        });
    }

    function populateServiceDropdown() {
        const sel = document.getElementById('editRuleService');
        sel.innerHTML = "";
        services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});