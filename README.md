# OpenCode Plugin: NotebookLM

Access Google NotebookLM from OpenCode AI coding assistant.

## Features

- **8 tools** with context inference
- **Auto-auth via CDP** - Chrome auto-launches when needed
- Notebook state persistence (auto-select active notebook)
- Multi-turn conversations
- Create & manage notebooks
- Add sources (URLs, text, Google Drive)
- Query AI about your sources
- Generate audio, reports, flashcards, infographics
- Deep research with web search

## Installation

### Option 1: npm package

```bash
bun add opencode-plugin-notebooklm
```

Add to `opencode.json`:

```json
{
  "plugins": ["opencode-plugin-notebooklm"]
}
```

### Option 2: Local plugin

Copy to `.opencode/plugins/notebooklm/`:

```bash
cp -r opencode-plugin-notebooklm .opencode/plugins/notebooklm
```

## Authentication

### Automatic (Recommended)

Plugin auto-launches Chrome when auth is needed:

1. Chrome opens with NotebookLM
2. Login to your Google account
3. Plugin extracts cookies automatically
4. Done! Chrome can be closed after login

**First time setup:** Just use any NotebookLM tool - Chrome will open automatically.

### Manual (Fallback)

If auto-auth fails, save cookies manually:

```
save_auth_tokens({ cookies: "your-cookie-header-from-devtools" })
```

To get cookies:
1. Open https://notebooklm.google.com in Chrome
2. Open DevTools (F12) > Network tab
3. Refresh page, click any request
4. Copy the `Cookie` header value from Request Headers

## Auth Recovery Flow

When auth expires, plugin attempts 4-layer recovery:

```
Auth Error → Refresh CSRF → Reload Disk → CDP Auto-refresh → Manual Auth
```

1. **Refresh CSRF** - Re-extract tokens from page
2. **Reload Disk** - Load cached tokens from `~/.notebooklm-mcp/auth.json`
3. **CDP Auto-refresh** - Launch Chrome, extract fresh cookies
4. **Manual Auth** - Prompt for `save_auth_tokens` (last resort)

## Tools Reference

### Notebook Management (4 tools)

| Tool | Description |
|------|-------------|
| `notebook_list` | List all notebooks |
| `notebook_create` | Create a new notebook |
| `notebook_get` | Get notebook details + AI summary |
| `notebook_query` | Ask AI about sources (multi-turn) |

### Source Management (1 tool)

| Tool | Description |
|------|-------------|
| `source_add` | Add sources to notebook |

**`source_add` parameters:**
- `urls` - URL(s) separated by space/newline
- `drive_id` - Google Drive document ID
- `text` - Plain text content
- `title` - Title (required for text)
- `notebook_id` - Target notebook

### Research & Studio (2 tools)

| Tool | Description |
|------|-------------|
| `research_start` | Start web research (fast/deep mode) |
| `studio_create` | Generate content (audio/report/flashcards/etc) |

### Auth (1 tool)

| Tool | Description |
|------|-------------|
| `save_auth_tokens` | Save cookies from browser (fallback) |

## Skills

Optional workflow guides available in `skills/`:

| Skill | Description |
|-------|-------------|
| `nlm-index` | Index docs/repos to NotebookLM |

Use with: `skill({ name: 'nlm-index' })`

## Smart Features

### Context Inference

Notebook ID is auto-inferred when:
- Only one notebook exists (auto-selected)
- A notebook was recently accessed (session state)

```
# No need to specify notebook_id if context is set
notebook_query({ query: "What are the main topics?" })
```

### Adding Sources

```
# Add URL(s)
source_add({ urls: "https://example.com/article" })
source_add({ urls: "https://example1.com https://example2.com" })

# Add Google Drive document
source_add({ drive_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs" })

# Add text content (title required)
source_add({ text: "Some text...", title: "My Notes" })
```

### Multi-turn Conversations

```
# First query
notebook_query({ query: "What is React?" })

# Follow-up (uses same conversation)
notebook_query({ query: "How about hooks?", conversation_id: "..." })
```

## Studio Content Types

`studio_create` supports:
- `audio` - Audio overview/deep dive
- `report` - Briefing document
- `flashcards` - Study flashcards
- `infographic` - Visual infographic
- `slide_deck` - Presentation slides
- `data_table` - Structured data table

## Usage Examples

### Create notebook and add sources

```
> Create a notebook about React hooks
> Add the React docs: https://react.dev/reference/react/hooks
```

### Query your sources

```
> Ask: "What are the best practices for useEffect cleanup?"
```

### Generate content

```
> Generate an audio overview of my notebook
> Create flashcards for React hooks
```

### Research

```
> Research "React Server Components best practices"
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck

# Test
bun test
```

## Architecture

```
src/
├── index.ts              # 8 tools + hooks
├── errors.ts             # AppError with structured errors
├── config.ts             # Configuration
├── types.ts              # TypeScript types
├── auth/
│   ├── tokens.ts         # Token parsing, validation, storage
│   └── cdp-provider.ts   # Chrome DevTools Protocol auth (auto-launch)
├── hooks/
│   └── index.ts          # OpenCode hooks (session events)
├── state/
│   ├── session.ts        # Session state (active notebook, conversation)
│   └── cache.ts          # TTL cache with auto-sweep
└── client/
    ├── index.ts          # NotebookLMClient (singleton with refresh mutex)
    ├── transport.ts      # RPC transport with 4-layer recovery
    ├── codec.ts          # Request/response encoding
    ├── encoding.ts       # Data encoding utilities
    ├── recovery.ts       # Error recovery strategies
    ├── conversations.ts  # Conversation persistence
    └── services/
        ├── notebook.ts   # Notebook CRUD operations
        ├── source.ts     # Source management
        ├── query.ts      # AI query operations
        ├── research.ts   # Web research
        └── studio.ts     # Content generation
```

### Key Design Patterns

- **Singleton client** with refresh mutex (prevents auth stampede)
- **4-layer auth recovery**: CSRF refresh → disk reload → CDP auto-launch → manual
- **Bun native APIs**: `Bun.spawn`, `Bun.sleep` for performance
- **Service layer** per domain (notebook, source, query, research, studio)
- **Transport layer** with retry/backoff and auth refresh
- **State management**: Session (in-memory) + Cache (TTL-based)
- **Proactive auth**: Token expiry check before requests

## Requirements

- Bun 1.0+
- Google Chrome (for CDP auto-auth)
- macOS / Linux / Windows

## License

MIT

## Credits

Based on [notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) by jacob-bd.
