import React, { useState } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { AtomicTransferForm } from './AtomicTransferForm';

interface QuickAddProps {
  onAdd?: () => void; // Optional callback after adding
  hideTransfer?: boolean;
}

const CATEGORIES = [
  'Groceries', 'Transportation', 'Housing', 'Entertainment', 'Personal Care', 'Dining', 'Shopping', 'Travel', 'Health', 'Education'
];

export const QuickAddTransaction: React.FC<QuickAddProps> = ({ onAdd, hideTransfer = false }) => {
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);
  
  const [activeTab, setActiveTab] = useState<'log' | 'transfer'>('log');

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'expense' | 'income' | 'goal'>('expense');
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [incomeType, setIncomeType] = useState('Salary');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !activeData) return;
    
    // Validation
    if (type === 'expense' && !merchant) return;
    if (type === 'goal' && !selectedGoalId) {
      alert("Please select a goal.");
      return;
    }

    const numAmount = Number(amount);
    
    let finalMerchant = merchant;
    let finalCategory = category;

    if (type === 'goal') {
      const selectedGoal = activeData.goals.find(g => g.id === selectedGoalId);
      finalMerchant = selectedGoal ? selectedGoal.name : 'Goal';
      finalCategory = 'Goal Contribution';
    } else if (type === 'income') {
      finalMerchant = incomeType;
      finalCategory = 'Income';
    }

    const newTx = {
      id: 'tx_' + Date.now(),
      user_id: activeData.user.id,
      type,
      amount: numAmount,
      category: finalCategory,
      merchant: finalMerchant,
      description: '',
      transaction_date: date,
      payment_method: 'Card',
      is_recurring: false,
      regret_tag: null,
      created_at: new Date().toISOString(),
      ...(type === 'goal' && selectedGoalId ? { goal_id: selectedGoalId } : {})
    };

    updateDB(prev => {
      let nextPrev = {
        ...prev,
        transactions: [newTx, ...prev.transactions]
      };

      if (type === 'goal' && selectedGoalId) {
        nextPrev.goals = nextPrev.goals.map(g => 
          g.id === selectedGoalId ? { ...g, current_amount: g.current_amount + numAmount } : g
        );
      }
      
      const primaryIdx = nextPrev.accounts.findIndex(a => a.accountType === 'primary');
      if (primaryIdx !== -1) {
        const netChange = type === 'income' ? numAmount : -numAmount;
        nextPrev.accounts = nextPrev.accounts.map((acc, idx) => 
          idx === primaryIdx ? { ...acc, balance: acc.balance + netChange } : acc
        );
      }

      return nextPrev;
    });

    setAmount('');
    setMerchant('');
    if (onAdd) onAdd();
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-6">
      
      {/* Inline Tab Toggle (Non-Breaking Layout) */}
      {!hideTransfer ? (
        <div className="flex gap-4 mb-6 border-b border-line">
          <button 
            onClick={() => setActiveTab('log')}
            className={`pb-3 text-sm font-semibold uppercase tracking-wider transition-colors relative ${activeTab === 'log' ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            Log Record
            {activeTab === 'log' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-ink" />}
          </button>
          <button 
            onClick={() => setActiveTab('transfer')}
            className={`pb-3 text-sm font-semibold uppercase tracking-wider transition-colors relative ${activeTab === 'transfer' ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            Transfer Funds
            {activeTab === 'transfer' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-ink" />}
          </button>
        </div>
      ) : (
        <h3 className="text-section font-serif text-lg mb-4">Log Transaction</h3>
      )}
      
      {activeTab === 'log' || hideTransfer ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Amount</label>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none font-mono text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Type</label>
            <select 
              value={type}
              onChange={(e) => { setType(e.target.value as 'expense'|'income'|'goal'); setMerchant(''); }}
              className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="goal">Goal</option>
            </select>
          </div>
        </div>

        {/* --- GOAL SPECIFIC FIELDS --- */}
        {type === 'goal' && activeData && activeData.goals.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Select Active Goal</label>
            <select 
              value={selectedGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
              className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
              required
            >
              <option value="" disabled>Choose a goal...</option>
              {activeData.goals.map(g => (
                <option key={g.id} value={g.id}>{g.name} (₹{g.current_amount} / ₹{g.target_amount})</option>
              ))}
            </select>
          </div>
        )}
        {type === 'goal' && activeData && activeData.goals.length === 0 && (
          <p className="text-xs text-danger italic">No active goals found. Create one in the Goals tab first.</p>
        )}

        {/* --- INCOME SPECIFIC FIELDS --- */}
        {type === 'income' && (
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Income Type</label>
            <select 
              value={incomeType}
              onChange={(e) => setIncomeType(e.target.value)}
              className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
            >
              <option value="Salary">Salary</option>
              <option value="Family and Friends">Family and Friends</option>
              <option value="Others">Others</option>
            </select>
          </div>
        )}

        {/* --- EXPENSE SPECIFIC FIELDS --- */}
        {type === 'expense' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Merchant / Title</label>
              <input 
                type="text" 
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase tracking-wider text-muted">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none text-sm cursor-pointer"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold uppercase tracking-wider text-muted">Date</label>
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-paper border border-line rounded-lg px-3 py-2 focus:border-ink outline-none font-mono text-sm"
            required
          />
        </div>

        <button type="submit" className="mt-2 bg-ink text-paper py-3 rounded-lg font-medium hover:shadow-md transition-shadow text-sm">
          {type === 'goal' ? 'Contribute to Goal' : 'Add Record'}
        </button>
      </form>
      ) : (
        <AtomicTransferForm />
      )}
    </div>
  );
};
