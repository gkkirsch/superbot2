import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { UpdateBanner } from './components/UpdateBanner'
import { UpdateCheckButton } from './components/UpdateCheckButton'
import { Dashboard } from './pages/Dashboard'
import { SpacesOverview } from './pages/SpacesOverview'
import { SpaceDetail } from './pages/SpaceDetail'
import { ProjectDetail } from './pages/ProjectDetail'
import { Context } from './pages/Context'
import { Skills } from './pages/Skills'
import { SkillCreator } from './pages/SkillCreator'

function AppContent() {
  return (
    <>
      <UpdateBanner />
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/spaces" element={<SpacesOverview />} />
        <Route path="/spaces/:slug" element={<SpaceDetail />} />
        <Route path="/spaces/:slug/:project" element={<ProjectDetail />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/skill-creator" element={<SkillCreator />} />
        <Route path="/context" element={<Context />} />
      </Routes>
      <UpdateCheckButton />
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
