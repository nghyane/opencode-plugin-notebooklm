/**
 * Tool Tests
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the API client
const mockClient = {
  listNotebooks: mock(() => Promise.resolve([
    { id: "nb-1", title: "Test Notebook", sourceCount: 2, isOwned: true, isShared: false, sources: [], createdAt: null, modifiedAt: null },
  ])),
  createNotebook: mock(() => Promise.resolve({ id: "nb-new", title: "New Notebook", sourceCount: 0, isOwned: true, isShared: false, sources: [], createdAt: null, modifiedAt: null })),
  getNotebook: mock(() => Promise.resolve(["Test Notebook", [["src-1", "Source 1"]], "nb-1"])),
  query: mock(() => Promise.resolve({ answer: "Test answer", conversationId: "conv-1" })),
  addUrlSource: mock(() => Promise.resolve({ id: "src-new", title: "URL Source" })),
};

// Mock getClient
mock.module("../src/client/api", () => ({
  getClient: () => mockClient,
  resetClient: () => {},
}));

// Import after mocking
import {
  notebook_list,
  notebook_create,
  notebook_get,
  notebook_query,
  notebook_add_url,
} from "../src/tools/notebook";

describe("Notebook Tools", () => {
  beforeEach(() => {
    // Reset mocks
    mockClient.listNotebooks.mockClear();
    mockClient.createNotebook.mockClear();
  });

  test("notebook_list returns normalized notebooks", async () => {
    const result = await notebook_list({});
    
    expect(result.status).toBe("success");
    expect(result.notebooks).toHaveLength(1);
    expect(result.notebooks[0]).toEqual({
      id: "nb-1",
      title: "Test Notebook",
      source_count: 2,
      url: "https://notebooklm.google.com/notebook/nb-1",
      ownership: "owned",
    });
  });

  test("notebook_list respects max_results", async () => {
    const result = await notebook_list({ max_results: 5 });
    
    expect(result.status).toBe("success");
    expect(mockClient.listNotebooks).toHaveBeenCalled();
  });

  test("notebook_create returns new notebook", async () => {
    const result = await notebook_create({ title: "My Notebook" });
    
    expect(result.status).toBe("success");
    expect(result.notebook.id).toBe("nb-new");
  });

  test("notebook_get returns notebook with sources", async () => {
    const result = await notebook_get({ notebook_id: "nb-1" });
    
    expect(result.status).toBe("success");
    expect(result.title).toBe("Test Notebook");
  });

  test("notebook_get with include_summary", async () => {
    mockClient.getNotebookSummary = mock(() => Promise.resolve({
      summary: "Test summary",
      suggestedTopics: [],
    }));

    const result = await notebook_get({ notebook_id: "nb-1", include_summary: true });
    
    expect(result.status).toBe("success");
  });

  test("notebook_query returns answer", async () => {
    const result = await notebook_query({
      notebook_id: "nb-1",
      query: "What is this about?",
    });
    
    expect(result.status).toBe("success");
    expect(result.answer).toBe("Test answer");
    expect(result.conversation_id).toBe("conv-1");
  });

  test("notebook_add_url returns source", async () => {
    const result = await notebook_add_url({
      notebook_id: "nb-1",
      url: "https://example.com",
    });
    
    expect(result.status).toBe("success");
    expect(result.source.id).toBe("src-new");
  });
});
