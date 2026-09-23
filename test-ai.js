require('dotenv').config();
const { getAIResponse, getProjectAIResponse } = require('./aiService');

async function test() {
  console.log("=== Testing Google Gemini AI Service ===");
  const dummyContext = `
    - Total Products: 10
    - Recent Products: Laptop, Wireless Mouse, Mechanical Keyboard
    - Low Stock Products: Wireless Mouse (Stock: 2, Alert: 5)
    - Total Sales Amount: ₹50,000
    - Total Customers: 4 (Sharma Traders, Apex Corp)
  `;

  try {
    // Test 1: Answering question
    console.log("\n1. Testing Query (Low Stock)...");
    const res1 = await getAIResponse("What products are running low on stock?", [], dummyContext);
    console.log("Query Response:", res1.response);
    console.log("Action (should be null):", res1.action);

    // Test 2: Creating an Invoice
    console.log("\n2. Testing Action Generation (Create Invoice)...");
    const res2 = await getAIResponse("Create a sale invoice for Sharma Traders for 5 Mechanical Keyboards at 1200 each with 18% GST", [], dummyContext);
    console.log("Action Proposal Response Preview:\n", res2.response.slice(0, 300));
    console.log("Action Object:", JSON.stringify(res2.action, null, 2));

    // Test 3: Project Copilot
    console.log("\n3. Testing Project Copilot with Google Gemini...");
    const copilotRes = await getProjectAIResponse('summary', 'Provide summary', {
      project: { name: 'ERP Modernization', status: 'Active', budget: 500000 },
      tasks: [
        { name: 'Architecture Plan', status: 'Done' },
        { name: 'Google Gemini Integration', status: 'In Progress' }
      ]
    });
    console.log("Copilot Response:\n", copilotRes.slice(0, 300));

    console.log("\n✅ All Google Gemini tests succeeded!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
}

test();

