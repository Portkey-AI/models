# AI Models Database

The most comprehensive, accurate, and API-ready open-source database of AI model configurations and pricing.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

## Overview

This repository contains unified model configurations for **42 AI providers** including OpenAI, Anthropic, Google, AWS Bedrock, Azure, and more. Each model entry includes:

- **Configuration**: Parameters, supported features, token limits
- **Pricing**: Per-token costs, caching rates, tiered pricing
- **Capabilities**: Tools, vision, audio, streaming support

## Directory Structure

```
models/
├── combined/          # 🌟 Unified configs (recommended)
│   ├── openai.json
│   ├── anthropic.json
│   ├── google.json
│   └── ...
├── general/           # Model configurations (params, types)
├── pricing/           # Pricing configurations
├── scripts/           # Merge and utility scripts
└── reports/           # Generated reports
```

## Documentation

- **[Schema Reference](docs/SCHEMA.md)** - Detailed JSON schema documentation
- **[Merge Report](reports/merge-report.md)** - Latest merge statistics

## Quick Start

### Using Combined Files (Recommended)

The `combined/` directory contains fully merged model data with both config and pricing:

```javascript
// Load a provider's models
const openaiModels = require('./combined/openai.json');

// Get a specific model
const gpt4o = openaiModels.models['gpt-4o'];
console.log(gpt4o.pricing);  // { input: 2.5, output: 10, ... }
```

### JSON Structure

Each combined JSON file follows this structure:

```json
{
  "provider": "openai",
  "provider_name": "OpenAI",
  "default": {
    "params": [...],
    "pricing": {
      "currency": "USD",
      "calculate": {...}
    }
  },
  "models": {
    "gpt-4o": {
      "type": "chat",
      "capabilities": ["tools", "image", "streaming"],
      "params": [...],
      "max_output_tokens": 16384,
      "pricing": {
        "input": 2.5,
        "output": 10,
        "cache_read": 1.25,
        "cache_write": 0
      }
    }
  }
}
```

## Pricing Format

All pricing is in **USD per 1M tokens** (industry standard for display):

| Field | Description |
|-------|-------------|
| `input` | Cost per 1M input tokens |
| `output` | Cost per 1M output tokens |
| `cache_read` | Cost per 1M cached input tokens read |
| `cache_write` | Cost per 1M cached tokens written |
| `audio_input` | Cost per 1M audio input tokens |
| `audio_output` | Cost per 1M audio output tokens |
| `image` | Cost per image (varies by size) |

Example: GPT-4o pricing
```json
{
  "input": 2.5,     // $2.50 per 1M input tokens
  "output": 10,     // $10.00 per 1M output tokens
  "cache_read": 1.25 // $1.25 per 1M cached tokens
}
```

### Tiered Pricing (Google)

Some models have context-length-based pricing tiers:

```json
{
  "gemini-1.5-flash": {
    "pricing": {
      "input": 0.075,
      "output": 0.30
    },
    "pricing_tiers": {
      "gt_128k": {
        "input": 0.15,
        "output": 0.60
      }
    }
  }
}
```

## Schema Quick Reference

**[📖 Full Schema Documentation →](docs/SCHEMA.md)**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"chat"`, `"text"`, `"embedding"`, `"image"` |
| `capabilities` | string[] | `["tools", "image", "pdf", "doc"]` |
| `params` | array | Parameter configs (merged with defaults) |
| `pricing` | object | `{input, output, cache_read, ...}` in $/1M tokens |
| `pricing_tiers` | object | Context-based pricing (Google) |
| `disablePlayground` | boolean | Hide from playground UI |
| `max_output_tokens` | number | Max output tokens |

## Supported Providers

| Provider | Models | Status |
|----------|--------|--------|
| OpenAI | 150 | ✅ Full |
| Anthropic | 37 | ✅ Full |
| Google | 51 | ✅ Full |
| AWS Bedrock | 134 | ✅ Full |
| Azure OpenAI | 160 | ✅ Full |
| Azure AI | 209 | ✅ Full |
| Vertex AI | 114 | ✅ Full |
| Together AI | 178 | ✅ Full |
| DeepInfra | 181 | ✅ Full |
| OpenRouter | 437 | ✅ Full |
| Groq | 36 | ✅ Full |
| Mistral AI | 12 | ✅ Full |
| Cohere | 17 | ✅ Full |
| xAI (Grok) | 36 | ✅ Full |
| DeepSeek | 2 | ✅ Full |
| Cerebras | 11 | ✅ Full |
| + 26 more... | | |

## API Usage

### REST API (Coming Soon)

```bash
# List all providers
GET /api/providers

# Get provider models
GET /api/providers/openai

# Get specific model
GET /api/models/openai/gpt-4o

# Search by capability
GET /api/models?capability=tools&capability=vision
```

### NPM Package (Coming Soon)

```javascript
import { getModel, getProvider, searchModels } from '@portkey/models';

// Get model with pricing
const model = await getModel('openai', 'gpt-4o');
console.log(model.pricing.input); // 2.5

// Search models with capabilities
const visionModels = await searchModels({ 
  capabilities: ['vision', 'tools'] 
});
```

## Regenerating Combined Files

If you update `general/` or `pricing/` files, regenerate the combined files:

```bash
node scripts/merge-models.js
```

This will:
1. Merge all provider files
2. Handle provider-specific naming conventions
3. Generate a mismatch report in `reports/`

## Provider-Specific Handling

The merge script handles these edge cases automatically:

| Provider | Special Logic |
|----------|---------------|
| OpenAI | `ft:` prefix for fine-tuned models |
| Google | `-lte-128k`/`-gt-128k` → `pricing_tiers` |
| Bedrock | Regional prefixes (`us.`, `eu.`) preserved |
| Fireworks AI | Model size buckets (`4b`, `16b`, `100b`) |
| Azure | `.ft` suffix handling |

## Contributing

We welcome contributions! To add or update model data:

1. Edit files in `general/` or `pricing/`
2. Run `node scripts/merge-models.js`
3. Review the changes in `combined/`
4. Submit a PR

## Comparison with Alternatives

| Feature | Portkey Models | LiteLLM | models.dev |
|---------|----------------|---------|------------|
| Providers | 42 | 100+ | 30+ |
| Pricing | ✅ Per-token | ✅ Per-token | ❌ Limited |
| Capabilities | ✅ Detailed | ✅ Basic | ✅ Basic |
| Parameters | ✅ Full config | ❌ None | ❌ None |
| Open Source | ✅ MIT | ✅ MIT | ❌ No |
| API Ready | ✅ Yes | ❌ No | ✅ Yes |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with ❤️ by [Portkey.ai](https://portkey.ai)**

