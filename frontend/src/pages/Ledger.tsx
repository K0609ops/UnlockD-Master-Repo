import React, { useState } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';

export const Ledger: React.FC = () => {
  const { db } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const [filterMonth, setFilterMonth] = useState('all');

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const filteredSacrifices = activeData.sacrifices
    .filter(s => {
      if (filterMonth === 'all') return true;
      const date = new Date(s.resolved_at);
      return date.getMonth().toString() === filterMonth;
    })
    .sort((a, b) => new Date(b.resolved_at).getTime() - new Date(a.resolved_at).getTime());

  const totalSaved = filteredSacrifices.reduce((sum, s) => sum + s.amount_saved, 0);

  return (
    <div className="min-h-screen p-6 py-12 max-w-5xl mx-auto animate-fade-in-up">
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-section font-serif mb-2">Sacrifice Ledger.</h1>
          <p className="text-muted text-sm">Every time Future You won a negotiation, it was logged here.</p>
        </div>
        <select 
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink"
        >
          <option value="all">All Time</option>
          <option value="5">June</option>
          <option value="6">July</option>
          <option value="7">August</option>
        </select>
      </div>

      <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm mb-8">
        <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-2">Total Capital Preserved</h3>
        <span className="text-hero font-serif text-success leading-none block">₹{totalSaved.toLocaleString()}</span>
      </div>

      {filteredSacrifices.length === 0 ? (
        <div className="p-8 text-center text-muted italic border border-line rounded-3xl">No sacrifices recorded for this period.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredSacrifices.map(s => (
            <div key={s.id} className="bg-surface border border-line rounded-2xl p-6 flex justify-between items-center">
              <div>
                <p className="font-medium text-ink">{s.category} Purchase Avoided</p>
                <p className="text-xs text-muted font-mono mt-1">{new Date(s.resolved_at).toLocaleDateString()}</p>
              </div>
              <span className="font-mono text-lg text-success font-medium">+₹{s.amount_saved}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
