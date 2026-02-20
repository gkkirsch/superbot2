# User Preferences

## Technical Stack
- PostgreSQL over SQLite for backends
- Default web stack: Node.js, React (Vite), Tailwind CSS v4, shadcn/ui, Lucide React, Inter font, Express, Zod, TypeScript
- Use `web-project-setup` skill to scaffold new web projects
- Prefers CLI/skill approach over MCP servers where possible
- Prefers agent-browser plugin over claude-in-chrome MCP for browser automation

## Design
- Cares about visual quality — explicit about poor default AI-generated designs
- Uses professional design plugin for redesigns

## Workflow
- Decisive about scope — will cancel features outright if not needed
- Prefers clear ownership boundaries between projects
- Wants visibility into orchestrator decisions
- Wants dashboard chat for messaging orchestrator
- Wants dedicated dev server ports per space to avoid conflicts
- Wants superbot2 packaged for easy single-command install

## Escalations
- Orchestrator should ONLY resolve if answer is explicitly in knowledge files or directly stated by user
- Do NOT resolve based on judgment or "reasonable defaults"
- Always triage untriaged/ before shutting down workers
- Dashboard must show orchestrator-resolved escalations for user visibility

## Plugin/Skill Curation
- Methodical, one at a time — no bulk-import or auto-curation
- Process: research → present findings → user decides → user tests → include in marketplace
- Wants single marketplace with categories, not multiple separate ones

## Dev Server Ports
- kidsvids: 5173
- supercharge: 5174
- dashboard: 3274
