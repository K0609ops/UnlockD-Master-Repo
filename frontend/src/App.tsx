import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FinanceProvider } from './context/FinanceContext';
import { useAuth } from './context/AuthContext';
import { Splash } from './pages/Splash';
import { Login } from './pages/Login';
import { DataSetup } from './pages/DataSetup';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Negotiate } from './pages/Negotiate';
import { Insights } from './pages/Insights';
import { Ledger } from './pages/Ledger';
import { Goals } from './pages/Goals';
import { Settings } from './pages/Settings';
import { Groups } from './pages/Groups';
import { GroupDetails } from './pages/GroupDetails';
import { GlobalNav } from './components/GlobalNav';

// Ambient background dots
const DriftingDots = () => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const dots = Array.from({ length: 25 }).map((_, i) => ({
    id: i,
    left: `${(i * 17) % 100}%`,
    top: `${(i * 23) % 150 - 25}%`,
    size: 2 + (i % 4) * 1.5,
    speed: 0.1 + (i % 5) * 0.05,
    color: i % 3 === 0 ? 'var(--color-present)' : i % 3 === 1 ? 'var(--color-future)' : i % 2 === 0 ? 'var(--color-gold)' : 'var(--color-muted)',
    opacity: 0.1 + (i % 3) * 0.06
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {dots.map(dot => (
        <div
          key={dot.id}
          className="absolute rounded-full"
          style={{
            left: dot.left,
            top: dot.top,
            width: `${dot.size}px`,
            height: `${dot.size}px`,
            backgroundColor: dot.color,
            opacity: dot.opacity,
            transform: `translateY(${-scrollY * dot.speed}px)`,
            transition: 'transform 0.1s linear'
          }}
        />
      ))}
    </div>
  );
};

// Route guard: blocks unauthenticated access
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-ink animate-spin" />
      </div>
    );
  }

  // Allow access if authenticated via Firebase OR via local email/password session
  const localEmail = (() => {
    try {
      const saved = localStorage.getItem('finverse_db');
      if (saved) return JSON.parse(saved)?.currentUserEmail ?? null;
    } catch { return null; }
    return null;
  })();

  if (!currentUser && !localEmail) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <FinanceProvider>
      <div className="min-h-screen relative bg-paper text-ink selection:bg-present-soft">
        <GlobalNav />
        <DriftingDots />
        <div className="relative z-10 max-w-7xl mx-auto">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Splash />} />
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route path="/setup" element={<ProtectedRoute><DataSetup /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
            <Route path="/negotiate" element={<ProtectedRoute><Negotiate /></ProtectedRoute>} />
            <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
            <Route path="/goals" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
            <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetails /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </FinanceProvider>
  );
};

export default App;
