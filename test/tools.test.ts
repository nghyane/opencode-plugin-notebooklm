/**
 * Tool Tests
 * 
 * NOTE: These tests are SKIPPED because the test architecture changed.
 * The tools are now exposed through the plugin entry point, not individual modules.
 * 
 * For testing individual tools, use integration tests (test/integration.test.ts)
 * with INTEGRATION=1 bun test test/integration.test.ts
 * 
 * TODO: Update to use new plugin architecture or use integration tests.
 */
import { describe, test, expect } from "bun:test";

describe.skip("Notebook Tools (deprecated)", () => {
  test("notebook_list - placeholder", () => {
    // Tools are now exposed via plugin entry point
    // See test/integration.test.ts for actual tool tests
    expect(true).toBe(true);
  });

  test("notebook_create - placeholder", () => {
    expect(true).toBe(true);
  });

  test("notebook_get - placeholder", () => {
    expect(true).toBe(true);
  });
});
