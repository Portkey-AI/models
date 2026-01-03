#!/usr/bin/env node
/**
 * AI Models Database - Reverse Merge Script
 * 
 * Generates general/ and pricing/ JSON files from combined/ files.
 * Used for verification that the merge process is lossless.
 * 
 * Usage: node scripts/reverse-merge.js
 */

const fs = require('fs');
const path = require('path');

// Directories
const COMBINED_DIR = path.join(__dirname, '..', 'combined');
const VERIFY_GENERAL_DIR = path.join(__dirname, '..', 'verify', 'general');
const VERIFY_PRICING_DIR = path.join(__dirname, '..', 'verify', 'pricing');

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
  const sorted = sortObjectKeys(data);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n');
}

// Helper: Round to avoid floating point precision issues
function roundPrice(value) {
  if (typeof value !== 'number' || isNaN(value)) return value;
  return Math.round(value * 1e10) / 1e10;
}

// Helper: Recursively convert nested pricing objects (reverse direction)
function reverseNestedPricing(obj, divisor) {
  if (obj === null || obj === undefined) return null;
  
  if (typeof obj === 'number') {
    return roundPrice(obj / divisor);
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const result = {};
  Object.keys(obj).forEach(key => {
    result[key] = reverseNestedPricing(obj[key], divisor);
  });
  
  return Object.keys(result).length > 0 ? result : null;
}

// Reverse the pricing conversion (combined uses * 10000, so we / 10000)
// Combined: dollars per million tokens
// Source: cents per token
// So: combined_value / 10000 = source_value
const REVERSE_FACTOR = 10000;

// Convert combined pricing back to source format
function reversePricing(pricing) {
  if (!pricing) return null;
  
  const payAsYouGo = {};
  
  if (pricing.input !== undefined) {
    payAsYouGo.request_token = { price: roundPrice(pricing.input / REVERSE_FACTOR) };
  }
  if (pricing.output !== undefined) {
    payAsYouGo.response_token = { price: roundPrice(pricing.output / REVERSE_FACTOR) };
  }
  if (pricing.cache_read !== undefined) {
    payAsYouGo.cache_read_input_token = { price: roundPrice(pricing.cache_read / REVERSE_FACTOR) };
  }
  if (pricing.cache_write !== undefined) {
    payAsYouGo.cache_write_input_token = { price: roundPrice(pricing.cache_write / REVERSE_FACTOR) };
  }
  if (pricing.audio_input !== undefined) {
    payAsYouGo.request_audio_token = { price: roundPrice(pricing.audio_input / REVERSE_FACTOR) };
  }
  if (pricing.audio_output !== undefined) {
    payAsYouGo.response_audio_token = { price: roundPrice(pricing.audio_output / REVERSE_FACTOR) };
  }
  if (pricing.audio_cache_read !== undefined) {
    payAsYouGo.cache_read_audio_input_token = { price: roundPrice(pricing.audio_cache_read / REVERSE_FACTOR) };
  }
  
  // Image pricing (reverse the * 100, handles nested structures)
  if (pricing.image) {
    payAsYouGo.image = reverseNestedPricing(pricing.image, 100);
  }
  
  // Additional units (reverse the * 100, handles nested structures)
  if (pricing.additional_units) {
    payAsYouGo.additional_units = reverseNestedPricing(pricing.additional_units, 100);
  }
  
  if (Object.keys(payAsYouGo).length === 0) return null;
  
  return {
    pricing_config: {
      pay_as_you_go: payAsYouGo
    }
  };
}

// Extract general config from combined model
function extractGeneral(modelEntry, defaultConfig) {
  const general = {};
  
  // Handle params - if present, extract model-specific overrides
  if (modelEntry.params && Array.isArray(modelEntry.params)) {
    // Find params that differ from defaults
    const modelParams = [];
    const defaultParamMap = new Map();
    
    if (defaultConfig?.params) {
      defaultConfig.params.forEach(p => {
        if (p.key) defaultParamMap.set(p.key, p);
      });
    }
    
    modelEntry.params.forEach(param => {
      if (!param.key) {
        modelParams.push(param);
        return;
      }
      
      const defaultParam = defaultParamMap.get(param.key);
      if (!defaultParam) {
        // Param not in defaults, include it
        modelParams.push(param);
      } else {
        // Check if this param differs from default
        const isDifferent = JSON.stringify(sortObjectKeys(param)) !== JSON.stringify(sortObjectKeys(defaultParam));
        if (isDifferent) {
          // Only include the changed properties
          const diff = { key: param.key };
          Object.keys(param).forEach(k => {
            if (k !== 'key' && JSON.stringify(param[k]) !== JSON.stringify(defaultParam[k])) {
              diff[k] = param[k];
            }
          });
          if (Object.keys(diff).length > 1) { // More than just 'key'
            modelParams.push(diff);
          }
        }
      }
    });
    
    if (modelParams.length > 0) {
      general.params = modelParams;
    }
  }
  
  // Handle removeParams
  if (modelEntry.removeParams) {
    general.removeParams = modelEntry.removeParams;
  }
  
  // Handle messages
  if (modelEntry.messages) {
    general.messages = modelEntry.messages;
  }
  
  // Handle type
  if (modelEntry.type || (modelEntry.capabilities && modelEntry.capabilities.length > 0)) {
    general.type = {
      primary: modelEntry.type || 'chat'
    };
    if (modelEntry.capabilities && modelEntry.capabilities.length > 0) {
      general.type.supported = modelEntry.capabilities;
    }
  }
  
  // Handle disablePlayground
  if (modelEntry.disablePlayground !== undefined) {
    general.disablePlayground = modelEntry.disablePlayground;
  }
  
  // Handle isDefault
  if (modelEntry.isDefault !== undefined) {
    general.isDefault = modelEntry.isDefault;
  }
  
  return Object.keys(general).length > 0 ? general : null;
}

// Process a combined file and split into general and pricing
function processCombined(providerName) {
  const combinedPath = path.join(COMBINED_DIR, `${providerName}.json`);
  const combined = readJson(combinedPath);
  
  if (!combined) {
    console.log(`  ⚠ Could not read ${providerName}.json`);
    return { general: null, pricing: null };
  }
  
  // Build general file
  const general = {
    name: combined.provider_name || providerName,
    description: combined.description || ''
  };
  
  // Add default section
  if (combined.default) {
    general.default = { ...combined.default };
    // Remove pricing from general default
    delete general.default.pricing;
  }
  
  // Build pricing file
  const pricing = {
    default: {}
  };
  
  // Add default pricing config
  if (combined.default?.pricing) {
    pricing.default.pricing_config = {
      pay_as_you_go: {
        request_token: { price: 0 },
        response_token: { price: 0 },
        cache_write_input_token: { price: 0 },
        cache_read_input_token: { price: 0 }
      }
    };
    if (combined.default.pricing.currency) {
      pricing.default.pricing_config.currency = combined.default.pricing.currency;
    }
    if (combined.default.pricing.calculate) {
      pricing.default.pricing_config.calculate = combined.default.pricing.calculate;
    }
  }
  
  // Process models
  let generalModelCount = 0;
  let pricingModelCount = 0;
  
  if (combined.models) {
    Object.keys(combined.models).sort().forEach(modelName => {
      const model = combined.models[modelName];
      
      // Extract general config
      const modelGeneral = extractGeneral(model, combined.default);
      if (modelGeneral) {
        general[modelName] = modelGeneral;
        generalModelCount++;
      }
      
      // Extract pricing config
      if (model.pricing) {
        const modelPricing = reversePricing(model.pricing);
        if (modelPricing) {
          pricing[modelName] = modelPricing;
          pricingModelCount++;
        }
      }
      
      // Handle pricing tiers (Google)
      if (model.pricing_tiers) {
        Object.keys(model.pricing_tiers).forEach(tierName => {
          const tierPricing = reversePricing(model.pricing_tiers[tierName]);
          if (tierPricing) {
            const tierModelName = tierName === 'gt_128k' ? `${modelName}-gt-128k` : `${modelName}-${tierName}`;
            pricing[tierModelName] = tierPricing;
          }
        });
        
        // Also add lte-128k version with base pricing
        if (model.pricing_tiers.gt_128k && model.pricing) {
          const ltePricing = reversePricing(model.pricing);
          if (ltePricing) {
            pricing[`${modelName}-lte-128k`] = ltePricing;
          }
        }
      }
    });
  }
  
  return { 
    general, 
    pricing, 
    stats: { generalModelCount, pricingModelCount }
  };
}

// Main execution
function main() {
  console.log('🔄 AI Models Database - Reverse Merge Script\n');

  // Create output directories
  if (!fs.existsSync(VERIFY_GENERAL_DIR)) {
    fs.mkdirSync(VERIFY_GENERAL_DIR, { recursive: true });
  }
  if (!fs.existsSync(VERIFY_PRICING_DIR)) {
    fs.mkdirSync(VERIFY_PRICING_DIR, { recursive: true });
  }

  // Get all combined files
  const combinedFiles = fs.readdirSync(COMBINED_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  console.log(`Found ${combinedFiles.length} combined files to process\n`);

  let totalGeneral = 0;
  let totalPricing = 0;

  // Process each combined file
  combinedFiles.sort().forEach(provider => {
    console.log(`Processing: ${provider}`);
    
    const { general, pricing, stats } = processCombined(provider);
    
    if (general) {
      const generalPath = path.join(VERIFY_GENERAL_DIR, `${provider}.json`);
      writeJson(generalPath, general);
      console.log(`  ✓ General: ${stats.generalModelCount} models`);
      totalGeneral += stats.generalModelCount;
    }
    
    if (pricing && Object.keys(pricing).length > 1) { // More than just default
      const pricingPath = path.join(VERIFY_PRICING_DIR, `${provider}.json`);
      writeJson(pricingPath, pricing);
      console.log(`  ✓ Pricing: ${stats.pricingModelCount} models`);
      totalPricing += stats.pricingModelCount;
    }
  });

  console.log('\n✅ Reverse merge complete!');
  console.log(`   - ${combinedFiles.length} providers processed`);
  console.log(`   - ${totalGeneral} models in general/`);
  console.log(`   - ${totalPricing} models in pricing/`);
  console.log(`\n📁 Output written to verify/general/ and verify/pricing/`);
  console.log('   Compare with original files to verify no data loss.');
}

main();

