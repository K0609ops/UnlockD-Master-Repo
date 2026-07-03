import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { FinanceProvider } from './context/FinanceContext';
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
import { GlobalNav } from './components/GlobalNav';

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

export const App: React.FC = () => {
  return (
    <FinanceProvider>
      <div className="min-h-screen relative bg-paper text-ink selection:bg-present-soft">
        <GlobalNav />
        <DriftingDots />
        <div className="relative z-10 max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={<Splash />} />
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<DataSetup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/negotiate" element={<Negotiate />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </div>
    </FinanceProvider>
  );
};

export default App;
