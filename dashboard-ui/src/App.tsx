import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { UpdateBanner } from './components/UpdateBanner'
import { FileViewerProvider } from './contexts/FileViewerContext'
import { Dashboard } from './pages/Dashboard'
import { SpacesOverview } from './pages/SpacesOverview'
import { SpaceDetail } from './pages/SpaceDetail'
import { ProjectDetail } from './pages/ProjectDetail'
import { Knowledge } from './pages/Knowledge'
import { Skills } from './pages/Skills'
import { SkillCreator } from './pages/SkillCreator'
import { Learn } from './pages/Learn'
import { SetupScreen } from './pages/SetupScreen'

/** True when running inside the Electron shell (preload exposes window.superbot). */
const isElectron = !!(window as unknown as { superbot?: unknown }).superbot

function AppContent() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/spaces" element={<SpacesOverview />} />
          <Route path="/spaces/:slug" element={<SpaceDetail />} />
          <Route path="/spaces/:slug/:project" element={<ProjectDetail />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/skill-creator" element={<SkillCreator />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/learn" element={<Learn />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [setupDone, setSetupDone] = useState(!isElectron)
  const handleSetupComplete = useCallback(() => setSetupDone(true), [])

  if (!setupDone) {
    return <SetupScreen onComplete={handleSetupComplete} />
  }

  return (
    <BrowserRouter>
      <FileViewerProvider>
        <AppContent />
      </FileViewerProvider>
    </BrowserRouter>
  )
}

export default App
