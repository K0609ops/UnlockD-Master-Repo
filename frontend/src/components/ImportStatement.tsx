import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, XCircle } from 'lucide-react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';

export interface ParsedTransaction {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  is_recurring: boolean;
  type: 'expense' | 'income';
}

function parseLocalStatement(csvText: string): ParsedTransaction[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) throw new Error("File is empty or not a valid CSV.");

  const headers = lines[0].toLowerCase().split(',');
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('merchant'));
  const amtIdx = headers.findIndex(h => h.includes('amount'));
  const typeIdx = headers.findIndex(h => h.includes('type'));

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) {
    throw new Error("Could not detect Date, Description, and Amount columns.");
  }

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < Math.max(dateIdx, descIdx, amtIdx) + 1) continue;

    let date = cols[dateIdx];
    let merchantRaw = cols[descIdx];
    let amtStr = cols[amtIdx].replace(/[^0-9.-]/g, '');
    let amount = parseFloat(amtStr);
    
    if (isNaN(amount)) continue;

    let typeStr = typeIdx !== -1 ? cols[typeIdx].toLowerCase() : '';
    let isIncome = amount > 0 || typeStr.includes('credit') || typeStr.includes('income');
    amount = Math.abs(amount);

    // Rule-based categorization and cleanup
    let merchant = merchantRaw.toUpperCase();
    let category = 'Others';
    let is_recurring = false;

    // Categorization Rules
    if (merchant.includes('GROCERIES') || merchant.includes('BIGBASKET') || merchant.includes('WHOLEFOODS')) category = 'Groceries';
    else if (merchant.includes('STARBUCKS') || merchant.includes('ZOMATO') || merchant.includes('SWIGGY') || merchant.includes('DELI')) category = 'Dining';
    else if (merchant.includes('NETFLIX') || merchant.includes('SPOTIFY') || merchant.includes('PRIME')) category = 'Entertainment';
    else if (merchant.includes('UBER') || merchant.includes('OLA') || merchant.includes('INDIAN OIL') || merchant.includes('FUEL')) category = 'Transportation';
    else if (merchant.includes('CULT.FIT') || merchant.includes('GYM') || merchant.includes('PHARMACY') || merchant.includes('APOLLO')) category = 'Health';
    else if (merchant.includes('AMZN') || merchant.includes('AMAZON') || merchant.includes('FLIPKART')) category = 'Shopping';
    else if (merchant.includes('RENT') || merchant.includes('RESIDENCY') || merchant.includes('HOUSING')) category = 'Housing';
    else if (merchant.includes('SALARY') || merchant.includes('PAYROLL')) category = 'Income';
    else if (merchant.includes('MAKEMYTRIP') || merchant.includes('AIRLINES') || merchant.includes('TRIP')) category = 'Travel';

    // Recurring Rules
    if (
      merchant.includes('SUBSCRIPTION') || 
      merchant.includes('PREMIUM') || 
      merchant.includes('NETFLIX') || 
      merchant.includes('SPOTIFY') || 
      merchant.includes('RENT') || 
      merchant.includes('SALARY') ||
      merchant.includes('AWS')
    ) {
      is_recurring = true;
    }

    // Clean Merchant Name
    let cleanMerchant = merchantRaw
      .replace(/(\*|\#)[0-9A-Za-z]+/, '') // Remove store numbers like *123 or #1209
      .replace(/\s+/g, ' ')
      .trim();
    
    // Title case
    cleanMerchant = cleanMerchant.toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');

    results.push({
      merchant: cleanMerchant,
      amount,
      date,
      category,
      is_recurring,
      type: isIncome ? 'income' : 'expense'
    });
  }

  return results;
}

export const ImportStatement: React.FC = () => {
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [parsedTxs, setParsedTxs] = useState<ParsedTransaction[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      setError(null);
      setParsedTxs([]);

      try {
        const txs = parseLocalStatement(text);
        setParsedTxs(txs);
      } catch (err: any) {
        setError(err.message || 'Failed to parse statement.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (!activeData || parsedTxs.length === 0) return;
    setIsSaving(true);

    const newTxs = parsedTxs.map(pt => ({
      id: 'tx_imp_' + Date.now() + Math.random().toString(36).substring(7),
      user_id: activeData.user.id,
      type: pt.type,
      amount: pt.amount,
      category: pt.category,
      merchant: pt.merchant,
      description: 'Imported via CSV',
      transaction_date: pt.date,
      payment_method: 'Imported',
      is_recurring: pt.is_recurring,
      regret_tag: null,
      created_at: new Date().toISOString()
    }));

    updateDB(prev => {
      const newAccounts = [...prev.accounts];
      const primaryIdx = newAccounts.findIndex(a => a.accountType === 'primary');
      
      let netChange = 0;
      parsedTxs.forEach(pt => {
        netChange += pt.type === 'income' ? pt.amount : -pt.amount;
      });

      if (primaryIdx !== -1) {
        newAccounts[primaryIdx] = {
          ...newAccounts[primaryIdx],
          balance: newAccounts[primaryIdx].balance + netChange
        };
      }

      return {
        ...prev,
        transactions: [...newTxs, ...prev.transactions],
        accounts: newAccounts
      };
    });

    setParsedTxs([]);
    setIsSaving(false);
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-section font-serif text-lg">Local Statement Import</h3>
          <p className="text-xs text-muted mt-1">Upload a CSV bank statement. Processed securely and instantly in your browser.</p>
        </div>
        
        {parsedTxs.length === 0 && (
          <div>
            <input 
              type="file" 
              accept=".csv,.txt"
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-paper border border-line hover:border-ink rounded-xl text-sm font-medium transition-colors text-ink"
            >
              <UploadCloud className="w-4 h-4" />
              Upload CSV
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-danger-soft border border-danger/30 rounded-xl text-danger text-sm flex items-center gap-2">
          <XCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {parsedTxs.length > 0 && (
        <div className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-4 border-t border-line pt-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Parsed {parsedTxs.length} Transactions
            </h4>
            <div className="flex gap-2">
              <button 
                onClick={() => setParsedTxs([])} 
                className="px-4 py-2 text-sm font-medium text-muted hover:text-danger"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium bg-ink text-paper rounded-xl hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {isSaving ? 'Saving...' : 'Save to Ledger'}
              </button>
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto border border-line rounded-xl bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface sticky top-0 border-b border-line">
                <tr>
                  <th className="p-3 font-semibold text-muted text-xs uppercase tracking-wider">Date</th>
                  <th className="p-3 font-semibold text-muted text-xs uppercase tracking-wider">Merchant & Category</th>
                  <th className="p-3 font-semibold text-muted text-xs uppercase tracking-wider">Type</th>
                  <th className="p-3 font-semibold text-muted text-xs uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {parsedTxs.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-surface/50">
                    <td className="p-3 font-mono text-muted">{tx.date}</td>
                    <td className="p-3">
                      <div className="font-medium text-ink flex items-center gap-2">
                        {tx.merchant}
                        {tx.is_recurring && <span className="text-[9px] bg-future-soft text-future px-1.5 py-0.5 rounded font-bold uppercase">Recurring</span>}
                      </div>
                      <div className="text-xs text-muted">{tx.category}</div>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-1 rounded font-medium uppercase tracking-wider ${tx.type === 'income' ? 'bg-success-soft text-success' : 'bg-surface text-ink border border-line'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-mono font-bold ${tx.type === 'income' ? 'text-success' : 'text-ink'}`}>
                      {tx.type === 'income' ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
