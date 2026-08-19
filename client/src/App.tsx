import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SharePage from './pages/SharePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />} />
        <Route path="/share/:id" element={<SharePage />} />
      </Routes>
    </BrowserRouter>
  );
}
