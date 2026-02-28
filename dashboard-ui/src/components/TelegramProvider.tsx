import type { ReactNode } from 'react'
import { TelegramContext, useTelegramInit } from '@/hooks/useTelegram'

export function TelegramProvider({ children }: { children: ReactNode }) {
  const telegram = useTelegramInit()
  return (
    <TelegramContext.Provider value={telegram}>
      {children}
    </TelegramContext.Provider>
  )
}
