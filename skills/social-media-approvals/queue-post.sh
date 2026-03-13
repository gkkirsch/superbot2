#!/bin/bash
# queue-post.sh - Queue a social media post draft for dashboard approval
# Usage: queue-post.sh <platform> <space> <draft> [options]
#
# Arguments:
#   platform  - Social media platform (facebook, x, instagram, linkedin, etc.)
#   space     - Space name the worker is operating in
#   draft     - The draft post/reply text
#
# Options:
#   --target "handle or group"   - Who/where the post targets
#   --post-url "https://..."     - URL of the post being replied to
#   --excerpt "original text"    - Excerpt from the original post
#   --context "why this reply"   - Context for why this engagement
#
# Examples:
#   queue-post.sh facebook hostreply 'great tip about react hooks' \
#     --target '@reactdev' \
#     --post-url 'https://facebook.com/groups/123/posts/456' \
#     --excerpt 'TIL you can use useReducer for...' \
#     --context 'relevant to our audience, high engagement post'

set -uo pipefail

PLATFORM="${1:-}"
SPACE="${2:-}"
DRAFT="${3:-}"
shift 3 2>/dev/null || true

if [[ -z "$PLATFORM" || -z "$SPACE" || -z "$DRAFT" ]]; then
  echo "Usage: queue-post.sh <platform> <space> <draft> [options]" >&2
  echo "Required: platform, space, draft text" >&2
  exit 1
fi

# Parse options
TARGET=""
POST_URL=""
EXCERPT=""
CONTEXT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --post-url) POST_URL="$2"; shift 2 ;;
    --excerpt) EXCERPT="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Write to persistent skill-data directory (survives plugin uninstall)
PLUGIN_NAME="social-media-approvals"
SKILL_DATA_DIR="${SKILL_DATA_DIR:-${HOME}/.superbot2/skill-data/plugin__${PLUGIN_NAME}}"
mkdir -p "$SKILL_DATA_DIR"
JSONL_FILE="$SKILL_DATA_DIR/data.jsonl"

# Generate unique ID
ID="post-$(date -u +%Y%m%d%H%M%S)-$$"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build and append JSONL line
jq -n -c \
  --arg id "$ID" \
  --arg platform "$PLATFORM" \
  --arg space "$SPACE" \
  --arg draft "$DRAFT" \
  --arg target "$TARGET" \
  --arg postUrl "$POST_URL" \
  --arg excerpt "$EXCERPT" \
  --arg context "$CONTEXT" \
  --arg createdAt "$TIMESTAMP" \
  '{
    id: $id,
    platform: $platform,
    space: $space,
    draft: $draft,
    target: $target,
    postUrl: $postUrl,
    excerpt: $excerpt,
    context: $context,
    status: "pending",
    createdAt: $createdAt
  }' >> "$JSONL_FILE"

echo "Queued post: $ID ($PLATFORM → $TARGET)"
