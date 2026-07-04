import React, { useState } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { apiClient } from '../api/client';

export const Goals: React.FC = () => {
  const { db, updateDB, refreshFromBackend } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');

  // Contract State
  const [contractMerchant, setContractMerchant] = useState('Netflix');
  const [contractAmount, setContractAmount] = useState('');
  const [contractDate, setContractDate] = useState(new Date().toISOString().split('T')[0]);

  const CONTRACT_OPTIONS = ['Netflix', 'Rent', 'Electricity Bill', 'Phone Bill', 'Entertainment Subscription', 'Internet', 'Gym'];

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalName || !newGoalTarget) return;

    const optimistic = {
      id: 'temp_g_' + Date.now(),
      user_id: activeData.user.id,
      name: newGoalName,
      target_amount: Number(newGoalTarget),
      current_amount: 0,
      target_date: '',
      priority: 1,
    };
    updateDB(prev => ({ ...prev, goals: [...prev.goals, optimistic] }));
    setNewGoalName('');
    setNewGoalTarget('');

    try {
      await apiClient.post('/finance/goals', {
        name: optimistic.name,
        target_amount: optimistic.target_amount,
        current_amount: 0,
        priority: 1,
      });
      await refreshFromBackend();
    } catch (err) {
      console.error('Failed to save goal:', err);
      updateDB(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== optimistic.id) }));
    }
  };

  const handleDraftContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAmount || !contractMerchant) return;
    const numAmount = Number(contractAmount);

    const tempRecId = 'temp_rec_' + Date.now();
    const optimisticRec = {
      id: tempRecId,
      user_id: activeData.user.id,
      merchant: contractMerchant,
      amount: numAmount,
      frequency: 'monthly' as const,
      next_expected_date: contractDate,
      confidence_score: 100,
    };
    updateDB(prev => ({ ...prev, recurring_transactions: [...prev.recurring_transactions, optimisticRec] }));
    setContractAmount('');

    try {
      await apiClient.post('/finance/recurring', {
        merchant: contractMerchant,
        amount: numAmount,
        frequency: 'monthly',
        next_expected_date: contractDate,
      });
      // Also log the first expense
      await apiClient.post('/finance/transactions', {
        type: 'expense',
        amount: numAmount,
        category: 'Commitment Contract',
        merchant: contractMerchant,
        description: 'Auto-debited from contract draft',
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'Auto-Debit',
        is_recurring: true,
      });
      await refreshFromBackend();
    } catch (err) {
      console.error('Failed to save contract:', err);
      updateDB(prev => ({ ...prev, recurring_transactions: prev.recurring_transactions.filter(r => r.id !== tempRecId) }));
    }
  };

  const handleTerminateContract = async (recId: string) => {
    if (window.confirm('Are you sure you want to terminate this contract?')) {
      updateDB(prev => ({ ...prev, recurring_transactions: prev.recurring_transactions.filter(r => r.id !== recId) }));
      try {
        await apiClient.delete(`/finance/recurring/${recId}`);
      } catch (err) {
        console.error('Failed to delete recurring transaction:', err);
        await refreshFromBackend();
      }
    }
  };

  return (
    <div className="min-h-screen p-6 py-12 max-w-5xl mx-auto animate-fade-in-up">
      <div className="mb-12">
        <h1 className="text-section font-serif mb-2">Goals & Contracts.</h1>
        <p className="text-muted text-sm">Long term targets and pre-commitment caps.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Goals List */}
        <div className="flex flex-col gap-6">
          <h2 className="text-xl font-serif">Active Goals</h2>
          
          {activeData.goals.map(g => {
            const progress = (g.current_amount / g.target_amount) * 100;
            return (
              <div key={g.id} className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
                <div className="flex justify-between mb-4">
                  <span className="font-medium text-ink">{g.name}</span>
                  <span className="font-mono text-sm text-muted">₹{g.current_amount} / ₹{g.target_amount}</span>
                </div>
                <div className="h-2 w-full bg-line rounded-full overflow-hidden">
                  <div className="h-full bg-duel-thread rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}

          <form onSubmit={handleAddGoal} className="bg-surface border border-line rounded-3xl p-8 shadow-sm mt-4">
            <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-4">New Goal</h3>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Goal Name" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink" required />
              <input type="number" placeholder="Target Amount" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink font-mono" required />
              <button type="submit" className="bg-ink text-paper py-3 rounded-xl font-medium">Add Goal</button>
            </div>
          </form>
        </div>

        {/* Pre-commitment Contracts */}
        <div className="flex flex-col gap-6">
          <h2 className="text-xl font-serif">Recurring Commitments</h2>
          
          <div className="flex flex-col gap-4">
            {activeData.recurring.length === 0 ? (
              <p className="text-sm text-muted italic p-4 bg-surface rounded-2xl border border-line">No active commitments.</p>
            ) : (
              activeData.recurring.map(rec => (
                <div key={rec.id} className="bg-surface border border-line rounded-2xl p-5 flex justify-between items-center group">
                  <div>
                    <span className="font-medium text-ink block">{rec.merchant}</span>
                    <span className="text-xs text-muted font-mono">Next: {rec.next_expected_date}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-ink font-medium">₹{rec.amount}/mo</span>
                    <button 
                      onClick={() => handleTerminateContract(rec.id)} 
                      className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-danger-soft text-danger border border-danger/20 hover:bg-danger hover:text-paper transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Terminate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleDraftContract} className="bg-surface border border-line rounded-3xl p-8 shadow-sm mt-2">
            <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-4">Draft New Contract</h3>
            <p className="text-xs text-muted mb-4">Drafting a contract immediately logs the first expense and schedules it for future engine deductions.</p>
            
            <div className="flex flex-col gap-4">
              <select 
                value={contractMerchant} onChange={e => setContractMerchant(e.target.value)}
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink cursor-pointer"
              >
                {CONTRACT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              
              <input 
                type="number" placeholder="Monthly Amount (₹)" value={contractAmount} onChange={e => setContractAmount(e.target.value)} 
                className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink font-mono" required 
              />
              
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted pl-1">Next Billing Date</label>
                <input 
                  type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} 
                  className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink font-mono" required 
                />
              </div>

              <button type="submit" className="bg-ink text-paper py-3 rounded-xl font-medium mt-2 hover:shadow-lg transition-shadow">
                Draft Contract & Auto-Debit
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};
