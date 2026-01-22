/**
 * Normalizer Tests
 */
import { describe, test, expect } from "bun:test";
import {
  normalizeNotebook,
  normalizeNotebooks,
  normalizeRawNotebook,
  normalizeRawSourceContent,
  success,
  failure,
} from "../src/state/normalizers";
import type { Notebook } from "../src/types";

describe("Normalizers", () => {
  test("normalizeNotebook flattens structure", () => {
    const nb: Notebook = {
      id: "nb-1",
      title: "Test",
      sourceCount: 5,
      sources: [],
      isOwned: true,
      isShared: false,
      createdAt: null,
      modifiedAt: null,
    };

    const result = normalizeNotebook(nb);

    expect(result).toEqual({
      id: "nb-1",
      title: "Test",
      sourceCount: 5,
      url: "https://notebooklm.google.com/notebook/nb-1",
      owned: true,
    });
  });

  test("normalizeNotebooks maps array", () => {
    const notebooks: Notebook[] = [
      { id: "1", title: "A", sourceCount: 1, sources: [], isOwned: true, isShared: false, createdAt: null, modifiedAt: null },
      { id: "2", title: "B", sourceCount: 2, sources: [], isOwned: false, isShared: true, createdAt: null, modifiedAt: null },
    ];

    const result = normalizeNotebooks(notebooks);

    expect(result).toHaveLength(2);
    expect(result[0].owned).toBe(true);
    expect(result[1].owned).toBe(false);
  });

  test("normalizeRawNotebook handles API response", () => {
    const raw = [
      "Notebook Title",
      [[["src-1"], "Source 1", [null, null, null, null, 5]]],
      "nb-id-123",
    ];

    const result = normalizeRawNotebook(raw);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("nb-id-123");
    expect(result!.title).toBe("Notebook Title");
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].type).toBe("web");
  });

  test("normalizeRawNotebook returns null for invalid input", () => {
    expect(normalizeRawNotebook([])).toBeNull();
    expect(normalizeRawNotebook(["only title"])).toBeNull();
  });

  test("normalizeRawSourceContent extracts content", () => {
    const raw = [
      [null, "Document Title", [null, null, null, null, 5, null, null, ["https://example.com"]]],
      null,
      null,
      [["This is the content", "More content"]],
    ];

    const result = normalizeRawSourceContent(raw);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Document Title");
    expect(result!.type).toBe("web");
    expect(result!.url).toBe("https://example.com");
    expect(result!.content).toContain("This is the content");
  });

  test("success helper creates correct structure", () => {
    const result = success({ data: "test" }, true);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ data: "test" });
    expect(result.cached).toBe(true);
  });

  test("failure helper creates error structure", () => {
    const result = failure("Something went wrong");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Something went wrong");
  });
});
