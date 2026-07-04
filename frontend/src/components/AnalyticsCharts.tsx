import React, { useMemo } from 'react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { RefreshCw } from 'lucide-react';
import Decimal from 'decimal.js';

export const AnalyticsCharts: React.FC = () => {
  const { db } = useFinanceDB();
  const activeData = getActiveUserData(db);

  if (!activeData || activeData.transactions.length === 0) {
    return null;
  }

  const { transactions } = activeData;

  // Calculate category breakdown for expenses
  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const categoryTotals: Record<string, number> = {};
    
    expenses.forEach(t => {
      categoryTotals[t.category] = new Decimal(categoryTotals[t.category] || 0).plus(t.amount).toNumber();
    });

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Identify recurring expenses
  const recurringTxs = useMemo(() => {
    return transactions.filter(t => t.is_recurring && t.type === 'expense');
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
      
      {/* Category Breakdown Pie Chart */}
      <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
        <h3 className="text-caption uppercase tracking-widest text-muted font-semibold mb-6">Spending by Category</h3>
        
        {categoryData.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={1000}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                  contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-line)', backgroundColor: 'var(--color-paper)' }}
                  itemStyle={{ color: 'var(--color-ink)' }}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-muted italic">
            No expenses logged yet.
          </div>
        )}
      </div>

      {/* Recurring Subscriptions Panel */}
      <div className="bg-surface border border-line rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <RefreshCw className="w-5 h-5 text-future" />
          <h3 className="text-caption uppercase tracking-widest text-muted font-semibold">Recurring Expenses</h3>
        </div>
        
        {recurringTxs.length > 0 ? (
          <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2">
            {recurringTxs.map(tx => (
              <div key={tx.id} className="flex justify-between items-center p-3 bg-paper border border-line rounded-xl hover:border-ink/20 transition-colors">
                <div>
                  <div className="font-medium text-sm text-ink">{tx.merchant}</div>
                  <div className="text-[10px] text-muted">{tx.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-ink">₹{Number(tx.amount).toFixed(2)}</div>
                  <div className="text-[9px] uppercase tracking-widest text-muted">Per Cycle</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-muted italic">
            No recurring subscriptions detected. Upload a statement to let the AI find them!
          </div>
        )}
      </div>
      
    </div>
  );
};
