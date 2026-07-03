import React from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import { AnalyticsCharts } from '../components/AnalyticsCharts';

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

  const [timeRange, setTimeRange] = React.useState<'all' | 'may' | 'june' | 'july'>('all');

  // Filter transactions based on selected time frame
  const filteredTxs = React.useMemo(() => {
    return activeData.transactions.filter(t => {
      if (timeRange === 'all') return true;
      const month = new Date(t.transaction_date).getMonth();
      if (timeRange === 'may') return month === 4;
      if (timeRange === 'june') return month === 5;
      if (timeRange === 'july') return month === 6;
      return true;
    });
  }, [activeData.transactions, timeRange]);

  // Calculate Regret Radar
  const regrettedTxs = filteredTxs.filter(t => t.regret_tag === 'bad');
  const happyTxs = filteredTxs.filter(t => t.regret_tag === 'good');
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
    const nonEssentials = filteredTxs
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
      <header className="mb-12 flex justify-between items-start">
        <div>
          <h1 className="text-section font-serif mb-2">Insights Engine.</h1>
          <p className="text-muted text-sm">Pattern detection running on real ledger data.</p>
        </div>
        <div className="flex bg-paper rounded-lg p-1 border border-line">
          <button onClick={() => setTimeRange('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'all' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>All History</button>
          <button onClick={() => setTimeRange('may')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'may' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>May</button>
          <button onClick={() => setTimeRange('june')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'june' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>June</button>
          <button onClick={() => setTimeRange('july')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === 'july' ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}>July</button>
        </div>
      </header>

      <AnalyticsCharts />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Regret Radar */}
        <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm flex flex-col items-center text-center">
          <h3 className="text-caption uppercase tracking-widest text-muted font-semibold w-full text-left mb-2">Regret Radar</h3>
          
          {taggedCount > 0 ? (
            <div className="flex flex-col items-center w-full mt-4">
              <div className="relative w-56 h-56 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Regrettable', value: regrettedTxs.length },
                        { name: 'Happy', value: happyTxs.length }
                      ]}
                      innerRadius={80}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      animationDuration={1500}
                      animationEasing="ease-out"
                    >
                      <Cell fill="#ef4444" /> {/* Red for Regret */}
                      <Cell fill="#10b981" /> {/* Green for Happy */}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-line)', backgroundColor: 'var(--color-paper)' }}
                      itemStyle={{ color: 'var(--color-ink)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Centered Percentage */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-5xl font-serif leading-none text-ink">{regretPercentage}%</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted mt-2">Regret</span>
                </div>
              </div>

              <p className="text-sm text-muted max-w-xs">
                You've tagged {taggedCount} recent transactions. <br/>
                <span className="text-danger font-medium">{regrettedTxs.length}</span> were regrettable, and <span className="text-success font-medium">{happyTxs.length}</span> were happy.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center w-full min-h-[200px]">
              <p className="text-muted text-sm italic">Tag transactions in the Ledger to activate this radar.</p>
            </div>
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
                  <div key={t.id} className="flex justify-between items-center text-xs py-2 border-b border-line/30">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{t.merchant}</span>
                      <span className="text-[10px] font-mono text-muted">{new Date(t.transaction_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <span className="font-mono text-ink">₹{t.amount}</span>
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
