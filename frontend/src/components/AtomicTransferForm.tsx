import React, { useState } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { apiClient } from '../api/client';
import Decimal from 'decimal.js';

export const AtomicTransferForm: React.FC = () => {
  const { db, updateDB, refreshFromBackend } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const accounts = activeData?.accounts || [];

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(accounts.length > 1 ? accounts[1].id : '');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (accounts.length < 2) {
    return (
      <div className="p-4 bg-surface rounded-xl text-muted text-sm border border-line mt-2">
        You need at least 2 accounts to make a transfer.
      </div>
    );
  }

  const selectedFromAccount = accounts.find(a => a.id === fromAccountId);
  const numAmount = amount === '' ? new Decimal(0) : new Decimal(amount);
  const isOverdraft = selectedFromAccount ? numAmount.gt(selectedFromAccount.balance) : false;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (fromAccountId === toAccountId) {
      setError('Source and destination cannot be the same.');
      return;
    }
    if (numAmount.lte(0)) return;

    setLoading(true);
    const idempotencyKey = crypto.randomUUID();

    // Optimistic update
    updateDB(prev => ({
      ...prev,
      accounts: prev.accounts.map(acc => {
        if (acc.id === fromAccountId) return { ...acc, balance: new Decimal(acc.balance).minus(numAmount).toNumber() };
        if (acc.id === toAccountId) return { ...acc, balance: new Decimal(acc.balance).plus(numAmount).toNumber() };
        return acc;
      }),
    }));

    try {
      await apiClient.post('/finance/transfer', {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: numAmount.toNumber(),
        idempotency_key: idempotencyKey,
        description: 'Internal transfer',
      });
      setSuccess(`Successfully transferred ₹${numAmount.toNumber().toLocaleString()}`);
      setAmount('');
      // Refresh from backend to get server-confirmed balances and transaction record
      await refreshFromBackend();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      // Roll back optimistic update on failure
      updateDB(prev => ({
        ...prev,
        accounts: prev.accounts.map(acc => {
          if (acc.id === fromAccountId) return { ...acc, balance: new Decimal(acc.balance).plus(numAmount).toNumber() };
          if (acc.id === toAccountId) return { ...acc, balance: new Decimal(acc.balance).minus(numAmount).toNumber() };
          return acc;
        }),
      }));
      const msg = err instanceof Error ? err.message : 'Transfer failed.';
      if (msg.includes('INSUFFICIENT_FUNDS')) {
        setError('Insufficient funds for this transfer.');
      } else {
        setError('Transfer failed. Please try again.');
      }
    } finally {
      setLoading(false);
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
            className={`w-full bg-paper border ${isOverdraft ? 'border-danger text-danger' : 'border-line focus:border-ink'} rounded-lg pl-8 pr-3 py-2 outline-none font-mono text-sm transition-colors`}
            placeholder="0.00"
            required
          />
        </div>
        {isOverdraft && (
          <span className="text-[10px] text-danger font-medium uppercase tracking-wider">
            Overdraft Warning: Available ₹{selectedFromAccount?.balance.toLocaleString()}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={isOverdraft || loading}
        className={`mt-2 py-3 rounded-lg font-medium text-sm transition-all ${
          isOverdraft || loading ? 'bg-line text-muted cursor-not-allowed' : 'bg-ink text-paper hover:shadow-md'
        }`}
      >
        {loading ? 'Processing...' : 'Execute Transfer'}
      </button>
    </form>
  );
};
