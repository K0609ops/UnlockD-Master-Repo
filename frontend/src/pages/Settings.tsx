import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';


export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { db, updateDB, clearDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  const [income, setIncome] = useState(activeData?.user.monthly_income || 0);
  const [apiKey, setApiKey] = useState(db.geminiApiKey || '');

  // Account creation state
  const [newAccType, setNewAccType] = useState('savings');
  const [newAccBalance, setNewAccBalance] = useState('');

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const handleSave = () => {
    updateDB(prev => ({
      ...prev,
      geminiApiKey: apiKey,
      users: prev.users.map(u => u.id === activeData.user.id ? { ...u, monthly_income: income } : u)
    }));
    alert('Settings saved. Forecasts invalidated.');
  };

  const handleAddAccount = () => {
    if (!newAccBalance) return;
    const balanceNum = Number(newAccBalance);
    const newAccount = {
      id: crypto.randomUUID(),
      userId: activeData.user.id,
      accountType: newAccType as any,
      balance: balanceNum,
      createdAt: new Date().toISOString()
    };
    
    // Synthetic initial deposit so ledger balances
    const depositTx = {
      id: 'tx_' + crypto.randomUUID(),
      user_id: activeData.user.id,
      type: 'income' as const,
      amount: balanceNum,
      category: 'Initial Deposit',
      merchant: 'Manual Addition',
      description: `Initial balance for new ${newAccType} account`,
      transaction_date: new Date().toISOString().split('T')[0],
      payment_method: 'Transfer',
      is_recurring: false,
      regret_tag: null,
      created_at: new Date().toISOString(),
      toAccountId: newAccount.id,
      status: 'completed' as const,
      idempotencyKey: crypto.randomUUID()
    };

    updateDB(prev => ({
      ...prev,
      accounts: [...prev.accounts, newAccount],
      transactions: [depositTx, ...prev.transactions]
    }));
    setNewAccBalance('');
    alert('Account created successfully!');
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to delete all data? This is unrecoverable.')) {
      clearDB();
      navigate('/');
    }
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + activeData.transactions.map(t => `${t.transaction_date},${t.merchant},${t.category},${t.amount},${t.type}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "finverse_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen p-6 py-12 max-w-3xl mx-auto animate-fade-in-up">
      <div className="mb-12">
        <h1 className="text-section font-serif mb-2">System Config.</h1>
        <p className="text-muted text-sm">Adjust parameters and manage your local data.</p>
      </div>

      <div className="flex flex-col gap-10">
        
        <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-serif mb-6">Engine Parameters</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Monthly Income (Net)</label>
              <input type="number" value={income} onChange={e => setIncome(Number(e.target.value))} className="bg-paper border border-line rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-ink" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Gemini API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="bg-paper border border-line rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-ink" />
            </div>
            <button onClick={handleSave} className="mt-2 bg-ink text-paper py-3 rounded-xl font-medium">Save Parameters</button>
          </div>
        </section>

        <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-serif mb-6">Account Management</h2>
          <p className="text-muted text-sm mb-6">Add new financial accounts to track in your Finverse environment.</p>
          <div className="flex items-center gap-4 bg-paper p-4 rounded-xl border border-line">
            <select 
              value={newAccType} 
              onChange={e => setNewAccType(e.target.value)}
              className="bg-transparent font-medium focus:outline-none cursor-pointer flex-1"
            >
              <option value="primary">Primary Checking</option>
              <option value="savings">Savings Vault</option>
              <option value="investment">Investment Portfolio</option>
            </select>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-muted">₹</span>
              <input 
                type="number" value={newAccBalance}
                onChange={e => setNewAccBalance(e.target.value)}
                className="bg-transparent font-mono w-full focus:outline-none"
                placeholder="Initial Balance"
              />
            </div>
            <button 
              onClick={handleAddAccount}
              className="bg-ink text-paper px-6 py-2 rounded-lg font-medium text-sm hover:shadow-md transition-shadow"
            >
              Create Account
            </button>
          </div>
        </section>

        <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-serif mb-6 text-danger">Data Control</h2>
          <div className="flex flex-col gap-4">
            <button onClick={handleExport} className="border border-line py-3 rounded-xl text-ink font-medium hover:bg-paper transition-colors">Export Ledger to CSV</button>
            <button onClick={handleClear} className="bg-danger-soft text-danger py-3 rounded-xl font-medium hover:bg-danger hover:text-paper transition-colors">Wipe Local Database</button>
          </div>
        </section>

      </div>
    </div>
  );
};
