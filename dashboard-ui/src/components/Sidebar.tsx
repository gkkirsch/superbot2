import { useState, useEffect, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, Sun, Moon, Menu, X, Star } from 'lucide-react'
import { topNavItems, docsNavItem } from '@/lib/navigation'
import { usePlugins, useSpaces, useEscalations } from '@/hooks/useSpaces'
import { useTheme } from '@/hooks/useTheme'

const STORAGE_KEY = 'superbot-sidebar-collapsed'
const STARRED_KEY = 'superbot-starred-spaces'

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function getStarredSpaces(): Set<string> {
  try {
    const stored = localStorage.getItem(STARRED_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [starred, setStarred] = useState(getStarredSpaces)
  const location = useLocation()
  const { data: plugins } = usePlugins()
  const { data: spaces } = useSpaces()
  const { data: needsHumanEscalations } = useEscalations('needs_human')
  const { theme, toggleTheme } = useTheme()

  const hasPluginWarnings = plugins?.some(p => p.installed && (p.hasUnconfiguredCredentials || p.hasMissingBins)) ?? false

  // Count needs_human escalations per space for blocked indicators
  const blockedBySpace = useMemo(() => {
    const counts = new Map<string, number>()
    if (!needsHumanEscalations) return counts
    for (const esc of needsHumanEscalations) {
      counts.set(esc.space, (counts.get(esc.space) || 0) + 1)
    }
    return counts
  }, [needsHumanEscalations])

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  // Persist starred spaces
  useEffect(() => {
    localStorage.setItem(STARRED_KEY, JSON.stringify([...starred]))
  }, [starred])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  const toggleStar = (slug: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStarred(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  // Sort spaces: starred first, then alphabetical
  const sortedSpaces = useMemo(() => {
    if (!spaces) return []
    return [...spaces].sort((a, b) => {
      const aStarred = starred.has(a.slug)
      const bStarred = starred.has(b.slug)
      if (aStarred && !bStarred) return -1
      if (!aStarred && bStarred) return 1
      return a.name.localeCompare(b.name)
    })
  }, [spaces, starred])

  // Nav items excluding Spaces (rendered separately) and Docs (bottom section)
  const mainNavItems = topNavItems.filter(item => item.to !== '/spaces')

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Collapse toggle — above the logo, top-right */}
      <div className={`hidden md:flex items-center px-2 pt-2 pb-0 shrink-0 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 rounded-md text-stone/40 hover:text-parchment hover:bg-surface transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Logo / Icon */}
      <div className="flex items-center justify-center px-3 pt-2 pb-6 shrink-0">
        {collapsed ? (
          <NavLink to="/" className="block hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="SB" className="h-8 w-8" />
          </NavLink>
        ) : (
          <NavLink to="/" className="block hover:opacity-80 transition-opacity">
            <img src="/superbot-logo.png" alt="Superbot" className="h-6" />
          </NavLink>
        )}
      </div>

      {/* Nav items */}
      <nav className="px-2 space-y-1 shrink-0">
        {mainNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={() =>
              `flex items-center gap-3 rounded-md text-sm transition-colors relative group/item ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
              } ${
                isActive(to, end)
                  ? 'bg-sand/15 text-sand font-medium'
                  : 'text-stone hover:text-parchment hover:bg-surface'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
            {to === '/skills' && hasPluginWarnings && (
              <span className={`h-2 w-2 rounded-full bg-amber-400 ${collapsed ? 'absolute top-1 right-1' : ''}`} />
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border-custom rounded text-xs text-parchment whitespace-nowrap opacity-0 pointer-events-none group-hover/item:opacity-100 transition-opacity z-50 shadow-lg">
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Spaces section — only when expanded */}
      {!collapsed && (
        <div className="mt-4 flex-1 min-h-0 flex flex-col">
          <button
            onClick={() => setSpacesOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-1.5 text-xs text-stone/70 uppercase tracking-wider hover:text-stone transition-colors w-full"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${spacesOpen ? '' : '-rotate-90'}`} />
            Spaces
          </button>
          {spacesOpen && (
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
              {sortedSpaces.map(space => (
                <NavLink
                  key={space.slug}
                  to={`/spaces/${space.slug}`}
                  className={() =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors group/space ${
                      isActive(`/spaces/${space.slug}`)
                        ? 'bg-sand/15 text-sand font-medium'
                        : 'text-stone hover:text-parchment hover:bg-surface'
                    }`
                  }
                >
                  <span className="truncate flex-1">{space.name}</span>
                  {blockedBySpace.has(space.slug) && (
                    <span
                      className="shrink-0 h-2 w-2 rounded-full bg-ember"
                      title={`${blockedBySpace.get(space.slug)} blocked`}
                    />
                  )}
                  <button
                    onClick={(e) => toggleStar(space.slug, e)}
                    className={`shrink-0 transition-colors ${
                      starred.has(space.slug)
                        ? 'text-sand'
                        : 'text-transparent group-hover/space:text-stone/30 hover:!text-sand'
                    }`}
                    title={starred.has(space.slug) ? 'Unstar' : 'Star'}
                  >
                    <Star className={`h-3 w-3 ${starred.has(space.slug) ? 'fill-sand' : ''}`} />
                  </button>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsed: just show spaces icon */}
      {collapsed && (
        <div className="px-2 mt-4">
          <NavLink
            to="/spaces"
            title="Spaces"
            className={() =>
              `flex items-center justify-center px-2 py-2.5 rounded-md text-sm transition-colors relative group/item ${
                isActive('/spaces')
                  ? 'bg-sand/15 text-sand font-medium'
                  : 'text-stone hover:text-parchment hover:bg-surface'
              }`
            }
          >
            {topNavItems.find(i => i.to === '/spaces')?.icon &&
              (() => {
                const SpacesIcon = topNavItems.find(i => i.to === '/spaces')!.icon
                return <SpacesIcon className="h-4 w-4 shrink-0" />
              })()
            }
            {blockedBySpace.size > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-ember" />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border-custom rounded text-xs text-parchment whitespace-nowrap opacity-0 pointer-events-none group-hover/item:opacity-100 transition-opacity z-50 shadow-lg">
              Spaces
            </div>
          </NavLink>
        </div>
      )}

      {/* Bottom section: docs + theme toggle + collapse */}
      <div className="px-2 pb-3 pt-2 space-y-1 border-t border-border-custom mt-auto shrink-0">
        {/* Docs link */}
        <NavLink
          to={docsNavItem.to}
          title={collapsed ? docsNavItem.label : undefined}
          className={() =>
            `flex items-center gap-3 rounded-md text-sm transition-colors relative group/item ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
            } ${
              isActive(docsNavItem.to)
                ? 'bg-sand/15 text-sand font-medium'
                : 'text-stone hover:text-parchment hover:bg-surface'
            }`
          }
        >
          <docsNavItem.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{docsNavItem.label}</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border-custom rounded text-xs text-parchment whitespace-nowrap opacity-0 pointer-events-none group-hover/item:opacity-100 transition-opacity z-50 shadow-lg">
              {docsNavItem.label}
            </div>
          )}
        </NavLink>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
          className={`flex items-center gap-3 w-full rounded-md text-sm text-stone hover:text-parchment hover:bg-surface transition-colors relative group/item ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
          }`}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border-custom rounded text-xs text-parchment whitespace-nowrap opacity-0 pointer-events-none group-hover/item:opacity-100 transition-opacity z-50 shadow-lg">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </div>
          )}
        </button>

      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-ink border-r border-border-custom h-screen sticky top-0 z-40 transition-all duration-300 shrink-0 overflow-hidden ${
          collapsed ? 'w-14' : 'w-60'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-surface border border-border-custom text-stone hover:text-parchment transition-colors shadow-lg"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="w-60 h-full bg-ink border-r border-border-custom shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end p-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-md text-stone hover:text-parchment hover:bg-surface transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
