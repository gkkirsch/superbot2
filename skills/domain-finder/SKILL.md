---
name: domain-finder
description: >
  Check domain name availability across .com, .app, .io, .co, .net TLDs.
  Use when you need to find an available domain for a project, check if a name is taken,
  or compare domain options with pricing.
  Triggers: "find a domain", "check domain availability", "is X.com available", "search for domains", "what domains are available for".
  NOT for: DNS management, Cloudflare zone config, domain transfers.
version: 1.0.0
argument-hint: "[base-name1] [base-name2] ..."
allowed-tools: Bash

metadata:
  superbot:
    emoji: "🌐"
    requires:
      bins: ["curl", "jq"]
    install:
      - id: brew-jq
        kind: brew
        formula: jq
        bins: ["jq"]
        label: "Install jq (brew)"
    credentials:
      - key: CLOUDFLARE_API_TOKEN
        label: "Cloudflare API Token"
        description: "Optional — enables at-cost pricing from Cloudflare Registrar. Create at dash.cloudflare.com/profile/api-tokens with 'Account Settings: Read' permission."
        required: false
      - key: CLOUDFLARE_ACCOUNT_ID
        label: "Cloudflare Account ID"
        description: "Your Cloudflare account ID. Found in the URL when logged into dash.cloudflare.com (the long hex string)."
        required: false
---

# Domain Finder

Check domain name availability and pricing across popular TLDs.

## How It Works

1. **RDAP** (free, no setup) — queries public RDAP servers to check if domains are registered
2. **Cloudflare Registrar** (optional) — returns at-cost registration pricing from Cloudflare

## Usage

Parse `$ARGUMENTS` to get the base domain name(s) the user wants to check.

Run the check script:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/check-domains.sh $ARGUMENTS
```

The script checks each base name against `.com`, `.app`, `.io`, `.co`, and `.net` TLDs in parallel and outputs a formatted table.

## Presenting Results

After running the script, present the results cleanly and recommend the best available option based on:

1. **Exact name match** — prefer the base name the user asked about
2. **TLD preference** — `.com` is most recognizable, `.app` is great for web apps, `.io` for tech/dev tools
3. **Price** — if Cloudflare pricing is available, factor in cost
4. **Memorability** — shorter and simpler is better

If no domains are available, suggest variations (add "hq", "get", "try", "use" prefix, or abbreviations).

## Cloudflare Pricing Setup

For at-cost domain pricing from Cloudflare:

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with **Account Settings: Read** permission
3. Set `CLOUDFLARE_API_TOKEN` in the dashboard credentials
4. Set `CLOUDFLARE_ACCOUNT_ID` (or use the default fallback)

Without Cloudflare credentials, availability is still checked via RDAP — you just won't see pricing.

## Gotchas

- RDAP checks are fast but occasionally return errors for rate limiting — domains showing "? error" can be re-checked
- `.io` RDAP can be slow or unreliable — if it times out, suggest the user check manually
- Cloudflare at-cost pricing is typically 20-40% cheaper than retail registrars
- Some premium domains may show as "available" in RDAP but have premium pricing at registrars
