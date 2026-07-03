import React, { useState, useMemo } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { QuickAddTransaction } from '../components/QuickAddTransaction';
import { ImportStatement } from '../components/ImportStatement';

export const Transactions: React.FC = () => {
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const handleToggleRegret = (txId: string, current: 'good' | 'bad' | null) => {
    const nextVal = current === null ? 'bad' : current === 'bad' ? 'good' : null;
    updateDB(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === txId ? { ...t, regret_tag: nextVal } : t)
    }));
  };

  const handleDelete = (txId: string) => {
    updateDB(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== txId)
    }));
  };

  const filteredTxs = useMemo(() => {
    return activeData.transactions
      .filter(t => filterType === 'all' || t.type === filterType)
      .filter(t => t.merchant.toLowerCase().includes(searchTerm.toLowerCase()) || t.category.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [activeData.transactions, searchTerm, filterType]);

  return (
    <div className="min-h-screen p-6 py-12 max-w-5xl mx-auto animate-fade-in-up">
      <div className="mb-12">
        <h1 className="text-section font-serif mb-2">Ledger.</h1>
        <p className="text-muted text-sm">Full history of cash movement. Edits here instantly invalidate cached forecasts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <ImportStatement />
          <QuickAddTransaction />
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex gap-4 mb-2">
            <input 
              type="text" 
              placeholder="Search merchant or category..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink"
            />
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value as 'all'|'income'|'expense')}
              className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </div>

          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            {filteredTxs.length === 0 ? (
              <div className="p-8 text-center text-muted">No transactions found.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line bg-paper">
                    <th className="p-4 text-caption font-semibold uppercase tracking-wider text-muted">Date</th>
                    <th className="p-4 text-caption font-semibold uppercase tracking-wider text-muted">Merchant</th>
                    <th className="p-4 text-caption font-semibold uppercase tracking-wider text-muted">Amount</th>
                    <th className="p-4 text-caption font-semibold uppercase tracking-wider text-muted">Regret</th>
                    <th className="p-4 text-caption font-semibold uppercase tracking-wider text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map(tx => (
                    <tr key={tx.id} className="border-b border-line/50 hover:bg-paper/50 transition-colors">
                      <td className="p-4 font-mono text-sm text-muted">{tx.transaction_date}</td>
                      <td className="p-4">
                        <div className="font-medium text-sm">{tx.merchant}</div>
                        <div className="text-xs text-muted">{tx.category}</div>
                      </td>
                      <td className={`p-4 font-mono font-medium ${tx.type === 'income' ? 'text-success' : 'text-ink'}`}>
                        {tx.type === 'income' ? '+' : '-'}₹{tx.amount}
                      </td>
                      <td className="p-4">
                        <button 
                          onClick={() => handleToggleRegret(tx.id, tx.regret_tag)}
                          className={`text-xs px-2 py-1 border rounded-md transition-colors ${
                            tx.regret_tag === 'good' ? 'bg-success-soft text-success border-success/30' :
                            tx.regret_tag === 'bad' ? 'bg-danger-soft text-danger border-danger/30' :
                            'bg-paper border-line text-muted hover:border-ink'
                          }`}
                        >
                          {tx.regret_tag === 'good' ? 'No Regret' : tx.regret_tag === 'bad' ? 'Regret' : 'Tag'}
                        </button>
                      </td>
                      <td className="p-4">
                        <button onClick={() => handleDelete(tx.id)} className="text-xs text-danger hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
