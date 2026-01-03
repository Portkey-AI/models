# Combined JSON Schema Documentation

This document describes the schema for the unified model configuration files in `combined/*.json`.

## File Structure Overview

Each provider file follows this top-level structure:

```json
{
  "provider": "string",           // Provider identifier (e.g., "openai", "anthropic")
  "provider_name": "string",      // Display name (e.g., "OpenAI", "Anthropic")
  "description": "string",        // Provider description
  "default": { ... },             // Default configuration for all models
  "models": {                     // Map of model configurations
    "model-name": { ... }
  }
}
```

---

## Top-Level Fields

### `provider`
- **Type**: `string`
- **Required**: Yes
- **Description**: Unique identifier for the provider, used in API calls
- **Examples**: `"openai"`, `"anthropic"`, `"bedrock"`, `"google"`

### `provider_name`
- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable display name
- **Examples**: `"OpenAI"`, `"Anthropic"`, `"AWS Bedrock"`

### `description`
- **Type**: `string`
- **Required**: No
- **Description**: Brief description of the provider

### `default`
- **Type**: `object`
- **Required**: Yes
- **Description**: Default configuration inherited by all models unless overridden
- **See**: [Default Section](#default-section)

### `models`
- **Type**: `object`
- **Required**: Yes
- **Description**: Map of model name → model configuration
- **See**: [Model Configuration](#model-configuration)

---

## Default Section

The `default` object contains base configuration that applies to all models.

```json
{
  "default": {
    "params": [ ... ],           // Default parameters
    "messages": { ... },         // Message configuration
    "type": { ... },             // Default type configuration
    "pricing": { ... }           // Default pricing configuration
  }
}
```

### `default.params`
Array of parameter definitions. See [Parameters](#parameters) for field details.

### `default.messages`
```json
{
  "options": ["system", "user", "assistant", "developer"]
}
```
- **options**: Array of supported message roles

### `default.type`
```json
{
  "primary": "chat",
  "supported": ["tools", "image"]
}
```
- **primary**: Primary model type (`"chat"`, `"text"`, `"embedding"`, etc.)
- **supported**: Array of supported capabilities

### `default.pricing`
```json
{
  "currency": "USD",
  "calculate": { ... }   // Complex calculation formula (optional)
}
```

---

## Model Configuration

Each model entry in the `models` object can have these fields:

```json
{
  "model-name": {
    // Identity & Display
    "type": "string",
    "capabilities": ["array"],
    "disablePlayground": boolean,
    "isDefault": boolean,
    
    // Parameters
    "params": [ ... ],
    "removeParams": ["array"],
    "messages": { ... },
    
    // Limits
    "max_output_tokens": number,
    
    // Pricing
    "pricing": { ... },
    "pricing_tiers": { ... }
  }
}
```

### Model Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | No | Model type: `"chat"`, `"text"`, `"embedding"`, `"image"` |
| `capabilities` | string[] | No | Supported features: `"tools"`, `"image"`, `"pdf"`, `"doc"`, etc. |
| `disablePlayground` | boolean | No | If `true`, model is hidden from playground UI |
| `isDefault` | boolean | No | If `true`, this is the default model for the provider |
| `params` | array | No | Model-specific parameters (merged with defaults) |
| `removeParams` | string[] | No | Parameters to remove from defaults for this model |
| `messages` | object | No | Model-specific message configuration |
| `max_output_tokens` | number | No | Maximum output tokens (extracted from params.max_tokens.maxValue) |
| `pricing` | object | No | Pricing configuration (null if no pricing data) |
| `pricing_tiers` | object | No | Tiered pricing (e.g., for Google's >128k context) |

---

## Parameters

Parameters control model behavior. Each parameter in the `params` array:

```json
{
  "key": "string",              // Parameter name (required)
  "defaultValue": any,          // Default value
  "minValue": number,           // Minimum allowed value
  "maxValue": number,           // Maximum allowed value
  "type": "string",             // Parameter type
  "options": [ ... ],           // Enum options
  "skipValues": [ ... ],        // Values to omit from requests
  "rule": { ... }               // Conditional rules
}
```

### Parameter Fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Parameter name as sent to API (e.g., `"temperature"`, `"max_tokens"`) |
| `defaultValue` | any | Default value if not specified |
| `minValue` | number | Minimum numeric value |
| `maxValue` | number | Maximum numeric value |
| `type` | string | Type hint: `"boolean"`, `"string"`, `"array-of-strings"`, `"non-view-manage-data"` |
| `options` | array | For enum parameters, list of allowed values |
| `skipValues` | array | Values that should be omitted from API requests |
| `rule` | object | Conditional rules for dynamic defaults |

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `max_tokens` | number | Maximum tokens to generate |
| `temperature` | number | Sampling temperature (0-2) |
| `top_p` | number | Nucleus sampling (0-1) |
| `frequency_penalty` | number | Repetition penalty (-2 to 2) |
| `presence_penalty` | number | Topic penalty (-2 to 2) |
| `stop` | string[] | Stop sequences |
| `stream` | boolean | Enable streaming |
| `tool_choice` | enum | Tool calling mode |
| `response_format` | enum | Output format (text, json_object, json_schema) |

### Parameter Options Example

```json
{
  "key": "tool_choice",
  "type": "non-view-manage-data",
  "defaultValue": null,
  "options": [
    { "value": "none", "name": "None" },
    { "value": "auto", "name": "Auto" },
    { "value": "required", "name": "Required" },
    {
      "value": "custom",
      "name": "Custom",
      "schema": { "type": "json" }
    }
  ],
  "skipValues": [null, []],
  "rule": {
    "default": {
      "condition": "tools",
      "then": "auto",
      "else": null
    }
  }
}
```

---

## Pricing

Pricing is in **USD per million tokens** (industry standard).

### Basic Pricing Structure

```json
{
  "pricing": {
    "input": 2.5,              // $2.50 per 1M input tokens
    "output": 10,              // $10.00 per 1M output tokens
    "cache_read": 1.25,        // $1.25 per 1M cached input tokens read
    "cache_write": 0,          // $0 per 1M cached tokens written
    "audio_input": 100,        // $100 per 1M audio input tokens
    "audio_output": 200,       // $200 per 1M audio output tokens
    "audio_cache_read": 50,    // $50 per 1M cached audio tokens
    "image": { ... },          // Image pricing (per image)
    "additional_units": { ... } // Other pricing units
  }
}
```

### Pricing Fields

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `input` | number | $/1M tokens | Input/prompt token cost |
| `output` | number | $/1M tokens | Output/completion token cost |
| `cache_read` | number | $/1M tokens | Cost to read cached tokens |
| `cache_write` | number | $/1M tokens | Cost to write tokens to cache |
| `audio_input` | number | $/1M tokens | Audio input token cost |
| `audio_output` | number | $/1M tokens | Audio output token cost |
| `audio_cache_read` | number | $/1M tokens | Cached audio read cost |
| `image` | object | varies | Image generation pricing |
| `additional_units` | object | varies | Other pricing units |

### Image Pricing

Image pricing varies by size/quality. Nested structure:

```json
{
  "image": {
    "default": {
      "1024x1024": 4,          // $0.04 per image
      "1024x1792": 8,          // $0.08 per image
      "1792x1024": 8
    },
    "hd": {
      "1024x1024": 8,
      "1024x1792": 12,
      "1792x1024": 12
    }
  }
}
```

Or simpler nested structure:
```json
{
  "image": {
    "default": {
      "default": {
        "price": 800            // $8 per image (value * 100)
      }
    }
  }
}
```

### Additional Units

Special pricing for features like web search, file search, etc:

```json
{
  "additional_units": {
    "web_search": { "price": 100 },        // $1 per search
    "file_search": { "price": 25 },        // $0.25 per search
    "thinking_token": { "price": 1.5 },    // $1.50 per 1M thinking tokens
    "video_seconds": { "price": 0.5 }      // Per video second
  }
}
```

### Pricing Tiers (Google)

For models with context-length-based pricing:

```json
{
  "pricing": {
    "input": 0.075,            // ≤128k context
    "output": 0.30
  },
  "pricing_tiers": {
    "gt_128k": {               // >128k context
      "input": 0.15,
      "output": 0.60
    }
  }
}
```

---

## Capabilities Reference

The `capabilities` array indicates what features a model supports:

| Capability | Description |
|------------|-------------|
| `tools` | Function/tool calling |
| `image` | Image input (vision) |
| `pdf` | PDF document input |
| `doc` | Document input |
| `mime_type` | Custom MIME type support |
| `streaming` | Streaming responses |

---

## Special Flags

### `disablePlayground`
```json
{
  "model-name": {
    "disablePlayground": true
  }
}
```
Models with this flag are not shown in the Portkey playground UI. Used for:
- Image generation models (DALL-E, Stable Diffusion)
- Audio models
- Moderation models
- Models requiring special handling

### `isDefault`
```json
{
  "model-name": {
    "isDefault": true
  }
}
```
Marks the default/recommended model for a provider.

### `removeParams`
```json
{
  "model-name": {
    "removeParams": ["logit_bias", "tool_choice"]
  }
}
```
Parameters from the default list that this model does NOT support.

---

## Provider-Specific Notes

### OpenAI
- Fine-tuned models use `ft:` prefix (e.g., `ft:gpt-3.5-turbo`)
- Real-time models have audio pricing

### Google
- Models have tiered pricing based on context length (≤128k vs >128k)
- Uses `pricing_tiers.gt_128k` for higher-context pricing

### Bedrock (AWS)
- Regional variants exist: `us.anthropic.claude-3...`, `eu.anthropic.claude-3...`
- Base pricing applies to all regional variants
- `::premium` suffix for premium tier (e.g., Stable Diffusion with >50 steps)

### Fireworks AI
- Full paths: `accounts/fireworks/models/model-name`
- Pricing may use shortened names

### Azure OpenAI / Azure AI
- Similar to OpenAI but with Azure-specific model names
- Fine-tuned models use `.ft` suffix

---

## Example: Complete Model Entry

```json
{
  "gpt-4o": {
    "type": "chat",
    "capabilities": ["tools", "image"],
    "max_output_tokens": 16384,
    "params": [
      {
        "key": "max_tokens",
        "defaultValue": 128,
        "minValue": 1,
        "maxValue": 16384
      },
      {
        "key": "temperature",
        "defaultValue": 0.8,
        "minValue": 0,
        "maxValue": 2
      },
      {
        "key": "response_format",
        "defaultValue": null,
        "type": "string",
        "options": [
          { "value": null, "name": "Text" },
          { "value": "json_object", "name": "JSON Object" },
          { "value": "json_schema", "name": "JSON Schema" }
        ]
      }
    ],
    "pricing": {
      "input": 2.5,
      "output": 10,
      "cache_read": 1.25,
      "additional_units": {
        "web_search": { "price": 100 },
        "file_search": { "price": 25 }
      }
    }
  }
}
```

---

## Modification Guide

### Adding a New Model

1. Add entry to `general/<provider>.json`:
```json
{
  "new-model": {
    "params": [{ "key": "max_tokens", "maxValue": 8192 }],
    "type": { "primary": "chat", "supported": ["tools"] }
  }
}
```

2. Add pricing to `pricing/<provider>.json`:
```json
{
  "new-model": {
    "pricing_config": {
      "pay_as_you_go": {
        "request_token": { "price": 0.0001 },
        "response_token": { "price": 0.0003 }
      }
    }
  }
}
```

3. Run merge:
```bash
node scripts/merge-models.js
```

### Modifying Pricing

Edit `pricing/<provider>.json`. Values are in **cents per token**:
- `0.00025` cents/token = $2.50 per 1M tokens
- `0.001` cents/token = $10 per 1M tokens

### Adding Capabilities

Edit `general/<provider>.json`:
```json
{
  "model-name": {
    "type": { 
      "primary": "chat", 
      "supported": ["tools", "image", "pdf"] 
    }
  }
}
```

### Verification

After changes, always run:
```bash
node scripts/verify-completeness.js
```

---

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐
│  general/*.json │     │  pricing/*.json │
│  (config, params)│     │  (costs)        │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
           ┌─────────────────┐
           │ merge-models.js │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │ combined/*.json │
           │ (unified format)│
           └────────┬────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
         ▼          ▼          ▼
      API       Playground    UI
```

