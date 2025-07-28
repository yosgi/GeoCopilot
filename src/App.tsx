
import './App.css';
import { DemoPage } from './pages/DemoPage';
import { PowerPlantDemo } from './pages/PowerPlantDemo';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 2000, background: '#f8f9fa', borderBottom: '1px solid #e0e0e0', padding: '8px 16px', display: 'flex', gap: 16 }}>
        <Link to="/demo" style={{ textDecoration: 'none', color: '#1976d2', fontWeight: 600 }}>🏗️ BIM Demo</Link>
        <Link to="/power-plant" style={{ textDecoration: 'none', color: '#388e3c', fontWeight: 600 }}>⚡ Power Plant Demo</Link>
      </div>
      <div style={{ marginTop: 48 }}>
        <Routes>
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/power-plant" element={<PowerPlantDemo />} />
          <Route path="*" element={<Navigate to="/demo" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
