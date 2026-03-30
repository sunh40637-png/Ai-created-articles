import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import BenchmarkWorkbenchPage from './pages/BenchmarkWorkbenchPage.jsx'

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<BenchmarkWorkbenchPage />} />
          <Route path="/benchmark" element={<BenchmarkWorkbenchPage />} />
          <Route path="*" element={<BenchmarkWorkbenchPage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
