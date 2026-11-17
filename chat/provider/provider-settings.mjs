// The provider settings: the endpoint, the API token saved for each endpoint, the model list and the chosen model, and the theme. They live together because they
// share one `config` object (kept in session storage, gone when the tab closes) and one set of form controls in Settings.
// createProviderSettings(host) returns the state as getters ({ config, models, authErrors }) and the actions the page needs.
//
// host: the form controls (endpointSelect, endpointInput, endpointHint, apiFormatSelect (optional), tokenInput, peekTokenBtn, copyTokenBtn, modelSelect, refreshModelsBtn, themeToggleBtn, authGuidance, authHintText,
// clearSettingsBtn), M() (pure modules, for icons), readJson, writeJson, keys (CONFIG_KEY, MODELS_KEY, ENDPOINT_TOKENS_KEY), showToast, confirmDialog, alertDialog, copyTextDialog,
// updateChatAvailability, loadTransferUi, transferUiDiscardPending, openProviderSettings

import { createEndpointTokens } from './endpoint-tokens.mjs';
import * as endpointUrls from './endpoint-urls.mjs';
import { endpointOptions, GROUPS, escapeHtml, getEndpointOptionById, findEndpointOptionForValue } from './endpoint-options.mjs';
import { API_FORMATS, FORMAT_IDS, isFormat, effectiveFormat, buildModelsRequest, modelIdsFrom } from './api-formats.mjs';
import { appSession } from "../vault/vault-store.mjs";

