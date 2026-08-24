import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SharePage from './pages/SharePage';
import HistoryPage from './pages/HistoryPage';
import { SidebarProvider } from './contexts/SidebarContext';

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <Routes>
          <Route path="/" element={<Layout />} />
          <Route path="/share/:id" element={<SharePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </SidebarProvider>
    </BrowserRouter>
  );
}
