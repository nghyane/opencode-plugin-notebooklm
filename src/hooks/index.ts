/**
 * OpenCode Hooks - Enhanced with unified event handler and context inference
 */
import { getClient } from '../client';
import { loadCachedTokens, validateCookies } from '../auth/tokens';
import {
  getState,
  setActiveNotebook,
  setLastSource,
  setConversation,
  setAuthStatus,
  getPendingTasks,
  updatePendingTask,
  removePendingTask,
  getContextSummary,
  reset,
  cleanupStaleTasks,
} from '../state/session';
import * as cache from '../state/cache';

// ============================================================================
// Types
// ============================================================================

interface BeforeContext {
  toolName: string;
  args: Record<string, unknown>;
}

interface AfterContext {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  error?: Error;
}

interface HookResult {
  skipExecution?: boolean;
  result?: string;
  summary?: string;
  notification?: string;
}

interface PluginContext {
  client: {
    app: {
      log: (opts: { level: string; message: string }) => void;
    };
  };
}

// Tools that need notebook context
const NOTEBOOK_CONTEXT_TOOLS = [
  'notebook_get',
  'notebook_query',
  'notebook_delete',
  'source_add',
  'research_start',
  'studio_create',
  'studio_delete',
];

// Tools that update source context
const SOURCE_CONTEXT_TOOLS = ['source_get', 'source_add'];

// ============================================================================
// Plugin Context Management
// ============================================================================

let pluginContext: PluginContext | null = null;

export function setPluginContext(ctx: PluginContext): void {
  pluginContext = ctx;
}

export function getPluginContext(): PluginContext | null {
  return pluginContext;
}

// ============================================================================
// Helper Functions
// ============================================================================

function showToast(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
  if (pluginContext?.client?.app?.log) {
    pluginContext.client.app.log({ level, message: `[NotebookLM] ${message}` });
  }
}

// ============================================================================
// Session Event Handlers
// ============================================================================

async function handleSessionCreated(): Promise<void> {
  // Reset state for new session
  reset();
  
  // Check auth tokens
  const tokens = loadCachedTokens();
  if (!tokens) {
    setAuthStatus(false);
    showToast('No auth tokens. Run save_auth_tokens first.', 'error');
    return;
  }
  
  if (!validateCookies(tokens.cookies)) {
    setAuthStatus(false);
    showToast('Invalid cookies. Please refresh tokens.', 'error');
    return;
  }
  
  setAuthStatus(true);
  
  // Preload notebooks
  try {
    const client = getClient();
    const notebooks = await client.listNotebooks();
    cache.set(cache.key.notebooks(), notebooks);
    
    // Auto-set if single notebook
    if (notebooks.length === 1) {
      const notebook = notebooks[0];
      setActiveNotebook(notebook?.id ?? null, notebook?.title ?? null);
      showToast(`Ready. Active notebook: "${notebook?.title}"`, 'success');
      return;
    }
    
    showToast(`Ready. ${notebooks.length} notebooks available.`, 'success');
  } catch {
    showToast('Failed to preload notebooks.', 'error');
  }
}

async function handleSessionIdle(): Promise<void> {
  const pending = getPendingTasks();
  if (pending.length === 0) return;
  
  // Cleanup stale tasks first (older than 10 minutes)
  cleanupStaleTasks(10 * 60 * 1000);
  
  // Guard: check if client can be created
  let client: ReturnType<typeof getClient>;
  try {
    client = getClient();
  } catch {
    // No valid tokens, skip polling
    return;
  }
  
  for (const task of pending) {
    // Skip if recently checked (within 5 seconds)
    if (task.lastCheckedAt && Date.now() - task.lastCheckedAt < 5000) {
      continue;
    }
    
    try {
      if (task.type === 'research') {
        const status = await client.pollResearch(task.notebookId, task.id);
        
        if (status.status === 'completed') {
          // Auto-import sources
          await client.importResearchSources(task.notebookId, task.id);
          removePendingTask(task.id);
          cache.del(cache.key.notebook(task.notebookId));
          showToast(`Research complete: Found ${status.sources?.length || 0} sources`, 'success');
        } else if (status.status === 'failed') {
          removePendingTask(task.id);
          showToast('Research failed', 'error');
        } else {
          updatePendingTask(task.id, { status: 'processing' });
        }
      }
      
      if (task.type === 'studio') {
        const artifacts = await client.pollStudioStatus(task.notebookId);
        const artifact = artifacts.find(a => a.id === task.id);
        
        if (artifact?.status === 'ready') {
          removePendingTask(task.id);
          showToast(`Studio content ready: ${task.id.slice(0, 8)}`, 'success');
        } else if (artifact?.status === 'failed') {
          removePendingTask(task.id);
          showToast('Studio generation failed', 'error');
        } else {
          updatePendingTask(task.id, { status: 'processing' });
        }
      }
    } catch (error) {
      // Track retry count, remove after 3 failures
      const retryCount = task.retryCount || 0;
      if (retryCount >= 3) {
        removePendingTask(task.id);
        showToast(`Task ${task.id.slice(0, 8)} removed after 3 failed retries`, 'error');
      } else {
        updatePendingTask(task.id, { 
          error: error instanceof Error ? error.message : 'Polling failed',
          retryCount: retryCount + 1,
        });
      }
    }
  }
}

