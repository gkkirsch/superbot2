import { useIdentity, useUser, useMemory } from '@/hooks/useSpaces'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

function TabSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="h-4 w-3/4 rounded bg-stone/10 animate-pulse" />
      <div className="h-4 w-1/2 rounded bg-stone/10 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-stone/10 animate-pulse" />
    </div>
  )
}

function TabBody({ content, exists, isLoading }: { content?: string; exists?: boolean; isLoading: boolean }) {
  if (isLoading) return <TabSkeleton />
  if (!exists || !content) {
    return <p className="py-6 text-center text-sm text-stone/60">No content available</p>
  }
  return (
    <div className="max-h-[400px] overflow-auto rounded-md bg-surface/30 p-4">
      <MarkdownRenderer content={content} />
    </div>
  )
}

export function ContextSection() {
  const identity = useIdentity()
  const user = useUser()
  const memory = useMemory()

  const allMissing =
    !identity.isLoading && !user.isLoading && !memory.isLoading &&
    !identity.data?.exists && !user.data?.exists && !memory.data?.exists

  if (allMissing) return null

  return (
    <Tabs defaultValue="identity">
      <TabsList>
        <TabsTrigger value="identity">Identity</TabsTrigger>
        <TabsTrigger value="user">User</TabsTrigger>
        <TabsTrigger value="memory">Memory</TabsTrigger>
      </TabsList>
      <TabsContent value="identity">
        <TabBody content={identity.data?.content} exists={identity.data?.exists} isLoading={identity.isLoading} />
      </TabsContent>
      <TabsContent value="user">
        <TabBody content={user.data?.content} exists={user.data?.exists} isLoading={user.isLoading} />
      </TabsContent>
      <TabsContent value="memory">
        <TabBody content={memory.data?.content} exists={memory.data?.exists} isLoading={memory.isLoading} />
      </TabsContent>
    </Tabs>
  )
}
