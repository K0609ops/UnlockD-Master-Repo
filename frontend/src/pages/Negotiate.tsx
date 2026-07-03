import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { simulate, safe_to_spend } from '../engine/financeEngine';
import { runNegotiation } from '../ai/geminiClient';
import type { NegotiationResult } from '../ai/geminiClient';

export const Negotiate: React.FC = () => {
  const navigate = useNavigate();
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category] = useState('Discretionary');
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [mathData, setMathData] = useState<any>(null);
  const [showMath, setShowMath] = useState(false);

  if (!activeData) return <div className="p-8">Please log in.</div>;

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !merchant) return;
    setError('');
    setResult(null);
    setIsSimulating(true);

    try {
      const numAmount = Number(amount);
      const enginePayload = {
        monthlyIncome: activeData.user.monthly_income,
        balance: activeData.transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0),
        transactions: activeData.transactions,
        recurring: activeData.recurring,
        goals: activeData.goals
      };

      const baselineSafe = safe_to_spend(enginePayload);
      const math = simulate(enginePayload, numAmount, false);
      setMathData({ baselineSafe, ...math });

      if (db.geminiApiKey) {
        const aiRes = await runNegotiation(
          db.geminiApiKey, merchant, numAmount, category,
          baselineSafe, baselineSafe - math.safeSpendChange,
          math.baselineRisk, math.scenarioRisk
        );
        setResult(aiRes);
      } else {
        // Fallback without API key so user isn't blocked
        setResult({
          present_argument: `I really want this ${merchant} purchase, it brings immediate value.`,
          future_argument: `This drops our safe spend and pushes our risk to ${math.scenarioRisk}.`,
          resolution: math.scenarioRisk === 'storm' ? 'Skip it entirely.' : 'You are clear to buy.',
          outcome: math.scenarioRisk === 'storm' ? 'skip' : 'proceed'
        });
      }
    } catch (err: any) {
      setError(err.message || 'Engine failed. Ensure you have enough transaction history.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleOutcome = (action: 'buy' | 'skip') => {
    if (!result) return;
    const numAmount = Number(amount);
    
    if (action === 'buy') {
      const newTx = {
        id: 'tx_' + Date.now(),
        user_id: activeData.user.id,
        type: 'expense' as const,
        amount: numAmount,
        category,
        merchant,
        description: 'Negotiated purchase',
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'Card',
        is_recurring: false,
        regret_tag: null,
        created_at: new Date().toISOString()
      };
      updateDB(prev => ({ ...prev, transactions: [newTx, ...prev.transactions] }));
    } else {
      const newSacrifice = {
        id: 'sac_' + Date.now(),
        user_id: activeData.user.id,
        amount_saved: numAmount,
        category,
        resolved_at: new Date().toISOString(),
        goal_days_saved: 0 // Simplification for now
      };
      updateDB(prev => ({ ...prev, sacrifices: [newSacrifice, ...prev.sacrifices] }));
    }
    
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen p-6 py-12 max-w-3xl mx-auto animate-fade-in-up">
      <div className="mb-12">
        <h1 className="text-section font-serif mb-2">The Negotiation.</h1>
        <p className="text-muted text-sm">Propose a transaction to the engine.</p>
      </div>

      {!result && !isSimulating && (
        <form onSubmit={handleSimulate} className="bg-surface border border-line rounded-3xl p-8 shadow-sm flex flex-col gap-6">
          {error && <div className="text-danger text-sm">{error}</div>}
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Merchant / Item</label>
            <input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} required className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-caption font-semibold uppercase tracking-wider text-muted">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required className="bg-paper border border-line rounded-xl px-4 py-3 focus:outline-none focus:border-ink font-mono" />
          </div>
          <button type="submit" className="mt-4 w-full bg-ink text-paper py-4 rounded-xl font-medium hover:shadow-xl transition-shadow">
            Initiate Sequence
          </button>
        </form>
      )}

      {isSimulating && (
        <div className="py-20 text-center flex flex-col items-center gap-4 text-muted">
          <div className="w-8 h-8 rounded-full border-2 border-line border-t-ink animate-spin" />
          <p className="font-mono text-sm uppercase tracking-widest">Running Engine Simulations...</p>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-12">
          
          <div className="flex flex-col gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} 
              className="max-w-[85%] self-start"
            >
              <span className="text-caption font-semibold text-present-text uppercase tracking-widest block mb-2 pl-4">Present You</span>
              <div className="bg-surface border-l-4 border-l-present rounded-r-3xl rounded-bl-3xl p-5 text-ink leading-relaxed shadow-sm">
                {result.present_argument}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} 
              className="max-w-[85%] self-end"
            >
              <span className="text-caption font-semibold text-future-text uppercase tracking-widest block mb-2 pr-4 text-right">Future You</span>
              <div className="bg-surface border-r-4 border-r-future rounded-l-3xl rounded-br-3xl p-5 text-ink leading-relaxed shadow-sm text-right">
                {result.future_argument}
              </div>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9 }} 
            className="text-center mt-4"
          >
            <span className="text-caption uppercase tracking-widest text-muted font-semibold block mb-6">Resolution</span>
            <div className="relative inline-block mb-10">
              <h3 className="text-section font-serif text-ink">{result.resolution}</h3>
              <div className="h-[3px] w-full mt-4 bg-duel-thread rounded-full" />
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={() => handleOutcome('buy')} className="px-8 py-4 border border-line text-ink rounded-xl hover:bg-surface transition-colors font-medium text-sm">
                I bought it
              </button>
              <button onClick={() => handleOutcome('skip')} className="px-8 py-4 bg-ink text-paper rounded-xl hover:shadow-xl transition-all font-medium text-sm">
                I'm skipping it
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-8">
            <button onClick={() => setShowMath(!showMath)} className="text-caption text-muted uppercase tracking-widest hover:text-ink transition-colors flex items-center justify-center w-full">
              {showMath ? '- Hide the Math' : '+ Show the Math'}
            </button>
            <AnimatePresence>
              {showMath && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-6 bg-paper border border-line font-mono text-xs p-6 overflow-x-auto text-ink/80 rounded-xl">
                    <pre>{JSON.stringify(mathData, null, 2)}</pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        </div>
      )}
    </div>
  );
};
