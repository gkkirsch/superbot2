# Contributing to Superbot2

Thanks for your interest in contributing to Superbot2! This guide covers everything you need to get started.

## Prerequisites

- **macOS** (primary supported platform)
- **Node.js v18+** (v22 recommended)
- **git**
- **jq** (`brew install jq`)
- **Claude Code** (installed automatically by `install.sh` if missing)

## Getting Started

### Clone the repo

```bash
git clone https://github.com/gkkirsch/superbot2.git
cd superbot2
```

### Install dependencies

```bash
# Dashboard API server
cd dashboard
npm install

# Dashboard UI (Vite + React)
cd ../dashboard-ui
npm install
```

### Install pre-commit hooks

[Lefthook](https://github.com/evilmartians/lefthook) is used for pre-commit hooks (TypeScript typecheck on `dashboard-ui/`). It is included as a dev dependency in `dashboard-ui/`:

```bash
cd dashboard-ui
npx lefthook install
```

## Running Locally

### Dashboard dev server (most common)

From the `dashboard-ui/` directory:

```bash
npm run dev
```

This starts both the Express API server on **port 3274** and the Vite dev server on **port 5173** using `concurrently`. The Vite dev server proxies API requests to the Express server.

You can also run services individually (`npm run dev:api` or `npm run dev:ui`) or build for production with `npm run build` (runs `tsc` + `vite build`).

To run the full orchestrator with dashboard, heartbeat, and agents, use the `superbot2` CLI after running the installer. See the [README](README.md) for details.

## Pull Request Process

### Branch naming

Use the format `space/project-name` matching the space and project you are working on:

```
meta/repo-cleanup
meta/dashboard-escalation-ux
meta/landing-page
```

### Commit messages

Follow the `[space/project] description` convention:

```
[meta/repo-cleanup] remove electron/dist/ from git tracking
[meta/dashboard-escalation-ux] improve social media draft cards
[meta/goal-dashboard-card] add cross-space goals aggregation endpoint
```

- Use lowercase description starting with a verb (add, fix, update, remove, refactor)
- Keep the first line under 80 characters
- Use `fix` for bug fixes, `add` for new features, `update` for enhancements, `remove` for deletions, `refactor` for restructuring

### What to include in PRs

- A clear description of what changed and why
- Verify `npm run build` passes in `dashboard-ui/` (the pre-commit hook runs `tsc --noEmit`)
- Test any dashboard changes locally before opening the PR
- Keep PRs focused on a single concern when possible

## Code Style

### TypeScript

- Strict mode is enabled (`strict: true` in tsconfig)
- Target: ES2022, module: ESNext
- No unused locals or parameters (`noUnusedLocals`, `noUnusedParameters`)
- Use path aliases: `@/*` maps to `src/*` in dashboard-ui
- ESLint is configured; run `npm run lint` in `dashboard-ui/`

### React

- React 19 with functional components and hooks
- React Router v7 for routing
- TanStack Query (React Query) for server state
- Lucide React for icons
- Prefer small, focused components in `src/components/` or feature-specific directories under `src/features/`

### Tailwind CSS

- Tailwind CSS **v4** (uses the Vite plugin `@tailwindcss/vite`, not a PostCSS config)
- Utility-first approach
- Use `clsx` and `tailwind-merge` for conditional class composition
- Use `class-variance-authority` (CVA) for component variants

### Express backend

- Express **v5** with plain JavaScript (no TypeScript on the server)
- ES modules (`"type": "module"` in package.json)
- Single-file server at `dashboard/server.js`
- Uses `multer` for file uploads, `js-yaml` for YAML parsing

## Project Structure

```
superbot2/
  agents/          Agent definitions (team-lead, space-worker, etc.)
  checklists/      Task completion checklists
  dashboard/       Express.js API server (server.js)
  dashboard-ui/    Vite + React + Tailwind dashboard
    src/
      components/  Shared UI components
      features/    Feature-specific modules
      hooks/       Custom React hooks
      pages/       Route-level page components
      lib/         Utility functions
  docs/            Architecture documentation
  electron/        macOS tray app (Electron)
  hooks/           Claude Code hooks
  knowledge/       Shared knowledge files
  landing/         Public landing page (static HTML)
  scripts/         Setup, heartbeat, scheduler, utility scripts
  skills/          Deployable Claude Code skills
  spaces/          Project space definitions
  templates/       Guide templates
```

### Key files

| File | Purpose |
|---|---|
| `superbot2` | Main CLI executable |
| `install.sh` | Curl-able installer script |
| `lefthook.yml` | Pre-commit hook configuration |
| `dashboard/server.js` | Express API server |
| `dashboard-ui/src/App.tsx` | Dashboard app entry point |
| `start-dashboard.sh` | Script to launch the dashboard |

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
