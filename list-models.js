const key = "AIzaSyAkfgQ1ZUb10ybVGLEXLDrGscsRXFjLB-M";
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
  const genAI = new GoogleGenerativeAI(key);
  try {
    // There isn't a direct listModels in the simple SDK, but we can try to find out
    // Actually, let's just try the most basic model name: gemini-pro
    console.log("Testing with gemini-pro...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hello");
    const response = await result.response;
    console.log("Success with gemini-pro:", response.text());
  } catch (err) {
    console.error("Failed with gemini-pro:", err.message);
    
    try {
      console.log("Testing with gemini-1.0-pro...");
      const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
      const result = await model.generateContent("Hello");
      const response = await result.response;
      console.log("Success with gemini-1.0-pro:", response.text());
    } catch (err2) {
      console.error("Failed with gemini-1.0-pro:", err2.message);
    }
  }
}

listModels();
