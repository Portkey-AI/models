# Contributing to Portkey Models

Thank you for your interest in contributing to the Portkey Models repository! This community-maintained database helps developers track AI model pricing and configurations across 35+ providers.

## Table of Contents

- [Getting Started](#getting-started)
- [Types of Contributions](#types-of-contributions)
- [Adding or Updating Pricing](#adding-or-updating-pricing)
- [Adding Model Configurations](#adding-model-configurations)
- [Submitting Your Changes](#submitting-your-changes)
- [Code of Conduct](#code-of-conduct)

## Getting Started

1. **Fork** this repository
2. **Clone** your fork locally
3. Make your changes
4. **Test** your changes (validate JSON)
5. **Submit** a pull request

## Types of Contributions

| Contribution | Directory | Description |
|--------------|-----------|-------------|
| Model Pricing | `pricing/` | Token costs, image pricing, additional units |
| Model Configs | `general/` | Parameters, capabilities, supported features |

## Adding or Updating Pricing

Pricing files are located in `pricing/{provider}.json`.

### Price Format

> ⚠️ **Prices are in cents per token, not dollars.**

| Provider Pricing | JSON Value | Calculation |
|------------------|------------|-------------|
| $0.03 / 1K tokens | `0.003` | $0.03 ÷ 1000 = 0.00003 dollars = 0.003 cents |
| $2.50 / 1M tokens | `0.00025` | $2.50 ÷ 1,000,000 = 0.0000025 dollars = 0.00025 cents |
| $10 / 1M tokens | `0.001` | $10 ÷ 1,000,000 = 0.00001 dollars = 0.001 cents |

**Quick formula:** `price_in_cents = (dollars_per_million / 1,000,000) * 100`

### Schema Structure

```json
{
  "model-name": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.001 },
        "response_token": { "price": 0.002 },
        "cache_write_input_token": { "price": 0 },
        "cache_read_input_token": { "price": 0.0005 }
      },
      "currency": "USD"
    }
  }
}
```

### Available Fields

| Field | Description |
|-------|-------------|
| `request_token` | Input token cost |
| `response_token` | Output token cost |
| `cache_write_input_token` | Cache write cost |
| `cache_read_input_token` | Cache read cost |
| `request_audio_token` | Audio input cost |
| `response_audio_token` | Audio output cost |
| `additional_units` | Provider-specific (web_search, thinking_token, etc.) |
| `image` | Image generation pricing by quality/size |

### Adding a New Provider

1. Create `pricing/{provider-name}.json`
2. Use lowercase with hyphens (e.g., `together-ai.json`)
3. Include a `default` entry with zero prices
4. Add model-specific pricing

```json
{
  "default": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0 },
        "response_token": { "price": 0 }
      },
      "currency": "USD"
    }
  },
  "model-name": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.001 },
        "response_token": { "price": 0.002 }
      }
    }
  }
}
```

## Adding Model Configurations

Configuration files are located in `general/{provider}.json`.

### Schema Structure

```json
{
  "model-name": {
    "params": [
      {
        "key": "max_tokens",
        "maxValue": 16384
      },
      {
        "key": "temperature",
        "defaultValue": 1,
        "minValue": 0,
        "maxValue": 2
      }
    ],
    "type": {
      "primary": "chat",
      "supported": ["tools", "image"]
    }
  }
}
```

### Type Values

| Primary Type | Description |
|--------------|-------------|
| `chat` | Chat completion models |
| `text` | Text completion models |
| `embedding` | Embedding models |
| `image` | Image generation models |
| `audio` | Audio models |

| Supported Features | Description |
|-------------------|-------------|
| `tools` | Function calling support |
| `image` | Vision/image input support |
| `cache_control` | Prompt caching support |

## Submitting Your Changes

### Before Submitting

1. **Validate JSON syntax**
   ```bash
   # Validate all pricing files
   for file in pricing/*.json; do jq empty "$file" && echo "✅ $file"; done
   
   # Validate all general files  
   for file in general/*.json; do jq empty "$file" && echo "✅ $file"; done
   ```

2. **Check your pricing math** — Remember: cents per token, not dollars!

3. **Find the source** — You'll need to provide a link to official pricing

### Pull Request Guidelines

1. **Title format:** `[provider] Brief description`
   - Example: `[openai] Add GPT-5 pricing`
   - Example: `[anthropic] Update Claude 4 cache pricing`

2. **Include source link** — Link to the provider's official pricing page

3. **One provider per PR** — Makes review easier

4. **Sign the CLA** — First-time contributors must sign our Contributor License Agreement

### What Happens Next

1. Automated checks validate your JSON
2. A maintainer reviews your PR
3. Once merged, changes sync to Portkey's systems

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing. We're committed to providing a welcoming and inclusive environment.

## Questions?

- 💬 [Discord](https://discord.gg/portkey) — Ask in #open-source
- 🐛 [Issues](https://github.com/Portkey-AI/models/issues) — Report bugs or request features
- 📖 [Documentation](https://portkey.ai/docs) — Learn more about Portkey

---

Thank you for helping keep AI model pricing accurate and up-to-date! 🙏
