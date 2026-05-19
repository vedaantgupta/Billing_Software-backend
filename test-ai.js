const key = "AIzaSyAkfgQ1ZUb10ybVGLEXLDrGscsRXFjLB-M";
process.env.GEMINI_API_KEY = key;
const { getAIResponse } = require('./aiService');

async function test() {
  console.log("Testing AI Service with Business Context...");
  const dummyContext = `
    - Total Products: 10
    - Recent Products: Laptop, Mouse, Keyboard
    - Total Sales Amount: 50000
  `;
  try {
    const response = await getAIResponse("How much are my total sales and what products do I have?", [], dummyContext);
    console.log("AI Response:", response);
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
