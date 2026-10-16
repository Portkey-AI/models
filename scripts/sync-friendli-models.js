#!/usr/bin/env node

/**
 * Sync FriendliAI model metadata from the Friendli serverless API.
 *
 * Fetches https://api.friendli.ai/serverless/v1/models and regenerates:
 *   - general/friendli.json   (model capabilities + params)
 *   - pricing/friendli.json   (per-model pricing in cents/token)
 *
 * Parameter ranges follow the Friendli OpenAPI spec (ServerlessChatCompletionBody):
 *   https://github.com/friendliai/friendli-openapi
 * Only ranges explicitly documented in the spec descriptions are included.
 * Default values come from the API's per-model `default_params` field.
 *
 * Friendli API returns pricing in USD/token; this repo stores cents/token (×100).
 *
 * Usage: node scripts/sync-friendli-models.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.friendli.ai/serverless/v1/models';
const GENERAL_FILE = path.join(__dirname, '..', 'general', 'friendli.json');
const PRICING_FILE = path.join(__dirname, '..', 'pricing', 'friendli.json');

// ── helpers ──────────────────────────────────────────────────────────────

/** USD/token → cents/token (×100), rounded to 10 significant decimals to avoid float noise. */
function usdToCents(usd) {
  // ponytail: rounding to 10 sig digits; real prices have ≤8 sig figs so this is lossless
  return Number((usd * 100).toPrecision(10));
}

/**
 * Build default params from API default_params + OpenAPI spec ranges.
 * Only minValue/maxValue that are explicitly documented in the spec description are included:
 *   - top_p: "Values range from 0.0 (exclusive) to 1.0 (inclusive)"
 *   - frequency_penalty: "Number between -2.0 and 2.0"
 *   - presence_penalty: "Number between -2.0 and 2.0"
 *   - min_p: "Values range from 0.0 (inclusive) to 1.0 (inclusive)"
 * Params without documented ranges (temperature, top_k, repetition_penalty, n) get defaultValue only.
 */
function buildDefaultParams(defaultParams) {
  const dp = defaultParams || {};

  return [
    { key: 'max_tokens', defaultValue: 256, minValue: 1 },
    { key: 'temperature', defaultValue: dp.temperature ?? 1 },
    { key: 'top_p', defaultValue: dp.top_p ?? 1, minValue: 0, maxValue: 1 },
    { key: 'top_k', defaultValue: dp.top_k ?? 0 },
    { key: 'min_p', defaultValue: dp.min_p ?? 0, minValue: 0, maxValue: 1 },
    { key: 'frequency_penalty', defaultValue: 0, minValue: -2, maxValue: 2 },
    { key: 'presence_penalty', defaultValue: 0, minValue: -2, maxValue: 2 },
    { key: 'repetition_penalty', defaultValue: dp.repetition_penalty ?? 1 },
    { key: 'n', defaultValue: 1 },
    { key: 'stop', defaultValue: null, type: 'array-of-strings', skipValues: [null, []] },
    { key: 'stream', defaultValue: true, type: 'boolean' },
  ];
}

// Params for models that support tool calling (from Friendli OpenAPI spec).
function buildToolParams() {
  return [
    {
      key: 'tool_choice',
      type: 'non-view-manage-data',
      defaultValue: null,
      options: [
        { value: 'none', name: 'None' },
        { value: 'auto', name: 'Auto' },
        { value: 'required', name: 'Required' },
        { value: 'custom', name: 'Custom', schema: { type: 'json' } },
      ],
      skipValues: [null, []],
      rule: { default: { condition: 'tools', then: 'auto', else: null } },
    },
    {
      key: 'response_format',
      defaultValue: null,
      options: [
        { value: null, name: 'Text' },
        { value: 'json_object', name: 'JSON Object' },
        {
          value: 'json_schema',
          name: 'JSON Schema',
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string', value: 'json_schema' },
              json_schema: { type: 'object' },
            },
          },
          params: { key: 'json_schema', defaultValue: null, type: 'json', skipValues: [null] },
        },
      ],
      skipValues: [null],
      type: 'string',
    },
  ];
}

