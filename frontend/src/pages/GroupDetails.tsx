import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Receipt, CheckCircle, Clock } from 'lucide-react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import type { ExpenseSplit } from '../context/FinanceContext';
import { apiClient } from '../api/client';

export const GroupDetails: React.FC = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isSettling, setIsSettling] = useState(false);

  if (!activeData || !groupId) return null;
  const { groups, group_members, group_expenses, expense_splits, settlements } = activeData;

  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return <div className="p-8">Group not found.</div>;
  }

  const members = group_members.filter(m => m.group_id === groupId);
  const expenses = group_expenses.filter(e => e.group_id === groupId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const splits = expense_splits.filter(s => expenses.some(e => e.id === s.expense_id));
  const pendingSettlements = settlements.filter(s => s.group_id === groupId && s.status === 'pending');
  const completedSettlements = settlements.filter(s => s.group_id === groupId && s.status === 'completed');

  // Compute net balances
  const balances: Record<string, number> = {};
  members.forEach(m => balances[m.id] = 0);
  
  expenses.forEach(e => {
    if (balances[e.paid_by] !== undefined) balances[e.paid_by] += e.amount;
  });
  splits.forEach(s => {
    if (balances[s.member_id] !== undefined) balances[s.member_id] -= s.amount_owed;
  });
  completedSettlements.forEach(s => {
    if (balances[s.paid_by] !== undefined) balances[s.paid_by] += s.amount;
    if (balances[s.paid_to] !== undefined) balances[s.paid_to] -= s.amount;
  });

  const getMemberName = (id: string) => members.find(m => m.id === id)?.name || 'Unknown';

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount || !paidBy) return;
    setIsSubmitting(true);

    try {
      const numAmount = parseFloat(amount);
      const expenseId = 'exp_' + Date.now();
      
      const newExpense = {
        id: expenseId,
        group_id: groupId,
        description: desc,
        amount: numAmount,
        paid_by: paidBy,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };

      const newSplits: ExpenseSplit[] = [];
      if (splitType === 'equal') {
        const splitAmount = numAmount / members.length;
        members.forEach(m => {
          newSplits.push({
            id: 'spl_' + Date.now() + Math.random().toString(36).substring(7),
            expense_id: expenseId,
            member_id: m.id,
            amount_owed: splitAmount
          });
        });
      } else {
        // Custom
        Object.entries(customSplits).forEach(([mId, amtStr]) => {
          const amt = parseFloat(amtStr) || 0;
          if (amt > 0) {
            newSplits.push({
              id: 'spl_' + Date.now() + Math.random().toString(36).substring(7),
              expense_id: expenseId,
              member_id: mId,
              amount_owed: amt
            });
          }
        });
      }

      await apiClient.post(`/groups/${groupId}/expenses`, {
        expense: newExpense,
        splits: newSplits
      });

      // Refetch state from server to get updated settlements
      if (db.currentUserEmail) {
        const state = await apiClient.get<any>(`/finance/${encodeURIComponent(db.currentUserEmail)}/state`);
        updateDB(prev => ({ ...state, currentUserEmail: prev.currentUserEmail }));
      }

      setIsAddingExpense(false);
      setDesc('');
      setAmount('');
      setPaidBy('');
      setCustomSplits({});
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaySettlement = async (settlementId: string) => {
    try {
      await apiClient.post(`/groups/${groupId}/settlements/${settlementId}/pay`, {});
      // Refetch state
      if (db.currentUserEmail) {
        const state = await apiClient.get<any>(`/finance/${encodeURIComponent(db.currentUserEmail)}/state`);
        updateDB(prev => ({ ...state, currentUserEmail: prev.currentUserEmail }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen p-6 py-8 max-w-[1200px] mx-auto animate-fade-in-up">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/groups')} className="w-10 h-10 flex items-center justify-center bg-surface border border-line rounded-xl hover:bg-paper transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-section font-serif tracking-tight">{group.name}</h1>
          <p className="text-sm text-muted">{members.length} members</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Balances & Settlements */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <section className="bg-surface border border-line rounded-3xl p-6 shadow-sm">
            <h2 className="text-lg font-serif mb-4">Balances</h2>
            <div className="flex flex-col gap-3">
              {members.map(m => {
                const bal = balances[m.id] || 0;
                return (
                  <div key={m.id} className="flex justify-between items-center bg-paper p-3 rounded-xl border border-line">
                    <span className="font-medium text-sm">{m.name}</span>
                    <span className={`font-mono font-bold text-sm ${bal > 0.01 ? 'text-success' : bal < -0.01 ? 'text-danger' : 'text-muted'}`}>
                      {bal > 0.01 ? 'gets back ' : bal < -0.01 ? 'owes ' : 'settled'}
                      {Math.abs(bal) > 0.01 && `₹${Math.abs(bal).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-surface border border-line rounded-3xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-serif">Settle Up</h2>
              {pendingSettlements.length > 0 && (
                <button onClick={() => setIsSettling(true)} className="text-xs bg-ink text-paper px-3 py-1.5 rounded-lg font-medium hover:shadow-md">
                  View optimized
                </button>
              )}
            </div>
            
            {pendingSettlements.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">All settled up!</p>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingSettlements.slice(0, 3).map(s => (
                  <div key={s.id} className="text-sm p-3 bg-paper border border-line rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-medium">{getMemberName(s.paid_by)}</span> owes <span className="font-medium">{getMemberName(s.paid_to)}</span>
                    </div>
                    <span className="font-mono font-bold">₹{s.amount.toFixed(2)}</span>
                  </div>
                ))}
                {pendingSettlements.length > 3 && (
                  <p className="text-xs text-center text-muted">+ {pendingSettlements.length - 3} more</p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Col: Expenses */}
        <div className="lg:col-span-2">
          <section className="bg-surface border border-line rounded-3xl p-6 shadow-sm min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-serif">Expenses</h2>
              <button onClick={() => { setIsAddingExpense(true); setPaidBy(members[0]?.id || ''); }} className="flex items-center gap-1.5 bg-ink text-paper px-3 py-2 rounded-xl text-sm font-medium hover:shadow-md transition-shadow">
                <Plus className="w-4 h-4" /> Add Expense
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {expenses.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No expenses yet.</p>
                </div>
              ) : (
                expenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center p-4 bg-paper border border-line rounded-2xl hover:border-ink/20 transition-colors">
                    <div className="flex gap-4 items-center">
                      <div className="w-10 h-10 bg-surface rounded-xl flex flex-col items-center justify-center text-[10px] font-mono text-muted border border-line">
                        <span className="font-bold text-ink">{new Date(exp.date).getDate()}</span>
                        <span>{new Date(exp.date).toLocaleString('default', { month: 'short' })}</span>
                      </div>
                      <div>
                        <p className="font-medium text-ink">{exp.description}</p>
                        <p className="text-xs text-muted">Paid by {getMemberName(exp.paid_by)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-ink">₹{exp.amount.toFixed(2)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isAddingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm">
          <div className="bg-surface border border-line rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsAddingExpense(false)} className="absolute top-6 right-6 text-muted hover:text-ink">✕</button>
            <h2 className="text-2xl font-serif mb-6">Add Expense</h2>
            
            <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
              <input required placeholder="Description (e.g. Dinner)" value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ink" />
              <input required type="number" step="0.01" placeholder="Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-ink" />
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-muted mb-2">Paid By</label>
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ink cursor-pointer">
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex gap-2 mb-3 bg-paper p-1 border border-line rounded-xl">
                  <button type="button" onClick={() => setSplitType('equal')} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors ${splitType === 'equal' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}>Equal Split</button>
                  <button type="button" onClick={() => setSplitType('custom')} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors ${splitType === 'custom' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}>Custom Split</button>
                </div>
                
                {splitType === 'custom' && (
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm flex-1 truncate">{m.name}</span>
                        <div className="flex items-center gap-1 w-24">
                          <span className="text-muted text-sm">₹</span>
                          <input type="number" step="0.01" value={customSplits[m.id] || ''} onChange={e => setCustomSplits(prev => ({...prev, [m.id]: e.target.value}))} className="w-full bg-paper border border-line rounded-md px-2 py-1 text-sm font-mono focus:outline-none focus:border-ink text-right" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={isSubmitting} className="mt-2 w-full bg-ink text-paper py-3 rounded-xl font-medium hover:shadow-lg disabled:opacity-50">
                {isSubmitting ? 'Saving...' : 'Save Expense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Settle Up Modal */}
      {isSettling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm">
          <div className="bg-surface border border-line rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsSettling(false)} className="absolute top-6 right-6 text-muted hover:text-ink">✕</button>
            <h2 className="text-2xl font-serif mb-2">Optimized Settlements</h2>
            <p className="text-sm text-muted mb-6">Minimum transactions needed to settle all debts.</p>
            
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
              {pendingSettlements.map(s => (
                <div key={s.id} className="p-4 bg-paper border border-line rounded-xl flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-ink mb-1">
                      <span className="font-semibold">{getMemberName(s.paid_by)}</span> pays <span className="font-semibold">{getMemberName(s.paid_to)}</span>
                    </p>
                    <p className="font-mono font-bold text-lg text-ink">₹{s.amount.toFixed(2)}</p>
                  </div>
                  <button onClick={() => handlePaySettlement(s.id)} className="shrink-0 flex flex-col items-center gap-1 p-2 bg-success-soft text-success rounded-lg hover:bg-success hover:text-paper transition-colors group">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">Record</span>
                  </button>
                </div>
              ))}
              
              {completedSettlements.length > 0 && (
                <div className="mt-6 pt-4 border-t border-line">
                  <h3 className="text-xs uppercase font-semibold text-muted tracking-widest mb-3 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> History
                  </h3>
                  <div className="flex flex-col gap-2">
                    {completedSettlements.slice(0, 5).map(s => (
                      <div key={s.id} className="text-xs text-muted flex justify-between p-2 bg-surface/50 rounded-lg">
                        <span>{getMemberName(s.paid_by)} paid {getMemberName(s.paid_to)}</span>
                        <span className="font-mono">₹{s.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
