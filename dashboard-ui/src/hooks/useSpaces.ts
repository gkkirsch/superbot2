import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSpaces, fetchSpace, fetchSpaceOverview, fetchProjectTasks,
  fetchEscalations, fetchSpaceEscalations, fetchAllTasks,
  fetchIdentity, fetchUser, fetchMemory, fetchOrchestratorPrompt, fetchWorkerPrompt,
  fetchProjectPlan, fetchProjectDocuments,
  fetchServerStatus,
  fetchSchedule,
  fetchSystemStatus,
  fetchHeartbeatConfig,
  fetchHeartbeatActivity,
  fetchActivity,
  fetchSkills,
  fetchAgents,
  fetchHooks,
  fetchPlugins,
  fetchMarketplaces,
  fetchSessions,
  fetchSuperbotSkills,
  fetchMessages,
  fetchDashboardConfig,
  saveDashboardConfig,
  fetchTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  fetchPluginCredentials,
  fetchKnowledge,
  saveKnowledgeFile,
  deleteKnowledgeFile,
  createKnowledgeFile,
  saveUser,
  fetchActiveWorkers,
  uploadKnowledgeFile,
  fetchAutoTriageRules,
  deleteAutoTriageRule,
  updateAutoTriageRule,
  fetchCards,
  fetchCardItems,
  updateCardItem,
  deleteCardItem,
  createCardItem,
  refreshCardItems,
  fetchSkillManifest,
  fetchSkillSettings,
  saveSkillSettings,
  fetchSkillSchedules,
  toggleSkillSchedule,
  fetchBacklog,
  addBacklogItem,
  updateBacklogItem,
  deleteBacklogItem,
  promoteBacklogItem,
  fetchLatestFiles,
} from '@/lib/api'
import type { DashboardConfig, TodoItem, BacklogItem } from '@/lib/types'

// --- Context files ---

export function useIdentity() {
  return useQuery({ queryKey: ['context', 'identity'], queryFn: fetchIdentity, staleTime: 60_000 })
}

export function useUser() {
  return useQuery({ queryKey: ['context', 'user'], queryFn: fetchUser, staleTime: 60_000 })
}

export function useMemory() {
  return useQuery({ queryKey: ['context', 'memory'], queryFn: fetchMemory, staleTime: 60_000 })
}

export function useOrchestratorPrompt() {
  return useQuery({ queryKey: ['context', 'orchestrator-prompt'], queryFn: fetchOrchestratorPrompt, staleTime: 60_000 })
}

export function useWorkerPrompt() {
  return useQuery({ queryKey: ['context', 'worker-prompt'], queryFn: fetchWorkerPrompt, staleTime: 60_000 })
}

// --- Spaces ---

export function useSpaces() {
  return useQuery({ queryKey: ['spaces'], queryFn: fetchSpaces, staleTime: 30_000 })
}

export function useSpace(slug: string) {
  return useQuery({ queryKey: ['space', slug], queryFn: () => fetchSpace(slug), enabled: !!slug, staleTime: 30_000 })
}

export function useSpaceOverview(slug: string) {
  return useQuery({ queryKey: ['space-overview', slug], queryFn: () => fetchSpaceOverview(slug), enabled: !!slug, staleTime: 30_000 })
}

export function useProjectTasks(slug: string, project: string) {
  return useQuery({ queryKey: ['project-tasks', slug, project], queryFn: () => fetchProjectTasks(slug, project), enabled: !!slug && !!project, staleTime: 15_000 })
}

export function useProjectPlan(slug: string, project: string) {
  return useQuery({ queryKey: ['project-plan', slug, project], queryFn: () => fetchProjectPlan(slug, project), enabled: !!slug && !!project, staleTime: 30_000 })
}

export function useProjectDocuments(slug: string, project: string) {
  return useQuery({ queryKey: ['project-documents', slug, project], queryFn: () => fetchProjectDocuments(slug, project), enabled: !!slug && !!project, staleTime: 30_000 })
}

// --- Escalations ---

export function useEscalations(status?: string) {
  return useQuery({ queryKey: ['escalations', status], queryFn: () => fetchEscalations(status), staleTime: 10_000, refetchInterval: 30_000 })
}

export function useAllEscalations() {
  return useQuery({ queryKey: ['escalations-all'], queryFn: () => fetchEscalations(), staleTime: 10_000, refetchInterval: 30_000 })
}

export function useSpaceEscalations(slug: string, status?: string) {
  return useQuery({ queryKey: ['space-escalations', slug, status], queryFn: () => fetchSpaceEscalations(slug, status), enabled: !!slug, staleTime: 10_000, refetchInterval: 30_000 })
}

// --- Server status ---

export function useServerStatus(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['server-status', slug],
    queryFn: () => fetchServerStatus(slug),
    enabled: !!slug && enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}

// --- System status ---