function buildSupported(inputModalities, functionality) {
  const supported = [];
  if (functionality?.tool_call) supported.push('tools');
  if (inputModalities?.includes('image')) supported.push('image');
  return supported;
}

function generateGeneralFile(models) {
  // Use the first model's default_params as the provider-wide default
  // (all models currently share the same default_params)
  const defaultParams = models[0]?.default_params;

  const general = {
    name: 'friendli',
    description: '',
    default: {
      params: buildDefaultParams(defaultParams),
      messages: { options: ['system', 'user', 'assistant'] },
      type: { primary: 'chat', supported: [] },
    },
  };

  for (const model of models) {
    const supported = buildSupported(model.input_modalities, model.functionality);
    const params = [{ key: 'max_tokens', maxValue: model.max_completion_tokens }];

    // Add tool_choice + response_format for models that support tool calling
    if (model.functionality?.tool_call) {
      params.push(...buildToolParams());
    }

    general[model.id] = {
      name: model.id,
      params,
      type: { primary: 'chat', supported },
    };
  }

  return general;
}

function generatePricingFile(models, existing) {
  const pricing = {};

  // Preserve the default block (used for models without explicit pricing)
  pricing['default'] = existing?.['default'] ?? {
    pricing_config: {
      pay_as_you_go: {
        request_token: { price: 0 },
        response_token: { price: 0 },
      },
      calculate: {
        request: {
          operation: 'multiply',
          operands: [{ value: 'input_tokens' }, { value: 'rates.request_token' }],
        },
        response: {
          operation: 'multiply',
          operands: [{ value: 'output_tokens' }, { value: 'rates.response_token' }],
        },
      },
      currency: 'USD',
    },
  };

  for (const model of models) {
    const p = model.pricing || {};
    const entry = {
      pricing_config: {
        pay_as_you_go: {},
      },
    };

    const payg = entry.pricing_config.pay_as_you_go;
    if (p.input != null) {
      payg.request_token = { price: usdToCents(p.input) };
    }
    if (p.output != null) {
      payg.response_token = { price: usdToCents(p.output) };
    }
    if (p.input_cache_read != null) {
      payg.cache_read_input_token = { price: usdToCents(p.input_cache_read) };
    }

    pricing[model.id] = entry;
  }

  return pricing;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Fetching ${API_URL} ...`);
  // ponytail: 3 retries with backoff; API occasionally returns 503
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(API_URL, { headers: { Accept: 'application/json' } });
    if (res.ok) break;
    if (attempt < 3) {
      const delay = 1000 * attempt;
      console.error(`  Attempt ${attempt}: ${res.status} ${res.statusText}, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!res || !res.ok) {
    console.error(`API returned ${res?.status} ${res?.statusText} after retries`);
    process.exit(1);
  }

  const body = await res.json();
  const models = body.data;
  if (!Array.isArray(models) || models.length === 0) {
    console.error('No models found in API response');
    process.exit(1);
  }

  // Sort by id for stable output
  models.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`Found ${models.length} model(s):\n  ${models.map((m) => m.id).join('\n  ')}\n`);

  let existingPricing = null;
  if (fs.existsSync(PRICING_FILE)) {
    try {
      existingPricing = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
    } catch {
      // ignore — will regenerate from scratch
    }
  }

  const general = generateGeneralFile(models);
  const pricing = generatePricingFile(models, existingPricing);

  if (dryRun) {
    console.log('--- general/friendli.json (dry run) ---');
    console.log(JSON.stringify(general, null, 2));
    console.log('\n--- pricing/friendli.json (dry run) ---');
    console.log(JSON.stringify(pricing, null, 2));
    return;
  }

  fs.writeFileSync(GENERAL_FILE, JSON.stringify(general, null, 2) + '\n');
  console.log(`✅ Wrote ${GENERAL_FILE}`);

  fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2) + '\n');
  console.log(`✅ Wrote ${PRICING_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
