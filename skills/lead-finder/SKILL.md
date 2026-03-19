---
name: lead-finder
description: >
  Systematically research companies matching target criteria, find decision-maker contacts,
  and build structured outreach target lists. Uses web search, company website analysis,
  and email pattern discovery to compile actionable lead profiles.
  Triggers: "find leads", "research companies", "build target list", "find contacts",
  "prospect list", "find decision makers", "lead generation", "outreach targets",
  "find companies in", "who should I reach out to".
  NOT for: sending emails, CRM management, social media outreach, cold calling scripts.
version: 1.0.0
argument-hint: "[industry/location/criteria]"
allowed-tools: Read, Grep, Glob, Bash, Write, WebSearch, WebFetch

metadata:
  superbot:
    emoji: "🎯"
---

# Lead Finder

Research companies, find decision makers, and build structured outreach target lists.

## INPUT

Parse `$ARGUMENTS` for target criteria. Expected formats:

- `"vacation rental property managers in Hawaii"`
- `"SaaS startups in Austin TX with 10-50 employees"`
- `"dentists in Portland Oregon"`
- `"e-commerce brands selling outdoor gear"`

Extract these dimensions from the arguments:

| Dimension | Example |
|-----------|---------|
| **Industry/niche** | vacation rental management, dental practice, SaaS |
| **Location** | Hawaii, Austin TX, Portland Oregon |
| **Company type** | property managers, startups, agencies |
| **Size filter** (optional) | small business, 10-50 employees, solo practitioner |
| **Role targets** (optional) | owner, CEO, CTO, operations manager |

If role targets aren't specified, default to: **Owner, CEO, Founder, General Manager, Operations Manager**.

## RESEARCH — Company Discovery

Find 10-20 companies matching the criteria. Use multiple search strategies:

### Step 1: Direct web search

Run 3-5 varied searches to get broad coverage:

```
WebSearch: "{industry} {location}"
WebSearch: "best {company_type} in {location}"
WebSearch: "{industry} companies {location} list"
WebSearch: "top {company_type} {location} directory"
WebSearch: "{niche} {location} reviews"
```

### Step 2: Directory and listing searches

```
WebSearch: "site:yelp.com {industry} {location}"
WebSearch: "site:bbb.org {industry} {location}"
WebSearch: "{industry} association {location} members"
WebSearch: "{industry} {location} directory"
```

### Step 3: Compile the company list

For each company found, record:
- **Company name**
- **Website URL** (from search results)
- **Source** (where you found them — Yelp, BBB, Google, directory)

Deduplicate by domain name. Aim for 10-20 unique companies.

### Step 4: Prioritize

Rank companies by relevance signals:
- Exact match to specified criteria
- Active web presence (real website, not just a Yelp listing)
- Appears in multiple sources
- Has enough info to find contacts

Take the top 10-15 for enrichment.

## ENRICHMENT — Contact & Company Details

For each company in the prioritized list, gather details in this order:

### Company profile

Fetch the company website and extract:

```
WebFetch: company website → "Extract: company description, services offered, team size indicators,
technology used, year founded, locations. Look for About page, Team page, and footer info."
```

Record:
- **Description** (1-2 sentences about what they do)
- **Services/products** offered
- **Size indicators** (team page headcount, "we're a team of X", office locations)
- **Tech stack clues** (powered by X, built with Y, integrations listed)

### Decision maker identification

Search for people at the company:

```
WebSearch: "{company name} owner"
WebSearch: "{company name} CEO founder"
WebSearch: "site:linkedin.com {company name} {role}"
```

Fetch the company's team/about page if it exists:

```
WebFetch: "{company_url}/about" → "List all people with their names and titles"
WebFetch: "{company_url}/team" → "List all people with their names and titles"
WebFetch: "{company_url}/about-us" → "List all people with their names and titles"
```

Record for each decision maker:
- **Full name**
- **Title/role**
- **LinkedIn URL** (if found)

### Email discovery

Try these methods in order for each contact:

**Method 1: Website contact info**
```
WebFetch: "{company_url}/contact" → "Extract all email addresses"
WebFetch: company website → "Extract email addresses from the page source, footer, contact section"
```

