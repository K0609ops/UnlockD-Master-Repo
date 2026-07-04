import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

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
  password?: string;
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
  transaction_date: string;
  payment_method: string;
  is_recurring: boolean;
  regret_tag: 'good' | 'bad' | null;
  created_at: string;
  goal_id?: string;
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
  groups: Group[];
  group_members: GroupMember[];
  group_expenses: GroupExpense[];
  expense_splits: ExpenseSplit[];
  settlements: Settlement[];
  currentUserEmail: string | null;
}

interface FinanceContextType {
  db: DBState;
  updateDB: (updater: (prev: DBState) => DBState) => void;
  clearDB: () => void;
  refreshFromBackend: () => Promise<void>;
}

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

  // Track whether we've already hydrated from backend for the current email.
  // This prevents the re-hydration on every render from wiping optimistic updates.
  const hydratedEmailRef = useRef<string | null>(null);

  const refreshFromBackend = async () => {
    try {
      const state = await apiClient.get<DBState>('/finance/state');
      setDb(prev => ({
        ...state,
        currentUserEmail: prev.currentUserEmail,
      }));
      if (db.currentUserEmail) {
        hydratedEmailRef.current = db.currentUserEmail;
      }
    } catch (err) {
      console.error('Failed to fetch state from backend:', err);
    }
  };

  // Hydrate from backend ONCE per login session (not on every re-render)
  useEffect(() => {
    if (db.currentUserEmail && hydratedEmailRef.current !== db.currentUserEmail) {
      hydratedEmailRef.current = db.currentUserEmail;
      refreshFromBackend();
    }
  }, [db.currentUserEmail]);

  // Persist to localStorage (excludes sensitive keys)
  useEffect(() => {
    localStorage.setItem('finverse_db', JSON.stringify(db));
  }, [db]);

  const updateDB = (updater: (prev: DBState) => DBState) => {
    setDb(prev => updater(prev));
  };

  const clearDB = () => {
    setDb(defaultDB);
  };

  return (
    <FinanceContext.Provider value={{ db, updateDB, clearDB, refreshFromBackend }}>
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
