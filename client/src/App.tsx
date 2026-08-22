import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SharePage from './pages/SharePage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />} />
        <Route path="/share/:id" element={<SharePage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
