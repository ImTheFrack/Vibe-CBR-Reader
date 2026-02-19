import { apiGet, apiPut, apiPost } from '../api.js';
import { showToast } from '../utils.js';

let currentApiKey = '';

export async function loadAISettings() {
  const settings = await apiGet('/api/admin/ai-settings');
  if (settings.error) {
    showToast(`Error loading AI settings: ${settings.error}`, 'error');
    return;
  }

  currentApiKey = settings.api_key || '';

  const providerSelect = document.getElementById('ai-provider-select');
  const modelInput = document.getElementById('ai-model-input');
  const apiKeyInput = document.getElementById('ai-api-key-input');
  const baseUrlInput = document.getElementById('ai-base-url-input');

  if (providerSelect) providerSelect.value = settings.provider || 'openai';
  if (modelInput) modelInput.value = settings.model || 'gpt-4o-mini';
  if (apiKeyInput) {
    apiKeyInput.value = maskApiKey(currentApiKey);
    apiKeyInput.dataset.masked = 'true';
  }
  if (baseUrlInput) baseUrlInput.value = settings.base_url || '';
}

export function renderAISettingsForm() {
  const container = document.getElementById('ai-settings-form-container');
  if (!container) return;

  container.innerHTML = `
    <div class="admin-grid-2col">
      <div>
        <label class="admin-form-label">Provider</label>
        <select id="ai-provider-select" class="admin-select">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google (Gemini)</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div>
        <label class="admin-form-label">Model</label>
        <input type="text" id="ai-model-input" class="search-input" placeholder="gpt-4o-mini">
      </div>
      <div class="admin-form-full-width">
        <label class="admin-form-label">API Key</label>
        <input type="password" id="ai-api-key-input" class="search-input" placeholder="Enter API key...">
        <small class="admin-form-hint">Leave blank to keep existing key. Only last 4 characters shown.</small>
      </div>
      <div class="admin-form-full-width">
        <label class="admin-form-label">Base URL (Optional)</label>
        <input type="text" id="ai-base-url-input" class="search-input" placeholder="https://api.openai.com/v1">
      </div>
    </div>
    <div class="admin-form-actions">
      <button id="ai-test-btn" class="btn-secondary">🔌 Test Connection</button>
      <button id="ai-save-btn" class="btn-primary">💾 Save Settings</button>
    </div>
  `;

  setupAISettingsHandlers();
}

function setupAISettingsHandlers() {
  const apiKeyInput = document.getElementById('ai-api-key-input');
  const testBtn = document.getElementById('ai-test-btn');
  const saveBtn = document.getElementById('ai-save-btn');

  if (apiKeyInput) {
    apiKeyInput.addEventListener('focus', () => {
      if (apiKeyInput.dataset.masked === 'true') {
        apiKeyInput.value = '';
        apiKeyInput.dataset.masked = 'false';
      }
    });

    apiKeyInput.addEventListener('blur', () => {
      if (apiKeyInput.value === '' && currentApiKey) {
        apiKeyInput.value = maskApiKey(currentApiKey);
        apiKeyInput.dataset.masked = 'true';
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', handleTestConnection);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveSettings);
  }
}

export async function handleTestConnection() {
  const provider = document.getElementById('ai-provider-select')?.value || 'openai';
  const model = document.getElementById('ai-model-input')?.value || 'gpt-4o-mini';
  const apiKeyInput = document.getElementById('ai-api-key-input');
  const baseUrl = document.getElementById('ai-base-url-input')?.value || '';

  console.log('[AI Test] Starting connection test:', { provider, model, baseUrl });

  let apiKey = currentApiKey;
  if (apiKeyInput && apiKeyInput.dataset.masked !== 'true' && apiKeyInput.value) {
    apiKey = apiKeyInput.value;
    console.log('[AI Test] Using new API key from input');
  } else {
    console.log('[AI Test] Using existing API key (masked):', apiKey ? '***' + apiKey.slice(-4) : 'none');
  }

  // For Ollama, API key is optional
  if (!apiKey && provider !== 'ollama') {
    showToast('API key is required to test connection', 'error');
    return;
  }

  const testBtn = document.getElementById('ai-test-btn');
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = '⏳ Testing...';
  }

  const payload = {
    provider,
    model,
    api_key: apiKey || null,
    base_url: baseUrl || null
  };
  console.log('[AI Test] Sending payload:', { ...payload, api_key: payload.api_key ? '***' : null });

  const result = await apiPost('/api/admin/ai-settings/test', payload);
  console.log('[AI Test] Result:', result);

  if (testBtn) {
    testBtn.disabled = false;
    testBtn.textContent = '🔌 Test Connection';
  }

  if (result.error) {
    showToast(`Connection failed: ${result.error}`, 'error');
  } else if (result.success) {
    showToast('✅ Connection successful!');
  } else {
    showToast('Connection test returned unexpected result', 'error');
  }
}

export async function handleSaveSettings() {
  const provider = document.getElementById('ai-provider-select')?.value || 'openai';
  const model = document.getElementById('ai-model-input')?.value || 'gpt-4o-mini';
  const apiKeyInput = document.getElementById('ai-api-key-input');
  const baseUrl = document.getElementById('ai-base-url-input')?.value || '';

  const settings = {
    provider,
    model,
    base_url: baseUrl || null
  };

  if (apiKeyInput && apiKeyInput.dataset.masked !== 'true' && apiKeyInput.value) {
    settings.api_key = apiKeyInput.value;
  }

  const saveBtn = document.getElementById('ai-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving...';
  }

  const result = await apiPut('/api/admin/ai-settings', settings);

  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Settings';
  }

  if (result.error) {
    showToast(`Error saving settings: ${result.error}`, 'error');
  } else {
    showToast('AI settings saved successfully');
    if (result.api_key) {
      currentApiKey = result.api_key;
    }
    await loadAISettings();
  }
}

function maskApiKey(key) {
  if (!key || key.length < 4) return '';
  const lastFour = key.slice(-4);
  return '*'.repeat(Math.min(key.length - 4, 20)) + lastFour;
}

window.loadAISettings = loadAISettings;
window.handleTestConnection = handleTestConnection;
window.handleSaveSettings = handleSaveSettings;