export function useSystemStatus() {
  return useQuery({ queryKey: ['system-status'], queryFn: fetchSystemStatus, staleTime: 10_000, refetchInterval: 30_000 })
}

// --- Heartbeat config ---

export function useHeartbeatConfig() {
  return useQuery({ queryKey: ['heartbeat-config'], queryFn: fetchHeartbeatConfig, staleTime: 30_000 })
}

export function useHeartbeatActivity() {
  return useQuery({ queryKey: ['heartbeat-activity'], queryFn: fetchHeartbeatActivity, staleTime: 30_000, refetchInterval: 60_000 })
}

// --- Activity ---

export function useActivity(hours = 24) {
  return useQuery({ queryKey: ['activity', hours], queryFn: () => fetchActivity(hours), staleTime: 20_000, refetchInterval: 30_000 })
}

// --- Schedule ---

export function useSchedule() {
  return useQuery({ queryKey: ['schedule'], queryFn: fetchSchedule, staleTime: 15_000, refetchInterval: 60_000 })
}

// --- All Tasks ---

export function useAllTasks() {
  return useQuery({ queryKey: ['all-tasks'], queryFn: () => fetchAllTasks(), staleTime: 15_000 })
}

// --- Skills page ---

export function useSkills() {
  return useQuery({ queryKey: ['skills'], queryFn: fetchSkills, staleTime: 60_000 })
}

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: fetchAgents, staleTime: 60_000 })
}

export function useHooks() {
  return useQuery({ queryKey: ['hooks'], queryFn: fetchHooks, staleTime: 60_000 })
}

export function usePlugins() {
  return useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 15_000 })
}

export function useMarketplaces() {
  return useQuery({ queryKey: ['marketplaces'], queryFn: fetchMarketplaces, staleTime: 15_000 })
}

// --- Plugin Credentials ---

export function usePluginCredentials(name: string) {
  return useQuery({
    queryKey: ['plugin-credentials', name],
    queryFn: () => fetchPluginCredentials(name),
    enabled: !!name,
    staleTime: 30_000,
  })
}

// --- Sessions ---

export function useSessions(limit = 20, space?: string) {
  return useQuery({ queryKey: ['sessions', limit, space], queryFn: () => fetchSessions(limit, space), enabled: space !== undefined ? !!space : true, staleTime: 15_000, refetchInterval: 30_000 })
}

// --- Messages ---

export function useMessages(background = false, limit = 50) {
  return useQuery({ queryKey: ['messages', background, limit], queryFn: () => fetchMessages(background, limit), staleTime: 10_000, refetchInterval: 15_000 })
}

// --- Superbot skills ---

export function useSuperbotSkills() {
  return useQuery({ queryKey: ['superbot-skills'], queryFn: fetchSuperbotSkills, staleTime: 60_000 })
}

// --- Dashboard config ---

export function useDashboardConfig() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['dashboard-config'], queryFn: fetchDashboardConfig, staleTime: 60_000 })

  const mutation = useMutation({
    mutationFn: (config: DashboardConfig) => saveDashboardConfig(config),
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(['dashboard-config'], savedConfig)
    },
    onError: (err: Error) => {
      console.error('Dashboard config save failed:', err.message)
    },
  })

  return {
    config: query.data,
    isLoading: query.isLoading,
    saveConfig: mutation.mutate,
    isSaving: mutation.isPending,
    saveError: mutation.error as Error | null,
  }
}

// --- Todos ---

export function useTodos() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['todos'], queryFn: fetchTodos, staleTime: 30_000 })

  const addMutation = useMutation({
    mutationFn: (text: string) => addTodo(text),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }) },
  })

  const toggleMutation = useMutation({
    mutationFn: (todo: TodoItem) => updateTodo(todo.id, { completed: !todo.completed }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }) },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteTodo(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }) },
  })

  const updateTextMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateTodo(id, { text }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }) },
  })

  return {
    todos: query.data || [],
    isLoading: query.isLoading,
    add: addMutation.mutate,
    toggle: toggleMutation.mutate,
    remove: removeMutation.mutate,
    updateText: updateTextMutation.mutate,
  }
}

// --- Backlog ---

export function useBacklog(slug: string) {
  const queryClient = useQueryClient()
  const queryKey = ['backlog', slug]
  const query = useQuery({ queryKey, queryFn: () => fetchBacklog(slug), staleTime: 30_000, enabled: !!slug })

  const addMutation = useMutation({
    mutationFn: (text: string) => addBacklogItem(slug, text),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }) },
  })

  const toggleMutation = useMutation({
    mutationFn: (item: BacklogItem) => updateBacklogItem(slug, item.id, { completed: !item.completed }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }) },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteBacklogItem(slug, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }) },
  })

  const updateTextMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateBacklogItem(slug, id, { text }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }) },
  })

  const promoteMutation = useMutation({
    mutationFn: (id: string) => promoteBacklogItem(slug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ['space', slug] })
    },
  })

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    add: addMutation.mutate,
    toggle: toggleMutation.mutate,
    remove: removeMutation.mutate,
    updateText: updateTextMutation.mutate,
    promote: promoteMutation.mutate,
  }
}

