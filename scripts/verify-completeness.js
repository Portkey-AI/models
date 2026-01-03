#!/usr/bin/env node
/**
 * AI Models Database - Completeness Verification Script
 * 
 * Checks that combined files contain all data from general/ and pricing/
 * Reports any missing or mismatched data.
 */

const fs = require('fs');
const path = require('path');

const GENERAL_DIR = path.join(__dirname, '..', 'general');
const PRICING_DIR = path.join(__dirname, '..', 'pricing');
const COMBINED_DIR = path.join(__dirname, '..', 'combined');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

// Model resolvers (same as merge-models.js)
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
    return model.replace(/^(us\.|eu\.|global\.|us-gov\.)/, '');
  },
  google: (model) => model,
  'stability-ai': (model) => model,
  predibase: (model) => {
    if (model.includes('mixtral-8x7b')) {
      return 'mixtral-8x7b-v0-1';
    }
    return model;
  }
};

// Deep comparison helper
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

const issues = {
  missingProviders: [],
  missingModelsFromGeneral: [],
  missingModelsFromPricing: [],
  missingParams: [],
  missingPricing: [],
  missingCapabilities: [],
  missingAdditionalUnits: [],
  pricingMismatch: [],
  otherIssues: []
};

let totalChecks = 0;
let passedChecks = 0;

function check(condition, description, category = 'otherIssues') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    return true;
  } else {
    issues[category].push(description);
    return false;
  }
}

// Get all providers
const generalProviders = getJsonFiles(GENERAL_DIR);
const pricingProviders = getJsonFiles(PRICING_DIR);
const combinedProviders = getJsonFiles(COMBINED_DIR);
const allProviders = [...new Set([...generalProviders, ...pricingProviders])];

console.log('🔍 AI Models Database - Completeness Verification\n');
console.log(`Providers: ${allProviders.length} total`);
console.log(`  - In general/: ${generalProviders.length}`);
console.log(`  - In pricing/: ${pricingProviders.length}`);
console.log(`  - In combined/: ${combinedProviders.length}\n`);

// Check all providers exist in combined
allProviders.forEach(provider => {
  check(
    combinedProviders.includes(provider),
    `Provider "${provider}" missing from combined/`,
    'missingProviders'
  );
});

// Detailed checks per provider
let totalModelsInGeneral = 0;
let totalModelsInPricing = 0;
let totalModelsInCombined = 0;

