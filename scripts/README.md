# Models Repo Scripts

## sync-to-gateway.js

Syncs pricing configuration files from this repository to the `gateway-enterprise-node` repository with full validation.

### What It Does

1. **Validates JSON Syntax** - Ensures all files are valid JSON
2. **Validates Schema Structure** - Checks that each config follows the expected structure
3. **Copies Validated Configs** - Only copies files that pass validation
4. **Regenerates index.ts** - Automatically updates the exports to include all providers
5. **Generates Changelog** - Creates detailed PR description with price changes

### Manual Usage

```bash
# From the models repo root
node scripts/sync-to-gateway.js ../gateway-enterprise-node
```

---

## check_pricing_sanity.py

Flags prices that parse fine but are probably wrong. Runs in the Validate JSON workflow and only adds warnings, so it never blocks a merge.

It checks for:

- `cache_read_input_token` priced above `request_token` (cached input should be cheaper; usually a swapped field)
- the same model id priced 50x or more apart across providers (usually a cents/dollars or per-1K/per-1M slip)
- cache read and cache write swapped compared with the same model in another provider

```bash
python3 scripts/check_pricing_sanity.py           # warnings, exit 0
python3 scripts/check_pricing_sanity.py --strict  # exit 1 if anything is flagged
```

Each warning names the file and line, and shows prices as $/1M tokens. A warning is a prompt to check the provider's pricing page, not proof the entry is wrong.

---

## GitHub Actions Workflows

### Branch Behavior

| Models Branch | Gateway Target | Environment  | Workflow                          |
| ------------- | -------------- | ------------ | --------------------------------- |
| `main`        | `main`         | `production` | `sync-pricing-to-gateway.yml`     |
| `dev`         | `dev`          | `dev`        | `sync-pricing-to-gateway-dev.yml` |

Both workflows create PRs for review.

---

## Setup: GitHub App Authentication

The workflows use a GitHub App for authentication (more secure than PATs).

### 1. Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Configure:
   - **Name**: `models-gateway-sync` (or similar)
   - **Homepage URL**: `https://github.com/portkey-ai/models`
   - **Webhook**: Uncheck "Active" (not needed)
   - **Repository permissions**:
     - Contents: **Read and write**
     - Pull requests: **Read and write**
   - **Where can this GitHub App be installed?**: Only on this account
3. Click **Create GitHub App**
4. Note the **App ID** (displayed at top)
5. Scroll down and click **Generate a private key** (downloads `.pem` file)

### 2. Install the App

1. On the app page, click **Install App** (left sidebar)
2. Select your organization (`portkey-ai`)
3. Choose **Only select repositories**
4. Select `gateway-enterprise-node`
5. Click **Install**

### 3. Create Environments & Secrets

#### Create Environments

1. Go to `models` repo → **Settings → Environments**
2. Create environment: `production`
3. Create environment: `dev`

#### Add Secrets to Each Environment

For **both** `production` and `dev` environments, add:

| Secret Name       | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `APP_ID`          | The App ID from step 1 (numeric)                                          |
| `APP_PRIVATE_KEY` | Contents of the `.pem` file (including `-----BEGIN...` and `-----END...`) |

---

## Validation Rules

- All files must be valid JSON
- Each model entry must have a `pricing_config` key
- `pricing_config` can be:
  - An object with `pay_as_you_go` pricing details
  - `null` (for deprecated/free models)

### Failure Behavior

If **any** file fails validation:

- Exit code 1
- **No files are copied**
- Clear error messages show which files failed

---

## Changelog in PRs

The PR body includes detailed changes:

- **✨ New Providers** - Newly added provider configs
- **📝 Updated Providers** - Collapsible details for each provider:
  - New models added
  - Models removed
  - Price changes table (model, type, old price → new price)
- **🗑️ Removed Providers** - Provider configs that were deleted

---

## Adding New Providers

1. Create `pricing/<provider-name>.json`:

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

2. Push to the appropriate branch
3. Workflow validates → creates PR in gateway repo
