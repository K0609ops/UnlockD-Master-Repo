import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { forecast_balance, simulate, calculateSafeToSpend, calculateDailySpendLimit, ANCHOR_DATE } from '../engine/financeEngine';
import { runNegotiation } from '../ai/geminiClient';
import type { NegotiationResult } from '../ai/geminiClient';
import { DashboardChart } from '../components/DashboardChart';
import { QuickAddTransaction } from '../components/QuickAddTransaction';
import { Settings as SettingsIcon, Trash2 } from 'lucide-react';

const CATEGORIES = [
  'Dining', 'Groceries', 'Transport', 'Entertainment', 'Shopping', 
  'Travel', 'Health', 'Education', 'Subscriptions', 'Personal Care', 'Gadgets'
];

export const Dashboard: React.FC = () => {
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  // --- Negotiation State ---
  const [negAmount, setNegAmount] = useState('');
  const [negMerchant, setNegMerchant] = useState('');
  const [negCategory, setNegCategory] = useState(CATEGORIES[0]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [negError, setNegError] = useState('');
  const [negResult, setNegResult] = useState<NegotiationResult | null>(null);
  const [mathData, setMathData] = useState<any>(null);

  // --- Ledger State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState<'all' | 'may' | 'june' | 'july'>('all');
  const [ledgerTimeRange, setLedgerTimeRange] = useState<'all' | 'may' | 'june' | 'july'>('all');

  if (!activeData) {
    return (
      <div className="min-h-screen p-8 text-center animate-fade-in-up">
        <h2 className="text-section font-serif mb-4">No active session</h2>
        <Link to="/login" className="text-future hover:underline">Return to Login</Link>
      </div>
    );
  }

  const { user, transactions, recurring, goals, accounts } = activeData;

  if (transactions.length === 0) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center animate-fade-in-up">
        <h2 className="text-section font-serif mb-4">Awaiting Signal.</h2>
        <p className="text-muted text-center max-w-md mb-8">Add your first transaction to calibrate the engine.</p>
        <Link to="/setup" className="px-8 py-4 bg-ink text-paper font-medium rounded-2xl hover:-translate-y-1 hover:shadow-xl transition-all">Initialize Ledger</Link>
      </div>
    );
  }

  // Engine Execution for Overview
  const primaryAccounts = accounts.filter(a => a.accountType === 'primary');
  const liquidBalance = accounts.length > 0
    ? primaryAccounts.reduce((sum, a) => sum + a.balance, 0)
    : transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : (t.type === 'expense' || t.type === 'goal' ? -t.amount : 0)), 0);

  let safeSpend = 0;
  let forecastData: any[] = [];
  let dailySpendData: { limit: number, status: 'on_track' | 'warning' | 'danger', targetSavingsAmount: number } = { limit: 0, status: 'danger', targetSavingsAmount: 0 };
  
  let enginePayload: any = null;

  try {
    safeSpend = calculateSafeToSpend({ dbState: db, userId: user.id });
    
    enginePayload = {
      monthlyIncome: user.monthly_income,
      balance: safeSpend,
      target_savings_percentage: user.target_savings_percentage,
      transactions,
      recurring,
      goals
    };
    
    forecastData = forecast_balance(enginePayload);
    dailySpendData = calculateDailySpendLimit({ dbState: db, userId: user.id });
  } catch (e) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center">
        <h2 className="text-section font-serif mb-4 text-danger">Insufficient Data</h2>
        <Link to="/setup" className="text-ink underline">Go to Setup</Link>
      </div>
    );
  }

  // --- Negotiation Handlers ---
  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!negAmount || !negMerchant) return;
    setNegError('');
    setNegResult(null);
    setIsSimulating(true);

    try {
      const numAmount = Number(negAmount);
      const baselineSafe = safeSpend;
      const math = simulate(enginePayload, numAmount, false);
      setMathData({ baselineSafe, ...math });

      const aiRes = await runNegotiation(
          negMerchant, numAmount, negCategory,
          baselineSafe, baselineSafe - math.safeSpendChange,
          math.baselineRisk, math.scenarioRisk
        );
        setNegResult(aiRes);
    } catch (err: any) {
      setNegError(err.message || 'Engine failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleOutcome = (action: 'buy' | 'skip') => {
    if (!negResult) return;
    const numAmount = Number(negAmount);
    if (action === 'buy') {
      const newTx = {
        id: 'tx_' + Date.now(),
        user_id: user.id, type: 'expense' as const, amount: numAmount, category: negCategory,
        merchant: negMerchant, description: 'Negotiated purchase',
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'Card', is_recurring: false, regret_tag: null, created_at: new Date().toISOString()
      };
      updateDB(prev => ({ ...prev, transactions: [newTx, ...prev.transactions] }));
    } else {
      const newSacrifice = {
        id: 'sac_' + Date.now(), user_id: user.id, amount_saved: numAmount, category: negCategory,
        resolved_at: new Date().toISOString(), goal_days_saved: 0
      };
      updateDB(prev => ({ ...prev, sacrifices: [newSacrifice, ...prev.sacrifices] }));
    }
    setNegResult(null); setNegAmount(''); setNegMerchant('');
  };

  // --- Ledger Handlers ---
  const handleToggleRegret = (txId: string, current: 'good' | 'bad' | null) => {
    const nextVal = current === null ? 'bad' : current === 'bad' ? 'good' : null;
    updateDB(prev => ({
      ...prev, transactions: prev.transactions.map(t => t.id === txId ? { ...t, regret_tag: nextVal } : t)
    }));
  };
  
  const handleDeleteTransaction = (txId: string) => {
    if (window.confirm('Are you sure you want to delete this transaction? This will permanently remove it from your ledger and recalculate your margins.')) {
      updateDB(prev => ({
        ...prev, transactions: prev.transactions.filter(t => t.id !== txId)
      }));
    }
  };
  
  const filteredTxs = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = t.merchant.toLowerCase().includes(searchTerm.toLowerCase()) || t.category.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;
      if (ledgerTimeRange === 'all') return true;
      const month = new Date(t.transaction_date).getMonth();
      if (ledgerTimeRange === 'may') return month === 4;
      if (ledgerTimeRange === 'june') return month === 5;
      if (ledgerTimeRange === 'july') return month === 6;
      return true;
    });
  }, [transactions, searchTerm, ledgerTimeRange]);

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const handleSavingsSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    // Optimistic UI update
    updateDB(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === user.id ? { ...u, target_savings_percentage: val } : u)
    }));
    
    // Persist to Postgres
    import('../api/client').then(({ apiClient }) => {
      apiClient.patch(`/finance/${encodeURIComponent(user.email)}`, {
        target_savings_percentage: val
      }).catch(err => console.error('Failed to persist target savings:', err));
    });
  };

  return (
    <div className="min-h-screen p-6 py-8 max-w-[1400px] mx-auto animate-fade-in-up flex flex-col gap-8">
      
      {/* ─── Header ─── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-section font-serif tracking-tight">
            Hello, {user.username.split(' ')[0]}.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/insights" className="px-4 py-2 text-sm font-medium text-muted hover:text-ink border border-line rounded-xl bg-surface hover:bg-paper transition-colors">Insights</Link>
          <Link to="/goals" className="px-4 py-2 text-sm font-medium text-muted hover:text-ink border border-line rounded-xl bg-surface hover:bg-paper transition-colors">Goals</Link>
          <Link to="/settings" className="flex items-center gap-2 px-4 py-2 bg-ink text-paper rounded-xl text-sm font-medium hover:shadow-lg transition-shadow">
            <SettingsIcon className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </header>

      {/* ─── Personal Details Strip ─── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Profile Card */}
        <div className="col-span-2 sm:col-span-1 lg:col-span-2 bg-surface border border-line rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center text-lg font-serif font-medium flex-shrink-0">
            {user.username.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{user.username}</p>
            <p className="text-xs text-muted truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] font-mono bg-paper border border-line px-2 py-0.5 rounded text-muted">
              Member since {new Date(user.created_at).getFullYear()}
            </span>
          </div>
        </div>

        {/* One card per account */}
        {accounts.map(acc => (
          <div key={acc.id} className="bg-surface border border-line rounded-2xl p-5 flex flex-col justify-between shadow-sm min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
              {acc.accountType === 'primary' ? '🏦 Checking' : acc.accountType === 'savings' ? '🏛 Savings' : '📈 Investments'}
            </p>
            <p className="text-xl font-serif tracking-tight truncate">₹{acc.balance.toLocaleString('en-IN')}</p>
            <div className="mt-3 h-[2px] rounded-full" style={{
              background: acc.accountType === 'primary'
                ? 'linear-gradient(to right,#3b82f6,#6366f1)'
                : acc.accountType === 'savings'
                ? 'linear-gradient(to right,#10b981,#059669)'
                : 'linear-gradient(to right,#f59e0b,#d97706)'
            }} />
          </div>
        ))}

        {/* Monthly Income */}
        <div className="bg-surface border border-line rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">💼 Monthly Income</p>
          <p className="text-xl font-serif tracking-tight">₹{user.monthly_income.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-muted mt-2 font-mono">net / month</p>
        </div>
      </section>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Chart & Ledger */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Section A: Overview & Chart */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-caption uppercase tracking-widest text-muted font-semibold mb-2">Safe to Spend Margin</h2>
                <div className="relative inline-block">
                  <span className="text-hero font-serif leading-none block">₹{safeSpend.toLocaleString()}</span>
                  <div className="h-[3px] w-full mt-2 bg-duel-thread rounded-full" />
                </div>
                <p className="text-[11px] text-muted font-mono mt-4 leading-relaxed max-w-sm">
                  <span className="font-semibold text-ink">Calculation:</span> Primary Balance + Expected Income — Fixed Expenses — Active Goals — Outflows
                </p>
              </div>
              <div className="flex bg-paper rounded-lg p-1 border border-line self-start">
                <button onClick={() => setTimeRange('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'all' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>All History</button>
                <button onClick={() => setTimeRange('may')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'may' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>May</button>
                <button onClick={() => setTimeRange('june')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'june' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>June</button>
                <button onClick={() => setTimeRange('july')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'july' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>July</button>
              </div>
            </div>
            
            <DashboardChart forecast={forecastData} transactions={transactions} safeSpend={safeSpend} timeRange={timeRange} />
          </section>

          {/* Section C: Mini-Ledger */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm flex-1 flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-serif">Live Ledger</h2>
              <div className="flex items-center gap-3">
                <select 
                  value={ledgerTimeRange} 
                  onChange={e => setLedgerTimeRange(e.target.value as any)}
                  className="bg-paper border border-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink cursor-pointer"
                >
                  <option value="all">All Months</option>
                  <option value="may">May</option>
                  <option value="june">June</option>
                  <option value="july">July</option>
                </select>
                <input 
                  type="text" placeholder="Search transactions..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="bg-paper border border-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ink w-64"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[500px] pr-2">
              <table className="w-full text-left border-collapse">
                <tbody>
                  {filteredTxs.map(tx => (
                    <React.Fragment key={tx.id}>
                      <tr 
                        onDoubleClick={() => setExpandedTxId(expandedTxId === tx.id ? null : tx.id)}
                        className="border-b border-line/50 hover:bg-paper/50 transition-colors group cursor-pointer"
                        title="Double-click for details"
                      >
                        <td className="py-3 pr-4 font-mono text-xs text-muted w-24 align-top pt-4">
                          {tx.transaction_date}
                          {expandedTxId === tx.id && (
                            <div className="text-[10px] mt-1 text-ink/40 font-medium">
                              {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 align-top pt-4">
                          <div className="font-medium text-sm text-ink">{tx.merchant}</div>
                          <div className="text-xs text-muted">{tx.category}</div>
                        </td>
                        <td className={`py-3 font-mono font-medium text-right align-top pt-4 ${tx.type === 'income' ? 'text-success' : 'text-ink'}`}>
                          {tx.type === 'income' ? '+' : '-'}₹{tx.amount}
                        </td>
                        <td className="py-3 pl-4 text-right flex items-start justify-end gap-2 pt-4">
                          <button onClick={(e) => { e.stopPropagation(); handleToggleRegret(tx.id, tx.regret_tag); }} className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${tx.regret_tag === 'good' ? 'bg-success-soft text-success' : tx.regret_tag === 'bad' ? 'bg-danger-soft text-danger' : 'bg-paper text-muted border border-line hover:border-ink'}`}>
                            {tx.regret_tag === 'good' ? 'No Regret' : tx.regret_tag === 'bad' ? 'Regret' : 'Tag'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(tx.id); }} className="text-muted hover:text-danger transition-colors opacity-0 group-hover:opacity-100" title="Delete Transaction">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      
                      {expandedTxId === tx.id && (
                        <tr className="bg-paper/30 border-b border-line/50">
                          <td colSpan={4} className="py-4 px-4 text-xs text-muted">
                            <div className="grid grid-cols-2 gap-6 bg-surface p-4 rounded-xl border border-line">
                              <div>
                                <span className="font-semibold uppercase tracking-wider text-[10px] block mb-2 text-ink">Metadata</span>
                                <p className="mb-1"><strong className="font-medium text-ink/70">Method:</strong> {tx.payment_method}</p>
                                <p className="mb-1"><strong className="font-medium text-ink/70">Description:</strong> {tx.description || 'N/A'}</p>
                                {tx.is_recurring && <p className="text-future font-medium mt-2 bg-future-soft inline-block px-2 py-1 rounded">Recurring Autopay</p>}
                              </div>
                              
                              {tx.type === 'transfer' && (
                                <div>
                                  <span className="font-semibold uppercase tracking-wider text-[10px] block mb-2 text-ink">Atomic Proof</span>
                                  <p className="mb-1 font-mono text-[10px] truncate"><strong className="font-medium font-sans text-ink/70">From:</strong> {tx.fromAccountId}</p>
                                  <p className="mb-1 font-mono text-[10px] truncate"><strong className="font-medium font-sans text-ink/70">To:</strong> {tx.toAccountId}</p>
                                  <p className="mb-2">
                                    <strong className="font-medium text-ink/70">Status:</strong> 
                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tx.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                                      {tx.status}
                                    </span>
                                  </p>
                                  {tx.idempotencyKey && <p className="font-mono text-[9px] text-muted truncate mt-2 border-t border-line/50 pt-2" title={tx.idempotencyKey}>Token: {tx.idempotencyKey}</p>}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {filteredTxs.length === 0 && <p className="text-center text-muted text-sm mt-8">No transactions found.</p>}
            </div>
          </section>

        </div>

        {/* Right Column: Negotiation Engine */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          {/* Section: Daily Pacing */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-serif">Daily Velocity</h2>
                <p className="text-xs text-muted mt-1">Maximum daily spend to hit savings target.</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="text-center py-4">
                <span className={`text-5xl font-serif tracking-tight ${dailySpendData.status === 'danger' ? 'text-danger' : dailySpendData.status === 'warning' ? 'text-[#ff9800]' : 'text-success'}`}>
                  {dailySpendData.limit < 0 ? '₹0' : `₹${dailySpendData.limit.toLocaleString()}`}
                </span>
                <p className="text-xs font-mono uppercase tracking-widest text-muted mt-2">Per Day Remaining</p>
                {dailySpendData.status === 'danger' && (
                  <p className="text-xs text-danger font-medium mt-2 bg-danger-soft inline-block px-3 py-1 rounded-full text-center">
                    Mathematical threshold breached.
                    <br/>Modify future spending to recover.
                  </p>
                )}
              </div>

              {/* Savings Goal Slider — redesigned */}
              <div className="border-t border-line pt-6">
                <div className="flex justify-between items-center mb-5">
                  <span className="text-sm font-medium text-ink">Target Savings</span>
                  <span className="text-sm font-mono font-bold bg-ink text-paper px-3 py-1 rounded-lg">
                    {user.target_savings_percentage ?? 20}%
                  </span>
                </div>

                <div className="relative h-3 mb-4 flex items-center group cursor-pointer">
                  {/* Visual Background Track */}
                  <div className="absolute w-full h-3 bg-line rounded-full pointer-events-none" />
                  
                  {/* Visual Filled Track */}
                  <div
                    className="absolute h-3 rounded-full pointer-events-none"
                    style={{
                      width: `${((user.target_savings_percentage ?? 20) / 80) * 100}%`,
                      background: 'linear-gradient(to right, #3b82f6, #6366f1)'
                    }}
                  />
                  
                  {/* Visible Thumb Handle */}
                  <div 
                    className="absolute w-5 h-5 bg-paper border-2 border-indigo-500 rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-110"
                    style={{
                      left: `calc(${((user.target_savings_percentage ?? 20) / 80) * 100}% - 10px)`
                    }}
                  />

                  {/* Invisible Input for Interaction */}
                  <input
                    type="range"
                    min="0" max="80" step="5"
                    value={user.target_savings_percentage ?? 20}
                    onChange={handleSavingsSliderChange}
                    className="w-full h-full absolute inset-0 cursor-pointer appearance-none opacity-0"
                    style={{ zIndex: 10 }}
                  />
                </div>

                <div className="flex justify-between text-[10px] font-mono text-muted mt-1">
                  <span>0%</span>
                  <span className="text-ink font-semibold">₹{dailySpendData.targetSavingsAmount.toLocaleString('en-IN')}/mo saved</span>
                  <span>80%</span>
                </div>
              </div>
            </div>
          </section>

          {/* New Section: Historical Savings Trajectory */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-serif">Savings Trajectory</h2>
              <p className="text-xs text-muted mt-1">Net savings over the last 3 months.</p>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { month: 4, name: 'May' },
                { month: 5, name: 'June' },
                { month: 6, name: 'July (Current)' }
              ].map((m, idx) => {
                const monthTxs = transactions.filter(t => new Date(t.transaction_date).getMonth() === m.month && t.status !== 'failed');
                const mIncome = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const mExpense = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                const saved = mIncome - mExpense;
                
                const isCurrent = m.month === 6;
                let projected = saved;
                if (isCurrent) {
                  const currentDay = ANCHOR_DATE.getDate();
                  const daysInMonth = new Date(ANCHOR_DATE.getFullYear(), ANCHOR_DATE.getMonth() + 1, 0).getDate();
                  const remainingDays = daysInMonth - currentDay;
                  
                  // Calculate historical daily discretionary spend for a much more stable projection
                  const historicalDiscretionary = transactions.filter(t => t.type === 'expense' && !t.is_recurring).reduce((s, t) => s + t.amount, 0);
                  const daysOfHistory = 75; // Roughly May 1 to mid-July
                  const dailyAvg = historicalDiscretionary / daysOfHistory;
                  
                  // Projected savings = Current savings - (Average historical daily spend * remaining days)
                  projected = Math.round(saved - (dailyAvg * remainingDays));
                }

                return (
                  <div key={m.month} className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-medium text-ink">{m.name}</span>
                      <div className="text-right">
                        <span className={`text-sm font-bold font-mono ${saved >= 0 ? 'text-success' : 'text-danger'}`}>
                          {saved >= 0 ? '+' : '-'}₹{Math.abs(saved).toLocaleString('en-IN')}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] text-muted block">Projected: ₹{projected.toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-line rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${saved >= 0 ? 'bg-success' : 'bg-danger'}`} 
                        style={{ width: `${Math.min(100, Math.max(0, (saved / (user.monthly_income || 1)) * 100))}%`, opacity: isCurrent ? 0.6 : 1 }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Quick Add block */}
          <QuickAddTransaction />

          {/* Section B: Inline Negotiation */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm flex-1 flex flex-col">
            <div className="mb-6">
              <h2 className="text-lg font-serif">Negotiation Engine</h2>
              <p className="text-xs text-muted mt-1">Simulate purchases before you commit.</p>
            </div>

            {!negResult && !isSimulating && (
              <form onSubmit={handleSimulate} className="flex flex-col gap-4">
                {negError && <div className="text-danger text-xs">{negError}</div>}
                <input type="text" placeholder="Merchant" value={negMerchant} onChange={e => setNegMerchant(e.target.value)} required className="bg-paper border border-line rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ink" />
                <input type="number" placeholder="Amount (₹)" value={negAmount} onChange={e => setNegAmount(e.target.value)} required className="bg-paper border border-line rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-ink" />
                <select value={negCategory} onChange={e => setNegCategory(e.target.value)} className="bg-paper border border-line rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ink cursor-pointer">
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <button type="submit" className="mt-2 w-full bg-ink text-paper py-3 rounded-lg font-medium text-sm hover:shadow-md transition-shadow">
                  Simulate Impact
                </button>
              </form>
            )}

            {isSimulating && (
              <div className="flex-1 flex flex-col justify-center items-center py-12 gap-4 text-muted">
                <div className="w-6 h-6 rounded-full border-2 border-line border-t-ink animate-spin" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Consulting Agents...</span>
              </div>
            )}

            {negResult && (
              <div className="flex flex-col gap-6 flex-1">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="self-start w-[90%]">
                  <span className="text-[10px] font-semibold text-present-text uppercase tracking-widest block mb-1">Present You</span>
                  <div className="bg-paper border-l-2 border-present p-3 rounded-r-xl rounded-bl-xl text-sm text-ink">{negResult.present_argument}</div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="self-end w-[90%] text-right">
                  <span className="text-[10px] font-semibold text-future-text uppercase tracking-widest block mb-1">Future You</span>
                  <div className="bg-paper border-r-2 border-future p-3 rounded-l-xl rounded-br-xl text-sm text-ink">{negResult.future_argument}</div>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-4 pt-4 border-t border-line text-center">
                  <span className="text-[10px] uppercase tracking-widest text-muted font-semibold block mb-2">Resolution</span>
                  <p className="font-serif text-lg mb-6 leading-tight">"{negResult.resolution}"</p>
                  
                  <div className="flex flex-col gap-2">
                    <button onClick={() => handleOutcome('buy')} className="w-full border border-line py-2 rounded-lg text-ink text-sm font-medium hover:bg-paper">Proceed (Log Expense)</button>
                    <button onClick={() => handleOutcome('skip')} className="w-full bg-ink text-paper py-2 rounded-lg text-sm font-medium hover:shadow-lg">Skip (Log Sacrifice)</button>
                  </div>
                </motion.div>

                {/* Show the math - simulated impact */}
                {mathData && (
                  <div className="mt-4 p-4 bg-paper rounded-lg border border-line/50 text-[10px] font-mono text-muted">
                    <div className="flex justify-between mb-1">
                      <span>Safe Margin Change:</span>
                      <span className="text-danger">-₹{mathData.safeSpendChange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Risk Shift:</span>
                      <span>{mathData.baselineRisk} → {mathData.scenarioRisk}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};
