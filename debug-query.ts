
import { NotebookLMClient } from "./src/client/notebooklm";
import { CONSTANTS } from "./src/constants";

async function test() {
  const cookie = process.env.NOTEBOOKLM_COOKIE;
  if (!cookie) {
    console.error("No cookie found in env");
    process.exit(1);
  }

  const client = new NotebookLMClient(cookie);
  const nbId = "7eb36e21-e783-48a5-9145-6d8b73d1ed2f";
  
  console.log("Querying notebook:", nbId);
  try {
    const res = await client.query(nbId, "OpenCode là gì?");
    console.log("Result:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
