import React, { useState } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';

export const AtomicTransferForm: React.FC = () => {
  const { db, executeSimulatedTransfer } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const accounts = activeData?.accounts || [];

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(accounts.length > 1 ? accounts[1].id : '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (accounts.length < 2) {
    return <div className="p-4 bg-surface rounded-xl text-muted text-sm border border-line mt-2">You need at least 2 accounts to make a transfer. Please initialize them in Data Setup.</div>;
  }

  const selectedFromAccount = accounts.find(a => a.id === fromAccountId);
  const numAmount = Number(amount);
  const isOverdraft = selectedFromAccount ? (numAmount > selectedFromAccount.balance) : false;

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (fromAccountId === toAccountId) {
      setError('Source and destination cannot be the same.');
      return;
    }

    if (isOverdraft) {
      setError('Insufficient funds for this transfer.');
      return;
    }

    if (numAmount <= 0) return;

    const idempotencyKey = crypto.randomUUID();
    
    const result = executeSimulatedTransfer(
      fromAccountId,
      toAccountId,
      numAmount,
      idempotencyKey,
      'Transfer',
      'Internal atomic transfer'
    );

    if (result.success) {
      setSuccess(`Successfully transferred ₹${numAmount.toLocaleString()}`);
      setAmount('');
      // auto-clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(result.error || 'Transfer failed.');
    }
  };

  return (
    <form onSubmit={handleTransfer} className="flex flex-col gap-4 mt-2">
      {error && <div className="text-danger text-xs p-2 bg-danger-soft rounded border border-danger/20">{error}</div>}
      {success && <div className="text-success text-xs p-2 bg-success-soft rounded border border-success/20">{success}</div>}

      <div className="flex flex-col gap-2">
        <label className="text-caption font-semibold uppercase tracking-wider text-muted">From Account</label>
        <select 
          value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}
          className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.accountType.toUpperCase()} (₹{acc.balance.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-caption font-semibold uppercase tracking-wider text-muted">To Account</label>
        <select 
          value={toAccountId} onChange={e => setToAccountId(e.target.value)}
          className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.accountType.toUpperCase()} (₹{acc.balance.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-caption font-semibold uppercase tracking-wider text-muted">Amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-mono">₹</span>
          <input 
            type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className={`w-full bg-paper border ${isOverdraft ? 'border-danger text-danger focus:border-danger' : 'border-line focus:border-ink'} rounded-lg pl-8 pr-3 py-2 outline-none font-mono text-sm transition-colors`}
            placeholder="0.00"
            required
          />
        </div>
        {isOverdraft && <span className="text-[10px] text-danger font-medium uppercase tracking-wider">Overdraft Warning: Available balance is ₹{selectedFromAccount?.balance.toLocaleString()}</span>}
      </div>

      <button 
        type="submit" 
        disabled={isOverdraft}
        className={`mt-2 py-3 rounded-lg font-medium text-sm transition-all ${isOverdraft ? 'bg-line text-muted cursor-not-allowed' : 'bg-ink text-paper hover:shadow-md'}`}
      >
        Execute Transfer
      </button>
    </form>
  );
};
