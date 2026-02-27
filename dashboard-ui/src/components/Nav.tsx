import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { topNavItems, docsNavItem } from '@/lib/navigation'
import { usePlugins } from '@/hooks/useSpaces'
import { useTelegram } from '@/hooks/useTelegram'

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { data: plugins } = usePlugins()
  const { isTelegram, user } = useTelegram()

  const hasPluginWarnings = plugins?.some(p => p.installed && (p.hasUnconfiguredCredentials || p.hasMissingBins)) ?? false

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  return (
    <nav className="border-b border-border-custom bg-ink sticky top-0 z-50">
      <div className={`mx-auto px-6 flex items-center gap-8 ${isTelegram ? 'max-w-full px-3 h-11' : 'max-w-7xl h-14'}`}>
        <NavLink to="/" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
          <img src="/superbot-logo.png" alt="Superbot" className={isTelegram ? 'h-5' : 'h-6'} />
        </NavLink>

        {/* Desktop nav -- hidden in Telegram (mobile-only there) */}
        {!isTelegram && (
          <div className="hidden md:flex items-center gap-1">
            {topNavItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={() =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors relative ${
                    isActive(to, end)
                      ? 'bg-sand/15 text-sand font-medium'
                      : 'text-stone hover:text-parchment hover:bg-surface'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {to === '/skills' && hasPluginWarnings && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" />
                )}
              </NavLink>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Telegram user name */}
        {isTelegram && user && (
          <span className="text-xs text-stone truncate max-w-[120px]">
            {user.first_name}
          </span>
        )}

        {/* Docs link — far right, desktop only */}
        {!isTelegram && (
          <NavLink
            to={docsNavItem.to}
            className={({ isActive }) =>
              `hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-sand/15 text-sand font-medium'
                  : 'text-stone hover:text-parchment hover:bg-surface'
              }`
            }
          >
            <docsNavItem.icon className="h-4 w-4" />
            {docsNavItem.label}
          </NavLink>
        )}

        {/* Mobile hamburger -- always shown on small screens, also in Telegram */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`p-2 text-stone hover:text-parchment transition-colors ${isTelegram ? '' : 'md:hidden'}`}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className={`border-t border-border-custom bg-ink px-6 py-4 space-y-1 ${isTelegram ? '' : 'md:hidden'}`}>
          {[...topNavItems, docsNavItem].map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileOpen(false)}
              className={() =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors relative ${
                  isActive(to, end)
                    ? 'bg-sand/15 text-sand font-medium'
                    : 'text-stone hover:text-parchment hover:bg-surface'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              {to === '/skills' && hasPluginWarnings && (
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              )}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  )
}
