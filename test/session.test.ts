/**
 * Session State Tests
 */
import { describe, test, expect, beforeEach } from "bun:test";
import * as session from "../src/state/session";

describe("Session State", () => {
  beforeEach(() => {
    session.reset();
  });

  test("setActiveNotebook updates state", () => {
    session.setActiveNotebook("nb-1", "My Notebook");
    
    const active = session.getActiveNotebook();
    expect(active.id).toBe("nb-1");
    expect(active.title).toBe("My Notebook");
  });

  test("setConversation tracks query context", () => {
    session.setConversation("conv-1", "What is X?", "X is a thing");
    
    const conv = session.getConversation();
    expect(conv.conversationId).toBe("conv-1");
    expect(conv.lastQuery).toBe("What is X?");
    expect(conv.lastAnswer).toBe("X is a thing");
  });

  test("addPendingTask and removePendingTask", () => {
    session.addPendingTask({
      id: "task-1",
      type: "research",
      notebookId: "nb-1",
      status: "pending",
      startedAt: Date.now(),
    });
    session.addPendingTask({
      id: "task-2",
      type: "studio",
      notebookId: "nb-1",
      status: "pending",
      startedAt: Date.now(),
    });
    
    expect(session.getPendingTasks()).toHaveLength(2);
    
    session.removePendingTask("task-1");
    expect(session.getPendingTasks()).toHaveLength(1);
    expect(session.getPendingTasks()[0].id).toBe("task-2");
  });

  test("getContextSummary includes all state", () => {
    session.setActiveNotebook("nb-1", "Test Notebook");
    session.setConversation("conv-1", "Query?", "Answer");
    session.addPendingTask({
      id: "task-1",
      type: "research",
      notebookId: "nb-1",
      status: "pending",
      startedAt: Date.now(),
    });
    
    const summary = session.getContextSummary();
    
    expect(summary).toContain("Test Notebook");
    expect(summary).toContain("Query?");
    expect(summary).toContain("research:");
  });

  test("reset clears all state", () => {
    session.setActiveNotebook("nb-1", "Test");
    session.reset();
    
    const active = session.getActiveNotebook();
    expect(active.id).toBeNull();
  });
});
