import {
  MessageCircle, AtSign, Hash, Share2, Heart, Repeat,
  FileText, PenLine, Newspaper, BookOpen, Type,
  Database, BarChart3, Table, PieChart, TrendingUp,
  Bot, Zap, Cog, Timer, Workflow,
  Mail, Bell, Megaphone, Send,
  Eye, Radar, Activity, Shield, Search,
  Puzzle, Globe, Star, Flag, Target, Trophy, Rocket, Sparkles,
  Wand2, Layers, Package, Code2, Terminal, GitBranch, Cpu,
  type LucideIcon,
} from 'lucide-react'

export interface SkillIconEntry {
  name: string
  icon: LucideIcon
  category: string
}

export const SKILL_ICON_CATEGORIES = [
  'Social Media',
  'Content',
  'Data',
  'Automation',
  'Communication',
  'Monitoring',
  'General',
] as const

export const SKILL_ICONS: SkillIconEntry[] = [
  // Social Media
  { name: 'message-circle', icon: MessageCircle, category: 'Social Media' },
  { name: 'at-sign', icon: AtSign, category: 'Social Media' },
  { name: 'hash', icon: Hash, category: 'Social Media' },
  { name: 'share-2', icon: Share2, category: 'Social Media' },
  { name: 'heart', icon: Heart, category: 'Social Media' },
  { name: 'repeat', icon: Repeat, category: 'Social Media' },

  // Content
  { name: 'file-text', icon: FileText, category: 'Content' },
  { name: 'pen-line', icon: PenLine, category: 'Content' },
  { name: 'newspaper', icon: Newspaper, category: 'Content' },
  { name: 'book-open', icon: BookOpen, category: 'Content' },
  { name: 'type', icon: Type, category: 'Content' },

  // Data
  { name: 'database', icon: Database, category: 'Data' },
  { name: 'bar-chart-3', icon: BarChart3, category: 'Data' },
  { name: 'table', icon: Table, category: 'Data' },
  { name: 'pie-chart', icon: PieChart, category: 'Data' },
  { name: 'trending-up', icon: TrendingUp, category: 'Data' },

  // Automation
  { name: 'bot', icon: Bot, category: 'Automation' },
  { name: 'zap', icon: Zap, category: 'Automation' },
  { name: 'cog', icon: Cog, category: 'Automation' },
  { name: 'timer', icon: Timer, category: 'Automation' },
  { name: 'workflow', icon: Workflow, category: 'Automation' },

  // Communication
  { name: 'mail', icon: Mail, category: 'Communication' },
  { name: 'bell', icon: Bell, category: 'Communication' },
  { name: 'megaphone', icon: Megaphone, category: 'Communication' },
  { name: 'send', icon: Send, category: 'Communication' },

  // Monitoring
  { name: 'eye', icon: Eye, category: 'Monitoring' },
  { name: 'radar', icon: Radar, category: 'Monitoring' },
  { name: 'activity', icon: Activity, category: 'Monitoring' },
  { name: 'shield', icon: Shield, category: 'Monitoring' },
  { name: 'search', icon: Search, category: 'Monitoring' },

  // General
  { name: 'puzzle', icon: Puzzle, category: 'General' },
  { name: 'globe', icon: Globe, category: 'General' },
  { name: 'star', icon: Star, category: 'General' },
  { name: 'flag', icon: Flag, category: 'General' },
  { name: 'target', icon: Target, category: 'General' },
  { name: 'trophy', icon: Trophy, category: 'General' },
  { name: 'rocket', icon: Rocket, category: 'General' },
  { name: 'sparkles', icon: Sparkles, category: 'General' },
  { name: 'wand-2', icon: Wand2, category: 'General' },
  { name: 'layers', icon: Layers, category: 'General' },
  { name: 'package', icon: Package, category: 'General' },
  { name: 'code-2', icon: Code2, category: 'General' },
  { name: 'terminal', icon: Terminal, category: 'General' },
  { name: 'git-branch', icon: GitBranch, category: 'General' },
  { name: 'cpu', icon: Cpu, category: 'General' },
]

const ICON_MAP = new Map(SKILL_ICONS.map(e => [e.name, e.icon]))

/** Resolve a Lucide icon by name string. Returns Puzzle as fallback. */
export function getSkillIcon(name?: string | null): LucideIcon {
  if (!name) return Puzzle
  return ICON_MAP.get(name) || Puzzle
}
