/**
 * CDP Auth Test - Test browser detection and auth flow
 */
import { 
  isCDPAvailable, 
  extractCookiesViaCDP, 
  getBrowserDebugCommand,
  getResolvedBrowserInfo,
  getInstalledBrowsers,
  refreshAuthViaCDP,
} from "../src/auth/cdp-provider";
import { getAuthManager } from "../src/auth/manager";
import { getClient } from "../src/client";

async function testBrowserDetection() {
  console.log("=== Browser Detection ===\n");
  
  const browsers = getInstalledBrowsers();
  console.log("Installed browsers:");
  for (const b of browsers) {
    console.log(`  • ${b.name}: ${b.path}`);
  }
  
  const resolved = getResolvedBrowserInfo();
  if (resolved) {
    console.log(`\nSelected: ${resolved.name}`);
  } else {
    console.log("\n❌ No compatible browser found");
  }
}

async function testCDPConnection() {
  console.log("\n=== CDP Connection ===\n");
  
  const available = await isCDPAvailable();
  console.log(`CDP available: ${available}`);
  
  if (!available) {
    console.log("\n❌ Browser not running with CDP.");
    console.log("Run this command first:\n");
    console.log(getBrowserDebugCommand());
    return false;
  }
  
  return true;
}

async function testCookieExtraction() {
  console.log("\n=== Cookie Extraction ===\n");
  
  const cookies = await extractCookiesViaCDP();
  
  if (cookies) {
    console.log("✅ Cookies extracted:");
    console.log(`   Found ${Object.keys(cookies).length} cookies`);
    console.log(`   Has SID: ${"SID" in cookies}`);
    console.log(`   Has HSID: ${"HSID" in cookies}`);
    return true;
  } else {
    console.log("❌ Failed to extract cookies. Login to NotebookLM first.");
    return false;
  }
}

async function testAuthManager() {
  console.log("\n=== AuthManager ===\n");
  
  const authManager = getAuthManager();
  console.log(`State: ${authManager.getState().status}`);
  console.log(`CDP Enabled: ${authManager.getConfig().cdpEnabled}`);
  
  console.log("\nCalling ensureValid()...");
  const valid = await authManager.ensureValid();
  console.log(`Auth valid: ${valid}`);
  console.log(`State after: ${authManager.getState().status}`);
  
  return valid;
}

async function testGetClient() {
  console.log("\n=== getClient() ===\n");
  
  try {
    const client = await getClient();
    console.log("✅ Client created successfully");
    
    // Try listing notebooks
    const notebooks = await client.listNotebooks();
    console.log(`✅ Found ${notebooks.length} notebooks`);
    for (const nb of notebooks) {
      console.log(`   • ${nb.title}`);
    }
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error}`);
    return false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     NotebookLM CDP Auth Test         ║");
  console.log("╚══════════════════════════════════════╝\n");
  
  await testBrowserDetection();
  
  // Check CDP status (info only)
  const cdpOk = await testCDPConnection();
  if (!cdpOk) {
    console.log("\n→ Browser will be auto-launched by AuthManager...\n");
  }
  
  // Let AuthManager handle everything (including auto-launch)
  const authOk = await testAuthManager();
  if (!authOk) {
    console.log("\n⚠️  AuthManager failed to validate.");
    process.exit(1);
  }
  
  const clientOk = await testGetClient();
  if (!clientOk) {
    console.log("\n⚠️  Client failed.");
    process.exit(1);
  }
  
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     ✅ All tests passed!              ║");
  console.log("╚══════════════════════════════════════╝\n");
}

main().catch(console.error);
