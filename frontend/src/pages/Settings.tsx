import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { clearAuthToken } from '../api/auth';
import { apiClient } from '../api/client';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { db, updateDB, clearDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  const [income, setIncome] = useState(activeData?.user.monthly_income || 0);
  const [newAccType, setNewAccType] = useState('savings');
  const [newAccBalance, setNewAccBalance] = useState('');

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const handleSave = async () => {
    try {
      await apiClient.patch('/finance/preferences', {
        monthly_income: income,
      });
      updateDB(prev => ({
        ...prev,
        users: prev.users.map(u => u.id === activeData.user.id ? { ...u, monthly_income: income } : u),
      }));
      alert('Settings saved. Forecasts recalculated.');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings.');
    }
  };

  const handleAddAccount = async () => {
    if (!newAccBalance) return;
    const balanceNum = Number(newAccBalance);
    
    try {
      await apiClient.post('/finance/accounts', {
        accountType: newAccType,
        balance: balanceNum,
      });

      // Optimistic Update
      const existingAccount = activeData.accounts.find(a => a.accountType === newAccType);
      if (existingAccount) {
        updateDB(prev => ({
          ...prev,
          accounts: prev.accounts.map(a => a.id === existingAccount.id ? { ...a, balance: balanceNum } : a)
        }));
        setNewAccBalance('');
        alert('Account balance updated successfully!');
        return;
      }

      const newAccount = {
        id: 'acc_' + Date.now().toString(),
        userId: activeData.user.id,
        accountType: newAccType as 'primary' | 'savings' | 'investment',
        balance: balanceNum,
        createdAt: new Date().toISOString(),
      };

      const depositTx = {
        id: 'tx_' + Date.now().toString(),
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
        idempotencyKey: 'idk_' + Date.now().toString(),
      };

      updateDB(prev => ({
        ...prev,
        accounts: [...prev.accounts, newAccount],
        transactions: [depositTx, ...prev.transactions],
      }));
      setNewAccBalance('');
      alert('Account created successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update account.');
    }
  };

  const handleClear = () => {
    if (confirm('Are you sure? This clears all local data and logs you out.')) {
      clearAuthToken();
      clearDB();
      navigate('/');
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch (e) {
      console.error('Logout error', e);
    }
    clearAuthToken();
    clearDB();
    navigate('/login');
  };

  const handleExport = () => {
    const csvContent = 'data:text/csv;charset=utf-8,'
      + 'Date,Merchant,Category,Amount,Type\n'
      + activeData.transactions
          .map(t => `${t.transaction_date},${t.merchant},${t.category},${t.amount},${t.type}`)
          .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'finverse_export.csv');
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
              <input
                type="number" value={income} onChange={e => setIncome(Number(e.target.value))}
                className="bg-paper border border-line rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-ink"
              />
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
                placeholder={activeData.accounts.some(a => a.accountType === newAccType) ? "New Balance" : "Initial Balance"}
              />
            </div>
            <button
              onClick={handleAddAccount}
              className="bg-ink text-paper px-6 py-2 rounded-lg font-medium text-sm hover:shadow-md transition-shadow"
            >
              {activeData.accounts.some(a => a.accountType === newAccType) ? 'Update Balance' : 'Create Account'}
            </button>
          </div>
        </section>

        <section className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-serif mb-6 text-danger">Data Control</h2>
          <div className="flex flex-col gap-4">
            <button onClick={handleLogout} className="border border-line py-3 rounded-xl text-ink font-medium hover:bg-paper transition-colors">Sign Out</button>
            <button onClick={handleExport} className="border border-line py-3 rounded-xl text-ink font-medium hover:bg-paper transition-colors">Export Ledger to CSV</button>
            <button onClick={handleClear} className="bg-danger-soft text-danger py-3 rounded-xl font-medium hover:bg-danger hover:text-paper transition-colors">Wipe Local Database</button>
          </div>
        </section>

      </div>
    </div>
  );
};
