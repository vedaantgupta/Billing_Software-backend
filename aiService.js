/**
 * Hugging Face AI Service for Billing & Management System
 * Powered by Hugging Face Serverless Router (Llama-3.3-70B, Qwen2.5-72B, Llama-3.1-8B)
 * Supports Autonomous Business Actions with User Permission Confirmation
 */

const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
function getHfToken() {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    console.error("[HuggingFace AI] HF_TOKEN is not defined in environment variables!");
  }
  return token;
}

const MODELS_TO_TRY = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct"
];

/**
 * Normalizes raw extracted action data into the software's standard database schema.
 */
function normalizeActionData(actionType, rawData = {}) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timestampId = Date.now().toString();

  switch (actionType) {
    case 'create_document': {
      const docType = rawData.docType || rawData.document_type || rawData.type || 'Sale Invoice';
      const customerName = rawData.customerName || rawData.customer_name || rawData.customer || rawData.client_name || rawData.clientName || rawData.client || rawData.party || rawData.buyer || rawData.vendor || rawData.vendorName || rawData.name || 'Customer';
      const rawItems = Array.isArray(rawData.items) ? rawData.items : [];
      const overallTax = Number(rawData.tax || rawData.gst || rawData.gst_percentage || rawData.tax_rate || 0);

      let subTotal = 0;
      let taxAmount = 0;
      const normalizedItems = rawItems.map((item, idx) => {
        const qty = Number(item.quantity || item.qty || 1);
        const rate = Number(item.price || item.unit_price || item.rate || item.unitPrice || 0);
        const taxRate = Number(item.tax || item.gst_percentage || item.gst || item.tax_rate || overallTax || 0);
        const lineSub = qty * rate;
        const lineTax = (lineSub * taxRate) / 100;
        subTotal += lineSub;
        taxAmount += lineTax;

        return {
          id: `item-${idx + 1}`,
          name: item.name || item.product_name || item.productName || item.description || `Item ${idx + 1}`,
          description: item.description || '',
          quantity: qty,
          unit: item.unit || 'Pieces (PCS)',
          price: rate,
          tax: String(taxRate),
          amount: Math.round((lineSub + lineTax) * 100) / 100
        };
      });

      // If no items were detailed, synthesize from provided total
      if (normalizedItems.length === 0) {
        const directTotal = Number(rawData.total || rawData.amount || rawData.grandTotal || 0);
        const taxRate = Number(rawData.tax || rawData.gst_percentage || 18);
        const derivedSub = directTotal > 0 ? (directTotal / (1 + taxRate / 100)) : 0;
        const derivedTax = directTotal - derivedSub;

        subTotal = Math.round(derivedSub * 100) / 100;
        taxAmount = Math.round(derivedTax * 100) / 100;
        normalizedItems.push({
          id: 'item-1',
          name: rawData.itemName || rawData.description || 'General Service / Goods',
          description: rawData.description || '',
          quantity: 1,
          unit: 'Numbers (NOS)',
          price: subTotal || directTotal,
          tax: String(taxRate),
          amount: directTotal || subTotal
        });
      }

      const grandTotal = Math.round((subTotal + taxAmount) * 100) / 100;
      const invPrefix = docType.toLowerCase().includes('purchase') ? 'PO' : (docType.toLowerCase().includes('quotation') ? 'QT' : 'INV');
      const invoiceNumber = rawData.invoiceNumber || rawData.invoice_number || `${invPrefix}-${Math.floor(1000 + Math.random() * 9000)}`;

      return {
        id: timestampId,
        docType,
        invoiceNumber,
        date: rawData.date || todayStr,
        dueDate: rawData.dueDate || rawData.due_date || todayStr,
        customerName,
        billingAddress: rawData.address || rawData.billingAddress || '',
        items: normalizedItems,
        subTotal,
        taxAmount,
        total: grandTotal,
        grandTotal,
        status: rawData.status || 'Unpaid',
        paymentStatus: rawData.paymentStatus || 'Unpaid',
        notes: rawData.notes || 'Generated via AI Assistant upon user confirmation.'
      };
    }

    case 'create_product': {
      const name = rawData.name || rawData.product_name || rawData.productName || 'New Product';
      const purchasePrice = Number(rawData.purchasePrice || rawData.cost_price || rawData.purchase_price || rawData.costPrice || 0);
      const sellingPrice = Number(rawData.sellingPrice || rawData.selling_price || rawData.price || 0);
      const stock = Number(rawData.stock || rawData.quantity || rawData.initial_stock || 0);
      const tax = String(rawData.tax || rawData.gst || rawData.tax_rate || '18');

      return {
        id: timestampId,
        itemType: rawData.itemType || 'product',
        name,
        description: rawData.description || `${name} (Added by AI Assistant)`,
        unit: rawData.unit || 'Pieces (PCS)',
        purchasePrice,
        sellingPrice: sellingPrice || purchasePrice,
        stock,
        tax,
        category: rawData.category || 'General',
        lowStockAlert: Number(rawData.lowStockAlert || rawData.low_stock_alert || 5)
      };
    }

    case 'create_contact': {
      const name = rawData.name || rawData.contactName || rawData.companyName || rawData.company_name || 'New Contact';
      const type = (rawData.type || 'customer').toLowerCase();
      const phone = rawData.phone || rawData.mobile || '';
      const email = rawData.email || '';
      const gstin = (rawData.gstin || rawData.gst || '').toUpperCase();
      const address = rawData.address || rawData.city || '';

      return {
        id: timestampId,
        name,
        companyName: rawData.companyName || name,
        type: (type === 'vendor' || type === 'supplier') ? 'vendor' : 'customer',
        phone,
        email,
        gstin,
        billing: {
          address: rawData.billingAddress || address,
          city: rawData.city || '',
          state: rawData.state || '',
          pincode: rawData.pincode || ''
        },
        shipping: {
          address: rawData.shippingAddress || address,
          city: rawData.city || '',
          state: rawData.state || '',
          pincode: rawData.pincode || ''
        }
      };
    }

    case 'create_staff': {
      const fullName = rawData.name || `${rawData.firstName || ''} ${rawData.lastName || ''}`.trim() || 'New Staff';
      const parts = fullName.split(' ');
      const firstName = rawData.firstName || parts[0] || 'Staff';
      const lastName = rawData.lastName || parts.slice(1).join(' ') || '';

      return {
        id: timestampId,
        firstName,
        lastName,
        name: fullName,
        phone: rawData.phone || '',
        email: rawData.email || '',
        role: rawData.role || rawData.position || rawData.designation || 'Staff Member',
        salary: Number(rawData.salary || 0),
        status: 'Active',
        joiningDate: rawData.joiningDate || rawData.joining_date || todayStr
      };
    }

    case 'create_project': {
      const name = rawData.name || rawData.project_name || 'New Project';
      const budget = Number(rawData.budget || 0);
      const generatedId = `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;

      return {
        id: timestampId,
        name,
        projectId: rawData.projectId || generatedId,
        clientName: rawData.clientName || rawData.client_name || rawData.customerName || '',
        status: rawData.status || 'Planned',
        startDate: rawData.startDate || rawData.start_date || todayStr,
        endDate: rawData.endDate || rawData.end_date || '',
        budget,
        priority: rawData.priority || 'Medium',
        description: rawData.description || `Project: ${name}`,
        color: '#4f46e5'
      };
    }

    case 'create_project_task': {
      return {
        id: timestampId,
        projectId: rawData.projectId || '',
        name: rawData.name || rawData.task_name || rawData.title || 'New Task',
        description: rawData.description || '',
        status: rawData.status || 'To Do',
        priority: rawData.priority || 'Medium',
        type: 'Task',
        dueDate: rawData.dueDate || rawData.due_date || '',
        createdAt: now.toISOString()
      };
    }

    case 'create_expense': {
      const amount = Number(rawData.amount || 0);
      const category = rawData.category || rawData.expense_category || 'Miscellaneous';

      return {
        id: timestampId,
        category,
        amount,
        grandTotal: amount,
        date: rawData.date || todayStr,
        paymentMode: rawData.paymentMode || rawData.payment_mode || rawData.paymentMethod || 'Cash',
        notes: rawData.notes || rawData.description || `Expense recorded for ${category}`
      };
    }

    case 'create_ledger_entry': {
      const amount = Number(rawData.amount || 0);
      const type = (rawData.type || 'dr').toLowerCase().includes('cr') ? 'cr' : 'dr';

      return {
        id: timestampId,
        contactName: rawData.contactName || rawData.contact_name || rawData.name || 'Unknown Contact',
        amount,
        type,
        date: rawData.date || todayStr,
        description: rawData.description || (type === 'dr' ? 'Receivable entry' : 'Payable entry')
      };
    }

    default:
      return { id: timestampId, ...rawData };
  }
}

/**
 * Main AI Assistant function.
 * Evaluates business context and user prompt.
 * If user wants an action executed, generates an action proposal requiring confirmation.
 * Output is structured JSON with `response` (markdown text) and `action` (executable payload or null).
 */
async function getAIResponse(prompt, history = [], businessContext = "") {
  const token = getHfToken();
  const safeBusinessContext = businessContext.length > 25000
    ? businessContext.substring(0, 25000) + "... [DATA TRUNCATED FOR LENGTH]"
    : businessContext;

  const systemInstruction = `You are the Autonomous AI Business Assistant for a Professional Enterprise Billing & Management Software.
You are equipped with full knowledge of the user's business and can both answer questions AND propose/execute actions on their behalf.

SOFTWARE MODULES & ROUTES:
- Dashboard: [/]
- Documents (Invoices, Quotations, Bills, Delivery Challans): [/documents]
- Products & Inventory: [/products]
- Contacts (Customers & Vendors): [/contacts]
- Staff / Human Resources: [/staff]
- Digital Ledger (Udhaar & Khata): [/ledger]
- Project Management: [/projects]
- Daily Expenses: [/expenses/daily]
- Loan Manager: [/loans]
- Bank Accounts: [/banks]
- Reports & Analytics: [/reports]

CRITICAL ACTION CAPABILITY:
You have the power to create and manage:
1. Documents (Sale Invoices, Purchase Invoices, Quotations, Delivery Challans, Bills) -> action type: "create_document", collection: "documents"
2. Products / Inventory Items -> action type: "create_product", collection: "products"
3. Contacts (Customers & Vendors) -> action type: "create_contact", collection: "contacts"
4. Staff Members -> action type: "create_staff", collection: "staff"
5. Projects -> action type: "create_project", collection: "projects"
6. Project Tasks -> action type: "create_project_task", collection: "project_tasks"
7. Expenses -> action type: "create_expense", collection: "expenses"
8. Digital Ledger Entries -> action type: "create_ledger_entry", collection: "ledger_transactions"

CRITICAL SAFETY & PERMISSION DIRECTIVE:
All data-altering actions REQUIRE explicit user permission before saving to the database.
When a user asks you to perform an action (e.g. "Create invoice for X", "Add product Y", "Add contact Z", "Create project W", "Record expense"):
1. Prepare the exact data payload in the "action" object.
2. In the "message", provide a friendly, beautifully formatted markdown preview of all details (items, prices, GST, totals, dates, names).
3. Conclude the message asking for user confirmation: "⚠️ *Please confirm: Would you like me to proceed and create this now? You can click 'Confirm & Execute' or reply 'Yes'.*"

If the user is just asking a question or requesting business analysis (e.g. "What is my total sales?", "Who owes me money?", "Which products are low on stock?"):
- Provide a helpful, clear markdown answer grounded strictly in the BUSINESS CONTEXT provided below.
- Set "action": null.

FORMAT REQUIREMENTS:
You MUST respond with a single valid JSON object strictly matching this schema:
{
  "message": "Markdown response text to display to user",
  "action": null | {
    "type": "create_document" | "create_product" | "create_contact" | "create_staff" | "create_project" | "create_project_task" | "create_expense" | "create_ledger_entry",
    "collection": "documents" | "products" | "contacts" | "staff" | "projects" | "project_tasks" | "expenses" | "ledger_transactions",
    "label": "Action title for button, e.g. 'Confirm & Create Invoice for Ramesh'",
    "data": { ...extracted structured fields... }
  }
}
DO NOT include any text outside the JSON object.

LIVE BUSINESS DATA CONTEXT:
${safeBusinessContext}
`;

  // Build chat messages array
  const formattedMessages = [{ role: "system", content: systemInstruction }];

  // Add recent history
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      formattedMessages.push({ role: 'user', content: String(msg.content) });
    } else if (msg.role === 'ai' || msg.role === 'assistant' || msg.role === 'model') {
      const contentStr = typeof msg.content === 'object' ? JSON.stringify(msg.content) : String(msg.content);
      formattedMessages.push({ role: 'assistant', content: contentStr });
    }
  }

  // Append user prompt
  formattedMessages.push({ role: "user", content: prompt });

  let lastError = null;

  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`[HuggingFace AI] Requesting model: ${modelName}`);
      const res = await fetch(HF_ROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: formattedMessages,
          temperature: 0.15,
          max_tokens: 1800,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[HuggingFace AI] Model ${modelName} returned status ${res.status}: ${errText.slice(0, 200)}`);
        lastError = new Error(`HF HTTP ${res.status}: ${errText}`);
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

      if (!rawContent) {
        console.warn(`[HuggingFace AI] Model ${modelName} returned empty content.`);
        continue;
      }

      // Parse JSON from model output
      let parsed = null;
      try {
        parsed = JSON.parse(rawContent);
      } catch (jsonErr) {
        // Attempt substring extraction if wrapped in backticks
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          try {
            parsed = JSON.parse(rawContent.substring(firstBrace, lastBrace + 1));
          } catch (innerErr) {
            console.warn("[HuggingFace AI] Failed to parse extracted JSON substring:", innerErr.message);
          }
        }
      }

      if (parsed && typeof parsed === 'object') {
        const responseMessage = parsed.message || (typeof parsed.response === 'string' ? parsed.response : rawContent);
        let normalizedAction = null;

        if (parsed.action && parsed.action.type && parsed.action.data) {
          const actionType = parsed.action.type;
          const collection = parsed.action.collection || getCollectionForAction(actionType);
          const normalizedData = normalizeActionData(actionType, parsed.action.data);

          normalizedAction = {
            actionId: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type: actionType,
            collection,
            label: parsed.action.label || generateActionLabel(actionType, normalizedData),
            summary: parsed.action.summary || parsed.action.label || '',
            data: normalizedData,
            status: 'pending'
          };
        }

        console.log(`[HuggingFace AI] Success with model: ${modelName}. Action proposed: ${normalizedAction ? normalizedAction.type : 'none'}`);
        return {
          response: responseMessage,
          action: normalizedAction
        };
      } else {
        // Model returned plain text instead of JSON
        console.log(`[HuggingFace AI] Model returned raw text.`);
        return {
          response: rawContent,
          action: null
        };
      }
    } catch (err) {
      console.error(`[HuggingFace AI] Error with model ${modelName}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("All Hugging Face AI models failed to respond.");
}

function getCollectionForAction(type) {
  switch (type) {
    case 'create_document': return 'documents';
    case 'create_product': return 'products';
    case 'create_contact': return 'contacts';
    case 'create_staff': return 'staff';
    case 'create_project': return 'projects';
    case 'create_project_task': return 'project_tasks';
    case 'create_expense': return 'expenses';
    case 'create_ledger_entry': return 'ledger_transactions';
    default: return 'documents';
  }
}

function generateActionLabel(type, data) {
  switch (type) {
    case 'create_document':
      return `Confirm & Create ${data.docType || 'Invoice'} for ${data.customerName || 'Customer'} (₹${Number(data.grandTotal || data.total || 0).toLocaleString()})`;
    case 'create_product':
      return `Confirm & Add Product: ${data.name || 'Item'} (₹${Number(data.sellingPrice || 0).toLocaleString()})`;
    case 'create_contact':
      return `Confirm & Add Contact: ${data.name || data.companyName || 'Contact'}`;
    case 'create_staff':
      return `Confirm & Add Staff: ${data.firstName || ''} ${data.lastName || ''}`.trim();
    case 'create_project':
      return `Confirm & Add Project: ${data.name || 'Project'} (₹${Number(data.budget || 0).toLocaleString()})`;
    case 'create_project_task':
      return `Confirm & Add Task: ${data.name || 'Task'}`;
    case 'create_expense':
      return `Confirm & Record Expense: ₹${Number(data.amount || 0).toLocaleString()} (${data.category || 'Expense'})`;
    case 'create_ledger_entry':
      return `Confirm & Record Ledger ${data.type === 'dr' ? 'Receivable' : 'Payable'}: ₹${Number(data.amount || 0).toLocaleString()}`;
    default:
      return 'Confirm & Execute Action';
  }
}

/**
 * Enterprise Project Copilot powered by Hugging Face AI
 */
async function getProjectAIResponse(mode, prompt, projectContext = {}) {
  const token = getHfToken();

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

  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`[Project Copilot HF] Attempting with model: ${modelName}`);
      const res = await fetch(HF_ROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: contextPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1500
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (text) return text;
      }
    } catch (err) {
      console.warn(`[Project Copilot HF] Model ${modelName} failed:`, err.message);
    }
  }

  // Deterministic fallback if offline
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

module.exports = { getAIResponse, getProjectAIResponse, normalizeActionData };
