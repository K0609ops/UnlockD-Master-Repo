import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';

export const GlobalNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  if (location.pathname === '/' || location.pathname === '/login') {
    return null;
  }

  const isAuthenticated = currentUser || db.currentUserEmail;

  // Resolve display name: prefer DB user, then Firebase, then email prefix
  const displayName = activeData?.user.username
    || currentUser?.displayName
    || db.currentUserEmail?.split('@')[0]
    || null;

  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Firebase logout error:', e);
    }
    updateDB(prev => ({ ...prev, currentUserEmail: null }));
    navigate('/');
  };

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

        {/* Brand */}
        <div className="text-xs uppercase tracking-widest font-semibold text-muted">
          Finverse System
        </div>

        {/* User + Logout */}
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            {displayName && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center text-[11px] font-semibold">
                  {initials}
                </div>
                <span className="text-sm font-medium text-ink hidden sm:block">
                  {displayName.split(' ')[0]}
                </span>
              </div>
            )}
            <div className="w-px h-4 bg-line" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-muted hover:text-danger transition-colors font-medium text-sm group"
              title="Log out"
            >
              <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <div className="w-16" />
        )}
      </div>
    </nav>
  );
};
