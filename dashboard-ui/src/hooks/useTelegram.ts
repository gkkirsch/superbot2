import { createContext, useContext, useEffect, useState } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramState {
  isTelegram: boolean
  initData: string
  user: TelegramUser | null
  themeParams: Record<string, string>
}

const defaultState: TelegramState = {
  isTelegram: false,
  initData: '',
  user: null,
  themeParams: {},
}

export const TelegramContext = createContext<TelegramState>(defaultState)

export function useTelegram() {
  return useContext(TelegramContext)
}

export function useTelegramInit(): TelegramState {
  const [state, setState] = useState<TelegramState>(defaultState)

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (!tg?.initData) return

    // We're inside Telegram
    tg.ready()
    tg.expand()

    // Parse user from initDataUnsafe (safe to read client-side for display;
    // actual auth happens server-side via HMAC validation)
    const user = tg.initDataUnsafe?.user || null
    const themeParams = tg.themeParams || {}

    // Apply Telegram theme as CSS custom properties
    applyTelegramTheme(themeParams)

    // Increase base font size for Telegram Mini App readability
    // Tailwind utilities (text-sm, text-xs, etc.) use rem, so scaling the root
    // font-size makes everything proportionally larger.
    document.documentElement.style.fontSize = '20px'
    document.body.classList.add('telegram')

    setState({
      isTelegram: true,
      initData: tg.initData,
      user,
      themeParams,
    })
  }, [])

  return state
}

function applyTelegramTheme(params: Record<string, string>) {
  const root = document.documentElement

  // Map Telegram themeParams to our CSS custom properties (HSL format)
  // Telegram provides hex colors; we convert to HSL values for our existing system
  const mappings: Array<[string, string]> = [
    ['bg_color', '--background'],
    ['secondary_bg_color', '--card'],
    ['text_color', '--foreground'],
    ['hint_color', '--muted-foreground'],
    ['button_color', '--primary'],
    ['button_text_color', '--primary-foreground'],
    ['link_color', '--ring'],
  ]

  for (const [tgKey, cssVar] of mappings) {
    const hex = params[tgKey]
    if (!hex) continue
    const hsl = hexToHsl(hex)
    if (hsl) root.style.setProperty(cssVar, hsl)
  }

  // Also set raw hex values as tg-specific vars for direct use
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      root.style.setProperty(`--tg-${key.replace(/_/g, '-')}`, value)
    }
  }

  // Set body background to match Telegram
  if (params.bg_color) {
    document.body.style.backgroundColor = params.bg_color
  }
}

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null

  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
