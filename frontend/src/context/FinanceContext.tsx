import React, { createContext, useContext, useState, useEffect } from 'react';

// --- Database Schema Equivalents ---

export interface Account {
  id: string;
  userId: string;
  accountType: 'primary' | 'savings' | 'investment';
  balance: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  password?: string; // Only for local email/password accounts (not Google)
  monthly_income: number;
  hours_per_week: number;
  target_savings_percentage?: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense' | 'goal' | 'transfer';
  amount: number;
  category: string;
  merchant: string;
  description: string;
  transaction_date: string; // YYYY-MM-DD
  payment_method: string;
  is_recurring: boolean;
  regret_tag: 'good' | 'bad' | null;
  created_at: string;
  goal_id?: string;

  // Atomic Transfer Fields
  fromAccountId?: string | null;
  toAccountId?: string | null;
  status?: 'pending' | 'completed' | 'failed' | 'reversed';
  idempotencyKey?: string;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  frequency: 'monthly' | 'weekly';
  next_expected_date: string;
  confidence_score: number;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  priority: number;
}

export interface Contract {
  id: string;
  user_id: string;
  category: string;
  cap_amount: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'failed';
  streak_count: number;
}

export interface Sacrifice {
  id: string;
  user_id: string;
  amount_saved: number;
  category: string;
  resolved_at: string;
  goal_days_saved: number;
}

export interface Insight {
  id: string;
  user_id: string;
  insight_type: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detected_at: string;
}

export interface Group {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  name: string;
  user_id?: string | null;
}

export interface GroupExpense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  paid_by: string;
  date: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  amount_owed: number;
}

export interface Settlement {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  date?: string | null;
  status: 'pending' | 'completed';
}

export interface DBState {
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  recurring_transactions: RecurringTransaction[];
  goals: Goal[];
  contracts: Contract[];
  sacrifices: Sacrifice[];
  insights: Insight[];

  // Groups and Bill Splitting
  groups: Group[];
  group_members: GroupMember[];
  group_expenses: GroupExpense[];
  expense_splits: ExpenseSplit[];
  settlements: Settlement[];

  // Session state
  currentUserEmail: string | null;
}

interface FinanceContextType {
  db: DBState;
  updateDB: (updater: (prev: DBState) => DBState) => void;
  clearDB: () => void;
  executeSimulatedTransfer: (
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    idempotencyKey: string,
    category: string,
    description: string
  ) => { success: boolean; error?: string; transaction?: Transaction };
}

import { apiClient } from '../api/client';

const defaultDB: DBState = {
  currentUserEmail: null,
  users: [],
  accounts: [],
  transactions: [],
  recurring_transactions: [],
  goals: [],
  contracts: [],
  sacrifices: [],
  insights: [],
  groups: [],
  group_members: [],
  group_expenses: [],
  expense_splits: [],
  settlements: [],
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<DBState>(() => {
    const saved = localStorage.getItem('finverse_db');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { geminiApiKey: _removed, ...clean } = parsed;
        return {
          ...defaultDB,
          ...clean,
          accounts: clean.accounts || [],
          transactions: clean.transactions || [],
          groups: clean.groups || [],
          group_members: clean.group_members || [],
          group_expenses: clean.group_expenses || [],
          expense_splits: clean.expense_splits || [],
          settlements: clean.settlements || [],
        };
      } catch (e) {
        console.error('Failed to parse saved DB', e);
      }
    }
    return defaultDB;
  });

  // Fetch real data from Postgres API whenever currentUserEmail changes
  useEffect(() => {
    if (db.currentUserEmail) {
      apiClient.get<DBState>(`/finance/${encodeURIComponent(db.currentUserEmail)}/state`)
        .then((state) => {
          setDb(prev => ({
            ...state,
            currentUserEmail: prev.currentUserEmail
          }));
        })
        .catch(err => {
          console.error('Failed to fetch user state from backend API:', err);
        });
    }
  }, [db.currentUserEmail]);

  useEffect(() => {
    localStorage.setItem('finverse_db', JSON.stringify(db));
  }, [db]);

  const updateDB = (updater: (prev: DBState) => DBState) => {
    setDb(prev => updater(prev));
  };

  const clearDB = () => {
    setDb(defaultDB);
  };

  const executeSimulatedTransfer = (
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    idempotencyKey: string,
    category: string,
    description: string
  ): { success: boolean; error?: string; transaction?: Transaction } => {

    // 1. Deduplication Guard
    const existingTx = db.transactions.find(tx => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      return { success: existingTx.status === 'completed', transaction: existingTx };
    }

    // 2. Fetch Accounts
    const fromAccount = db.accounts.find(acc => acc.id === fromAccountId);
    const toAccount = db.accounts.find(acc => acc.id === toAccountId);

    if (!fromAccount || !toAccount) {
      return { success: false, error: 'INVALID_ACCOUNT' };
    }

    // 3. Overdraft Prevention
    if (fromAccount.balance < amount) {
      const failedTx: Transaction = {
        id: 'tx_' + Date.now(),
        user_id: fromAccount.userId,
        type: 'transfer',
        amount, category,
        merchant: 'System',
        description,
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'Internal Transfer',
        is_recurring: false,
        regret_tag: null,
        created_at: new Date().toISOString(),
        fromAccountId, toAccountId,
        status: 'failed',
        idempotencyKey,
      };
      updateDB(prev => ({ ...prev, transactions: [failedTx, ...prev.transactions] }));
      return { success: false, error: 'INSUFFICIENT_FUNDS', transaction: failedTx };
    }

    // 4. Atomic State Transition
    const completedTx: Transaction = {
      id: 'tx_' + Date.now(),
      user_id: fromAccount.userId,
      type: 'transfer',
      amount, category,
      merchant: 'System',
      description,
      transaction_date: new Date().toISOString().split('T')[0],
      payment_method: 'Internal Transfer',
      is_recurring: false,
      regret_tag: null,
      created_at: new Date().toISOString(),
      fromAccountId, toAccountId,
      status: 'completed',
      idempotencyKey,
    };

    updateDB(prev => {
      const updatedAccounts = prev.accounts.map(acc => {
        if (acc.id === fromAccountId) return { ...acc, balance: acc.balance - amount };
        if (acc.id === toAccountId) return { ...acc, balance: acc.balance + amount };
        return acc;
      });
      return { ...prev, accounts: updatedAccounts, transactions: [completedTx, ...prev.transactions] };
    });

    return { success: true, transaction: completedTx };
  };

  return (
    <FinanceContext.Provider value={{ db, updateDB, clearDB, executeSimulatedTransfer }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinanceDB = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinanceDB must be used within FinanceProvider');
  return context;
};

// Helper to get the current user's full data subset
export function getActiveUserData(db: DBState) {
  const user = db.users.find(u => u.email === db.currentUserEmail);
  if (!user) return null;

  return {
    user,
    accounts: (db.accounts || []).filter(a => a.userId === user.id),
    transactions: (db.transactions || []).filter(t => t.user_id === user.id),
    recurring: (db.recurring_transactions || []).filter(r => r.user_id === user.id),
    goals: (db.goals || []).filter(g => g.user_id === user.id),
    contracts: (db.contracts || []).filter(c => c.user_id === user.id),
    sacrifices: (db.sacrifices || []).filter(s => s.user_id === user.id),
    insights: (db.insights || []).filter(i => i.user_id === user.id),
    groups: (db.groups || []).filter(g => g.user_id === user.id),
    group_members: db.group_members || [],
    group_expenses: db.group_expenses || [],
    expense_splits: db.expense_splits || [],
    settlements: db.settlements || [],
  };
}