// --- Todo Research (agent_plan escalations) ---

export function useTodoResearch() {
  return useQuery({
    queryKey: ['escalations', undefined, undefined, 'agent_plan'],
    queryFn: () => fetchEscalations(undefined, undefined, 'agent_plan'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// --- Auto-triage rules ---

export function useAutoTriageRules() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['auto-triage-rules'], queryFn: fetchAutoTriageRules, staleTime: 10_000 })

  const deleteMutation = useMutation({
    mutationFn: (index: number) => deleteAutoTriageRule(index),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-triage-rules'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ index, rule }: { index: number; rule: string }) => updateAutoTriageRule(index, rule),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-triage-rules'] }),
  })

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    remove: deleteMutation.mutate,
    update: updateMutation.mutate,
  }
}

// --- Active workers ---

export function useActiveWorkers() {
  return useQuery({ queryKey: ['active-workers'], queryFn: fetchActiveWorkers, staleTime: 10_000, refetchInterval: 15_000 })
}

// --- Knowledge ---

export function useKnowledge() {
  return useQuery({ queryKey: ['knowledge'], queryFn: fetchKnowledge, staleTime: 30_000 })
}

export function useSaveKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, filename, content }: { source: string; filename: string; content: string }) =>
      saveKnowledgeFile(source, filename, content),
    onSuccess: (_data, { source, filename }) => {
      qc.invalidateQueries({ queryKey: ['knowledge'] })
      qc.invalidateQueries({ queryKey: ['knowledge-content', source, filename] })
    },
  })
}

export function useDeleteKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, filename }: { source: string; filename: string }) =>
      deleteKnowledgeFile(source, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })
}

export function useCreateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, filename, content }: { source: string; filename: string; content?: string }) =>
      createKnowledgeFile(source, filename, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })
}

export function useSaveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => saveUser(content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['context', 'user'] })
    },
  })
}

export function useUploadKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, file }: { source: string; file: File }) =>
      uploadKnowledgeFile(source, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })
}

// --- Latest files ---

export function useLatestFiles() {
  return useQuery({ queryKey: ['latest-files'], queryFn: fetchLatestFiles, staleTime: 30_000 })
}

// --- Dashboard cards ---

export function useCards() {
  return useQuery({ queryKey: ['cards'], queryFn: fetchCards, staleTime: 60_000 })
}

export function useCardItems(skillId: string) {
  return useQuery({
    queryKey: ['card-items', skillId],
    queryFn: () => fetchCardItems(skillId),
    enabled: !!skillId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useUpdateCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId, itemId, update }: { skillId: string; itemId: string; update: Record<string, unknown> }) =>
      updateCardItem(skillId, itemId, update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card-items'] })
    },
    onError: (err: Error) => {
      console.error('Card item update failed:', err.message)
    },
  })
}

export function useDeleteCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId, itemId }: { skillId: string; itemId: string }) =>
      deleteCardItem(skillId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card-items'] })
    },
  })
}

export function useCreateCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId, item }: { skillId: string; item: Record<string, unknown> }) =>
      createCardItem(skillId, item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card-items'] })
    },
  })
}

export function useRefreshCardItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) => refreshCardItems(skillId),
    onSuccess: (_data, skillId) => {
      qc.invalidateQueries({ queryKey: ['card-items', skillId] })
    },
  })
}

// --- Skill manifest & settings ---

export function useSkillManifest(skillId: string) {
  return useQuery({
    queryKey: ['skill-manifest', skillId],
    queryFn: () => fetchSkillManifest(skillId),
    enabled: !!skillId,
    staleTime: 60_000,
  })
}

export function useSkillSettings(skillId: string) {
  return useQuery({
    queryKey: ['skill-settings', skillId],
    queryFn: () => fetchSkillSettings(skillId),
    enabled: !!skillId,
    staleTime: 30_000,
  })
}

export function useSaveSkillSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId, values }: { skillId: string; values: Record<string, unknown> }) =>
      saveSkillSettings(skillId, values),
    onSuccess: (_data, { skillId }) => {
      qc.invalidateQueries({ queryKey: ['skill-settings', skillId] })
    },
  })
}

export function useSkillSchedules() {
  return useQuery({
    queryKey: ['skill-schedules'],
    queryFn: fetchSkillSchedules,
    staleTime: 30_000,
  })
}

export function useToggleSkillSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) => toggleSkillSchedule(skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skill-schedules'] })
      qc.invalidateQueries({ queryKey: ['schedule'] })
    },
  })
}
