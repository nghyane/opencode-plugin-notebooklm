/**
 * Normalizer Tests
 * 
 * NOTE: These tests are SKIPPED because the normalizers module was removed.
 * The normalization logic has been moved into individual service modules.
 * 
 * TODO: Update tests to use new architecture or remove this file.
 */
import { describe, test, expect } from "bun:test";

describe.skip("Normalizers (deprecated)", () => {
  test("normalizeNotebook - placeholder", () => {
    // Normalizers module no longer exists
    // Normalization is now done inline in services
    expect(true).toBe(true);
  });
});