**Method 2: Email pattern generation**
Given the company domain (e.g., `example.com`) and contact name (e.g., `John Smith`), generate common patterns:
- `john@example.com`
- `john.smith@example.com`
- `jsmith@example.com`
- `johns@example.com`
- `john.s@example.com`
- `info@example.com` (fallback)

**Method 3: Web search for email**
```
WebSearch: "{person name} {company name} email"
WebSearch: "{person name} {company name} contact"
WebSearch: "@{domain}" "{person name}"
```

Record:
- **Email** (confirmed or best-guess pattern)
- **Email confidence**: `confirmed` (found on website/public source), `pattern` (generated from common formats), `unknown` (no email found)

### Personalization hooks

For each company, search for recent context:

```
WebSearch: "{company name} news"
WebSearch: "{company name} {industry} 2025 2026"
```

Look for:
- Recent news, awards, or milestones
- Pain points common to their industry/size
- Technology they use (from their website)
- Growth signals (hiring, new locations, funding)

Record 1-3 personalization hooks per company.

## OUTPUT — Structured Target List

### Summary table

Write a markdown summary table:

```markdown
# Lead Research: {criteria}
**Date:** {today's date}
**Criteria:** {full search criteria}
**Companies found:** {count}

## Target List

| # | Company | Website | Contact | Title | Email | Confidence | Score |
|---|---------|---------|---------|-------|-------|------------|-------|
| 1 | Acme Corp | acme.com | John Smith | CEO | john@acme.com | confirmed | 9/10 |
| 2 | Beta LLC | beta.io | Jane Doe | Owner | jane@beta.io | pattern | 7/10 |
```

### Detailed profiles

After the table, include a detailed profile for each company:

```markdown
---

### 1. Acme Corp
**Website:** https://acme.com
**LinkedIn:** https://linkedin.com/company/acme-corp
**Description:** Full-service vacation rental management company operating 50+ properties across Maui and Oahu.
**Size:** ~15 employees (based on team page)
**Services:** Property management, guest communication, cleaning coordination, revenue optimization
**Tech stack:** Guesty PMS, Airbnb/VRBO listings, WordPress website

**Decision Maker:**
- **Name:** John Smith
- **Title:** CEO & Founder
- **Email:** john@acme.com (confirmed — found on contact page)
- **LinkedIn:** https://linkedin.com/in/johnsmith

**Relevance Score:** 9/10
- ✅ Exact industry match
- ✅ Right location
- ✅ Active web presence
- ✅ Decision maker identified with confirmed email

**Personalization Hooks:**
- Recently expanded to Big Island properties (news article from Jan 2026)
- Uses Guesty — could discuss integration opportunities
- Active on social media, posts about industry challenges
```

### Relevance scoring

Score each company 1-10 based on:
- **Industry match** (0-3): How closely they match the specified industry/niche
- **Location match** (0-2): Exact location match vs. nearby/regional
- **Contact quality** (0-3): Confirmed email > pattern email > no email; named contact > generic
- **Engagement potential** (0-2): Active web presence, recent activity, size fit

## TRACKING — Save Results

Save the complete target list to the caller's space knowledge directory:

```
Write: {space_knowledge_dir}/leads-{slugified-criteria}.md
```

The file path should be provided by the caller or inferred from context. If working within a space, save to that space's `knowledge/` directory. If no space context, save to the current working directory.

Also output the full results to the conversation so the caller can see them immediately.

## PROCESS SUMMARY

1. Parse criteria from `$ARGUMENTS`
2. Run 5-8 web searches to discover companies
3. Deduplicate and prioritize top 10-15
4. For each company: fetch website, find decision makers, discover emails, find personalization hooks
5. Score relevance for each lead
6. Generate summary table + detailed profiles
7. Save to knowledge file
8. Present results

## GOTCHAS

- **Rate limiting**: Space out WebFetch calls. If a fetch fails, skip and note it rather than retrying endlessly.
- **Email accuracy**: Always mark confidence level. Never claim a pattern-generated email is confirmed.
- **Stale data**: Web search results may reference outdated info. Note if a company website appears abandoned or outdated.
- **LinkedIn limitations**: LinkedIn pages often block scraping. Record the URL but don't depend on fetching full profile data.
- **Small businesses**: Many small businesses lack a team page. The owner's name often appears on the About page, Yelp listing, or BBB profile instead.
- **Privacy**: This skill finds publicly available business contact information only. Do not attempt to access private databases or paid lookup services.
