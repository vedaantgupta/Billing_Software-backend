const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Google AI with API Key
const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAkfgQ1ZUb10ybVGLEXLDrGscsRXFjLB-M";
const genAI = new GoogleGenerativeAI(API_KEY);

async function getAIResponse(prompt, history = [], businessContext = "") {
  try {
    // Models that are known to be active in this environment
    const modelsToTry = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash-latest"];
    let lastError = null;

    // Safety: Truncate business context
    const safeBusinessContext = businessContext.length > 30000 
      ? businessContext.substring(0, 30000) + "... [TRUNCATED]" 
      : businessContext;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI] Attempting with model: ${modelName}`);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: `You are an AI assistant for a professional Billing and Inventory Management Software. 
          Your goal is to help users manage their business efficiently. 
          
          SOFTWARE MODULES & ROUTES:
          - Dashboard: [/] - Overview of business health, charts.
          - Documents: [/documents] - Invoices, Purchase Orders, etc.
          - Inventory: [/products] - Product management, stock levels.
          - Contacts: [/contacts] - Customer and Vendor profiles.
          - Staff: [/staff] - Employee management.
          - Digital Ledger / Udhaar: [/ledger] - Transaction history.
          - Loan Manager: [/loans] - EMI tracking.
          - Bank Accounts: [/banks] - Bank management.
          - Payments: [/payments/inward] or [/payments/outward]
          - Daily Expenses: [/expenses/daily]
          - Reports: [/reports] - Detailed analytics.
          - History: [/history] - Audit log.
          - Compliance: [/compliance] - GST filing.
          - Settings: [/settings] - Preferences.

          BUSINESS CONTEXT:
          ${safeBusinessContext}
          
          Guidelines:
          - ALWAYS use the BUSINESS CONTEXT provided below to answer questions. 
          - YOU HAVE FULL ACCESS to ledger balances, contact lists, and inventory status provided in the context.
          - NEVER say "I don't have access to specific data" if the data is present in the BUSINESS CONTEXT.
          - If a contact (like 'Tiwari') is mentioned, search for them in the "Full Contact Details" or "All Outstanding Balances" sections below.
          - If you suggest navigating to a module or page, you MUST provide a BOLD MARKDOWN LINK using the route map above. 
            Example: "To view this, go to the [**Digital Ledger**](/ledger)."
          - Be proactive and helpful.
          - Keep responses professional and concise.`,
        });

        let cleanedHistory = [...history];
        // Gemini API requires the history to start with a 'user' role
        while (cleanedHistory.length > 0 && cleanedHistory[0].role !== 'user') {
          cleanedHistory.shift();
        }

        const chat = model.startChat({
          history: cleanedHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          })),
        });

        // Prepend business context to the prompt to force the model to see it in the current turn
        const enrichedPrompt = `BUSINESS CONTEXT DATA:
${safeBusinessContext}

USER QUESTION:
${prompt}`;

        const result = await chat.sendMessage(enrichedPrompt);
        const response = await result.response;
        const text = response.text();
        
        if (text) {
          console.log(`[AI] Success with model: ${modelName}`);
          return text;
        }
      } catch (err) {
        console.error(`[AI] Error with model ${modelName}:`, err.message);
        lastError = err;
        
        // If it's a quota error (429), don't keep trying other models, they share the same quota
        if (err.message.includes('429') || err.message.includes('Quota exceeded')) {
          return "I'm sorry, but your AI Assistant has reached its daily usage limit (Free Tier Quota). Please try again in a few hours or tomorrow. You can still use all other software features manually!";
        }

        // Continue to next model if it's a 404 or other temporary error
        continue;
      }
    }

    throw lastError || new Error("All AI models failed to respond.");
  } catch (error) {
    console.error("AI Assistant Service Error:", error);
    throw error;
  }
}

module.exports = { getAIResponse };
