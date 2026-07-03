import type { Transaction, RecurringTransaction, Goal, DBState } from '../context/FinanceContext';


export interface ForecastPoint {
  date: string;
  predictedBalance: number;
  contributingFactors: { name: string; amount: number; type: 'income' | 'expense' }[];
}

interface UserData {
  monthlyIncome: number;
  balance: number;
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
  let currentBalance = data.balance;
  
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const simDate = new Date(today);
    simDate.setDate(today.getDate() + i);
    const dateStr = simDate.toISOString().split('T')[0];
    const dayNum = simDate.getDate();
    
    const factors: { name: string; amount: number; type: 'income' | 'expense' }[] = [];
    
    // Simulate recurring bills triggering
    data.recurring.forEach(bill => {
      // Very naive scheduling: assuming they fall on the same day of month as next_expected_date
      const billDay = new Date(bill.next_expected_date).getDate();
      if (dayNum === billDay) {
        currentBalance -= bill.amount;
        factors.push({ name: bill.merchant, amount: bill.amount, type: 'expense' });
      }
    });

    // Simulate average daily discretionary spend (from history)
    // Here we compute average spend of the last 30 days.
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const recentSpend = data.transactions
      .filter(t => t.type === 'expense' && new Date(t.transaction_date) >= thirtyDaysAgo && !t.is_recurring)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const dailyAvg = recentSpend / 30 || 0; // If no history, assume 0
    
    if (dailyAvg > 0) {
      currentBalance -= dailyAvg;
      factors.push({ name: 'Avg Discretionary', amount: Math.round(dailyAvg), type: 'expense' });
    }

    forecast.push({
      date: dateStr,
      predictedBalance: Math.round(currentBalance),
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
  
  let safeAmount = data.balance;
  
  // Deduct all upcoming bills for the next 15 days
  const today = new Date();
  data.recurring.forEach(bill => {
    const billDate = new Date(bill.next_expected_date);
    const diffTime = Math.abs(billDate.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays <= 15) {
      safeAmount -= bill.amount;
    }
  });

  // Deduct active goal targets
  data.goals.forEach(goal => {
    const remaining = goal.target_amount - goal.current_amount;
    if (remaining > 0) {
      // rough heuristic: reserve 10% of remaining target right now
      safeAmount -= (remaining * 0.1);
    }
  });

  const safetyBuffer = data.monthlyIncome * 0.1; // 10% buffer
  safeAmount -= safetyBuffer;

  return Math.max(0, Math.round(safeAmount));
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
  const scenarioData = { ...data, balance: data.balance + (isIncome ? hypotheticalAmount : -hypotheticalAmount) };
  
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
  // 1. Establish the Real Baseline Balance directly from the primary account entity
  const primaryAccount = dbState.accounts?.find(
    acc => acc.userId === userId && acc.accountType === 'primary'
  );
  const currentBaseline = primaryAccount ? primaryAccount.balance : 0;

  // 2. Aggregate Committed Contracts (Recurring Bills)
  const activeUser = dbState.users.find(u => u.id === userId);
  const monthlyIncome = activeUser ? activeUser.monthly_income : 0;

  const totalFixedExpenses = (dbState.recurring_transactions || [])
    .filter(bill => bill.user_id === userId)
    .reduce((sum, bill) => sum + bill.amount, 0);

  // 3. Aggregate Allocated Financial Targets (Goals)
  const totalGoalCommitments = (dbState.goals || [])
    .filter(goal => goal.user_id === userId && goal.current_amount < goal.target_amount)
    .reduce((sum, goal) => sum + goal.current_amount, 0);

  // 4. Track Variable Spending (Strict Ledger Status Filter)
  // Completely isolate and ignore transactions with status 'failed' or 'pending'
  const variableSpending = (dbState.transactions || [])
    .filter((tx) => 
      tx.user_id === userId && 
      tx.status === 'completed' && 
      tx.fromAccountId !== null &&
      tx.fromAccountId !== undefined
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  // 5. Execute Pure Financial Formula
  const safeToSpendMargin = (currentBaseline + monthlyIncome) - (totalFixedExpenses + totalGoalCommitments + variableSpending);

  return Math.max(0, Math.round(safeToSpendMargin));
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
  const targetSavingsAmount = (monthlyIncome * targetSavingsPct) / 100;

  // Fixed expenses
  const totalFixedExpenses = (dbState.recurring_transactions || [])
    .filter(bill => bill.user_id === userId)
    .reduce((sum, bill) => sum + bill.amount, 0);

  // Disposable income for the month
  const disposableIncome = monthlyIncome - targetSavingsAmount - totalFixedExpenses;

  // Track variable spending THIS MONTH
  const now = new Date();
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
    .reduce((sum, tx) => sum + tx.amount, 0);

  const remainingDisposable = disposableIncome - spentThisMonth;

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
