#!/usr/bin/env node
/**
 * AI Models Database - Merge Script
 * 
 * Combines general/ and pricing/ JSON files into a unified combined/ format.
 * Handles provider-specific edge cases like Google's context tiers, Bedrock's regional prefixes, etc.
 * 
 * Usage: node scripts/merge-models.js
 */

const fs = require('fs');
const path = require('path');

// Directories
const GENERAL_DIR = path.join(__dirname, '..', 'general');
const PRICING_DIR = path.join(__dirname, '..', 'pricing');
const COMBINED_DIR = path.join(__dirname, '..', 'combined');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Provider-specific model resolvers (matching the pricing lookup logic)
const modelResolvers = {
  openai: (model) => {
    if (model.startsWith('ft:')) {
      return `ft:${model.split(':')[1]}`;
    }
    return model;
  },

  'azure-openai': (model) => {
    if (model.includes('.ft')) {
      return `${model.split('.ft')[0]}.ft`;
    }
    return model;
  },

  'azure-ai': (model) => {
    if (model.includes('.ft')) {
      return `${model.split('.ft')[0]}.ft`;
    }
    return model;
  },

  'fireworks-ai': (model) => {
    model = model.replace('accounts/fireworks/models/', '');
    if (model.includes('mixtral-8x7b')) return 'mixtral-8x7b';
    if (model.includes('dbrx-instruct')) return 'dbrx-instruct';
    return model;
  },

  bedrock: (model) => {
    // Strip regional prefixes for pricing lookup
    return model.replace(/^(us\.|eu\.|global\.|us-gov\.)/, '');
  },

  google: (model) => {
    // Google pricing uses -lte-128k and -gt-128k suffixes
    // We need to find base model and map to tiered pricing
    return model;
  },

  'stability-ai': (model) => {
    return model;
  },

  predibase: (model) => {
    if (model.includes('mixtral-8x7b')) {
      return 'mixtral-8x7b-v0-1';
    }
    return model;
  }
};

// Helper: Get all JSON files in a directory
function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

// Helper: Read JSON file safely
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return null;
  }
}

// Helper: Sort object keys alphabetically (recursive)
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObjectKeys(obj[key]);
  });
  return sorted;
}

// Helper: Write JSON file with pretty formatting
function writeJson(filePath, data) {
  // Sort keys alphabetically for consistency
  const sorted = sortObjectKeys(data);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n');
}

// Helper: Round to avoid floating point precision issues
function roundPrice(value) {
  if (typeof value !== 'number' || isNaN(value)) return value;
  // Round to 10 decimal places to avoid floating point artifacts
  return Math.round(value * 1e10) / 1e10;
}

