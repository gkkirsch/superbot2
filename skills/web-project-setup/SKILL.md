---
name: web-project-setup
description: "Use when setting up a new web project. Scaffolds a Vite + React + Tailwind project with the standard stack."
---

# Web Project Setup

## Stack

Every web project uses this stack unless the user says otherwise:

- **Runtime**: Node.js
- **Framework**: React (with Vite)
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Fonts**: Google Fonts (via @fontsource or direct import)
- **API**: Express
- **Validation**: Zod
- **Language**: TypeScript

## Scaffold Steps

### 1. Create the Vite project

```bash
npm create vite@latest . -- --template react-ts
npm install
```

### 2. Install core dependencies

```bash
# Styling
npm install tailwindcss @tailwindcss/vite

# shadcn prerequisites
npm install class-variance-authority clsx tailwind-merge

# Icons
npm install lucide-react

# Validation
npm install zod

# API (if needed)
npm install express
npm install -D @types/express
```

### 3. Configure Tailwind

Add the Tailwind plugin to `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

Replace the contents of `src/index.css` with:

```css
@import "tailwindcss";
```

### 4. Set up shadcn

```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

Add components as needed:
```bash
npx shadcn@latest add button card input label
```

### 5. Set up Google Fonts

Add to `index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Add to Tailwind config or CSS:
```css
@theme {
  --font-sans: "Inter", sans-serif;
}
```

### 6. Utility helper

Create `src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 7. Project structure

```
src/
  components/       # Reusable components
    ui/             # shadcn components
  lib/              # Utilities (utils.ts, validators, etc.)
  pages/            # Page components
  hooks/            # Custom React hooks
  api/              # API client functions
  types/            # TypeScript types
  App.tsx
  main.tsx
  index.css
```

## Conventions

- Use `cn()` for conditional class merging
- Use Zod schemas for all form validation and API request/response types
- Use Lucide icons, never inline SVGs
- Keep components small and composable
- Use shadcn components as base, customize with Tailwind
- Server code goes in a separate `server/` directory if the project has a backend
