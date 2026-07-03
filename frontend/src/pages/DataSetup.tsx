import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { QuickAddTransaction } from '../components/QuickAddTransaction';

export const DataSetup: React.FC = () => {
  const navigate = useNavigate();
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  const [income, setIncome] = useState<number | ''>(activeData?.user.monthly_income || '');
  const [hours, setHours] = useState(activeData?.user.hours_per_week || 40);

  const hasAccounts = activeData && activeData.accounts && activeData.accounts.length > 0;
  const [setupAccounts, setSetupAccounts] = useState([
    { id: crypto.randomUUID(), type: 'primary', balance: 5000 },
    { id: crypto.randomUUID(), type: 'savings', balance: 15000 },
  ]);

  useEffect(() => {
    if (!db.currentUserEmail) {
      navigate('/login');
    }
  }, [db.currentUserEmail, navigate]);

  if (!activeData) return null;

  const handleComplete = () => {
    updateDB(prev => {
      let newAccounts = prev.accounts;
      let newTxs = prev.transactions;

      if (!hasAccounts) {
        const mappedAccounts = setupAccounts.map(acc => ({
          id: acc.id,
          userId: activeData.user.id,
          accountType: acc.type as 'primary' | 'savings' | 'investment',
          balance: Number(acc.balance),
          createdAt: new Date().toISOString(),
        }));
        newAccounts = [...prev.accounts, ...mappedAccounts];

        const depositTxs = mappedAccounts.map(acc => ({
          id: 'tx_' + crypto.randomUUID(),
          user_id: activeData.user.id,
          type: 'income' as const,
          amount: acc.balance,
          category: 'Initial Deposit',
          merchant: 'System Boot',
          description: `Initial balance for ${acc.accountType}`,
          transaction_date: new Date().toISOString().split('T')[0],
          payment_method: 'Transfer',
          is_recurring: false,
          regret_tag: null,
          created_at: new Date().toISOString(),
          toAccountId: acc.id,
          status: 'completed' as const,
          idempotencyKey: crypto.randomUUID(),
        }));
        newTxs = [...depositTxs, ...prev.transactions];
      }

      return {
        ...prev,
        accounts: newAccounts,
        transactions: newTxs,
        users: prev.users.map(u =>
          u.id === activeData.user.id
            ? { ...u, monthly_income: Number(income), hours_per_week: Number(hours) }
            : u
        ),
      };
    });

    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen p-6 py-12 max-w-3xl mx-auto animate-fade-in-up">
      <div className="mb-12">
        <h1 className="text-hero font-serif mb-4">Data Setup.</h1>
        <p className="text-section text-muted font-light">FINVERSE requires real numbers to function. Enter your baseline metrics.</p>
      </div>

      <div className="flex flex-col gap-10">

        {/* Section 1: Income & Accounts */}
        <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-serif mb-6">1. Baseline Metrics & Accounts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Monthly Income (Net)</label>
              <input
                type="number" value={income} onChange={e => setIncome(Number(e.target.value))}
                className="bg-paper border border-line rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:border-ink"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Hours Worked / Week</label>
              <input
                type="number" value={hours} onChange={e => setHours(Number(e.target.value))}
                className="bg-paper border border-line rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4 border-t border-line pt-6">Bootstrapping Accounts</h3>
          {hasAccounts ? (
            <p className="text-sm text-success bg-success-soft p-4 rounded-xl border border-success/20">Accounts already initialized. Proceed to dashboard.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {setupAccounts.map((acc, index) => (
                <div key={acc.id} className="grid grid-cols-[1fr_2fr] gap-4 items-center bg-paper p-4 rounded-xl border border-line">
                  <select
                    value={acc.type}
                    onChange={e => setSetupAccounts(prev => prev.map((a, i) => i === index ? { ...a, type: e.target.value } : a))}
                    className="bg-transparent font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="primary">Primary Checking</option>
                    <option value="savings">Savings Vault</option>
                    <option value="investment">Investment Portfolio</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">₹</span>
                    <input
                      type="number" value={acc.balance}
                      onChange={e => setSetupAccounts(prev => prev.map((a, i) => i === index ? { ...a, balance: Number(e.target.value) } : a))}
                      className="bg-transparent font-mono w-full focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() => setSetupAccounts(prev => [...prev, { id: crypto.randomUUID(), type: 'savings', balance: 0 }])}
                className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink self-start transition-colors"
              >
                + Add Another Account
              </button>
            </div>
          )}
        </section>

        {/* Section 2: Seed Transactions */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-serif mb-2">2. Seed Transactions</h2>
            <p className="text-muted text-sm mb-6">Add recent purchases or recurring bills to calibrate the engine.</p>
            <QuickAddTransaction hideTransfer={true} />
          </div>

          <div className="bg-surface border border-line rounded-2xl p-6 overflow-y-auto max-h-[400px]">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-muted mb-4">Your Ledger ({activeData.transactions.length})</h3>
            {activeData.transactions.length === 0 ? (
              <p className="text-sm text-muted italic">No transactions logged yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {activeData.transactions.map(tx => (
                  <div key={tx.id} className="flex justify-between items-center py-2 border-b border-line/50 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{tx.merchant}</p>
                      <p className="text-xs text-muted font-mono">{tx.transaction_date}</p>
                    </div>
                    <p className={`font-mono font-medium ${tx.type === 'expense' || tx.type === 'goal' ? 'text-ink' : 'text-success'}`}>
                      {tx.type === 'expense' || tx.type === 'goal' ? '-' : '+'}₹{tx.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <button
          onClick={handleComplete}
          className="w-full bg-ink text-paper py-5 rounded-2xl font-medium text-lg hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
        >
          Boot Dashboard
        </button>

      </div>
    </div>
  );
};
