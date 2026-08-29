import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import SharePage from './pages/SharePage';
import HistoryPage from './pages/HistoryPage';
import { SidebarProvider } from './contexts/SidebarContext';
import { trackPageChange } from './utils/analytics';

// Track page/route changes for analytics
function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    // Map routes to page names
    const pageMap: Record<string, string> = {
      '/': 'home',
      '/share': 'share',
      '/history': 'history',
    };
    const page = Object.keys(pageMap).find((prefix) => location.pathname.startsWith(prefix))
      ? pageMap[Object.keys(pageMap).find((prefix) => location.pathname.startsWith(prefix))!] || 'unknown'
      : 'unknown';
    if (page !== 'unknown') {
      trackPageChange(page);
    }
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <PageTracker />
        <Routes>
          <Route path="/" element={<Layout />} />
          <Route path="/share/:id" element={<SharePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </SidebarProvider>
    </BrowserRouter>
  );
}
