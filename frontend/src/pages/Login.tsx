import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFinanceDB } from '../context/FinanceContext';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loginWithGoogle, firebaseEnabled } = useAuth();
  const { db, updateDB } = useFinanceDB();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/setup';

  // If already authenticated, redirect
  useEffect(() => {
    if (currentUser || db.currentUserEmail) {
      navigate(from, { replace: true });
    }
  }, [currentUser, db.currentUserEmail, navigate, from]);

  // Auto-fill username from email prefix during signup
  useEffect(() => {
    if (mode === 'signup' && email && !username) {
      setUsername(email.split('@')[0]);
    }
  }, [email, mode]);

  const validatePassword = (pass: string) =>
    pass.length >= 8 && /[A-Z]/.test(pass) && /[0-9]/.test(pass);

  const handleGoogleAuth = async () => {
    setError('');
    setGoogleLoading(true);
    if (!firebaseEnabled) {
      setError('Google sign-in requires Firebase keys in .env — use email/password instead.');
      setGoogleLoading(false);
      return;
    }
    try {
      const firebaseUser = await loginWithGoogle();
      const userEmail = firebaseUser.email!;
      const displayName = firebaseUser.displayName || userEmail.split('@')[0];

      // Upsert user in local finance state
      const existingUser = db.users.find(u => u.email === userEmail);
      if (!existingUser) {
        const newUser = {
          id: firebaseUser.uid,
          email: userEmail,
          username: displayName,
          monthly_income: 0,
          hours_per_week: 40,
          created_at: new Date().toISOString(),
        };
        updateDB(prev => ({
          ...prev,
          users: [...prev.users, newUser],
          currentUserEmail: userEmail,
        }));
        navigate('/setup', { replace: true });
      } else {
        updateDB(prev => ({ ...prev, currentUserEmail: userEmail }));
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      // User cancelled popup — don't show error
      if (!msg.includes('popup-closed')) {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if it's the backend-seeded demo user
    if ((email === 'demo@finverse.app' || email === 'Kalhara Biju') && password === 'Demo@2024') {
      updateDB(prev => ({ ...prev, currentUserEmail: 'demo@finverse.app' }));
      navigate('/dashboard', { replace: true });
      return;
    }

    const user = db.users.find(
      u => (u.email === email || u.username === email) && u.password === password
    );
    if (user) {
      updateDB(prev => ({ ...prev, currentUserEmail: user.email }));
      navigate('/dashboard', { replace: true });
    } else {
      setError('Invalid credentials. Have you signed up?');
    }
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !username || !password) {
      setError('All fields are required.');
      return;
    }
    if (db.users.find(u => u.email === email)) {
      setError('Email already registered. Please log in.');
      return;
    }
    if (db.users.find(u => u.username === username)) {
      setError('Username taken. Please choose another.');
      return;
    }
    if (!validatePassword(password)) {
      setError('Password must be 8+ chars with an uppercase letter and a number.');
      return;
    }

    const newUser = {
      id: 'u_' + Date.now(),
      email,
      username,
      password,
      monthly_income: 0,
      hours_per_week: 40,
      created_at: new Date().toISOString(),
    };
    updateDB(prev => ({
      ...prev,
      users: [...prev.users, newUser],
      currentUserEmail: email,
    }));
    navigate('/setup', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="w-full max-w-md bg-surface border border-line rounded-3xl p-10 shadow-sm animate-fade-in-up relative z-10">

        <h1 className="text-section font-serif mb-2">FINVERSE</h1>
        <p className="text-muted text-sm mb-8">
          {mode === 'login' ? 'Authenticate your session.' : 'Create a new instance.'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-danger-soft text-danger text-sm rounded-xl border border-danger/20">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 bg-paper border border-line py-3 rounded-xl font-medium hover:bg-line/20 transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <div className="w-4 h-4 rounded-full border-2 border-line border-t-ink animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-4 text-muted text-xs uppercase tracking-widest mb-6">
          <div className="h-px bg-line flex-1" />
          <span>OR</span>
          <div className="h-px bg-line flex-1" />
        </div>

        {/* --- LOGIN MODE --- */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Email or Username</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)} required
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink transition-colors font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Passcode</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink transition-colors font-mono"
              />
            </div>

            <button type="submit" className="w-full bg-ink text-paper py-4 rounded-xl font-medium mt-4 hover:shadow-xl transition-all">
              Authenticate
            </button>
            <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="text-sm text-muted hover:text-ink mt-2 transition-colors">
              New here? Create an account.
            </button>
          </form>
        )}

        {/* --- SIGNUP MODE --- */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink transition-colors font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Username</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)} required
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink transition-colors font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Passcode</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="8+ chars, uppercase, number"
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink transition-colors font-mono text-sm"
              />
            </div>

            <button type="submit" className="w-full bg-ink text-paper py-4 rounded-xl font-medium mt-4 hover:shadow-xl transition-all">
              Create Account
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-sm text-muted hover:text-ink mt-2 transition-colors">
              Already have an account? Log in.
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
