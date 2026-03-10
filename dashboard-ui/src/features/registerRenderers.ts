// Register all built-in card renderers.
// Import this once at app startup (e.g., in DashboardSections.tsx).

import { registerRenderer } from './cardRenderers'
import { CardSkillSection } from './CardSection'
import { GoalRenderer } from './GoalSection'
import { GitHubPrsRenderer } from './GitHubPrsRenderer'

registerRenderer('default', CardSkillSection)
registerRenderer('goal-tracker', GoalRenderer)
registerRenderer('github-prs', GitHubPrsRenderer)