// Helper: Recursively convert nested pricing objects
// Handles structures like: { "1024x1024": 4 } or { "default": { "default": { "price": 8 } } }
function convertNestedPricing(obj, factor) {
  if (obj === null || obj === undefined) return null;
  
  if (typeof obj === 'number') {
    return roundPrice(obj * factor);
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const result = {};
  Object.keys(obj).forEach(key => {
    result[key] = convertNestedPricing(obj[key], factor);
  });
  
  return Object.keys(result).length > 0 ? result : null;
}

// Helper: Convert pricing format
// Source values appear to be in cents per token
// Output: dollars per million tokens (industry standard display format)
// 
// Example: GPT-4o input
// - Source: 0.00025 (cents per token)
// - Actual: $2.50 / 1M tokens
// - Conversion: 0.00025 * 10000 = 2.5 ✓
//
// Formula: source_value * 10000 = dollars per 1M tokens
function normalizePricing(pricingConfig) {
  if (!pricingConfig || !pricingConfig.pay_as_you_go) return null;

  const payg = pricingConfig.pay_as_you_go;
  const pricing = {};

  // Conversion factor: cents/token → dollars/million tokens
  // cents/token * (1/100 dollar/cent) * 1,000,000 tokens = dollars/M tokens
  // = source * 10000
  const CONVERSION_FACTOR = 10000;

  // Standard token pricing
  if (payg.request_token?.price !== undefined && payg.request_token.price !== 0) {
    pricing.input = roundPrice(payg.request_token.price * CONVERSION_FACTOR);
  }
  if (payg.response_token?.price !== undefined && payg.response_token.price !== 0) {
    pricing.output = roundPrice(payg.response_token.price * CONVERSION_FACTOR);
  }
  if (payg.cache_read_input_token?.price !== undefined && payg.cache_read_input_token.price !== 0) {
    pricing.cache_read = roundPrice(payg.cache_read_input_token.price * CONVERSION_FACTOR);
  }
  if (payg.cache_write_input_token?.price !== undefined && payg.cache_write_input_token.price !== 0) {
    pricing.cache_write = roundPrice(payg.cache_write_input_token.price * CONVERSION_FACTOR);
  }

  // Audio tokens
  if (payg.request_audio_token?.price !== undefined && payg.request_audio_token.price !== 0) {
    pricing.audio_input = roundPrice(payg.request_audio_token.price * CONVERSION_FACTOR);
  }
  if (payg.response_audio_token?.price !== undefined && payg.response_audio_token.price !== 0) {
    pricing.audio_output = roundPrice(payg.response_audio_token.price * CONVERSION_FACTOR);
  }
  if (payg.cache_read_audio_input_token?.price !== undefined && payg.cache_read_audio_input_token.price !== 0) {
    pricing.audio_cache_read = roundPrice(payg.cache_read_audio_input_token.price * CONVERSION_FACTOR);
  }

  // Image pricing - handle nested structures (can be 2-3 levels deep)
  // Examples: image.1024x1024 = 4, or image.default.default.price = 8
  if (payg.image) {
    pricing.image = convertNestedPricing(payg.image, 100);
  }

  // Additional units - preserve ALL of them with * 100 conversion (nested structures supported)
  if (payg.additional_units) {
    pricing.additional_units = convertNestedPricing(payg.additional_units, 100);
  }

  return Object.keys(pricing).length > 0 ? pricing : null;
}

// Helper: Extract capabilities from type.supported
function extractCapabilities(typeObj) {
  if (!typeObj) return [];
  const capabilities = [];
  
  if (typeObj.supported && Array.isArray(typeObj.supported)) {
    capabilities.push(...typeObj.supported);
  }
  
  return capabilities;
}

// Helper: Extract max_output_tokens from params
function extractMaxOutputTokens(params) {
  if (!params || !Array.isArray(params)) return null;
  
  const maxTokensParam = params.find(p => 
    p.key === 'max_tokens' || p.key === 'max_completion_tokens'
  );
  
  return maxTokensParam?.maxValue || null;
}

// Helper: Merge params with defaults
// Model params override default params by key
function mergeParamsWithDefaults(modelParams, defaultParams) {
  if (!defaultParams || !Array.isArray(defaultParams)) {
    return modelParams || [];
  }
  
  if (!modelParams || modelParams.length === 0) {
    // Return empty array for models with no params (like disablePlayground models)
    // The default will be referenced from the default section
    return null; // null means "use defaults"
  }
  
  // Create a map of model params by key
  const modelParamMap = new Map();
  modelParams.forEach(p => {
    if (p.key) modelParamMap.set(p.key, p);
  });
  
  // Merge: start with defaults, override with model-specific
  const merged = [];
  const processedKeys = new Set();
  
  // First, add all default params (potentially overridden by model params)
  defaultParams.forEach(defaultParam => {
    if (!defaultParam.key) {
      merged.push(defaultParam);
      return;
    }
    
    const modelParam = modelParamMap.get(defaultParam.key);
    if (modelParam) {
      // Merge the model param with default - model values take precedence
      merged.push({ ...defaultParam, ...modelParam });
      processedKeys.add(defaultParam.key);
    } else {
      merged.push(defaultParam);
      processedKeys.add(defaultParam.key);
    }
  });
  
  // Add any model-specific params not in defaults
  modelParams.forEach(modelParam => {
    if (modelParam.key && !processedKeys.has(modelParam.key)) {
      merged.push(modelParam);
    }
  });
  
  return merged;
}

// Google-specific: Match pricing tiers to base model
function matchGooglePricing(modelName, pricingData) {
  const lteKey = `${modelName}-lte-128k`;
  const gtKey = `${modelName}-gt-128k`;
  
  const ltePricing = pricingData[lteKey];
  const gtPricing = pricingData[gtKey];
  
  // Also check if there's a direct match
  const directPricing = pricingData[modelName];
  
  const result = {
    pricing: null,
    pricing_tiers: null
  };

  if (directPricing) {
    result.pricing = normalizePricing(directPricing.pricing_config);
  } else if (ltePricing) {
    result.pricing = normalizePricing(ltePricing.pricing_config);
  }

  if (gtPricing && ltePricing) {
    result.pricing_tiers = {
      gt_128k: normalizePricing(gtPricing.pricing_config)
    };
  }

  return result;
}

// Bedrock-specific: Get pricing for regional model
function matchBedrockPricing(modelName, pricingData) {
  // First try direct match
  if (pricingData[modelName]) {
    return normalizePricing(pricingData[modelName].pricing_config);
  }
  
  // Strip regional prefix and try again
  const baseModel = modelName.replace(/^(us\.|eu\.|global\.|us-gov\.)/, '');
  if (pricingData[baseModel]) {
    return normalizePricing(pricingData[baseModel].pricing_config);
  }
  
  return null;
}

// Main merge function for a single provider
function mergeProvider(providerName) {
  const generalPath = path.join(GENERAL_DIR, `${providerName}.json`);
  const pricingPath = path.join(PRICING_DIR, `${providerName}.json`);
  
  const generalData = fs.existsSync(generalPath) ? readJson(generalPath) : null;
  const pricingData = fs.existsSync(pricingPath) ? readJson(pricingPath) : null;
  
  if (!generalData && !pricingData) {
    console.log(`Skipping ${providerName}: No data found`);
    return { combined: null, report: null };
  }

  const report = {
    provider: providerName,
    generalOnly: [],
    pricingOnly: [],
    matched: [],
    tieredPricing: []
  };

  // Get default params for merging
  const defaultParams = generalData?.default?.params || [];
  const defaultMessages = generalData?.default?.messages || null;
  const defaultType = generalData?.default?.type || null;

  // Initialize combined structure
  const combined = {
    provider: providerName,
    provider_name: generalData?.name || providerName,
    description: generalData?.description || '',
    default: {},
    models: {}
  };

  // Process default section from general - keep it for reference
  if (generalData?.default) {
    combined.default = { ...generalData.default };
  }

  // Add default pricing config from pricing file
  if (pricingData?.default?.pricing_config) {
    combined.default.pricing = {
      currency: pricingData.default.pricing_config.currency || 'USD'
    };
    if (pricingData.default.pricing_config.calculate) {
      combined.default.pricing.calculate = pricingData.default.pricing_config.calculate;
    }
  }

  // Collect all model names from both sources
  const generalModels = new Set();
  const pricingModels = new Set();

  if (generalData) {
    Object.keys(generalData).forEach(key => {
      if (key !== 'name' && key !== 'description' && key !== 'default') {
        generalModels.add(key);
      }
    });
  }

  if (pricingData) {
    Object.keys(pricingData).forEach(key => {
      if (key !== 'default') {
        pricingModels.add(key);
      }
    });
  }

  // For Google, filter out the -lte-128k and -gt-128k variants from pricingModels
  // as they'll be merged into the base model
  if (providerName === 'google') {
    const tieredModels = new Set();
    pricingModels.forEach(model => {
      if (model.endsWith('-lte-128k') || model.endsWith('-gt-128k')) {
        const baseModel = model.replace(/-(?:lte|gt)-128k$/, '');
        tieredModels.add(baseModel);
        pricingModels.delete(model);
      }
    });
    tieredModels.forEach(m => report.tieredPricing.push(m));
  }

  // Process models from general
  generalModels.forEach(modelName => {
    const generalConfig = generalData[modelName];
    const modelEntry = {};

    // Handle params - merge with defaults or mark as using defaults
    if (generalConfig.params && generalConfig.params.length > 0) {
      const mergedParams = mergeParamsWithDefaults(generalConfig.params, defaultParams);
      if (mergedParams) {
        modelEntry.params = mergedParams;
      }
    }
    // If no params specified, model uses defaults (don't include params key)
    
    // Copy removeParams if present
    if (generalConfig.removeParams) {
      modelEntry.removeParams = generalConfig.removeParams;
    }

    // Copy messages if different from default
    if (generalConfig.messages) {
      modelEntry.messages = generalConfig.messages;
    }

    // Handle type
    if (generalConfig.type) {
      modelEntry.type = generalConfig.type.primary || 'chat';
      const capabilities = extractCapabilities(generalConfig.type);
      if (capabilities.length > 0) {
        modelEntry.capabilities = capabilities;
      }
    } else if (defaultType) {
      modelEntry.type = defaultType.primary || 'chat';
    }

    // Copy disablePlayground if present
    if (generalConfig.disablePlayground !== undefined) {
      modelEntry.disablePlayground = generalConfig.disablePlayground;
    }

    // Copy isDefault if present
    if (generalConfig.isDefault !== undefined) {
      modelEntry.isDefault = generalConfig.isDefault;
    }

    // Extract max_output_tokens
    const maxOutput = extractMaxOutputTokens(generalConfig.params || defaultParams);
    if (maxOutput) {
      modelEntry.max_output_tokens = maxOutput;
    }

    // Find pricing
    let pricing = null;
    let pricingTiers = null;

    if (providerName === 'google') {
      const googlePricing = matchGooglePricing(modelName, pricingData || {});
      pricing = googlePricing.pricing;
      pricingTiers = googlePricing.pricing_tiers;
    } else if (providerName === 'bedrock') {
      pricing = matchBedrockPricing(modelName, pricingData || {});
    } else {
      // Standard lookup with resolver
      const resolver = modelResolvers[providerName];
      const lookupName = resolver ? resolver(modelName) : modelName;
      
      if (pricingData && pricingData[lookupName]) {
        pricing = normalizePricing(pricingData[lookupName].pricing_config);
      } else if (pricingData && pricingData[modelName]) {
        pricing = normalizePricing(pricingData[modelName].pricing_config);
      }
    }

    if (pricing) {
      modelEntry.pricing = pricing;
      if (pricingTiers) {
        modelEntry.pricing_tiers = pricingTiers;
      }
      report.matched.push(modelName);
    } else {
      modelEntry.pricing = null;
      report.generalOnly.push(modelName);
    }

    combined.models[modelName] = modelEntry;
  });

  // Process models only in pricing (not in general)
  pricingModels.forEach(modelName => {
    if (!generalModels.has(modelName)) {
      // Check if it's already matched via resolver
      let alreadyMatched = false;
      generalModels.forEach(gm => {
        const resolver = modelResolvers[providerName];
        const lookupName = resolver ? resolver(gm) : gm;
        if (lookupName === modelName) {
          alreadyMatched = true;
        }
      });

      if (!alreadyMatched && pricingData[modelName]) {
        const pricing = normalizePricing(pricingData[modelName].pricing_config);
        combined.models[modelName] = {
          type: 'chat',
          pricing: pricing
        };
        report.pricingOnly.push(modelName);
      }
    }
  });

  return { combined, report };
}

// Main execution
function main() {
  console.log('🚀 AI Models Database - Merge Script\n');

  // Create output directories
  if (!fs.existsSync(COMBINED_DIR)) {
    fs.mkdirSync(COMBINED_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // Get all providers from both directories
  const generalProviders = getJsonFiles(GENERAL_DIR);
  const pricingProviders = getJsonFiles(PRICING_DIR);
  const allProviders = [...new Set([...generalProviders, ...pricingProviders])];

  console.log(`Found ${allProviders.length} providers to process\n`);

  const allReports = [];
  let totalMatched = 0;
  let totalGeneralOnly = 0;
  let totalPricingOnly = 0;

  // Process each provider
  allProviders.sort().forEach(provider => {
    console.log(`Processing: ${provider}`);
    
    const { combined, report } = mergeProvider(provider);
    
    if (combined) {
      // Write combined file
      const outputPath = path.join(COMBINED_DIR, `${provider}.json`);
      writeJson(outputPath, combined);
      
      const modelCount = Object.keys(combined.models).length;
      console.log(`  ✓ ${modelCount} models written to combined/${provider}.json`);
      
      if (report) {
        allReports.push(report);
        totalMatched += report.matched.length;
        totalGeneralOnly += report.generalOnly.length;
        totalPricingOnly += report.pricingOnly.length;
        
        if (report.generalOnly.length > 0) {
          console.log(`  ⚠ ${report.generalOnly.length} models without pricing`);
        }
        if (report.pricingOnly.length > 0) {
          console.log(`  ⚠ ${report.pricingOnly.length} models only in pricing`);
        }
      }
    }
  });

  // Generate report
  console.log('\n📊 Generating merge report...');
  
  let reportMd = `# AI Models Database - Merge Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|-------|
| Total Providers | ${allProviders.length} |
| Models Matched | ${totalMatched} |
| Models in General Only | ${totalGeneralOnly} |
| Models in Pricing Only | ${totalPricingOnly} |

## Provider Details

`;

  allReports.forEach(report => {
    reportMd += `### ${report.provider}\n\n`;
    
    if (report.matched.length > 0) {
      reportMd += `**Matched (${report.matched.length}):** ${report.matched.length > 10 ? report.matched.slice(0, 10).join(', ') + '...' : report.matched.join(', ')}\n\n`;
    }
    
    if (report.generalOnly.length > 0) {
      reportMd += `**General Only (${report.generalOnly.length}):**\n`;
      report.generalOnly.forEach(m => {
        reportMd += `- \`${m}\` - No pricing data\n`;
      });
      reportMd += '\n';
    }
    
    if (report.pricingOnly.length > 0) {
      reportMd += `**Pricing Only (${report.pricingOnly.length}):**\n`;
      report.pricingOnly.forEach(m => {
        reportMd += `- \`${m}\` - No general config\n`;
      });
      reportMd += '\n';
    }
    
    if (report.tieredPricing.length > 0) {
      reportMd += `**Tiered Pricing (${report.tieredPricing.length}):** ${report.tieredPricing.join(', ')}\n\n`;
    }
    
    reportMd += '---\n\n';
  });

  const reportPath = path.join(REPORTS_DIR, 'merge-report.md');
  fs.writeFileSync(reportPath, reportMd);
  console.log(`  ✓ Report written to reports/merge-report.md`);

  // Final summary
  console.log('\n✅ Merge complete!');
  console.log(`   - ${allProviders.length} providers processed`);
  console.log(`   - ${totalMatched} models with both general + pricing`);
  console.log(`   - ${totalGeneralOnly} models without pricing (pricing: null)`);
  console.log(`   - ${totalPricingOnly} models only in pricing (minimal config)`);
}

main();
