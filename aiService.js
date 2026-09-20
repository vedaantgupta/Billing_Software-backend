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

async function getProjectAIResponse(mode, prompt, projectContext = {}) {
  const modelsToTry = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash-latest"];
  
  const systemInstructions = `You are an elite Enterprise Project Management AI Architect and Copilot.
You assist project managers, tech leads, and teams.
Your responses MUST BE STRICTLY GROUNDED in the provided project data.
NEVER fabricate facts or invent tasks that do not exist unless explicitly asked to generate new task suggestions.
When reporting risks, ALWAYS strictly separate:
FACT: (exact data points like "3 tasks are overdue", "Total budget variance is +14%")
AI INFERENCE: (reasoned probability like "Milestone Beta may be delayed by 5 days")

Mode requested: ${mode}
`;

  const contextPrompt = `PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

USER PROMPT / TASK:
${prompt || `Perform ${mode} analysis`}
`;

  try {
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstructions
        });

        const result = await model.generateContent(contextPrompt);
        const text = result.response.text();
        if (text) return text;
      } catch (err) {
        console.warn(`[Project AI] Model ${modelName} failed:`, err.message);
        if (err.message.includes('429') || err.message.includes('Quota exceeded')) break;
      }
    }
  } catch (err) {
    console.error("[Project AI] Gemini request failed:", err);
  }

  // Resilient deterministic fallback if AI service is offline or rate-limited
  return generateDeterministicFallback(mode, prompt, projectContext);
}

function generateDeterministicFallback(mode, prompt, context) {
  const project = context.project || {};
  const tasks = context.tasks || [];
  const milestones = context.milestones || [];
  
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
  const now = new Date();
  const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'Done');
  const blockedTasks = tasks.filter(t => t.status === 'Blocked');
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (mode === 'summary') {
    return `### Project Executive Summary: ${project.name || 'Current Project'}
**Overall Progress**: ${progressPct}% (${completedTasks}/${totalTasks} tasks completed)
**Status**: ${project.status || 'Active'}
**Health**: ${overdueTasks.length > 0 || blockedTasks.length > 0 ? 'Needs Attention' : 'On Track'}

#### Key Metrics:
- **Active Tasks**: ${inProgressTasks}
- **Overdue Tasks**: ${overdueTasks.length}
- **Blocked Tasks**: ${blockedTasks.length}
- **Upcoming Milestones**: ${milestones.filter(m => m.status !== 'Achieved').length}

#### Critical Observations:
${overdueTasks.length > 0 ? `- **Overdue Items**: ${overdueTasks.slice(0, 3).map(t => t.name).join(', ')}` : '- Schedule adherence is currently healthy.'}
${blockedTasks.length > 0 ? `- **Blockers**: ${blockedTasks.map(t => t.name).join(', ')} require immediate unblocking.` : '- No active blockers recorded.'}`;
  }

  if (mode === 'breakdown') {
    return JSON.stringify([
      { name: "Requirements Analysis & Architecture Plan", type: "Task", priority: "High", estimatedHours: 8, subtasks: [{ title: "Scope definition" }, { title: "Technical specification" }] },
      { name: "Core Implementation & Feature Setup", type: "Task", priority: "High", estimatedHours: 16, subtasks: [{ title: "Frontend components" }, { title: "Backend endpoints" }] },
      { name: "Integration, Review & QA Testing", type: "Task", priority: "Medium", estimatedHours: 8, subtasks: [{ title: "Unit & E2E verification" }, { title: "Bug fixes" }] },
      { name: "Deployment & Documentation", type: "Task", priority: "Medium", estimatedHours: 4, subtasks: [{ title: "Release notes" }, { title: "User walkthrough" }] }
    ], null, 2);
  }

  if (mode === 'risks') {
    return `### Project Risk & Health Analysis

#### FACTS:
- ${overdueTasks.length} tasks are currently past their due date.
- ${blockedTasks.length} tasks are in Blocked status.
- Project completion is at ${progressPct}% with ${totalTasks - completedTasks} remaining tasks.

#### AI INFERENCE:
- ${overdueTasks.length > 0 ? 'Overdue tasks in the critical path present a moderate risk of delaying upcoming milestones.' : 'Low risk of schedule slippage based on current milestone dates.'}
- Resource allocation should focus on resolving ${blockedTasks.length ? 'blocked tasks' : 'high-priority items'}.`;
  }

  if (mode === 'scheduling') {
    return `### Scheduling & Dependency Assessment
- Analyzed ${totalTasks} tasks and ${milestones.length} milestones.
- Recommended Action: Reassign or extend target dates for ${overdueTasks.length} overdue tasks.
- Prioritize Finish-to-Start predecessor dependencies to prevent cascading bottlenecks.`;
  }

  return `Based on live project data: Project "${project.name || 'Project'}" has ${totalTasks} tasks (${completedTasks} completed, ${overdueTasks.length} overdue). Budget allocated: ₹${Number(project.budget || 0).toLocaleString()}.`;
}

module.exports = { getAIResponse, getProjectAIResponse };
