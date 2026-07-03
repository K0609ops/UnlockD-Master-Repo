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
  password?: string;
  monthly_income: number;
  hours_per_week: number;
  target_savings_percentage?: number; // Phase 5: Dynamic daily pacing
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
  
  // Phase 4 Atomic Transfer Fields (CamelCase per Hackathon Gate Requirement)
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

export interface DBState {
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  recurring_transactions: RecurringTransaction[];
  goals: Goal[];
  contracts: Contract[];
  sacrifices: Sacrifice[];
  insights: Insight[];
  
  // App-specific session state
  currentUserEmail: string | null;
  geminiApiKey: string | null;
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

const defaultDB: DBState = {
  users: [],
  accounts: [],
  transactions: [],
  recurring_transactions: [],
  goals: [],
  contracts: [],
  sacrifices: [],
  insights: [],
  currentUserEmail: null,
  geminiApiKey: null
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<DBState>(() => {
    const saved = localStorage.getItem('finverse_db');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure legacy state gets new properties
        return {
          ...defaultDB,
          ...parsed,
          accounts: parsed.accounts || [],
          transactions: parsed.transactions || []
        };
      } catch (e) {
        console.error('Failed to parse saved DB', e);
      }
    }
    return defaultDB;
  });

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
    
    // 1. Deduplication Guard (Idempotency Key Check)
    const existingTx = db.transactions.find(tx => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      return { success: existingTx.status === 'completed', transaction: existingTx };
    }

    // 2. Fetch Account States
    const fromAccount = db.accounts.find(acc => acc.id === fromAccountId);
    const toAccount = db.accounts.find(acc => acc.id === toAccountId);

    if (!fromAccount || !toAccount) {
      return { success: false, error: 'INVALID_ACCOUNT' };
    }

    // 3. Simulation Guard: Overdraft Prevention Check
    if (fromAccount.balance < amount) {
      const failedTx: Transaction = {
        id: 'tx_' + Date.now(),
        user_id: fromAccount.userId,
        type: 'transfer',
        amount,
        category,
        merchant: 'System',
        description,
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'Internal Transfer',
        is_recurring: false,
        regret_tag: null,
        created_at: new Date().toISOString(),
        fromAccountId: fromAccountId,
        toAccountId: toAccountId,
        status: 'failed',
        idempotencyKey: idempotencyKey
      };
      
      updateDB(prev => ({
        ...prev,
        transactions: [failedTx, ...prev.transactions]
      }));
      
      return { success: false, error: 'INSUFFICIENT_FUNDS', transaction: failedTx };
    }

    // 4. Executing State Transition: Mutate balance sets atomically
    const completedTx: Transaction = {
      id: 'tx_' + Date.now(),
      user_id: fromAccount.userId,
      type: 'transfer',
      amount,
      category,
      merchant: 'System',
      description,
      transaction_date: new Date().toISOString().split('T')[0],
      payment_method: 'Internal Transfer',
      is_recurring: false,
      regret_tag: null,
      created_at: new Date().toISOString(),
      fromAccountId: fromAccountId,
      toAccountId: toAccountId,
      status: 'completed',
      idempotencyKey: idempotencyKey
    };

    updateDB(prev => {
      const updatedAccounts = prev.accounts.map(acc => {
        if (acc.id === fromAccountId) return { ...acc, balance: acc.balance - amount };
        if (acc.id === toAccountId) return { ...acc, balance: acc.balance + amount };
        return acc;
      });

      return {
        ...prev,
        accounts: updatedAccounts,
        transactions: [completedTx, ...prev.transactions]
      };
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

// Helper for the engine to get the current user's full subset of data
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
    insights: (db.insights || []).filter(i => i.user_id === user.id)
  };
}