function handleSessionDeleted(): void {
  // Cleanup on session end
  reset();
  cache.clear();
  // Clear any pending tasks
  const pending = getPendingTasks();
  for (const task of pending) {
    removePendingTask(task.id);
  }
}

// ============================================================================
// Before tool execution - context inference & cache check
// ============================================================================

export async function onToolExecuteBefore(context: BeforeContext): Promise<HookResult> {
  const { toolName, args } = context;
  const state = getState();
  
  // Inject notebook_id if not provided and we have context
  if (NOTEBOOK_CONTEXT_TOOLS.includes(toolName) && !args['notebook_id'] && state.notebookId) {
    context.args = { ...args, notebook_id: state.notebookId };
  }
  
  // Cache check for read operations
  if (toolName === 'notebook_list') {
    const cached = cache.get<unknown[]>(cache.key.notebooks());
    if (cached) {
      // Return same shape as tool output (object with count and notebooks)
      return { skipExecution: true, result: JSON.stringify({ count: cached.length, notebooks: cached }) };
    }
  }
  
  if (toolName === 'notebook_get' && args['notebook_id']) {
    const cacheKey = cache.key.notebook(args['notebook_id'] as string);
    const cached = cache.get<Record<string, unknown>>(cacheKey);
    // Only return cached if it's the right shape (object with id, title, sources)
    if (cached && typeof cached === 'object' && 'id' in cached && !args['include_summary']) {
      return { skipExecution: true, result: JSON.stringify(cached) };
    }
  }
  
  return {};
}

// ============================================================================
// After tool execution - update state & cache
// ============================================================================

export async function onToolExecuteAfter(context: AfterContext): Promise<void> {
  const { toolName, args, result } = context;
  
  if (!result || context.error) return;
  
  let data: unknown;
  try {
    data = typeof result === 'string' ? JSON.parse(result) : result;
  } catch {
    return;
  }
  
  // Update notebook context from notebook_list (expects {count, notebooks} shape)
  if (toolName === 'notebook_list' && data && typeof data === 'object') {
    const listData = data as { notebooks?: unknown[] };
    if (Array.isArray(listData.notebooks)) {
      cache.set(cache.key.notebooks(), listData.notebooks);
      
      // Auto-set current notebook if only one
      if (listData.notebooks.length === 1) {
        const nb = listData.notebooks[0] as { id?: string; title?: string };
        if (nb.id) {
          setActiveNotebook(nb.id, nb.title || null);
        }
      }
    }
  }
  
  if (toolName === 'notebook_get' && data && typeof data === 'object') {
    const nb = data as { id?: string; title?: string };
    if (nb.id) {
      cache.set(cache.key.notebook(nb.id), data);
      setActiveNotebook(nb.id, nb.title || null);
    }
  }
  
  if (toolName === 'notebook_create' && data && typeof data === 'object') {
    const nb = data as { id?: string; title?: string };
    if (nb.id) {
      cache.del(cache.key.notebooks());
      setActiveNotebook(nb.id, nb.title || null);
    }
  }
  
  if (toolName === 'notebook_delete') {
    cache.del(cache.key.notebooks());
    if (args['notebook_id'] === getState().notebookId) {
      setActiveNotebook(null, null);
    }
  }
  
  // Update source context
  if (SOURCE_CONTEXT_TOOLS.includes(toolName) && data && typeof data === 'object') {
    const src = data as { id?: string };
    if (src.id) {
      setLastSource(src.id);
      cache.set(cache.key.source(src.id), data);
    }
  }
  
  // Update conversation context (tool returns conversation_id, not conversationId)
  if (toolName === 'notebook_query' && data && typeof data === 'object') {
    const q = data as { conversation_id?: string; conversationId?: string; query?: string; answer?: string };
    const convId = q.conversation_id || q.conversationId;
    if (convId) {
      setConversation(convId, args['query'] as string, q.answer);
    }
  }
  
  // Auth success indicator
  if (!context.error) {
    setAuthStatus(true);
  }
}

// ============================================================================
// Session compacting - provide context summary
// ============================================================================

export async function onSessionCompacting(): Promise<HookResult> {
  return {
    summary: getContextSummary(),
  };
}

// ============================================================================
// Unified Event Handler
// ============================================================================

export async function onEvent(ctx: { event: { type: string; data?: unknown } }): Promise<void> {
  const { event } = ctx;
  
  switch (event.type) {
    case 'session.created':
      await handleSessionCreated();
      break;
    case 'session.idle':
      await handleSessionIdle();
      break;
    case 'session.deleted':
      handleSessionDeleted();
      break;
    case 'tui.toast.show':
      // Can emit toast events
      break;
  }
}

// ============================================================================
// Export hooks object for plugin registration
// ============================================================================

export const hooks = {
  'event': onEvent,
  'tool.execute.before': onToolExecuteBefore,
  'tool.execute.after': onToolExecuteAfter,
  'experimental.session.compacting': onSessionCompacting,
};
