# Conventions

## Default Web Stack

All web projects use this stack unless explicitly overridden:

- **Runtime**: Node.js
- **Framework**: React (with Vite)
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Fonts**: Google Fonts (Inter as default)
- **API**: Express
- **Validation**: Zod
- **Language**: TypeScript

When starting a new web project, use the `web-project-setup` skill to scaffold it.

## Default Database

- **Database**: PostgreSQL (prefer over SQLite for all backends)

Use Postgres even for simple projects — it's the default. Only use SQLite if there's a specific reason (e.g., embedded/local-only with no server).

## Git Workflow

All development must use feature branches. Never commit directly to `main`.

- At session start: `git branch --show-current` — if on main, create a branch immediately
- Use descriptive branch names matching the project: `hostaway-integration`, `facebook-gtm`, etc.
- All commits go on the branch
- When work is complete: create a PR or escalation requesting merge — workers never self-merge
- User reviews and merges

This applies to all spaces and all projects.
