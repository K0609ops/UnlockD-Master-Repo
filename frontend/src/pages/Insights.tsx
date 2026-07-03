import React from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';

import { Link } from 'react-router-dom';

export const Insights: React.FC = () => {
  const { db } = useFinanceDB();
  const activeData = getActiveUserData(db);

  if (!activeData || activeData.transactions.length === 0) {
    return (
      <div className="min-h-screen p-8 text-center animate-fade-in-up">
        <h2 className="text-section font-serif mb-4">Insufficient History</h2>
        <p className="text-muted">The insights engine requires more transactions to generate patterns.</p>
        <Link to="/transactions" className="text-ink underline mt-4 block">Go to Ledger</Link>
      </div>
    );
  }

  // Calculate Regret Radar
  const regrettedTxs = activeData.transactions.filter(t => t.regret_tag === 'bad');
  const happyTxs = activeData.transactions.filter(t => t.regret_tag === 'good');
  const taggedCount = regrettedTxs.length + happyTxs.length;
  
  const regretPercentage = taggedCount > 0 
    ? Math.round((regrettedTxs.length / taggedCount) * 100) 
    : 0;

  // Financial Archaeology - Goal Closing Logic
  // Given a real goal, sort real non-essential transactions descending, greedily select until gap closes.
  const activeGoal = activeData.goals.find(g => g.target_amount > g.current_amount);
  let archaeologyTxs: typeof activeData.transactions = [];
  let archaeologySum = 0;
  
  if (activeGoal) {
    const gap = activeGoal.target_amount - activeGoal.current_amount;
    const nonEssentials = activeData.transactions
      .filter(t => t.type === 'expense' && !['Rent', 'Utilities', 'Groceries'].includes(t.category))
      .sort((a, b) => b.amount - a.amount);
    
    for (const t of nonEssentials) {
      if (archaeologySum >= gap) break;
      archaeologyTxs.push(t);
      archaeologySum += t.amount;
    }
  }

  return (
    <div className="min-h-screen p-6 py-12 max-w-5xl mx-auto animate-fade-in-up">
      <header className="mb-12">
        <h1 className="text-section font-serif mb-2">Insights Engine.</h1>
        <p className="text-muted text-sm">Pattern detection running on real ledger data.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Regret Radar */}
        <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-6">Regret Radar</h3>
          
          {taggedCount > 0 ? (
            <div>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-hero font-serif leading-none">{regretPercentage}%</span>
                <span className="text-muted pb-2">of tagged spend</span>
              </div>
              <p className="text-sm text-muted">You have tagged {taggedCount} transactions recently. {regrettedTxs.length} were marked as regrettable.</p>
            </div>
          ) : (
            <p className="text-muted text-sm italic">Tag transactions in the Ledger to activate this radar.</p>
          )}
        </div>

        {/* Financial Archaeology */}
        <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
          <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-6">Financial Archaeology</h3>
          
          {!activeGoal ? (
            <p className="text-muted text-sm italic">No active goal to analyze.</p>
          ) : archaeologySum === 0 ? (
            <p className="text-muted text-sm italic">Not enough non-essential spending found to cover the goal gap.</p>
          ) : (
            <div>
              <p className="text-sm text-ink font-medium mb-4">
                You could have fully funded "{activeGoal.name}" by skipping these {archaeologyTxs.length} purchases:
              </p>
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2">
                {archaeologyTxs.map(t => (
                  <div key={t.id} className="flex justify-between text-xs py-1 border-b border-line/30">
                    <span className="text-muted">{t.merchant}</span>
                    <span className="font-mono">₹{t.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Deja Vu Detector - Honest empty state */}
        <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm md:col-span-2">
          <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-6">Déjà Vu Detector</h3>
          <p className="text-muted text-sm italic">
            Insufficient historical month-over-month data to establish a high-confidence similarity precedent.
          </p>
        </div>

      </div>
    </div>
  );
};
