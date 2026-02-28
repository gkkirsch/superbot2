#!/usr/bin/env bash
# check-domains.sh — Check domain availability via RDAP/WHOIS + optional Cloudflare pricing
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: check-domains.sh <basename1> [basename2] ..."
  exit 1
fi

# Check for jq (needed for Cloudflare pricing)
HAS_JQ=false
if command -v jq &>/dev/null; then
  HAS_JQ=true
fi

# Cloudflare config
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-c5d8a23755e8c11364f0ff8e4de57171}"
HAS_CF=false
if [[ -n "$CF_TOKEN" && -n "$CF_ACCOUNT" && "$HAS_JQ" == "true" ]]; then
  HAS_CF=true
fi

BASENAMES=("$@")
TLDS=("com" "app" "io" "co" "net")

# RDAP endpoints — only for TLDs with working RDAP servers
declare -A RDAP_URLS
RDAP_URLS[com]="https://rdap.verisign.com/com/v1/domain"
RDAP_URLS[net]="https://rdap.verisign.com/net/v1/domain"
RDAP_URLS[app]="https://pubapi.registry.google/rdap/domain"

# TLDs that need WHOIS fallback (no public RDAP)
declare -A WHOIS_TLDS
WHOIS_TLDS[io]=1
WHOIS_TLDS[co]=1

# Temp dir for results
TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

echo "Checking domains for: $(IFS=', '; echo "${BASENAMES[*]}")"
echo ""

# --- Availability checks (parallel) ---
for base in "${BASENAMES[@]}"; do
  for tld in "${TLDS[@]}"; do
    domain="${base}.${tld}"
    (
      if [[ -n "${WHOIS_TLDS[$tld]:-}" ]]; then
        # WHOIS-based check for .io and .co
        whois_out=$(whois "$domain" 2>/dev/null || echo "error")
        if echo "$whois_out" | grep -qi "not found\|no match\|no data found\|no entries found"; then
          echo "available" > "${TMPDIR_WORK}/${domain}.status"
        elif echo "$whois_out" | grep -qi "error\|timed out\|connection refused"; then
          echo "error" > "${TMPDIR_WORK}/${domain}.status"
        else
          echo "taken" > "${TMPDIR_WORK}/${domain}.status"
        fi
      else
        # RDAP-based check for .com, .net, .app
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${RDAP_URLS[$tld]}/${domain}" 2>/dev/null || echo "000")
        if [[ "$http_code" == "404" ]]; then
          echo "available" > "${TMPDIR_WORK}/${domain}.status"
        elif [[ "$http_code" == "200" ]]; then
          echo "taken" > "${TMPDIR_WORK}/${domain}.status"
        else
          echo "error" > "${TMPDIR_WORK}/${domain}.status"
        fi
      fi
    ) &
  done
done

# --- Cloudflare pricing (parallel per basename) ---
if [[ "$HAS_CF" == "true" ]]; then
  for base in "${BASENAMES[@]}"; do
    (
      cf_response=$(curl -s --max-time 15 -X POST \
        "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/registrar/domains/search" \
        -H "Authorization: Bearer ${CF_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"${base}\"}" 2>/dev/null || echo "{}")
      echo "$cf_response" > "${TMPDIR_WORK}/${base}.cf.json"
    ) &
  done
fi

wait

# --- Parse Cloudflare pricing into lookup ---
declare -A CF_PRICES
if [[ "$HAS_CF" == "true" ]]; then
  for base in "${BASENAMES[@]}"; do
    cf_file="${TMPDIR_WORK}/${base}.cf.json"
    if [[ -f "$cf_file" ]]; then
      while IFS='|' read -r domain price; do
        if [[ -n "$domain" && -n "$price" ]]; then
          CF_PRICES["$domain"]="$price"
        fi
      done < <(jq -r '
        .result[]? |
        select(.available == true) |
        "\(.domain_name)|\(.pricing.registration.price // .pricing.registration_price // empty)"
      ' "$cf_file" 2>/dev/null || true)
    fi
  done
fi

# --- Output table ---
printf "%-24s %-14s %s\n" "DOMAIN" "STATUS" "PRICE"
printf "%-24s %-14s %s\n" "────────────────────────" "──────────────" "─────────────────"

for base in "${BASENAMES[@]}"; do
  for tld in "${TLDS[@]}"; do
    domain="${base}.${tld}"
    status_file="${TMPDIR_WORK}/${domain}.status"

    if [[ -f "$status_file" ]]; then
      status=$(cat "$status_file")
    else
      status="error"
    fi

    if [[ "$status" == "available" ]]; then
      status_display="✓ available"
      if [[ "$HAS_CF" == "true" ]]; then
        price="${CF_PRICES[$domain]:-}"
        if [[ -n "$price" ]]; then
          price_display="\$${price}/yr (CF)"
        else
          price_display=""
        fi
      else
        if [[ -z "$CF_TOKEN" ]]; then
          price_display="(no price — configure CLOUDFLARE_API_TOKEN)"
        else
          price_display="(no price — install jq for CF pricing)"
        fi
      fi
    elif [[ "$status" == "taken" ]]; then
      status_display="✗ taken"
      price_display=""
    else
      status_display="? error"
      price_display=""
    fi

    printf "%-24s %-14s %s\n" "$domain" "$status_display" "$price_display"
  done
  # Blank line between basenames if multiple
  if [[ ${#BASENAMES[@]} -gt 1 ]]; then
    echo ""
  fi
done
