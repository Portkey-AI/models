

<h3 align="center">Portkey Models</h3>

<p align="center"><em>Accurate pricing for 2,000+ models across 40+ providers. Free API, no auth required.</em></p>

<p align="center">
  <a href="https://portkey.ai/models">Explorer</a> · <a href="https://portkey.ai/rankings">Rankings</a> · <a href="#api">API</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="https://discord.gg/portkey">Discord</a>
</p>

<p align="center">
<a href="./LICENSE"><img src="https://img.shields.io/github/license/Portkey-AI/gateway" alt="License"></a>
<a href="https://discord.gg/portkey"><img src="https://img.shields.io/discord/1143393887742861333" alt="Discord"></a>
<a href="https://twitter.com/PortkeyAI"><img src="https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI" alt="Twitter"></a>
</p>

---

This repository contains comprehensive pricing and configuration data for LLMs. It powers cost attribution for 200+ enterprises running 400B+ tokens through [Portkey AI Gateway](https://github.com/Portkey-AI/gateway) every day.

## Why This Exists

LLM pricing is a mess. Every team building on LLMs ends up maintaining its own spreadsheet — and it's stale by Friday.

- **The Naming Problem** — `gpt-5`, `gpt-5.2-pro-2025-12-11`, `o1`, `o3-mini` are all different models with different prices
- **The Units Problem** — OpenAI charges tokens, Google charges characters, Cohere uses "generations" and "summarization units"
- **The Hidden Dimensions Problem** — Thinking tokens, cache writes vs. reads, context thresholds, per-request fees, multimodal surcharges
- **The Velocity Problem** — DeepSeek dropped R1 pricing 75% in weeks. Google releases new tiers mid-quarter with no announcement

We built this as an open, community-maintained database to solve that problem.

## API

> 🔓 **Free API. No authentication required.**

```bash
curl https://api.portkey.ai/model-configs/pricing/{provider}/{model}
```

```bash
# Examples
curl https://api.portkey.ai/model-configs/pricing/openai/gpt-5
curl https://api.portkey.ai/model-configs/pricing/anthropic/claude-sonnet-4-5-20250514
curl https://api.portkey.ai/model-configs/pricing/google/gemini-3.0-pro
```

📖 **[Full API Documentation](https://portkey.ai/docs/product/model-catalog/portkey-models)** — Response schema, model configuration endpoints, and more.

## Pricing Unit

> ⚠️ **Prices are in cents per token, not dollars.**

| JSON | Per 1K | Per 1M |
|------|--------|--------|
| `0.003` | $0.03 | $30 |
| `0.00025` | $0.0025 | $2.50 |
| `1` | $10 | $10,000 |

```javascript
const costDollars = (tokens * price) / 100;
```

## Schema

```json
{
  "model-name": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.00025 },
        "response_token": { "price": 0.001 },
        "cache_write_input_token": { "price": 0 },
        "cache_read_input_token": { "price": 0.000125 },
        "additional_units": {
          "web_search": { "price": 1 }
        }
      },
      "currency": "USD"
    }
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `request_token` | Input |
| `response_token` | Output |
| `cache_write_input_token` | Cache write |
| `cache_read_input_token` | Cache read |
| `request_audio_token` | Audio input |
| `response_audio_token` | Audio output |
| `image` | Image gen (by quality/size) |
| `additional_units` | Provider-specific (see below) |

---

## Additional Units

| Unit | Providers | Price (¢) |
|------|-----------|-----------|
| `web_search` | openai, azure-openai, azure-ai, google, vertex-ai, perplexity-ai | 0.5 - 3.5 |
| `file_search` | openai, azure-openai, azure-ai | 0.25 |
| `search` | google, vertex-ai | 1.4 - 3.5 |
| `thinking_token` | google, vertex-ai | 0.00004 - 0.0012 |
| `image_token` | google, vertex-ai | 0.003 |
| `image_1k` | google | 3.9 |
| `megapixels` | together-ai | 0.0027 - 0.08 |
| `video_seconds` | vertex-ai | 10 - 50 |
| `video_duration_seconds_720_1280` | openai, azure-openai | 10 - 30 |
| `video_duration_seconds_1280_720` | openai, azure-openai | 10 - 30 |
| `video_duration_seconds_1024_1792` | openai, azure-openai | 50 |
| `video_duration_seconds_1792_1024` | openai, azure-openai | 50 |
| `request_audio_token` | openai, azure-openai | 0 - 0.6 |
| `response_audio_token` | openai, azure-openai | 0 - 1.5 |
| `routing_units` | azure-openai | 0.000014 |
| `input_image` | vertex-ai | 0.01 |
| `input_video_essential` | vertex-ai | 0.05 |
| `input_video_standard` | vertex-ai | 0.1 |
| `input_video_plus` | vertex-ai | 0.2 |

### Perplexity

| Unit | Price (¢) |
|------|-----------|
| `web_search_low_context` | 0.5 - 0.6 |
| `web_search_medium_context` | 0.8 - 1.0 |
| `web_search_high_context` | 1.2 - 1.4 |

### Examples

```json
// OpenAI (gpt-5, o3, o4-mini)
"additional_units": {
  "web_search": { "price": 1 },
  "file_search": { "price": 0.25 }
}

// Google (gemini-3.0-pro)
"additional_units": {
  "thinking_token": { "price": 0.001 },
  "web_search": { "price": 3.5 }
}

// OpenAI Sora
"additional_units": {
  "video_duration_seconds_720_1280": { "price": 10 }
}

// Together AI (image models)
"additional_units": {
  "megapixels": { "price": 0.05 }
}
```

---

## Contributing

The easiest way to contribute is to pick an issue with the `good first issue` tag 💪.

1. Fork this repo
2. Edit `pricing/{provider}.json`
3. Submit a PR with source link

**Remember:** Prices are in **cents per token**: `$0.03/1K` → `0.003`


## Providers

<details>
<summary>40+ providers</summary>

AI21, Anthropic, Anyscale, Azure AI, Azure OpenAI, AWS Bedrock, Cerebras, Cohere, Dashscope, Deepbricks, DeepInfra, DeepSeek, Fireworks AI, GitHub, Google, Groq, Inference.net, Jina, Lambda, Lemonfox AI, Mistral AI, MonsterAPI, Nebius, Nomic, Novita AI, OpenAI, OpenRouter, Oracle, PaLM, Perplexity AI, Predibase, Reka AI, Sagemaker, Segmind, Stability AI, Together AI, Vertex AI, Workers AI, X.AI, Zhipu

</details>

---

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- Chat with us on [Discord](https://discord.gg/portkey)
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai)
- Visit us on [YouTube](https://www.youtube.com/@PortkeyAI)
- Read our [Blog](https://portkey.ai/blog)
- View our official [Documentation](https://portkey.ai/docs)

---

<p align="center">
  <strong>Built by <a href="https://portkey.ai">Portkey</a></strong>
</p>

![Rubeus Social Share (4)](https://github.com/Portkey-AI/gateway/assets/971978/89d6f0af-a95d-4402-b451-14764c40d03f)
