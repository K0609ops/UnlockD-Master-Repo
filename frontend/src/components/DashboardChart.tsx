import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Decimal from 'decimal.js';
import type { ForecastPoint } from '../engine/financeEngine';
import type { Transaction } from '../context/FinanceContext';

interface DashboardChartProps {
  forecast: ForecastPoint[];
  transactions: Transaction[];
  safeSpend: number;
  timeRange?: 'all' | 'may' | 'june' | 'july';
}

export const DashboardChart: React.FC<DashboardChartProps> = ({ forecast, transactions, safeSpend, timeRange = 'all' }) => {
  // Map out timeline based on selected timeRange
  const data = [];
  // Hardcoded to July 3, 2024 for demo purposes to match the seed data
  const today = new Date('2024-07-03T12:00:00Z');
  
  let startOffset = -60;
  let endOffset = 15;

  if (timeRange === 'july') {
    startOffset = -2; // July 1 is 2 days before July 3
    endOffset = 28;   // End of July
  } else if (timeRange === 'june') {
    startOffset = -32; // June 1
    endOffset = -3;    // June 30
  } else if (timeRange === 'may') {
    startOffset = -63; // May 1
    endOffset = -33;   // May 31
  }

  for (let i = startOffset; i <= endOffset; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    
    if (i <= 0) {
      // Historical data from transactions
      const dayTxs = transactions.filter(t => t.transaction_date === dateStr);
      const income = dayTxs.filter(t => t.type === 'income').reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);
      const expense = dayTxs.filter(t => t.type === 'expense').reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);
      data.push({
        date: dateStr,
        displayDate: `${d.getMonth() + 1}/${d.getDate()}`,
        income,
        expense,
        balance: null // Use null so the line breaks naturally
      });
    } else {
      // Forecast data
      const fPoint = forecast.find(f => f.date === dateStr);
      data.push({
        date: dateStr,
        displayDate: `${d.getMonth() + 1}/${d.getDate()}`,
        income: 0,
        expense: fPoint ? fPoint.contributingFactors.filter(c => c.type === 'expense').reduce((s, c) => new Decimal(s).plus(c.amount).toNumber(), 0) : 0,
        balance: fPoint ? fPoint.predictedBalance : 0
      });
    }
  }

  // Connect the past and future by setting today's balance equal to safeSpend
  const todayIndex = data.findIndex(d => d.date === today.toISOString().split('T')[0]);
  if (todayIndex !== -1) {
    data[todayIndex].balance = safeSpend;
  }

  return (
    <div className="w-full h-64 mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-future)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--color-future)" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" opacity={0.5} />
          <XAxis 
            dataKey="displayDate" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: 'var(--color-muted)' }} 
            dy={10} 
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: 'var(--color-muted)' }} 
            tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: '12px', fontSize: '12px' }}
            itemStyle={{ color: 'var(--color-ink)' }}
            labelStyle={{ fontWeight: 'bold', color: 'var(--color-muted)', marginBottom: '8px' }}
          />
          
          {/* Historical Expense Area */}
          <Area type="monotone" dataKey="expense" name="Expense" stroke="var(--color-danger)" fillOpacity={1} fill="url(#colorExpense)" />
          
          {/* Forecasted Balance/Safe Margin Area */}
          <Area type="monotone" dataKey="balance" name="Forecasted Margin" stroke="var(--color-future)" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" connectNulls={true} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
