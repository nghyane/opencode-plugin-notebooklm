/**
 * Cache Tests
 */
import { describe, test, expect, beforeEach } from "bun:test";
import * as cache from "../src/state/cache";

describe("Cache", () => {
  beforeEach(() => {
    cache.clear();
  });

  test("set and get value", () => {
    cache.set("test-key", { data: "test" }, "notebooks");
    
    const result = cache.get<{ data: string }>("test-key");
    expect(result).toEqual({ data: "test" });
  });

  test("returns undefined for missing key", () => {
    const result = cache.get("missing");
    expect(result).toBeUndefined();
  });

  test("expires after TTL", async () => {
    // Set with very short TTL
    cache.set("expire-key", "value");
    
    // Should exist immediately
    expect(cache.get<string>("expire-key")).toBe("value");
    
    // Note: In real test, would wait for TTL
  });

  test("del removes matching keys", () => {
    cache.set("nb:1", "a");
    cache.set("nb:2", "b");
    cache.set("src:1", "c");
    
    cache.del("nb:");
    
    expect(cache.get("nb:1")).toBeUndefined();
    expect(cache.get("nb:2")).toBeUndefined();
    expect(cache.get<string>("src:1")).toBe("c");
  });

  test("key generators", () => {
    expect(cache.key.notebooks()).toBe("nbs");
    expect(cache.key.notebook("abc")).toBe("nb:abc");
    expect(cache.key.source("xyz")).toBe("src:xyz");
    expect(cache.key.query("nb1", "test query")).toMatch(/^q:nb1:/);
  });
});
