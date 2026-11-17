// The provider list in Settings: what each provider is called, its endpoint, which API it speaks, a hint on where to find the API key, and how to recognise which one an
// endpoint belongs to. Pure data and lookups, no DOM. Reviewed 2026-11-04 against each provider's own address and a browser (CORS) preflight from our origin; the research,
// the sources and the providers left out on purpose are in docs/PROVIDERS-PLAN.md. A provider that a browser cannot call directly does not belong here, however popular.
//
// An option may carry:
//   group        the heading it is listed under
//   format       the API the app speaks to it by default: "chat" (Chat Completions, the default), "responses" (OpenAI Responses) or "anthropic" (Anthropic Messages)
//   authStyle    how the key is sent: "bearer" (the default), "api-key" (Azure) or "x-api-key"
//   modelsUrl    where the model list is, when that is not .../models under the endpoint
//   stripModelPrefix  a prefix its model ids carry that chat requests do not want
//   detect       recognises endpoints that are not simply this base URL

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const key = (where, steps, docs) => `${where} ${steps}${docs ? ' ' + docs : ''}`;

export const GROUPS = Object.freeze(['Model makers', 'Gateways and clouds', 'Hosted open models', 'On this computer or network']);

export const endpointOptions = [
  {
    id: 'choose',
    label: 'Select an endpoint…',
    baseUrl: '',
    hint:
      'Pick a provider from the list to fill in its endpoint, see how the app talks to it and where to find its API key. You can still paste any custom endpoint below.'
  },

  // ---- model makers ----
  {
    id: 'openai', group: 'Model makers', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', format: 'responses',
    hint: key(`Sign in at ${link('https://platform.openai.com/', 'platform.openai.com')}, open <strong>API keys</strong>, click <strong>Create new secret key</strong> and copy it (shown once).`,
      `The app uses OpenAI’s Responses API; Chat Completions is also available under <em>API format</em> below.`, link('https://platform.openai.com/docs/api-reference/responses', 'Responses API reference'))
  },
  {
    id: 'anthropic', group: 'Model makers', label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', format: 'anthropic',
    hint: key(`Sign in at ${link('https://platform.claude.com/', 'platform.claude.com')}, open <strong>API keys</strong>, create a key and copy it (shown once).`,
      `Your key is sent from your browser straight to Anthropic (Anthropic calls this “direct browser access”); it is never sent anywhere else. Use a key with a spend limit.`,
      link('https://platform.claude.com/docs/en/api/overview', 'Messages API'))
  },
  {
    id: 'google', group: 'Model makers', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', stripModelPrefix: 'models/',
    hint: key(`Get a key in ${link('https://aistudio.google.com/apikey', 'Google AI Studio')} (<strong>Get API key</strong>).`,
      `This is Google’s OpenAI-compatible endpoint for Gemini models.`, link('https://ai.google.dev/gemini-api/docs/openai', 'Gemini OpenAI compatibility'))
  },
  {
    id: 'mistral', group: 'Model makers', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1',
    hint: key(`Sign in at ${link('https://console.mistral.ai/', 'console.mistral.ai')}, open <strong>API keys</strong> and create one.`, '', link('https://docs.mistral.ai/api/', 'Mistral API'))
  },
  {
    id: 'xai', group: 'Model makers', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', format: 'responses',
    hint: key(`Sign in at ${link('https://console.x.ai/', 'console.x.ai')}, open <strong>API Keys</strong> and create one.`, 'The app uses the Responses API; Chat Completions is also available under <em>API format</em>.', link('https://docs.x.ai/', 'xAI docs'))
  },
  {
    id: 'cohere', group: 'Model makers', label: 'Cohere', baseUrl: 'https://api.cohere.ai/compatibility/v1',
    hint: key(`Create a key in the ${link('https://dashboard.cohere.com/api-keys', 'Cohere dashboard')}.`, 'This is Cohere’s OpenAI-compatibility endpoint.', link('https://docs.cohere.com/docs/compatibility-api', 'Compatibility API'))
  },
  {
    id: 'deepseek', group: 'Model makers', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    hint: key(`Sign in at ${link('https://platform.deepseek.com/', 'platform.deepseek.com')}, open <strong>API keys</strong> and create one.`, '', link('https://api-docs.deepseek.com/', 'DeepSeek API'))
  },
  {
    id: 'moonshot', group: 'Model makers', label: 'Moonshot AI (Kimi)', baseUrl: 'https://api.moonshot.ai/v1',
    hint: key(`Create a key in the ${link('https://platform.kimi.ai/console/api-keys', 'Kimi API console')}.`, '', link('https://platform.kimi.ai/docs', 'Kimi API docs'))
  },
  {
    id: 'alibaba', group: 'Model makers', label: 'Alibaba Cloud (Qwen, international)', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hint: key(`Create a key in ${link('https://bailian.console.alibabacloud.com/', 'Alibaba Cloud Model Studio')} (international region).`, 'Keys for the mainland-China region use a different address; paste it as a custom endpoint.', link('https://www.alibabacloud.com/help/en/model-studio/', 'Model Studio docs'))
  },
  {
    id: 'zai', group: 'Model makers', label: 'Z.ai (GLM)', baseUrl: 'https://api.z.ai/api/paas/v4',
    hint: key(`Create a key at ${link('https://z.ai/manage-apikey/apikey-list', 'z.ai')} (<strong>API Keys</strong>).`, '', link('https://docs.z.ai/', 'Z.ai docs'))
  },

  // ---- gateways and clouds ----
  {
    id: 'openrouter', group: 'Gateways and clouds', label: 'OpenRouter — many providers, one key', baseUrl: 'https://openrouter.ai/api/v1',
    hint: key(`One key for models from many makers. Log in at ${link('https://openrouter.ai/', 'openrouter.ai')}, open <strong>Keys</strong>, create one (you can set a spend cap) and copy it (shown once).`,
      'The Responses API is also offered under <em>API format</em>.', link('https://openrouter.ai/docs/quickstart', 'OpenRouter quickstart'))
  },
  {
    id: 'vercel', group: 'Gateways and clouds', label: 'Vercel AI Gateway', baseUrl: 'https://ai-gateway.vercel.sh/v1',
    hint: key(`One key for many makers’ models. In the Vercel dashboard go to <strong>AI Gateway → API Keys</strong>, create a key and copy it.`, '', link('https://vercel.com/docs/ai-gateway', 'AI Gateway docs'))
  },
  {
    id: 'cloudflare', group: 'Gateways and clouds', label: 'Cloudflare AI Gateway', baseUrl: 'https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat',
    hint: key('In the Cloudflare dashboard open <strong>AI → AI Gateway</strong>, choose your gateway (put its account and gateway ids in the address), add the upstream providers’ keys under <strong>Provider Keys</strong>, and use a gateway token as the API key if you turned authentication on.',
      '', link('https://developers.cloudflare.com/ai-gateway/', 'Cloudflare AI Gateway')),
    detect: value => value.startsWith('https://gateway.ai.cloudflare.com/')
  },
  {
    id: 'huggingface-router', group: 'Gateways and clouds', label: 'Hugging Face Inference Providers', baseUrl: 'https://router.huggingface.co/v1',
    hint: key(`Create an access token at ${link('https://huggingface.co/settings/tokens', 'huggingface.co/settings/tokens')} with permission to call Inference Providers.`, '', link('https://huggingface.co/docs/inference-providers/', 'Inference Providers docs'))
  },
  {
    id: 'azure', group: 'Gateways and clouds', label: 'Microsoft Azure OpenAI / Foundry', baseUrl: 'https://{resource}.openai.azure.com/openai/v1', format: 'responses', authStyle: 'api-key',
    hint: key('Use your resource’s address with <code>/openai/v1</code> (replace <code>{resource}</code>), your resource key as the API token, and your <strong>deployment name</strong> as the model.',
      'The app uses the Responses API; Chat Completions is also available under <em>API format</em>. Your resource must be reachable from the internet.', link('https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle', 'Azure OpenAI v1 API')),
    detect: value => value.includes('.openai.azure.com/') || value.includes('.services.ai.azure.com/') || value.includes('.cognitiveservices.azure.com/')
  },

  // ---- hosted open models ----
  {
    id: 'groq', group: 'Hosted open models', label: 'Groq — very fast inference', baseUrl: 'https://api.groq.com/openai/v1',
    hint: key(`Log in to ${link('https://console.groq.com/', 'Groq Cloud')}, open <strong>API Keys</strong>, create one and copy it.`, '', link('https://console.groq.com/docs/openai', 'Groq OpenAI compatibility'))
  },
  {
    id: 'together', group: 'Hosted open models', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1',
    hint: key(`Sign in at ${link('https://api.together.ai/', 'api.together.ai')}, open <strong>Settings → API Keys</strong> and create one.`, '', link('https://docs.together.ai/docs/openai-api-compatibility', 'Together OpenAI compatibility'))
  },
  {
    id: 'fireworks', group: 'Hosted open models', label: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1',
    hint: key(`In the ${link('https://app.fireworks.ai/settings/users/api-keys', 'Fireworks dashboard')} open <strong>API Keys</strong> and create one.`, '', link('https://docs.fireworks.ai/tools-sdks/openai-compatibility', 'Fireworks OpenAI compatibility'))
  },
  {
    id: 'cerebras', group: 'Hosted open models', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1',
    hint: key(`Create a key in ${link('https://cloud.cerebras.ai/', 'Cerebras Cloud')}.`, '', link('https://inference-docs.cerebras.ai/', 'Cerebras inference docs'))
  },
  {
    id: 'nebius', group: 'Hosted open models', label: 'Nebius Token Factory', baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    hint: key(`Create a key in ${link('https://tokenfactory.nebius.com/', 'Nebius Token Factory')}.`, '', link('https://docs.tokenfactory.nebius.com/', 'Token Factory docs'))
  },
  {
    id: 'deepinfra', group: 'Hosted open models', label: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai',
    hint: key(`Open <strong>Dashboard → API Keys</strong> at ${link('https://deepinfra.com/dash/api_keys', 'deepinfra.com')} and create one.`, '', link('https://deepinfra.com/docs/openai_api', 'DeepInfra OpenAI API'))
  },
  {
    id: 'hyperbolic', group: 'Hosted open models', label: 'Hyperbolic', baseUrl: 'https://api.hyperbolic.xyz/v1',
    hint: key(`Open <strong>Settings → API Keys</strong> in the ${link('https://app.hyperbolic.ai/settings', 'Hyperbolic dashboard')} and create one.`, '', link('https://docs.hyperbolic.xyz/', 'Hyperbolic docs'))
  },
  {
    id: 'scaleway', group: 'Hosted open models', label: 'Scaleway (hosted in the EU)', baseUrl: 'https://api.scaleway.ai/v1',
    hint: key(`Create an API key in the ${link('https://console.scaleway.com/generative-api', 'Scaleway console')} (<strong>Generative APIs</strong>).`, 'Models run in European data centres.', link('https://www.scaleway.com/en/docs/generative-apis/', 'Generative APIs docs'))
  },
  {
    id: 'perplexity', group: 'Hosted open models', label: 'Perplexity Sonar (answers with web search)', baseUrl: 'https://api.perplexity.ai', modelsUrl: 'https://api.perplexity.ai/v1/models',
    hint: key(`Create a key in your ${link('https://www.perplexity.ai/settings/api', 'Perplexity API settings')}.`, 'These models search the web, so what you write is sent to Perplexity and its search.', link('https://docs.perplexity.ai/', 'Perplexity docs'))
  },

  // ---- on this computer or network ----
  {
    id: 'ollama', group: 'On this computer or network', label: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    hint: key('Ollama runs models on your own machine. No API key is needed, so leave the token blank. If the browser refuses the connection, start Ollama with <code>OLLAMA_ORIGINS</code> set to this site’s address.',
      'Some browsers (Safari in particular) can refuse to let an https page call a local <code>http://</code> server; if yours does, try Chrome, Edge or Firefox.', link('https://docs.ollama.com/api/openai-compatibility', 'Ollama OpenAI compatibility'))
  },
  {
    id: 'lmstudio', group: 'On this computer or network', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1',
    hint: key('Start the local server from the LM Studio interface (turn on <strong>Enable CORS</strong>) and use this address; the API key can stay empty.', '', link('https://lmstudio.ai/docs/developer', 'LM Studio developer docs'))
  },
  {
    id: 'llamacpp', group: 'On this computer or network', label: 'llama.cpp server', baseUrl: 'http://localhost:8080/v1',
    hint: key('Start <code>llama-server</code> with a model; it answers on this address and needs no key unless you started it with <code>--api-key</code>.', '', link('https://github.com/ggml-org/llama.cpp/tree/master/tools/server', 'llama-server docs'))
  },
  {
    id: 'vllm', group: 'On this computer or network', label: 'vLLM server', baseUrl: 'http://localhost:8000/v1',
    hint: key('Start <code>vllm serve</code> with a model. A key is needed only if you started it with <code>--api-key</code>.', '', link('https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html', 'vLLM OpenAI-compatible server'))
  },
  {
    id: 'custom', group: 'On this computer or network', label: 'Custom endpoint', baseUrl: '',
    hint:
      'Paste the base URL of any server that speaks one of the three APIs (Chat Completions, Responses or Anthropic Messages), such as a company gateway or another local server, and choose its <em>API format</em> below. Include the provider’s API key if it needs one. The server must allow requests from this site (CORS).'
  }
];

export const escapeHtml = str =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function getEndpointOptionById(id) {
  return endpointOptions.find(option => option.id === id) || endpointOptions[0];
}

export function findEndpointOptionForValue(value) {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) {
    return getEndpointOptionById('choose');
  }
  const match = endpointOptions.find(option => {
    if (option.baseUrl) {
      const compare = option.baseUrl.toLowerCase();
      if (compare && normalized.startsWith(compare)) {
        return true;
      }
    }
    if (typeof option.detect === 'function') {
      try {
        if (option.detect(normalized)) {
          return true;
        }
      } catch (err) {
        console.warn('Endpoint detection failed for option', option.id, err);
      }
    }
    return false;
  });
  return match || getEndpointOptionById('custom');
}
