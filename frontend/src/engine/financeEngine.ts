import type { Transaction, RecurringTransaction, Goal, DBState } from '../context/FinanceContext';
import Decimal from 'decimal.js';

// Anchor date for the demo data environment
export const ANCHOR_DATE = new Date('2024-07-03T12:00:00Z');

export interface ForecastPoint {
  date: string;
  predictedBalance: number;
  contributingFactors: { name: string; amount: number; type: 'income' | 'expense' }[];
}

interface UserData {
  monthlyIncome: number;
  balance: number;
  target_savings_percentage?: number;
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  goals: Goal[];
}

/**
 * Ensures the user has enough real data to run calculations.
 * Throws if insufficient history exists.
 */
function validateDataSufficiency(transactions: Transaction[]) {
  if (transactions.length < 1) {
    throw new Error('INSUFFICIENT_DATA');
  }
}

/**
 * 1. forecast_balance
 * Projects the balance out `days` into the future.
 */
export function forecast_balance(data: UserData, days: number = 30): ForecastPoint[] {
  validateDataSufficiency(data.transactions);
  const forecast: ForecastPoint[] = [];
  
  // Calculate base monthly disposable income to act as the monthly reset ceiling
  const targetPct = data.target_savings_percentage ?? 20;
  const targetSavingsAmount = new Decimal(data.monthlyIncome).times(targetPct).dividedBy(100).toNumber();
  const totalFixedExpenses = data.recurring.reduce((s, b) => new Decimal(s).plus(b.amount).toNumber(), 0);
  const disposableIncome = new Decimal(data.monthlyIncome).gt(0) 
    ? new Decimal(data.monthlyIncome).minus(targetSavingsAmount).minus(totalFixedExpenses).toNumber() 
    : 0;
  
  let currentMargin = data.balance; 
  const today = new Date(ANCHOR_DATE);
  
  // Calculate historical daily discretionary average for a stable decay rate
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const recentSpend = data.transactions
    .filter(t => t.type === 'expense' && new Date(t.transaction_date) >= thirtyDaysAgo && !t.is_recurring)
    .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);
  const dailyAvg = recentSpend / 30 || 0;
  
  for (let i = 0; i < days; i++) {
    const simDate = new Date(today);
    simDate.setDate(today.getDate() + i);
    const dateStr = simDate.toISOString().split('T')[0];
    const dayNum = simDate.getDate();
    
    const factors: { name: string; amount: number; type: 'income' | 'expense' }[] = [];
    
    if (dailyAvg > 0) {
      currentMargin = new Decimal(currentMargin).minus(dailyAvg).toNumber();
      factors.push({ name: 'Avg Discretionary', amount: Math.round(dailyAvg), type: 'expense' });
    }

    forecast.push({
      date: dateStr,
      predictedBalance: Math.round(currentMargin),
      contributingFactors: factors
    });
  }

  return forecast;
}

/**
 * 2. safe_to_spend
 * Real balance minus upcoming bills minus goals minus safety buffer.
 */
export function safe_to_spend(data: UserData): number {
  validateDataSufficiency(data.transactions);
  // data.balance is now pre-computed globally by calculateSafeToSpend
  // so we just return it directly without double-deducting bills and goals.
  return Math.max(0, Math.round(data.balance));
}

/**
 * 3. risk_status
 */
export function risk_status(forecast: ForecastPoint[]): 'sunny' | 'cloudy' | 'rainy' | 'storm' {
  if (forecast.length === 0) return 'sunny';
  
  const minBalance = Math.min(...forecast.map(f => f.predictedBalance));
  
  if (minBalance < 0) return 'storm';
  if (minBalance < 5000) return 'rainy';
  if (minBalance < 15000) return 'cloudy';
  return 'sunny';
}

/**
 * 4. simulate
 * Diffs a baseline against a scenario.
 */
export function simulate(data: UserData, hypotheticalAmount: number, isIncome: boolean = false) {
  const baseline = forecast_balance(data);
  const baselineRisk = risk_status(baseline);
  const baselineSafe = safe_to_spend(data);

  // Apply scenario
  const scenarioData = { ...data, balance: new Decimal(data.balance).plus(isIncome ? hypotheticalAmount : -hypotheticalAmount).toNumber() };
  
  const scenarioForecast = forecast_balance(scenarioData);
  const scenarioRisk = risk_status(scenarioForecast);
  const scenarioSafe = safe_to_spend(scenarioData);

  return {
    baselineForecast: baseline,
    scenarioForecast: scenarioForecast,
    baselineRisk,
    scenarioRisk,
    safeSpendChange: baselineSafe - scenarioSafe
  };
}

