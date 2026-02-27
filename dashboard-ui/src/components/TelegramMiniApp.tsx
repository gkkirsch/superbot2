import { useState } from 'react'
import { MessageCircle, AlertTriangle, LayoutDashboard } from 'lucide-react'
import { ChatSection } from '@/features/ChatSection'
import { CombinedEscalationsSection } from '@/features/CombinedEscalationsSection'
import { useTelegram } from '@/hooks/useTelegram'

type Tab = 'chat' | 'escalations' | 'dashboard'

export function TelegramMiniApp() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const { user } = useTelegram()

  return (
    <div className="flex flex-col h-[100vh] bg-ink overflow-hidden">
      {/* Compact header */}
      <div className="shrink-0 border-b border-border-custom bg-ink px-3 py-2 flex items-center gap-2">
        <img src="/superbot-logo.png" alt="Superbot" className="h-5" />
        {user && (
          <span className="text-xs text-stone ml-auto truncate">
            {user.first_name}
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'chat' && (
          <div className="h-full">
            <ChatSection />
          </div>
        )}
        {activeTab === 'escalations' && (
          <div className="p-3">
            <CombinedEscalationsSection filters={new Set(['needs_review', 'orchestrator'])} />
          </div>
        )}
        {activeTab === 'dashboard' && (
          <div className="p-3">
            <MiniDashboard />
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="shrink-0 border-t border-border-custom bg-ink flex">
        <TabButton
          active={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          icon={MessageCircle}
          label="Chat"
        />
        <TabButton
          active={activeTab === 'escalations'}
          onClick={() => setActiveTab('escalations')}
          icon={AlertTriangle}
          label="Escalations"
        />
        <TabButton
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          icon={LayoutDashboard}
          label="Dashboard"
        />
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
        active ? 'text-sand' : 'text-stone'
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}

function MiniDashboard() {
  return (
    <div className="space-y-4 text-sm text-parchment">
      <p className="text-stone text-xs">
        For the full dashboard experience, open in a browser.
      </p>
      <div className="space-y-3">
        <CombinedEscalationsSection filters={new Set(['needs_review'])} />
      </div>
    </div>
  )
}
