import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const GlobalNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Do not render nav on entry pages
  if (location.pathname === '/' || location.pathname === '/login') {
    return null;
  }

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-paper/80 border-b border-line">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted hover:text-ink transition-colors font-medium text-sm group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back</span>
        </button>

        {/* Global branding or status can go here if needed */}
        <div className="text-xs uppercase tracking-widest font-semibold text-muted">
          Finverse System
        </div>

      </div>
    </nav>
  );
};
