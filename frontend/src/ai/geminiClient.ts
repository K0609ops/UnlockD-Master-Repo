import { GoogleGenAI } from '@google/genai';

export interface NegotiationResult {
  present_argument: string;
  future_argument: string;
  resolution: string;
  outcome: 'proceed' | 'skip' | 'reduced';
}

export const GEMINI_ENABLED = !!(import.meta.env.VITE_GEMINI_API_KEY);
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

/**
 * Negotiation Engine — calls Gemini with real financial engine data.
 * DO NOT pass API key from UI. Key lives in .env only.
 */
export async function runNegotiation(
  merchant: string,
  amount: number,
  category: string,
  baselineSafe: number,
  scenarioSafe: number,
  baselineRisk: string,
  scenarioRisk: string
): Promise<NegotiationResult> {
  // If no API key, return a deterministic local fallback so the app always works
  if (!GEMINI_API_KEY) {
    const shouldProceed = scenarioRisk !== 'storm';
    return {
      present_argument: `I want to buy ${merchant} for ₹${amount}. My safe-to-spend is ₹${baselineSafe} right now — this feels manageable.`,
      future_argument: `This purchase drops our margin by ₹${Math.abs(baselineSafe - scenarioSafe).toFixed(0)} and shifts risk from ${baselineRisk} to ${scenarioRisk}. ${ shouldProceed ? "We can absorb it." : "We cannot absorb this right now."}`,
      resolution: shouldProceed ? 'You are clear to proceed.' : 'Skip it — risk threshold breached.',
      outcome: shouldProceed ? 'proceed' : 'skip',
    };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const payload = `
    User wants to buy: ${merchant} for ₹${amount} in ${category}.
    Real engine data:
    - Safe to spend drops from ₹${baselineSafe} to ₹${scenarioSafe}.
    - Risk status goes from ${baselineRisk} to ${scenarioRisk}.
  `;

  const prompt = `
    You are the FINVERSE Negotiation Engine. You will simulate two agents debating a purchase.
    
    Here is the real financial data (DO NOT INVENT ANY OTHER NUMBERS):
    ${payload}

    Agent 1: "Present You"
    You are "Present You" — the user's voice of immediate desire, arguing FOR a purchase. Use ONLY the real numbers above. Make a genuine, human case in one paragraph, first person, under 40 words, conversational, no hedging.

    Agent 2: "Future You"
    You are "Future You" — grounded and protective. Counter using specific real figures only (ending balance difference, goal-delay days, risk change) — never a vague warning. One paragraph, first person, under 40 words, calm not scolding. End with a concrete resolution.

    Output a valid JSON object strictly matching this schema, without markdown formatting:
    {
      "present_argument": "...",
      "future_argument": "...",
      "resolution": "...",
      "outcome": "proceed" | "skip" | "reduced"
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt
  });

  let responseText = response.text || '';
  responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(responseText) as NegotiationResult;
  } catch {
    console.error('Gemini parse error', responseText);
    throw new Error('Failed to parse Gemini response.');
  }
}
