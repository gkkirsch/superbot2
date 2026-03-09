import type { ComponentType } from 'react'
import type { CardDefinition } from '@/lib/types'

// Card renderer registry
// Maps renderer names (from superbot.json card.renderer) to React components.
// Each renderer receives a CardDefinition and renders all items for that card.

export interface CardRendererProps {
  card: CardDefinition
}

const registry: Record<string, ComponentType<CardRendererProps>> = {}

export function registerRenderer(name: string, component: ComponentType<CardRendererProps>) {
  registry[name] = component
}

export function getRenderer(name: string): ComponentType<CardRendererProps> | undefined {
  return registry[name]
}

export function getRendererOrDefault(name?: string): ComponentType<CardRendererProps> | undefined {
  if (name && registry[name]) return registry[name]
  return registry['default']
}
