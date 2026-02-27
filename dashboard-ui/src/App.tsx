import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { UpdateBanner } from './components/UpdateBanner'
import { UpdateCheckButton } from './components/UpdateCheckButton'
import { Dashboard } from './pages/Dashboard'
import { SpacesOverview } from './pages/SpacesOverview'
import { SpaceDetail } from './pages/SpaceDetail'
import { ProjectDetail } from './pages/ProjectDetail'
import { Knowledge } from './pages/Knowledge'
import { Skills } from './pages/Skills'
import { SkillCreator } from './pages/SkillCreator'
import { Learn } from './pages/Learn'
import { useTelegram } from './hooks/useTelegram'

function AppContent() {
  const { isTelegram } = useTelegram()

  return (
    <>
      {!isTelegram && <UpdateBanner />}
      <Nav />
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
      {!isTelegram && <UpdateCheckButton />}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
