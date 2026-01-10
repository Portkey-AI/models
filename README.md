

<h1 align="center">LLM Pricing and Configs</h1>

<p align="center">
  <strong>An open-source database of AI model configurations and pricing for 1000+ LLMs</strong>
</p>

<p align="center">
  <a href="https://portkey.ai/docs"><img src="https://img.shields.io/badge/Docs-portkey.ai-blue" alt="Documentation"></a>
  <a href="https://github.com/Portkey-AI/gateway"><img src="https://img.shields.io/github/stars/Portkey-AI/gateway?style=social" alt="Gateway Stars"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://discord.gg/portkey"><img src="https://img.shields.io/discord/1143393887742861333?logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="#-free-public-api">API</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-data-structure">Data Structure</a> •
  <a href="#-supported-providers">Providers</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## Overview

This repository contains comprehensive configuration and pricing data for **1000+ LLM models** across **35+ AI providers**. The data powers [Portkey's AI Gateway](https://github.com/Portkey-AI/gateway) and is freely available via our public API.

**Why does this exist?**

There's no single source of truth for AI model specifications. Different providers have different pricing structures, parameter limits, and capabilities. We built this as an open, community-maintained database to solve this problem.

### What's Included

| Directory | Description |
|-----------|-------------|
| `general/` | Model parameters, capabilities, and configurations |
| `pricing/` | Token pricing, cost calculations, and billing structures |

---

## 🚀 Free Public API

Access model configurations and pricing instantly — **no authentication required**.

### Get Model Configuration & Pricing

```bash
# Get specific model config
curl https://api.portkey.ai/model-configs/pricing/{provider}/{model}

# Example: OpenAI GPT-4
curl https://api.portkey.ai/model-configs/pricing/openai/gpt-4

# Example: Anthropic Claude
curl https://api.portkey.ai/model-configs/pricing/anthropic/claude-3-5-sonnet-20241022
```

### Response Format

```json
{
  "pay_as_you_go": {
    "request_token": { "price": 0.003 },
    "response_token": { "price": 0.006 }
  },
  "calculate": {
    "request": {
      "operation": "sum",
      "operands": [
        { "operation": "multiply", "operands": [{ "value": "input_tokens" }, { "value": "rates.request_token" }] },
        { "operation": "multiply", "operands": [{ "value": "cache_write_tokens" }, { "value": "rates.cache_write_input_token" }] },
        { "operation": "multiply", "operands": [{ "value": "cache_read_tokens" }, { "value": "rates.cache_read_input_token" }] }
      ]
    },
    "response": {
      "operation": "sum",
      "operands": [
        { "operation": "multiply", "operands": [{ "value": "output_tokens" }, { "value": "rates.response_token" }] }
      ]
    }
  },
  "currency": "USD"
}
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/model-configs/pricing/{provider}/{model}` | Get pricing config for a specific model |
| `/model-configs/general/{provider}/{model}` | Get general config for a specific model |

> **Note:** Prices are in USD per token (not per 1K or 1M tokens).

---

## 💡 Quick Start

### Use with Portkey Gateway

The easiest way to use this data is through [Portkey's AI Gateway](https://github.com/Portkey-AI/gateway):

```python
from portkey_ai import Portkey

client = Portkey(
    provider="openai",  # or 'anthropic', 'bedrock', 'groq', etc.
    Authorization="sk-***"
)

# Automatic cost tracking using our model configs
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Direct API Usage

```javascript
// JavaScript/TypeScript
const response = await fetch('https://api.portkey.ai/model-configs/pricing/openai/gpt-4o');
const pricing = await response.json();

const inputCost = tokens.input * pricing.pay_as_you_go.request_token.price;
const outputCost = tokens.output * pricing.pay_as_you_go.response_token.price;
```

```python
# Python
import requests

pricing = requests.get('https://api.portkey.ai/model-configs/pricing/openai/gpt-4o').json()
input_cost = input_tokens * pricing['pay_as_you_go']['request_token']['price']
output_cost = output_tokens * pricing['pay_as_you_go']['response_token']['price']
```

---

## 📁 Data Structure

### General Config (`general/{provider}.json`)

Contains model parameters, supported features, and capabilities:

```json
{
  "name": "openai",
  "default": {
    "params": [
      { "key": "max_tokens", "defaultValue": 128, "minValue": 1, "maxValue": 4096 },
      { "key": "temperature", "defaultValue": 0.8, "minValue": 0, "maxValue": 2 },
      { "key": "top_p", "defaultValue": 0.1, "minValue": 0, "maxValue": 1 },
      { "key": "stream", "defaultValue": true, "type": "boolean" }
    ],
    "messages": { "options": ["system", "user", "assistant", "developer"] },
    "type": { "primary": "chat", "supported": [] }
  },
  "gpt-4o": {
    "params": [{ "key": "max_tokens", "maxValue": 16384 }],
    "type": { "primary": "chat", "supported": ["tools", "image"] }
  }
}
```

#### Field Reference

| Field | Description |
|-------|-------------|
| `params` | Model parameters with defaults, min/max values |
| `type.primary` | Primary model type: `chat`, `text`, `embedding`, `image`, `audio`, `moderation` |
| `type.supported` | Supported features: `tools`, `image`, `cache_control` |
| `messages.options` | Supported message roles |
| `removeParams` | Parameters to remove for this model |
| `disablePlayground` | If true, model isn't available in Portkey playground |

### Pricing Config (`pricing/{provider}.json`)

Contains token pricing and cost calculation formulas:

```json
{
  "default": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0 },
        "response_token": { "price": 0 },
        "cache_write_input_token": { "price": 0 },
        "cache_read_input_token": { "price": 0 }
      },
      "calculate": { ... },
      "currency": "USD"
    }
  },
  "gpt-4o": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.00025 },
        "response_token": { "price": 0.001 },
        "cache_read_input_token": { "price": 0.000125 }
      }
    }
  }
}
```

#### Pricing Fields

| Field | Description |
|-------|-------------|
| `request_token` | Cost per input token |
| `response_token` | Cost per output token |
| `cache_write_input_token` | Cost per cache write token |
| `cache_read_input_token` | Cost per cache read token |
| `request_audio_token` | Cost per audio input token |
| `response_audio_token` | Cost per audio output token |
| `finetune_config` | Fine-tuning pricing |
| `additional_units` | Special pricing (web search, file search, etc.) |

---

## 🌐 Supported Providers

<table>
<tr>
<td>

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-4o, GPT-4, o1, o3 |
| **Anthropic** | Claude 3.5, Claude 4, Opus |
| **Google** | Gemini Pro, PaLM |
| **Azure OpenAI** | All OpenAI models |
| **AWS Bedrock** | Claude, Titan, Llama |
| **Mistral AI** | Mistral, Mixtral |
| **Cohere** | Command, Embed |
| **Together AI** | 100+ open models |

</td>
<td>

| Provider | Models |
|----------|--------|
| **Groq** | Llama, Mixtral |
| **DeepSeek** | DeepSeek Chat, Reasoner |
| **Fireworks** | 50+ models |
| **Perplexity** | Sonar models |
| **Anyscale** | Open source models |
| **DeepInfra** | Llama, Mistral |
| **Cerebras** | Fast inference |
| **X.AI** | Grok models |

</td>
</tr>
</table>

<details>
<summary><strong>View all 35+ supported providers</strong></summary>

- AI21
- Anthropic
- Anyscale
- Azure AI
- Azure OpenAI
- AWS Bedrock
- Cerebras
- Cohere
- Deepbricks
- DeepInfra
- DeepSeek
- Fireworks AI
- GitHub
- Google
- Groq
- Inference.net
- Lambda
- Lemonfox AI
- Mistral AI
- Nebius
- Novita AI
- OpenAI
- OpenRouter
- Oracle
- PaLM
- Perplexity AI
- Together AI
- Vertex AI
- X.AI (Grok)
- Zhipu

</details>

---

## 🤝 Contributing

We welcome contributions! Help us keep this database accurate and up-to-date.

### Adding or Updating Model Data

1. **Fork this repository**

2. **Update the relevant JSON file:**
   - For model parameters: `general/{provider}.json`
   - For pricing: `pricing/{provider}.json`

3. **Follow the existing schema** (see [Data Structure](#-data-structure))

4. **Submit a Pull Request** with:
   - Clear description of changes
   - Source/reference for pricing updates
   - Any relevant documentation links

### Guidelines

- **Prices** are in USD cents per token (not per 1K or 1M tokens)
- **Inherit from default**: Only specify fields that differ from the provider's `default` config
- **Test your JSON**: Ensure valid JSON syntax before submitting
- **Include sources**: Reference official pricing pages when updating costs

### Example: Adding a New Model

```json
// In pricing/openai.json
{
  "gpt-5": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.001 },
        "response_token": { "price": 0.003 }
      }
    }
  }
}
```

```json
// In general/openai.json
{
  "gpt-5": {
    "params": [{ "key": "max_tokens", "maxValue": 32768 }],
    "type": { "primary": "chat", "supported": ["tools", "image"] }
  }
}
```

---

## 🔗 Resources

<table>
<tr>
<td width="50%">

### Portkey AI Gateway

The blazing fast AI Gateway that uses this data.

[![Gateway](https://img.shields.io/github/stars/Portkey-AI/gateway?style=social)](https://github.com/Portkey-AI/gateway)

```bash
npx @portkey-ai/gateway
```

[**Learn More →**](https://github.com/Portkey-AI/gateway)

</td>
<td width="50%">

### Documentation

Complete guides for using Portkey.

[**Docs →**](https://portkey.ai/docs)

[**API Reference →**](https://portkey.ai/docs/api-reference)

[**Pricing Guide →**](https://portkey.ai/docs/product/ai-gateway/universal-api/pricing)

</td>
</tr>
</table>

---

## 📊 Use Cases

- **Cost Estimation**: Calculate LLM costs before running requests
- **Provider Comparison**: Compare pricing across different providers
- **Model Selection**: Find models with specific capabilities (vision, tools, etc.)
- **Budget Tracking**: Build cost monitoring dashboards
- **Gateway Integration**: Power AI gateways with accurate model metadata

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <strong>Built with ❤️ by <a href="https://portkey.ai">Portkey</a></strong>
</p>

<p align="center">
  <a href="https://portkey.ai">Website</a> •
  <a href="https://portkey.ai/docs">Docs</a> •
  <a href="https://github.com/Portkey-AI/gateway">Gateway</a> •
  <a href="https://discord.gg/portkey">Discord</a> •
  <a href="https://twitter.com/PortkeyAI">Twitter</a>
</p>