/**
 * 5. month_similarity
 */
export function month_similarity(data: UserData): { mostSimilarMonth: string; similarityScore: number; shortfallPrecedent: number | null } | null {
  try {
    validateDataSufficiency(data.transactions);
  } catch (e) {
    return null; // Not enough data
  }
  
  // Dummy implementation for now - returning null means it won't render unless forced.
  // In a real implementation this computes cosine similarity of category vectors.
  return null;
}

export interface SafeToSpendPayload {
  dbState: DBState;
  userId: string;
}

export const calculateSafeToSpend = ({ dbState, userId }: SafeToSpendPayload): number => {
  const user = dbState.users.find(u => u.id === userId);
  if (!user) return 0;
  
  const monthlyIncome = user.monthly_income;
  const targetSavingsPct = user.target_savings_percentage ?? 20;
  const targetSavingsAmount = new Decimal(monthlyIncome).times(targetSavingsPct).dividedBy(100).toNumber();
  
  const totalFixedExpenses = (dbState.recurring_transactions || [])
    .filter(bill => bill.user_id === userId)
    .reduce((sum, bill) => new Decimal(sum).plus(bill.amount).toNumber(), 0);
    
  const disposableIncome = new Decimal(monthlyIncome).minus(targetSavingsAmount).minus(totalFixedExpenses).toNumber();
  
  const now = new Date(ANCHOR_DATE);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const spentThisMonth = (dbState.transactions || [])
    .filter(tx => {
      if (tx.user_id !== userId) return false;
      if (tx.status === 'failed' || tx.status === 'pending') return false;
      if (tx.type !== 'expense') return false;
      
      const txDate = new Date(tx.transaction_date);
      return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear && !tx.is_recurring;
    })
    .reduce((sum, tx) => new Decimal(sum).plus(tx.amount).toNumber(), 0);
    
  return Math.max(0, Math.round(new Decimal(disposableIncome).minus(spentThisMonth).toNumber()));
};

export interface DailySpendPayload {
  dbState: DBState;
  userId: string;
}

export const calculateDailySpendLimit = ({ dbState, userId }: DailySpendPayload): { limit: number, status: 'on_track' | 'warning' | 'danger', targetSavingsAmount: number } => {
  const user = dbState.users.find(u => u.id === userId);
  if (!user) return { limit: 0, status: 'danger', targetSavingsAmount: 0 };

  const monthlyIncome = user.monthly_income;
  const targetSavingsPct = user.target_savings_percentage ?? 20; // Default 20%
  const targetSavingsAmount = new Decimal(monthlyIncome).times(targetSavingsPct).dividedBy(100).toNumber();

  // Fixed expenses
  const totalFixedExpenses = (dbState.recurring_transactions || [])
    .filter(bill => bill.user_id === userId)
    .reduce((sum, bill) => new Decimal(sum).plus(bill.amount).toNumber(), 0);

  // Disposable income for the month
  const disposableIncome = new Decimal(monthlyIncome).minus(targetSavingsAmount).minus(totalFixedExpenses).toNumber();

  // Track variable spending THIS MONTH
  const now = new Date(ANCHOR_DATE);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const spentThisMonth = (dbState.transactions || [])
    .filter(tx => {
      if (tx.user_id !== userId) return false;
      if (tx.status === 'failed' || tx.status === 'pending') return false;
      if (tx.type !== 'expense') return false;
      
      const txDate = new Date(tx.transaction_date);
      return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear && !tx.is_recurring;
    })
    .reduce((sum, tx) => new Decimal(sum).plus(tx.amount).toNumber(), 0);

  const remainingDisposable = new Decimal(disposableIncome).minus(spentThisMonth).toNumber();

  // Calculate days remaining
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate() + 1; // inclusive of today

  const dailyLimit = remainingDisposable / daysRemaining;

  let status: 'on_track' | 'warning' | 'danger' = 'on_track';
  if (dailyLimit < 0) status = 'danger';
  else if (dailyLimit < (disposableIncome / daysInMonth) * 0.5) status = 'warning';

  return {
    limit: Math.round(dailyLimit),
    status,
    targetSavingsAmount
  };
};
