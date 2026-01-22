/**
 * Integration Test - Real API
 * 
 * Run với: INTEGRATION=1 bun test test/integration.test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";

// Skip if not integration mode
const SKIP = !process.env.INTEGRATION;

// Import plugin
import plugin from "../src/index";
import { loadCachedTokens } from "../src/auth/tokens";

describe.skipIf(SKIP)("Integration Tests", () => {
  let tools: Awaited<ReturnType<typeof plugin>>["tools"];

  beforeAll(async () => {
    // Check auth
    const tokens = loadCachedTokens();
    if (!tokens) {
      throw new Error("No auth tokens. Run notebooklm-mcp-auth first.");
    }

    const p = await plugin({
      project: { name: "test", root: "/tmp" },
      directory: "/tmp",
      worktree: "/tmp",
    });
    tools = p.tools;
  });

  test("notebook_list returns notebooks", async () => {
    const result = await tools.notebook_list({ max_results: 5 });

    expect(result.status).toBe("success");
    expect(Array.isArray(result.notebooks)).toBe(true);
    console.log(`Found ${result.count} notebooks`);
  });

  test("notebook_create and delete", async () => {
    // Create
    const createResult = await tools.notebook_create({
      title: `Test ${Date.now()}`,
    });
    expect(createResult.status).toBe("success");
    const notebookId = createResult.notebook.id;
    console.log(`Created notebook: ${notebookId}`);

    // Delete
    const deleteResult = await tools.notebook_delete({
      notebook_id: notebookId,
      confirm: true,
    });
    expect(deleteResult.status).toBe("success");
    console.log(`Deleted notebook: ${notebookId}`);
  });

  test("notebook_get with existing notebook", async () => {
    // First get a notebook
    const listResult = await tools.notebook_list({ max_results: 1 });
    if (listResult.notebooks.length === 0) {
      console.log("No notebooks to test");
      return;
    }

    const notebookId = listResult.notebooks[0].id;
    const result = await tools.notebook_get({
      notebook_id: notebookId,
      include_summary: true,
    });

    expect(result.status).toBe("success");
    expect(result.title).toBeDefined();
    console.log(`Got notebook: ${result.title}`);
  });

  test("studio_create types", async () => {
    // Verify type enum
    const types = ["audio", "video", "infographic", "slide_deck", "report", "flashcards", "quiz", "data_table", "mind_map"];
    
    for (const type of types) {
      // Just verify the function accepts the type (don't actually create)
      const result = await tools.studio_create({
        notebook_id: "fake-id",
        type: type as Parameters<typeof tools.studio_create>[0]["type"],
        confirm: false, // Won't actually create
      });

      expect(result.status).toBe("error");
      expect(result.error).toContain("not confirmed");
    }
  });
});
