#!/usr/bin/env node

/**
 * Sync FriendliAI model metadata from the Friendli serverless API.
 *
 * Fetches https://api.friendli.ai/serverless/v1/models and regenerates:
 *   - general/friendli.json   (model capabilities + params)
 *   - pricing/friendli.json   (per-model pricing in cents/token)
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

function buildCommonParams(maxCompletionTokens) {
  return [
    { key: 'max_tokens', defaultValue: 256, minValue: 1, maxValue: maxCompletionTokens },
    { key: 'temperature', defaultValue: 0.7, minValue: 0, maxValue: 2 },
    { key: 'top_p', defaultValue: 1, minValue: 0, maxValue: 1 },
    { key: 'repetition_penalty', defaultValue: 1, minValue: 0, maxValue: 2 },

    // Friendli-specific reasoning controls (see gateway PR #1756)
    { key: 'chat_template_kwargs', type: 'json', skipValues: [null, {}] },
    { key: 'parse_reasoning', defaultValue: false, type: 'boolean', skipValues: [null, false] },
    { key: 'include_reasoning', defaultValue: false, type: 'boolean', skipValues: [null, false] },

    { key: 'stop', defaultValue: null, type: 'array-of-strings', skipValues: [null, []] },
    { key: 'stream', defaultValue: true, type: 'boolean' },
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
  ];
}

function buildSupported(inputModalities, functionality) {
  const supported = [];
  if (functionality?.tool_call) supported.push('tools');
  if (inputModalities?.includes('image')) supported.push('image');
  return supported;
}

function generateGeneralFile(models) {
  const general = {
    name: 'friendli',
    description: '',
    default: {
      params: buildCommonParams(4096),
      messages: { options: ['system', 'user', 'assistant'] },
      type: { primary: 'chat', supported: [] },
    },
  };

  for (const model of models) {
    const supported = buildSupported(model.input_modalities, model.functionality);
    general[model.id] = {
      name: model.id,
      params: [{ key: 'max_tokens', maxValue: model.max_completion_tokens }],
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