export function createProviderSettings(host) {
  const { endpointSelect, endpointInput, endpointHint, apiFormatSelect, tokenInput, peekTokenBtn, copyTokenBtn, modelSelect, refreshModelsBtn, themeToggleBtn, authGuidance, authHintText,
    clearSettingsBtn, readJson, writeJson, showToast, confirmDialog, alertDialog, copyTextDialog, updateChatAvailability, loadTransferUi, transferUiDiscardPending, openProviderSettings } = host;
  const { CONFIG_KEY, MODELS_KEY, ENDPOINT_TOKENS_KEY } = host.keys;

  // ---- state ----
  // Application state
  let config = {
    endpoint: '',
    token: '',
    model: '',
    theme: '',
    format: '' // the API format chosen by the person ('chat' | 'responses' | 'anthropic'); '' = the provider's own default (chat/api-formats.mjs)
  };

  let models = [];

  let consecutiveAuthErrors = 0;

  const defaults = { endpoint: '', token: '', model: '', theme: '', format: '' };

  const promptedCopyFor = new Set();

  // ---- theme ----
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  const resolveTheme = preference =>
    preference === 'light' || preference === 'dark'
      ? preference
      : prefersDarkScheme && prefersDarkScheme.matches
        ? 'dark'
        : 'light';

  function updateThemeToggle(resolvedTheme, preference) {
    if (!themeToggleBtn) return;
    const themeIcon = themeToggleBtn.querySelector('.emoji-icon');
    if (themeIcon) {
      const glyph = resolvedTheme === 'dark' ? '🌙' : '☀️';
      const M = host.M(); if (M) themeIcon.replaceChildren(M.icons.iconNode(M.icons.EMOJI_ICON[glyph])); else themeIcon.textContent = glyph;
    }
    const followingSystem = preference !== 'light' && preference !== 'dark';
    const labelAction = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    const systemHint = 'Shift+click to follow system theme.';
    const ariaLabel = followingSystem
      ? `${labelAction}. Following system preference. ${systemHint}`
      : `${labelAction}. ${systemHint}`;
    themeToggleBtn.setAttribute('aria-label', ariaLabel);
    themeToggleBtn.setAttribute('title', `${labelAction} · ${systemHint}`);
    themeToggleBtn.setAttribute('aria-pressed', resolvedTheme === 'dark' ? 'true' : 'false');
    const srLabel = themeToggleBtn.querySelector('.sr-only');
    if (srLabel) {
      const status = followingSystem
        ? `Following system preference (currently ${resolvedTheme}).`
        : `Preference set to ${resolvedTheme} mode.`;
      srLabel.textContent = `${status} ${labelAction}. ${systemHint}`;
    }
  }

  function applyTheme(preference) {
    const resolved = resolveTheme(preference);
    try { localStorage.setItem('plc.theme.v1', resolved); } catch { /* private mode */ } // a plain hint so the unlock screen can match the theme before anything is unlocked (it says nothing about the person's chats)
    if (resolved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeToggle(resolved, preference);
  }

  if (prefersDarkScheme) {
    const handleSchemeChange = () => {
      if (config.theme !== 'light' && config.theme !== 'dark') {
        applyTheme('');
      }
    };
    if (typeof prefersDarkScheme.addEventListener === 'function') {
      prefersDarkScheme.addEventListener('change', handleSchemeChange);
    } else if (typeof prefersDarkScheme.addListener === 'function') {
      prefersDarkScheme.addListener(handleSchemeChange);
    }
  }

  // ---- the token saved for each endpoint ----
  // the token saved for each endpoint (chat/provider/endpoint-tokens.mjs)
  const endpointTokens = createEndpointTokens({
    storage: appSession, key: ENDPOINT_TOKENS_KEY, base: window.location.href,
    onSet: endpoint => { if (appSession.getItem('plc.pendingToken.v1')) loadTransferUi().then(ui => ui.tokenSetFor(endpoint)).catch(() => {}); }
  });
  const canonicalizeEndpoint = value => endpointTokens.canonicalize(value);
  const getTokenForEndpoint = endpoint => endpointTokens.get(endpoint);
  /** The token for a request: the one saved for this exact destination, never one saved for another. */
  const authTokenFor = endpoint => endpointTokens.get(endpoint);
  const setTokenForEndpoint = (endpoint, token) => endpointTokens.set(endpoint, token);
  const clearTokenForEndpoint = endpoint => endpointTokens.clear(endpoint);
  const loadEndpointTokens = () => endpointTokens.load();

  // ---- the endpoint form ----
  function updateEndpointHint(option, currentValue) {
    if (!endpointHint) return;
    const target = option || getEndpointOptionById('choose');
    let html = target.hint || '';
    if (target.id === 'custom' && currentValue) {
      html += `<br /><strong>Using:</strong> <code>${escapeHtml(currentValue)}</code>`;
    } else if (target.baseUrl) {
      html += `<br /><strong>Endpoint URL:</strong> <code>${escapeHtml(target.baseUrl)}</code>`;
    }
    if (target.id !== 'choose') {
      const api = apiSettingsFor(currentValue || target.baseUrl);
      html += `<br /><strong>API used:</strong> ${escapeHtml(API_FORMATS[api.format].label)}${api.explicit ? ' (your choice)' : ''}`;
    }
    if (!html) {
      endpointHint.textContent = '';
      endpointHint.hidden = true;
    } else {
      endpointHint.innerHTML = html;
      endpointHint.hidden = false;
    }
  }

  /** How the app talks to the provider at `endpoint`: the format (the person's choice, else the provider's default) and the provider's quirks. */
  function apiSettingsFor(endpoint = config.endpoint) {
    const option = findEndpointOptionForValue(endpoint);
    return { format: effectiveFormat(config.format, option), explicit: isFormat(config.format), option, authStyle: option.authStyle || '', modelsUrl: option.modelsUrl || '', stripModelPrefix: option.stripModelPrefix || '' };
  }

  function populateFormatSelect() {
    if (!apiFormatSelect) return;
    apiFormatSelect.innerHTML = '';
    const auto = document.createElement('option'); auto.value = ''; apiFormatSelect.appendChild(auto);
    for (const id of FORMAT_IDS) { const o = document.createElement('option'); o.value = id; o.textContent = API_FORMATS[id].label; apiFormatSelect.appendChild(o); }
    syncFormatSelect();
  }
  function syncFormatSelect() {
    if (!apiFormatSelect) return;
    const option = findEndpointOptionForValue(endpointInput ? endpointInput.value.trim() : config.endpoint);
    apiFormatSelect.options[0].textContent = 'Automatic (' + API_FORMATS[effectiveFormat('', option)].label + ')';
    apiFormatSelect.value = isFormat(config.format) ? config.format : '';
  }

  function syncEndpointControls(value) {
    const option = findEndpointOptionForValue(value);
    if (endpointSelect) {
      endpointSelect.value = option.id;
    }
    syncFormatSelect();
    updateEndpointHint(option, value);
  }

  function persistEndpointValue(value, { refresh = false, promptCopy = true } = {}) {
    const normalized = (value || '').trim();
    const previousEndpoint = config.endpoint;
    if (config.endpoint !== normalized) {
      config.endpoint = normalized;
      persistConfig();
      handleEndpointSwitch(previousEndpoint, normalized, { promptCopy });
    }
    syncEndpointControls(normalized);
    updateChatAvailability();
    consecutiveAuthErrors = 0;
    updateAuthGuidance();
    if (refresh) {
      refreshModels({ silent: true });
    }
  }

  function persistTokenValue(value, { refresh = false, remember = false, endpointForToken } = {}) {
    const normalized = (value || '').trim();
    if (config.token !== normalized) {
      config.token = normalized;
      persistConfig();
    }
    if (remember) {
      const targetEndpoint =
        typeof endpointForToken === 'string' && endpointForToken
          ? endpointForToken
          : endpointInput
            ? endpointInput.value
            : config.endpoint;
      setTokenForEndpoint(targetEndpoint, normalized);
    }
    consecutiveAuthErrors = 0;
    updateAuthGuidance();
    if (refresh) {
      refreshModels({ silent: true });
    }
  }

  function handleEndpointSwitch(prevEndpoint, nextEndpoint, { promptCopy = true, refresh = false } = {}) {
    if (!tokenInput) return;
    const prevCanon = canonicalizeEndpoint(prevEndpoint);
    const nextCanon = canonicalizeEndpoint(nextEndpoint);

    let prevToken = '';
    const hasPrevTokenStored = endpointTokens.has(prevEndpoint);
    const trimmedConfigToken = (config.token || '').trim();
    if (hasPrevTokenStored) {
      prevToken = endpointTokens.get(prevEndpoint);
    } else if (prevCanon && trimmedConfigToken) {
      prevToken = trimmedConfigToken;
      setTokenForEndpoint(prevEndpoint, prevToken);
    } else {
      prevToken = trimmedConfigToken;
    }

    let deferRefresh = false;
    const hasSavedNextToken = endpointTokens.has(nextEndpoint);
    const savedNextToken = endpointTokens.get(nextEndpoint);

    if (hasSavedNextToken) {
      if (tokenInput.value !== savedNextToken) {
        tokenInput.value = savedNextToken;
      }
      persistTokenValue(savedNextToken, { refresh: false });
    } else {
      if (tokenInput.value) {
        tokenInput.value = '';
      }
      persistTokenValue('', { refresh: false });

      if (promptCopy && prevToken && nextCanon && !promptedCopyFor.has(nextCanon)) {
        promptedCopyFor.add(nextCanon);
        deferRefresh = refresh; // the model list is fetched after the answer, with the key if it was copied
        confirmDialog('Copy your API key?', `No API key is saved for this endpoint.\n\nWould you like to copy your current key to:\n${nextCanon}\n\nNote: API keys are generally specific to the provider/endpoint.`, 'Copy key').then(confirmed => {
          if (confirmed) {
            tokenInput.value = prevToken;
            persistTokenValue(prevToken, {
              refresh: false,
              remember: true,
              endpointForToken: nextEndpoint
            });
          }
          if (refresh) refreshModels({ silent: true });
        });
      } else if (promptCopy && nextCanon && !promptedCopyFor.has(nextCanon)) {
        promptedCopyFor.add(nextCanon);
      }
    }

    if (refresh && !deferRefresh) {
      refreshModels({ silent: true });
    }
  }

  function applyEndpointOption(optionId) {
    const option = getEndpointOptionById(optionId);
    if (!option) return;
    if (option.id === 'choose') {
      endpointInput.value = '';
    } else if (option.baseUrl) {
      endpointInput.value = option.baseUrl;
    }
    if (config.format) { config.format = ''; persistConfig(); } // a provider picked from the list brings its own API format
    persistEndpointValue(endpointInput.value, { refresh: true });
  }

  function populateEndpointSelect() {
    if (!endpointSelect) return;
    endpointSelect.innerHTML = '';
    const add = (parent, option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      parent.appendChild(opt);
    };
    endpointOptions.filter(option => !option.group).forEach(option => add(endpointSelect, option));
    for (const name of GROUPS) {
      const group = document.createElement('optgroup');
      group.label = name;
      endpointOptions.filter(option => option.group === name).forEach(option => add(group, option));
      if (group.children.length) endpointSelect.appendChild(group);
    }
    populateFormatSelect();
    const currentValue = endpointInput ? endpointInput.value.trim() : '';
    syncEndpointControls(currentValue);
  }

  // ---- saving, the model list ----
  const persistConfig = () => writeJson(appSession, CONFIG_KEY, config);

  function loadModels() {
    models = readJson(appSession, MODELS_KEY, []);
  }

  function storeModels(list) {
    models = [...new Set(list.filter(Boolean))];
    writeJson(appSession, MODELS_KEY, models);
  }

  /**
   * Render the model dropdown. If no models are loaded the select is disabled.
   * @param {string[]} list list of model ids
   * @param {string} desiredModel previously selected model
   */
  function renderModelOptions(list, desiredModel) {
    const ids = [...new Set(list.filter(Boolean))];
    modelSelect.innerHTML = '';
    if (!ids.length) {
      modelSelect.disabled = true;
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No models loaded';
      modelSelect.appendChild(option);
      if (config.model) {
        config.model = '';
        persistConfig();
      }
      updateChatAvailability();
      return;
    }

    ids.forEach(id => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;
    const selection = ids.includes(desiredModel) ? desiredModel : ids[0];
    modelSelect.value = selection;
    if (config.model !== selection) {
      config.model = selection;
      persistConfig();
    }
    updateChatAvailability();
  }

  function loadConfig() {
    config = { ...defaults, ...readJson(appSession, CONFIG_KEY, {}) };
    endpointInput.value = config.endpoint;
    tokenInput.value = config.token;
    syncEndpointControls(config.endpoint);
    applyTheme(config.theme);
    renderModelOptions(models, config.model);
  }

  // ---- the hint under a failing request ----
  function updateAuthGuidance() {
    if (!authGuidance) {
      return;
    }
    if (authHintText) {
      authHintText.textContent = buildAuthHintMessage();
    }
    if (consecutiveAuthErrors >= 2) {
      authGuidance.classList.add('active');
      authGuidance.hidden = false;
      authGuidance.setAttribute('aria-hidden', 'false');
    } else {
      authGuidance.classList.remove('active');
      authGuidance.hidden = true;
      authGuidance.setAttribute('aria-hidden', 'true');
    }
  }

  function getActiveTokenValue() {
    const inputValue = tokenInput && typeof tokenInput.value === 'string' ? tokenInput.value.trim() : '';
    const storedValue = typeof config.token === 'string' ? config.token.trim() : '';
    return inputValue || storedValue;
  }

  function buildAuthHintMessage() {
    const token = getActiveTokenValue();
    if (token) {
      return 'Check that your saved API key is correct, has access to this provider, or consider regenerating it if it recently changed.';
    }
    return 'No API key is currently saved. Add one under Settings → API key if your provider requires it. Local endpoints and public routes such as OpenRouter’s model list may work without a key.';
  }

  function buildAuthErrorMessage(baseMessage) {
    const message = typeof baseMessage === 'string' && baseMessage.trim() ? baseMessage.trim() : 'Error';
    const hint = buildAuthHintMessage();
    return hint ? `${message}\n\n${hint}` : message;
  }

  function isAuthError(err) {
    return Boolean(err && (err.isAuthError || err.status === 401 || err.status === 403));
  }

  // ---- asking the provider which models it has ----
  /**
   * Given an endpoint (possibly relative) derive the URL for the models
   * endpoint. This attempts to find the nearest version segment and
   * replace the trailing path with 'models'.
   * @param {string} endpoint base endpoint
   */
  const deriveModelsUrl = endpoint => endpointUrls.deriveModelsUrl(endpoint, window.location.href);

  const deriveChatCompletionsUrl = endpoint => endpointUrls.deriveChatCompletionsUrl(endpoint, window.location.href);

  /**
   * Fetch the list of available models for the current endpoint and token.
   * Updates the dropdown with the returned ids. Silent mode suppresses
   * alerts for invalid endpoints or no models returned.
   * @param {object} opts silent: when true suppresses alert messages
   */
  async function refreshModels({ silent } = {}) {
    if (window.localModels?.mode !== "api") return;
    const endpoint = endpointInput.value.trim() || config.endpoint;
    if (!endpoint) {
      if (!silent) {
        alertDialog('Set an endpoint', 'Set an endpoint before refreshing models.');
      }
      updateChatAvailability();
      return;
    }
    let modelsEndpoint;
    try {
      modelsEndpoint = deriveModelsUrl(endpoint);
    } catch (err) {
      console.error('Invalid endpoint:', err);
      if (!silent) {
        alertDialog('Invalid endpoint', err.message);
      }
      updateChatAvailability();
      return;
    }

    if (config.endpoint !== endpoint) {
      config.endpoint = endpoint;
      persistConfig();
    }

    refreshModelsBtn.setAttribute('aria-busy', 'true');
    const refreshLabelTarget = refreshModelsBtn.querySelector('.btn-label');
    const originalLabel = refreshLabelTarget ? refreshLabelTarget.textContent : refreshModelsBtn.textContent;
    if (refreshLabelTarget) {
      refreshLabelTarget.textContent = 'Loading...';
    } else {
      refreshModelsBtn.textContent = 'Loading...';
    }
    try {
      const api = apiSettingsFor(endpoint);
      const token = authTokenFor(endpoint) || tokenInput.value.trim();
      const request = buildModelsRequest({ format: api.format, endpoint, token, authStyle: api.authStyle, modelsUrl: api.modelsUrl, base: window.location.href });
      const response = await fetch(request.url, request.init);
      if (!response.ok) {
        const error = new Error('Status ' + response.status);
        error.status = response.status;
        if (response.status === 401 || response.status === 403) {
          error.isAuthError = true;
        }
        throw error;
      }
      const data = await response.json();
      const ids = modelIdsFrom(data, apiSettingsFor(endpoint).option);
      if (!ids.length) {
        throw new Error('No models returned.');
      }
      storeModels(ids);
      renderModelOptions(models, config.model);
      consecutiveAuthErrors = 0;
      updateAuthGuidance();
      if (!silent) {
        showToast('Models updated.');
      }
    } catch (err) {
      console.error('Failed to refresh models:', err);
      if (!silent) {
        const errorText = err && typeof err.message === 'string' && err.message ? err.message : 'Unknown error';
        alertDialog('Could not load the models', buildAuthErrorMessage('Failed to load models: ' + errorText));
      }
      if (isAuthError(err)) {
        consecutiveAuthErrors = Math.min(consecutiveAuthErrors + 1, 3);
      }
      updateAuthGuidance();
    } finally {
      refreshModelsBtn.removeAttribute('aria-busy');
      if (refreshLabelTarget) {
        refreshLabelTarget.textContent = originalLabel;
      } else {
        refreshModelsBtn.textContent = originalLabel;
      }
      updateChatAvailability();
    }
  }

  // ---- clearing and importing settings ----
  async function clearAllSettings() {
    const hasConfigData =
      Boolean((config.endpoint || '').trim()) ||
      Boolean((config.token || '').trim()) ||
      Boolean((config.model || '').trim()) ||
      Boolean((config.theme || '').trim()) ||
      models.length > 0;
    if (!hasConfigData) {
      showToast('No settings to clear.');
      return;
    }
    const confirmed = await confirmDialog('Reset all settings?', 'This removes your endpoint, token, model selection, cached models, and theme preference.', 'Reset settings', { danger: true });
    if (!confirmed) {
      return;
    }
    try {
      appSession.removeItem(CONFIG_KEY);
      appSession.removeItem(MODELS_KEY);
      appSession.removeItem(ENDPOINT_TOKENS_KEY);
    } catch (err) {
      console.warn('Unable to clear settings from storage:', err);
    }
    config = { ...defaults };
    models = [];
    transferUiDiscardPending();
    consecutiveAuthErrors = 0;
    endpointTokens.reset();
    promptedCopyFor.clear();
    endpointInput.value = '';
    tokenInput.value = '';
    syncEndpointControls('');
    applyTheme(config.theme);
    renderModelOptions(models, config.model);
    persistConfig();
    updateAuthGuidance();
    updateChatAvailability();
    showToast('Settings cleared.');
  }

  const stringifyTheme = value => (value === 'light' || value === 'dark' ? value : '');

  /** Applies reviewed settings. A blank incoming field leaves what is already set; tokens stay with the destination they were saved for. */
  function applyImportedSettings(next, { token = null, clearToken = false, models: fileModels = null } = {}) {
    const previous = { ...config };
    const endpointChanged = (next.endpoint || '') !== (previous.endpoint || '');
    config = { ...defaults, ...config, endpoint: next.endpoint || '', model: next.model || '', theme: stringifyTheme(next.theme), format: endpointChanged ? '' : config.format };
    if (clearToken && next.endpoint) clearTokenForEndpoint(next.endpoint);
    if (typeof token === 'string' && token.trim() && next.endpoint) setTokenForEndpoint(next.endpoint, token);
    const effective = next.endpoint ? getTokenForEndpoint(next.endpoint) : '';
    config.token = effective;
    persistConfig();
    endpointInput.value = config.endpoint;
    tokenInput.value = effective;
    syncEndpointControls(config.endpoint);
    applyTheme(config.theme);
    if (Array.isArray(fileModels) && fileModels.length) storeModels([...fileModels, ...models]);
    // the imported model stays selected even before the list can be refreshed (for example while a token is still locked)
    if (config.model && !models.includes(config.model)) storeModels([...models, config.model]);
    renderModelOptions(models, config.model);
    consecutiveAuthErrors = 0;
    updateAuthGuidance();
    updateChatAvailability();
    return { endpointChanged };
  }

  /** Start-up: read what was saved, show it in the form and settle which token goes with the endpoint. */
  function restore() {
    populateEndpointSelect();
    loadModels();
    loadConfig();
    loadEndpointTokens();
    const initialEndpoint = (config.endpoint || '').trim();
    if (initialEndpoint) {
      const initialCanon = canonicalizeEndpoint(initialEndpoint);
      if (initialCanon && endpointTokens.has(initialEndpoint)) {
        const storedToken = endpointTokens.get(initialEndpoint);
        if (tokenInput && tokenInput.value !== storedToken) {
          tokenInput.value = storedToken;
        }
        persistTokenValue(storedToken, { refresh: false });
      } else if ((config.token || '').trim()) {
        setTokenForEndpoint(initialEndpoint, config.token);
      }
    }
  }

  /** Wire the form controls. Called once, when the page's own listeners are attached. */
  function bind() {
  if (tokenInput) {
    const setTokenMasked = masked => {
      tokenInput.classList.toggle('masked', masked);
      if (peekTokenBtn) {
        const label = masked ? 'Show token' : 'Hide token';
        peekTokenBtn.setAttribute('aria-pressed', String(!masked));
        peekTokenBtn.setAttribute('aria-label', label);
        peekTokenBtn.setAttribute('title', label);
        const iconUse = peekTokenBtn.querySelector('use');
        if (iconUse) {
          iconUse.setAttribute('href', masked ? '#icon-eye' : '#icon-eye-off');
        }
      }
    };

    setTokenMasked(true);

    if (peekTokenBtn) {
      peekTokenBtn.addEventListener('click', () => {
        setTokenMasked(!tokenInput.classList.contains('masked'));
      });
    }

    if (copyTokenBtn) {
      copyTokenBtn.addEventListener('click', async () => {
        const value = tokenInput.value || '';
        if (!value) {
          showToast('Token field is empty');
          return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(value);
            showToast('Token copied to clipboard');
            return;
          } catch (error) {
            console.warn('Clipboard write failed', error);
          }
        }

        copyTextDialog('Copy your API token', value);
      });
    }
  }
  // Attach event listeners
  let endpointDebounceTimer = null;

  if (endpointSelect) {
    endpointSelect.addEventListener('change', () => {
      applyEndpointOption(endpointSelect.value);
    });
    if (apiFormatSelect) {
      apiFormatSelect.addEventListener('change', () => {
        config.format = isFormat(apiFormatSelect.value) ? apiFormatSelect.value : '';
        persistConfig();
        syncEndpointControls(endpointInput ? endpointInput.value.trim() : config.endpoint);
        consecutiveAuthErrors = 0;
        updateAuthGuidance();
        refreshModels({ silent: true }); // the model list is asked for the way this format asks
      });
    }
  }

  if (endpointInput) {
    endpointInput.addEventListener('input', () => {
      syncEndpointControls(endpointInput.value.trim());
      if (endpointDebounceTimer) {
        clearTimeout(endpointDebounceTimer);
      }
      endpointDebounceTimer = window.setTimeout(() => {
        endpointDebounceTimer = null;
        persistEndpointValue(endpointInput.value, { refresh: true });
      }, 1600);
    });
    endpointInput.addEventListener('change', () => {
      if (endpointDebounceTimer) {
        clearTimeout(endpointDebounceTimer);
        endpointDebounceTimer = null;
      }
      persistEndpointValue(endpointInput.value, { refresh: true });
    });
  }

  if (tokenInput) {
    tokenInput.addEventListener('input', () => {
      updateAuthGuidance();
    });
    tokenInput.addEventListener('change', () => {
      persistTokenValue(tokenInput.value, { refresh: true, remember: true });
    });
    tokenInput.addEventListener('blur', () => {
      const trimmed = (tokenInput.value || '').trim();
      const normalizedConfigToken = (config.token || '').trim();
      if (trimmed !== normalizedConfigToken) {
        persistTokenValue(tokenInput.value, { refresh: false, remember: true });
      } else {
        const activeEndpointValue = endpointInput ? endpointInput.value : config.endpoint;
        if ((activeEndpointValue || '').trim()) {
          setTokenForEndpoint(activeEndpointValue, trimmed);
        }
      }
    });
    tokenInput.addEventListener('paste', () => {
      window.setTimeout(() => {
        persistTokenValue(tokenInput.value, { refresh: false, remember: true });
      }, 0);
    });
  }

  refreshModelsBtn.addEventListener('click', () => refreshModels());

  modelSelect.addEventListener('change', () => {
    config.model = modelSelect.value;
    persistConfig();
    updateChatAvailability();
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', event => {
      if (event.shiftKey) {
        if (config.theme === 'light' || config.theme === 'dark') {
          config.theme = '';
          persistConfig();
          applyTheme('');
          showToast('Theme now follows your system setting.');
        } else {
          showToast('Theme already follows your system setting.');
        }
        return;
      }
      const nextTheme = resolveTheme(config.theme) === 'dark' ? 'light' : 'dark';
      config.theme = nextTheme;
      persistConfig();
      applyTheme(nextTheme);
      showToast(`Switched to ${nextTheme} theme.`);
    });
  }
  }

  return {
    get config() { return config; }, get models() { return models; },
    get authErrors() { return consecutiveAuthErrors; }, set authErrors(v) { consecutiveAuthErrors = v; },
    restore, bind, applyTheme, resolveTheme, syncEndpointControls, persistEndpointValue, persistTokenValue, persistConfig, applyEndpointOption, populateEndpointSelect,
    loadModels, storeModels, renderModelOptions, loadConfig, updateAuthGuidance, buildAuthErrorMessage, isAuthError, refreshModels, deriveChatCompletionsUrl,
    clearAllSettings, applyImportedSettings, canonicalizeEndpoint, getTokenForEndpoint, authTokenFor, setTokenForEndpoint, clearTokenForEndpoint, loadEndpointTokens,
    findEndpointOptionForValue, endpointOptions, apiSettings: apiSettingsFor, tokens: endpointTokens
  };
}
