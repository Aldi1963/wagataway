import { handleOrderFlow } from "./artifacts/api-server/src/lib/bot-order-flow.js";

// Mocking some data or just calling the function to see the output string
// Note: This requires the db to be reachable and some data to exist.
// Since I can't easily mock the whole DB here without changing code, 
// I'll trust the logic or try a very simple test.

async function test() {
  console.log("Testing handleOrderFlow...");
  // Using some dummy IDs
  try {
    const reply = await handleOrderFlow(1, 1, "62812345678", "katalog");
    console.log("Reply for 'katalog':\n", reply);
  } catch (e) {
    console.error("Test failed (likely DB connection):", e.message);
  }
}

test();
