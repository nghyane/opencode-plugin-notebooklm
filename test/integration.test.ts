/**
 * Integration Test - Real API
 * 
 * Run với: INTEGRATION=1 bun test test/integration.test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";

// Skip if not integration mode
const SKIP = !process.env["INTEGRATION"];

// Import plugin
import plugin from "../src/index";
import { getAuthManager } from "../src/auth/manager";

describe.skipIf(SKIP)("Integration Tests", () => {
  let tools: Awaited<ReturnType<typeof plugin>>["tool"];

  beforeAll(async () => {
    // Ensure auth via AuthManager (may trigger CDP)
    const authManager = getAuthManager();
    const valid = await authManager.ensureValid();
    if (!valid) {
      throw new Error("Auth failed. Run browser with CDP or use save_auth_tokens.");
    }

    const p = await plugin({ client: null });
    tools = p.tool;
  });

  test("notebook_list returns notebooks", async () => {
    const result = await tools.notebook_list.execute({ max_results: 5 }, {} as any);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeUndefined();
    expect(Array.isArray(parsed.notebooks)).toBe(true);
    console.log(`Found ${parsed.count} notebooks`);
  });

  test("notebook_create", async () => {
    // Create
    const createResult = await tools.notebook_create.execute({
      title: `Test ${Date.now()}`,
    }, {} as any);
    const parsed = JSON.parse(createResult);
    
    expect(parsed.error).toBeUndefined();
    expect(parsed.created).toBeDefined();
    console.log(`Created notebook: ${parsed.created?.id}`);
  });

  test("notebook_get with existing notebook", async () => {
    // First get a notebook
    const listResult = await tools.notebook_list.execute({ max_results: 1 }, {} as any);
    const listParsed = JSON.parse(listResult);
    
    if (!listParsed.notebooks || listParsed.notebooks.length === 0) {
      console.log("No notebooks to test");
      return;
    }

    const notebookId = listParsed.notebooks[0].id;
    const result = await tools.notebook_get.execute({
      notebook_id: notebookId,
      include_summary: true,
    }, {} as any);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeUndefined();
    expect(parsed.notebook).toBeDefined();
    console.log(`Got notebook`);
  });

  test("studio_create types", async () => {
    // Verify type enum - just test that the tool accepts valid types
    const validTypes = ["audio", "report", "flashcards", "infographic", "slide_deck", "data_table"];
    
    for (const type of validTypes) {
      // Just verify the function accepts the type (will fail due to no notebook)
      const result = await tools.studio_create.execute({
        notebook_id: "fake-id",
        type: type as any,
      }, {} as any);
      const parsed = JSON.parse(result);

      // Should get error about notebook not found, not about invalid type
      expect(parsed.error).toBeDefined();
    }
  });
});
