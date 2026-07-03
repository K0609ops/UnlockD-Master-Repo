import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { forecast_balance, simulate, calculateSafeToSpend, calculateDailySpendLimit } from '../engine/financeEngine';
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

  const enginePayload = {
    monthlyIncome: user.monthly_income,
    balance: liquidBalance,
    transactions,
    recurring,
    goals
  };

  let safeSpend = 0;
  let forecastData: any[] = [];
  let dailySpendData: { limit: number, status: 'on_track' | 'warning' | 'danger', targetSavingsAmount: number } = { limit: 0, status: 'danger', targetSavingsAmount: 0 };
  try {
    safeSpend = calculateSafeToSpend({ dbState: db, userId: user.id });
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

      if (db.geminiApiKey) {
        const aiRes = await runNegotiation(
          db.geminiApiKey, negMerchant, numAmount, negCategory,
          baselineSafe, baselineSafe - math.safeSpendChange,
          math.baselineRisk, math.scenarioRisk
        );
        setNegResult(aiRes);
      } else {
        setNegResult({
          present_argument: `I really want this ${negMerchant} purchase, it brings immediate value.`,
          future_argument: `This drops our safe spend and pushes our risk to ${math.scenarioRisk}.`,
          resolution: math.scenarioRisk === 'storm' ? 'Skip it entirely.' : 'You are clear to buy.',
          outcome: math.scenarioRisk === 'storm' ? 'skip' : 'proceed'
        });
      }
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
    return transactions.filter(t => t.merchant.toLowerCase().includes(searchTerm.toLowerCase()) || t.category.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [transactions, searchTerm]);

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const handleSavingsSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    updateDB(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === user.id ? { ...u, target_savings_percentage: val } : u)
    }));
  };

  return (
    <div className="min-h-screen p-6 py-8 max-w-[1400px] mx-auto animate-fade-in-up flex flex-col gap-8">
      
      {/* Header */}
      <header className="flex justify-between items-center bg-surface border border-line rounded-3xl p-6 px-8 shadow-sm">
        <div>
          <h1 className="text-xl font-serif tracking-tight">FINVERSE Command Center</h1>
          <p className="text-caption text-muted uppercase tracking-widest mt-1">Unified Financial State</p>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/insights" className="text-sm font-medium text-muted hover:text-ink transition-colors">Insights Engine</Link>
          <Link to="/goals" className="text-sm font-medium text-muted hover:text-ink transition-colors">Goals & Contracts</Link>
          <div className="w-[1px] h-6 bg-line"></div>
          <Link to="/settings" className="flex items-center gap-2 px-4 py-2 bg-paper border border-line rounded-lg text-sm font-medium text-ink hover:bg-line/20 transition-colors">
            <SettingsIcon className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </header>

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
            </div>
            
            <DashboardChart forecast={forecastData} transactions={transactions} safeSpend={safeSpend} />
          </section>

          {/* Section C: Mini-Ledger */}
          <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm flex-1 flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-serif">Live Ledger</h2>
              <input 
                type="text" placeholder="Search transactions..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="bg-paper border border-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ink w-64"
              />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[300px] pr-2">
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

              <div className="border-t border-line pt-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-ink">Target Savings Goal</span>
                  <span className="text-sm font-mono text-ink bg-paper px-2 py-1 rounded border border-line">
                    {user.target_savings_percentage ?? 20}%
                  </span>
                </div>
                <input 
                  type="range" 
                  min="0" max="80" step="5"
                  value={user.target_savings_percentage ?? 20}
                  onChange={handleSavingsSliderChange}
                  className="w-full h-2 bg-line rounded-lg appearance-none cursor-pointer accent-ink"
                />
                <div className="flex justify-between items-center mt-2 text-xs text-muted font-mono">
                  <span>0%</span>
                  <span>Saving ₹{dailySpendData.targetSavingsAmount.toLocaleString()}/mo</span>
                  <span>80%</span>
                </div>
              </div>
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