allProviders.forEach(provider => {
  const generalPath = path.join(GENERAL_DIR, `${provider}.json`);
  const pricingPath = path.join(PRICING_DIR, `${provider}.json`);
  const combinedPath = path.join(COMBINED_DIR, `${provider}.json`);
  
  const general = fs.existsSync(generalPath) ? readJson(generalPath) : null;
  const pricing = fs.existsSync(pricingPath) ? readJson(pricingPath) : null;
  const combined = readJson(combinedPath);
  
  if (!combined) {
    issues.missingProviders.push(`Combined file missing for ${provider}`);
    return;
  }
  
  // Get model lists
  const generalModels = general ? Object.keys(general).filter(k => 
    k !== 'name' && k !== 'description' && k !== 'default'
  ) : [];
  
  const pricingModels = pricing ? Object.keys(pricing).filter(k => 
    k !== 'default'
  ) : [];
  
  const combinedModels = combined.models ? Object.keys(combined.models) : [];
  
  totalModelsInGeneral += generalModels.length;
  totalModelsInPricing += pricingModels.length;
  totalModelsInCombined += combinedModels.length;
  
  // Check all general models are in combined
  generalModels.forEach(model => {
    check(
      combinedModels.includes(model),
      `${provider}/${model} from general/ missing in combined/`,
      'missingModelsFromGeneral'
    );
    
    if (combinedModels.includes(model) && general[model]) {
      const generalConfig = general[model];
      const combinedConfig = combined.models[model];
      
      // Check type/capabilities
      if (generalConfig.type?.supported?.length > 0) {
        const hasCapabilities = combinedConfig.capabilities && 
          generalConfig.type.supported.every(c => combinedConfig.capabilities.includes(c));
        check(
          hasCapabilities,
          `${provider}/${model} missing capabilities: ${generalConfig.type.supported.join(', ')}`,
          'missingCapabilities'
        );
      }
      
      // Check disablePlayground
      if (generalConfig.disablePlayground !== undefined) {
        check(
          combinedConfig.disablePlayground === generalConfig.disablePlayground,
          `${provider}/${model} disablePlayground mismatch`,
          'otherIssues'
        );
      }
      
      // Check isDefault
      if (generalConfig.isDefault !== undefined) {
        check(
          combinedConfig.isDefault === generalConfig.isDefault,
          `${provider}/${model} isDefault mismatch`,
          'otherIssues'
        );
      }
      
      // Check removeParams
      if (generalConfig.removeParams) {
        check(
          combinedConfig.removeParams && 
          deepEqual(combinedConfig.removeParams, generalConfig.removeParams),
          `${provider}/${model} removeParams mismatch`,
          'otherIssues'
        );
      }
    }
  });
  
  // Check pricing models - verify they're either in combined or their pricing is applied to general models
  pricingModels.forEach(model => {
    // Skip Google tiered pricing suffixes - they get merged into base model
    if (provider === 'google' && (model.endsWith('-lte-128k') || model.endsWith('-gt-128k'))) {
      return;
    }
    
    // Check if this pricing model is used by any general model via resolver
    const resolver = modelResolvers[provider];
    let pricingApplied = false;
    
    // Check if model exists directly in combined
    if (combinedModels.includes(model)) {
      pricingApplied = true;
    } else {
      // Check if any general model resolves to this pricing model
      generalModels.forEach(gm => {
        const lookupName = resolver ? resolver(gm) : gm;
        if (lookupName === model) {
          // Verify the general model actually has pricing
          if (combined.models[gm]?.pricing) {
            pricingApplied = true;
          }
        }
      });
    }
    
    if (!pricingApplied) {
      check(
        false,
        `${provider}/${model} from pricing/ - pricing not applied to any model`,
        'missingModelsFromPricing'
      );
    }
  });
  
  // Check pricing data preservation
  pricingModels.forEach(model => {
    if (provider === 'google' && (model.endsWith('-lte-128k') || model.endsWith('-gt-128k'))) {
      return; // Handled separately
    }
    
    if (!combinedModels.includes(model)) return;
    
    const pricingConfig = pricing[model]?.pricing_config?.pay_as_you_go;
    const combinedPricing = combined.models[model]?.pricing;
    
    if (pricingConfig && combinedPricing) {
      // Check additional_units preservation
      if (pricingConfig.additional_units) {
        const origUnits = Object.keys(pricingConfig.additional_units);
        const combinedUnits = combinedPricing.additional_units ? 
          Object.keys(combinedPricing.additional_units) : [];
        
        origUnits.forEach(unit => {
          check(
            combinedUnits.includes(unit),
            `${provider}/${model} missing additional_unit: ${unit}`,
            'missingAdditionalUnits'
          );
        });
      }
      
      // Check pricing value conversion (source * 10000 = combined)
      if (pricingConfig.request_token?.price && combinedPricing.input) {
        const expected = Math.round(pricingConfig.request_token.price * 10000 * 1e10) / 1e10;
        const actual = combinedPricing.input;
        check(
          Math.abs(expected - actual) < 0.0001,
          `${provider}/${model} input pricing mismatch: expected ${expected}, got ${actual}`,
          'pricingMismatch'
        );
      }
    }
  });
});

