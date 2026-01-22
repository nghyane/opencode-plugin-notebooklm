/**
 * OpenCode Hooks - Enhanced with context inference
 */
import { getClient } from '../client/api';
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
} from '../state/session';
import * as cache from '../state/cache';
import { loadCachedTokens, validateCookies } from '../auth/tokens';

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
// Before tool execution - context inference & cache check
// ============================================================================

export async function onToolExecuteBefore(context: BeforeContext): Promise<HookResult> {
  const { toolName, args } = context;
  const state = getState();
  
  // Inject notebook_id if not provided and we have context
  if (NOTEBOOK_CONTEXT_TOOLS.includes(toolName) && !args.notebook_id && state.notebookId) {
    context.args = { ...args, notebook_id: state.notebookId };
  }
  
  // Cache check for read operations
  if (toolName === 'notebook_list') {
    const cached = cache.get(cache.key.notebooks());
    if (cached) {
      return { skipExecution: true, result: JSON.stringify(cached) };
    }
  }
  
  if (toolName === 'notebook_get' && args.notebook_id) {
    const cacheKey = cache.key.notebook(args.notebook_id as string);
    const cached = cache.get(cacheKey);
    if (cached && !args.include_summary) {
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
  
  // Update notebook context
  if (toolName === 'notebook_list' && Array.isArray(data)) {
    cache.set(cache.key.notebooks(), data);
    
    // Auto-set current notebook if only one
    if (data.length === 1) {
      setActiveNotebook(data[0].id, data[0].title);
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
    if (args.notebook_id === getState().notebookId) {
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
  
  // Update conversation context
  if (toolName === 'notebook_query' && data && typeof data === 'object') {
    const q = data as { conversationId?: string; query?: string; answer?: string };
    if (q.conversationId) {
      setConversation(q.conversationId, args.query as string, q.answer);
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
// Session idle - poll pending tasks
// ============================================================================

export async function onSessionIdle(): Promise<HookResult | void> {
  const pending = getPendingTasks();
  if (pending.length === 0) return;
  
  const client = getClient();
  
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
          
          return {
            notification: `Research complete: Found ${status.sources?.length || 0} sources`,
          };
        } else if (status.status === 'failed') {
          removePendingTask(task.id);
          return {
            notification: `Research failed`,
          };
        } else {
          updatePendingTask(task.id, { status: 'processing' });
        }
      }
      
      if (task.type === 'studio') {
        const artifacts = await client.pollStudioStatus(task.notebookId);
        const artifact = artifacts.find(a => a.id === task.id);
        
        if (artifact?.status === 'ready') {
          removePendingTask(task.id);
          return {
            notification: `Studio content ready: ${task.id}`,
          };
        } else if (artifact?.status === 'failed') {
          removePendingTask(task.id);
          return {
            notification: `Studio generation failed`,
          };
        } else {
          updatePendingTask(task.id, { status: 'processing' });
        }
      }
    } catch (error) {
      // Silently handle polling errors
      updatePendingTask(task.id, { 
        error: error instanceof Error ? error.message : 'Polling failed' 
      });
    }
  }
}

// ============================================================================
// Session created - preload & validate
// ============================================================================

export async function onSessionCreated(): Promise<HookResult | void> {
  // Check auth tokens
  const tokens = loadCachedTokens();
  if (!tokens) {
    setAuthStatus(false);
    return {
      notification: 'NotebookLM: No auth tokens. Run save_auth_tokens first.',
    };
  }
  
  if (!validateCookies(tokens.cookies)) {
    setAuthStatus(false);
    return {
      notification: 'NotebookLM: Invalid cookies. Please refresh tokens.',
    };
  }
  
  setAuthStatus(true);
  
  // Preload notebooks
  try {
    const client = getClient();
    const notebooks = await client.listNotebooks();
    cache.set(cache.key.notebooks(), notebooks);
    
    // Auto-set if single notebook
    if (notebooks.length === 1) {
      setActiveNotebook(notebooks[0].id, notebooks[0].title);
      return {
        notification: `NotebookLM ready. Active notebook: "${notebooks[0].title}"`,
      };
    }
    
    return {
      notification: `NotebookLM ready. ${notebooks.length} notebooks available.`,
    };
  } catch {
    return {
      notification: 'NotebookLM: Failed to preload notebooks.',
    };
  }
}

// ============================================================================
// Export hooks object for plugin registration
// ============================================================================

export const hooks = {
  'tool.execute.before': onToolExecuteBefore,
  'tool.execute.after': onToolExecuteAfter,
  'experimental.session.compacting': onSessionCompacting,
  'session.idle': onSessionIdle,
  'session.created': onSessionCreated,
};
