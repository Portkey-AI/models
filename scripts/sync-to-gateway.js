#!/usr/bin/env node

/**
 * Sync pricing configs from models repo to gateway-enterprise-node repo
 *
 * This script:
 * 1. Validates all JSON files in pricing/ directory
 * 2. Validates the pricing config schema structure
 * 3. Copies validated configs to the gateway configs directory
 * 4. Regenerates the index.ts file with all providers exported as an object
 * 5. Generates a detailed changelog of what changed
 *
 * Usage: node scripts/sync-to-gateway.js <path-to-gateway-repo>
 */

const fs = require('fs');
const path = require('path');

const PRICING_DIR = 'pricing';
const GATEWAY_CONFIGS_DIR = 'src/services/winky/configs';
const CHANGELOG_FILE = 'SYNC_CHANGELOG.md';

// ============================================================================
// VALIDATION
// ============================================================================

function validateJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function validatePricingSchema(data, filename) {
  const errors = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push(`${filename}: Root must be an object`);
    return { valid: false, errors };
  }

  const modelKeys = Object.keys(data);
  if (modelKeys.length === 0) {
    errors.push(`${filename}: Config must have at least one model entry`);
    return { valid: false, errors };
  }

  for (const modelName of modelKeys) {
    const modelConfig = data[modelName];

    if (typeof modelConfig !== 'object' || modelConfig === null) {
      errors.push(`${filename}: Model "${modelName}" must be an object`);
      continue;
    }

    if (!('pricing_config' in modelConfig)) {
      errors.push(`${filename}: Model "${modelName}" missing "pricing_config" key`);
      continue;
    }

    const pricingConfig = modelConfig.pricing_config;

    if (pricingConfig === null) {
      continue;
    }

    if (typeof pricingConfig !== 'object') {
      errors.push(`${filename}: Model "${modelName}" pricing_config must be an object or null`);
      continue;
    }

    if (pricingConfig.pay_as_you_go !== undefined) {
      if (typeof pricingConfig.pay_as_you_go !== 'object') {
        errors.push(`${filename}: Model "${modelName}" pay_as_you_go must be an object`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Compare two pricing configs and return detailed changes
 */
function compareConfigs(oldData, newData, providerName) {
  const changes = {
    provider: providerName,
    addedModels: [],
    removedModels: [],
    modifiedModels: [],
  };

  const oldModels = oldData ? Object.keys(oldData) : [];
  const newModels = Object.keys(newData);

  // Find added models
  for (const model of newModels) {
    if (!oldModels.includes(model)) {
      changes.addedModels.push(model);
    }
  }

  // Find removed models
  for (const model of oldModels) {
    if (!newModels.includes(model)) {
      changes.removedModels.push(model);
    }
  }

  // Find modified models
  for (const model of newModels) {
    if (oldModels.includes(model)) {
      const oldConfig = JSON.stringify(oldData[model]);
      const newConfig = JSON.stringify(newData[model]);
      if (oldConfig !== newConfig) {
        // Extract price changes for more detail
        const priceChanges = getPriceChanges(oldData[model], newData[model]);
        changes.modifiedModels.push({ model, priceChanges });
      }
    }
  }

  return changes;
}

/**
 * Extract specific price changes between two model configs
 */
function getPriceChanges(oldConfig, newConfig) {
  const changes = [];

  const oldPricing = oldConfig?.pricing_config?.pay_as_you_go || {};
  const newPricing = newConfig?.pricing_config?.pay_as_you_go || {};

  const allKeys = new Set([...Object.keys(oldPricing), ...Object.keys(newPricing)]);

  for (const key of allKeys) {
    const oldPrice = oldPricing[key]?.price;
    const newPrice = newPricing[key]?.price;

    if (oldPrice !== newPrice) {
      changes.push({
        type: key,
        old: oldPrice,
        new: newPrice,
      });
    }
  }

  return changes;
}

/**
 * Generate markdown changelog from changes
 */
function generateChangelog(allChanges, newProviders, removedFromIndex) {
  const lines = [];

  // New providers section
  if (newProviders.length > 0) {
    lines.push('### ✨ New Providers');
    lines.push('');
    for (const provider of newProviders) {
      lines.push(`- **${provider}**`);
    }
    lines.push('');
  }

  // Changes by provider
  const providersWithChanges = allChanges.filter(
    (c) => c.addedModels.length > 0 || c.removedModels.length > 0 || c.modifiedModels.length > 0,
  );

  if (providersWithChanges.length > 0) {
    lines.push('### 📝 Updated Providers');
    lines.push('');

    for (const change of providersWithChanges) {
      lines.push(`<details>`);
      lines.push(`<summary><strong>${change.provider}</strong> - ${getSummary(change)}</summary>`);
      lines.push('');

      if (change.addedModels.length > 0) {
        lines.push('**New models:**');
        for (const model of change.addedModels) {
          lines.push(`- \`${model}\``);
        }
        lines.push('');
      }

      if (change.removedModels.length > 0) {
        lines.push('**Removed models:**');
        for (const model of change.removedModels) {
          lines.push(`- \`${model}\``);
        }
        lines.push('');
      }

      if (change.modifiedModels.length > 0) {
        lines.push('**Price changes:**');
        lines.push('| Model | Type | Old | New |');
        lines.push('|-------|------|-----|-----|');
        for (const { model, priceChanges } of change.modifiedModels) {
          if (priceChanges.length > 0) {
            for (const pc of priceChanges) {
              const oldVal = pc.old !== undefined ? `$${pc.old}` : '-';
              const newVal = pc.new !== undefined ? `$${pc.new}` : '-';
              lines.push(`| \`${model}\` | ${pc.type} | ${oldVal} | ${newVal} |`);
            }
          } else {
            lines.push(`| \`${model}\` | (config changed) | - | - |`);
          }
        }
        lines.push('');
      }

      lines.push('</details>');
      lines.push('');
    }
  }

  // Removed from index
  if (removedFromIndex.length > 0) {
    lines.push('### 🗑️ Removed Providers');
    lines.push('');
    for (const provider of removedFromIndex) {
      lines.push(`- **${provider}**`);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    lines.push('No pricing changes detected.');
  }

  return lines.join('\n');
}

function getSummary(change) {
  const parts = [];
  if (change.addedModels.length > 0) parts.push(`${change.addedModels.length} added`);
  if (change.removedModels.length > 0) parts.push(`${change.removedModels.length} removed`);
  if (change.modifiedModels.length > 0) parts.push(`${change.modifiedModels.length} modified`);
  return parts.join(', ') || 'no changes';
}

// ============================================================================
// NAMING UTILITIES
// ============================================================================

function toImportName(filename) {
  const name = filename.replace('.json', '');
  return name
    .split('-')
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

function toProviderKey(filename) {
  return filename.replace('.json', '');
}

// ============================================================================
// INDEX.TS GENERATION
// ============================================================================

function generateIndexTs(jsonFiles) {
  const imports = [];
  const providerEntries = [];

  for (const file of jsonFiles) {
    const importName = toImportName(file);
    const providerKey = toProviderKey(file);

    imports.push(`import ${importName} from './${file}';`);

    if (providerKey.includes('-')) {
      providerEntries.push(`  '${providerKey}': ${importName},`);
    } else {
      providerEntries.push(`  ${importName},`);
    }
  }

  return `${imports.join('\n')}

const providers: Record<string, any> = {
${providerEntries.join('\n')}
};

export { providers };
`;
}

// ============================================================================
// SYNC LOGIC
// ============================================================================

function syncConfigs(gatewayRepoPath) {
  const modelsRoot = path.resolve(__dirname, '..');
  const pricingDir = path.join(modelsRoot, PRICING_DIR);
  const gatewayConfigsDir = path.join(gatewayRepoPath, GATEWAY_CONFIGS_DIR);

  const result = {
    success: true,
    copiedFiles: [],
    updatedFiles: [],
    errors: [],
    validationErrors: [],
    changelog: '',
    allChanges: [],
    newProviders: [],
  };

  // Validate directories exist
  if (!fs.existsSync(pricingDir)) {
    result.errors.push(`Pricing directory not found: ${pricingDir}`);
    result.success = false;
    return result;
  }

  if (!fs.existsSync(gatewayConfigsDir)) {
    result.errors.push(`Gateway configs directory not found: ${gatewayConfigsDir}`);
    result.success = false;
    return result;
  }

  // Get all files from pricing directory
  const allFiles = fs.readdirSync(pricingDir);
  const jsonFiles = allFiles.filter((file) => file.endsWith('.json')).sort();
  const nonJsonFiles = allFiles.filter((file) => !file.endsWith('.json') && !file.startsWith('.'));

  if (nonJsonFiles.length > 0) {
    console.log(`\n⚠️  Warning: Found non-JSON files in pricing/ (ignoring):`);
    nonJsonFiles.forEach((f) => console.log(`   - ${f}`));
  }

  if (jsonFiles.length === 0) {
    result.errors.push('No JSON files found in pricing directory');
    result.success = false;
    return result;
  }

  console.log(`\n📋 Found ${jsonFiles.length} JSON files to validate and sync\n`);

  // Phase 1: Validate ALL files first
  console.log('Phase 1: Validating JSON files...\n');

  const validatedConfigs = [];

  for (const file of jsonFiles) {
    const filePath = path.join(pricingDir, file);

    const jsonResult = validateJsonFile(filePath);
    if (!jsonResult.valid) {
      result.validationErrors.push(`${file}: Invalid JSON - ${jsonResult.error}`);
      console.log(`  ❌ ${file}: Invalid JSON`);
      continue;
    }

    const schemaResult = validatePricingSchema(jsonResult.data, file);
    if (!schemaResult.valid) {
      result.validationErrors.push(...schemaResult.errors);
      console.log(`  ❌ ${file}: Schema validation failed`);
      continue;
    }

    console.log(`  ✅ ${file}`);
    validatedConfigs.push({
      filename: file,
      sourcePath: filePath,
      data: jsonResult.data,
    });
  }

  if (result.validationErrors.length > 0) {
    console.log(`\n❌ Validation failed with ${result.validationErrors.length} error(s):\n`);
    result.validationErrors.forEach((err) => console.log(`   - ${err}`));
    result.success = false;
    return result;
  }

  console.log(`\n✅ All ${validatedConfigs.length} files passed validation\n`);

  // Phase 2: Copy validated files and track changes
  console.log('Phase 2: Syncing validated configs...\n');

  const allChanges = [];

  for (const config of validatedConfigs) {
    const destPath = path.join(gatewayConfigsDir, config.filename);
    const providerName = toProviderKey(config.filename);
    const sourceContent = JSON.stringify(config.data, null, 2);

    let needsCopy = true;
    let oldData = null;
    let isNewProvider = false;

    if (fs.existsSync(destPath)) {
      const destContent = fs.readFileSync(destPath, 'utf8');
      try {
        oldData = JSON.parse(destContent);
        const destNormalized = JSON.stringify(oldData, null, 2);
        needsCopy = sourceContent !== destNormalized;
      } catch {
        needsCopy = true;
      }
    } else {
      isNewProvider = true;
    }

    if (needsCopy) {
      // Track changes before copying
      const changes = compareConfigs(oldData, config.data, providerName);
      allChanges.push(changes);

      if (isNewProvider) {
        result.newProviders.push(providerName);
      }

      fs.writeFileSync(destPath, sourceContent);
      result.updatedFiles.push(config.filename);
      console.log(`  📝 ${config.filename}`);
    }
  }

  if (result.updatedFiles.length === 0) {
    console.log('  ✅ All config files are already up to date\n');
  } else {
    console.log(`\n  Updated ${result.updatedFiles.length} file(s)\n`);
  }

  // Phase 3: Regenerate index.ts
  console.log('Phase 3: Regenerating index.ts...\n');

  const indexPath = path.join(gatewayConfigsDir, 'index.ts');
  const validFilenames = validatedConfigs.map((c) => c.filename);
  const newIndexContent = generateIndexTs(validFilenames);

  // Check what providers are being removed from index
  let removedFromIndex = [];
  if (fs.existsSync(indexPath)) {
    const currentContent = fs.readFileSync(indexPath, 'utf8');
    const currentImports = currentContent.match(/from '\.\/([^']+\.json)'/g) || [];
    const currentFiles = currentImports.map((m) => m.match(/\.\/([^']+\.json)/)[1]);
    removedFromIndex = currentFiles.filter((f) => !validFilenames.includes(f)).map((f) => toProviderKey(f));
  }

  let indexNeedsUpdate = true;
  if (fs.existsSync(indexPath)) {
    const currentContent = fs.readFileSync(indexPath, 'utf8');
    indexNeedsUpdate = currentContent !== newIndexContent;
  }

  if (indexNeedsUpdate) {
    fs.writeFileSync(indexPath, newIndexContent);
    console.log(`  📝 index.ts regenerated with ${validFilenames.length} providers`);
    result.copiedFiles.push('index.ts');
  } else {
    console.log('  ✅ index.ts is already up to date');
  }

  // Phase 4: Generate changelog
  console.log('\nPhase 4: Generating changelog...\n');

  result.allChanges = allChanges;
  result.changelog = generateChangelog(allChanges, result.newProviders, removedFromIndex);

  // Write changelog to file for GitHub Actions to read
  const changelogPath = path.join(gatewayRepoPath, CHANGELOG_FILE);
  fs.writeFileSync(changelogPath, result.changelog);
  console.log(`  📝 Changelog written to ${CHANGELOG_FILE}`);

  // Summary
  result.copiedFiles = [...result.updatedFiles, ...(indexNeedsUpdate ? ['index.ts'] : [])];

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node scripts/sync-to-gateway.js <path-to-gateway-repo>');
  console.log('\nExample: node scripts/sync-to-gateway.js ../gateway-enterprise-node');
  process.exit(1);
}

const gatewayPath = path.resolve(args[0]);

console.log('═'.repeat(60));
console.log('  PRICING CONFIG SYNC');
console.log('═'.repeat(60));
console.log(`  Source: pricing/`);
console.log(`  Target: ${gatewayPath}/${GATEWAY_CONFIGS_DIR}`);
console.log('═'.repeat(60));

try {
  const result = syncConfigs(gatewayPath);

  console.log('\n' + '═'.repeat(60));

  if (result.success) {
    if (result.copiedFiles.length > 0) {
      console.log(`  ✅ SUCCESS: ${result.copiedFiles.length} file(s) updated`);
      console.log('═'.repeat(60));

      // Print changelog summary
      if (result.changelog) {
        console.log('\n📋 CHANGELOG:\n');
        console.log(result.changelog);
      }

      process.exit(0);
    } else {
      console.log('  ✅ SUCCESS: Everything is already up to date');
      console.log('═'.repeat(60));
      process.exit(0);
    }
  } else {
    console.log('  ❌ FAILED: See errors above');
    console.log('═'.repeat(60));
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
}