// Summary
console.log('=' .repeat(60));
console.log('📊 VERIFICATION SUMMARY');
console.log('=' .repeat(60));
console.log(`\nTotal models:`);
console.log(`  - In general/: ${totalModelsInGeneral}`);
console.log(`  - In pricing/: ${totalModelsInPricing}`);
console.log(`  - In combined/: ${totalModelsInCombined}`);
console.log(`\nChecks: ${passedChecks}/${totalChecks} passed (${((passedChecks/totalChecks)*100).toFixed(1)}%)\n`);

// Report issues
let hasIssues = false;
Object.entries(issues).forEach(([category, list]) => {
  if (list.length > 0) {
    hasIssues = true;
    console.log(`\n❌ ${category} (${list.length} issues):`);
    list.slice(0, 20).forEach(issue => console.log(`   - ${issue}`));
    if (list.length > 20) {
      console.log(`   ... and ${list.length - 20} more`);
    }
  }
});

if (!hasIssues) {
  console.log('✅ All checks passed! No issues found.');
} else {
  console.log('\n⚠️  Some issues found. Review above for details.');
}

// Special checks
console.log('\n' + '=' .repeat(60));
console.log('🔬 SPECIAL CASE VERIFICATION');
console.log('=' .repeat(60));

// Check Google tiered pricing
const googleCombined = readJson(path.join(COMBINED_DIR, 'google.json'));
if (googleCombined?.models) {
  const modelsWithTiers = Object.entries(googleCombined.models)
    .filter(([_, m]) => m.pricing_tiers)
    .map(([name, _]) => name);
  console.log(`\n✓ Google models with pricing_tiers: ${modelsWithTiers.length}`);
  if (modelsWithTiers.length > 0) {
    console.log(`  Examples: ${modelsWithTiers.slice(0, 5).join(', ')}`);
  }
}

// Check Bedrock regional models
const bedrockCombined = readJson(path.join(COMBINED_DIR, 'bedrock.json'));
if (bedrockCombined?.models) {
  const regionalModels = Object.keys(bedrockCombined.models)
    .filter(m => m.startsWith('us.') || m.startsWith('eu.'));
  console.log(`\n✓ Bedrock regional models: ${regionalModels.length}`);
  
  // Check if regional models have pricing
  const regionalWithPricing = regionalModels.filter(m => 
    bedrockCombined.models[m].pricing !== null
  );
  console.log(`  With pricing: ${regionalWithPricing.length}/${regionalModels.length}`);
}

// Check OpenAI fine-tuned models
const openaiCombined = readJson(path.join(COMBINED_DIR, 'openai.json'));
if (openaiCombined?.models) {
  const ftModels = Object.keys(openaiCombined.models)
    .filter(m => m.startsWith('ft:'));
  console.log(`\n✓ OpenAI fine-tuned models: ${ftModels.length}`);
}

// Check models with disablePlayground
let disabledCount = 0;
combinedProviders.forEach(provider => {
  const combined = readJson(path.join(COMBINED_DIR, `${provider}.json`));
  if (combined?.models) {
    Object.values(combined.models).forEach(m => {
      if (m.disablePlayground) disabledCount++;
    });
  }
});
console.log(`\n✓ Models with disablePlayground: ${disabledCount}`);

// Check additional_units coverage
let modelsWithAdditionalUnits = 0;
let uniqueUnitTypes = new Set();
combinedProviders.forEach(provider => {
  const combined = readJson(path.join(COMBINED_DIR, `${provider}.json`));
  if (combined?.models) {
    Object.values(combined.models).forEach(m => {
      if (m.pricing?.additional_units) {
        modelsWithAdditionalUnits++;
        Object.keys(m.pricing.additional_units).forEach(u => uniqueUnitTypes.add(u));
      }
    });
  }
});
console.log(`\n✓ Models with additional_units: ${modelsWithAdditionalUnits}`);
console.log(`  Unit types found: ${[...uniqueUnitTypes].join(', ')}`);

console.log('\n' + '=' .repeat(60));
console.log('Done!');

