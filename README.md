# OpenCode Plugin: NotebookLM

Access Google NotebookLM from OpenCode AI coding assistant.

## Features

- **13 smart tools** with context inference
- Auto-detect source type (URL/Drive/Text)
- Auto-polling for long operations (research, studio)
- Create & manage notebooks
- Add sources (URLs, text, Google Drive)
- Query AI about your sources
- Generate audio overviews, study guides, mind maps, etc.
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

Save cookies manually in OpenCode:

```
save_auth_tokens({ cookies: "your-cookie-header-from-devtools" })
```

To get cookies:
1. Open https://notebooklm.google.com in Chrome
2. Open DevTools (F12) > Network tab
3. Refresh page, click any request
4. Copy the `Cookie` header value from Request Headers

## Tools Reference

### Notebook Management (6 tools)

| Tool | Description |
|------|-------------|
| `notebook_list` | List all notebooks |
| `notebook_create` | Create a new notebook |
| `notebook_get` | Get notebook details (optional AI summary) |
| `notebook_query` | Ask AI about sources |
| `notebook_delete` | Delete notebook (requires confirm) |
| `notebook_rename` | Rename a notebook |

### Source Management (3 tools)

| Tool | Description |
|------|-------------|
| `source_add` | **Unified** - Add URL, Drive doc, or text (auto-detect) |
| `source_get` | Get source content/metadata |
| `source_delete` | Delete source (requires confirm) |

### Research & Studio (3 tools)

| Tool | Description |
|------|-------------|
| `research_start` | Start web research (auto-polls until complete) |
| `studio_create` | Generate content (auto-polls until complete) |
| `studio_delete` | Delete artifact (requires confirm) |

### Auth (1 tool)

| Tool | Description |
|------|-------------|
| `save_auth_tokens` | Save cookies from browser |

## Smart Features

### Context Inference

Notebook ID is auto-inferred when:
- Only one notebook exists (auto-selected)
- A notebook was recently accessed (session state)

```
# No need to specify notebook_id if only one notebook exists
notebook_query({ query: "What are the main topics?" })
```

### Auto-Detect Source Type

`source_add` automatically detects:
- **URL**: Content starts with `http://` or `https://`
- **Google Drive**: Alphanumeric ID pattern (25-50 chars)
- **Text**: Everything else

```
# These all use source_add
source_add({ content: "https://example.com/article" })  # URL
source_add({ content: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" })  # Drive
source_add({ content: "Some text content...", title: "My Notes" })  # Text
```

### Auto-Polling

Research and studio operations block until complete by default:

```
# Blocks until research completes (up to 120s)
research_start({ query: "AI trends 2025" })

# Use wait=false for async
research_start({ query: "AI trends 2025", wait: false })
```

## Studio Content Types

`studio_create` supports:
- `audio_overview` - Audio summary
- `audio_deep_dive` - Detailed audio discussion
- `briefing_doc` - Executive briefing
- `faq` - FAQ document
- `study_guide` - Study guide
- `timeline` - Timeline
- `mindmap` - Mind map visualization

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
> Create a study guide for React hooks
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
```

## Architecture

```
src/
├── index.ts           # 13 smart tools with context inference
├── client/
│   ├── api.ts         # NotebookLM API client
│   └── recovery.ts    # Retry, backoff, error handling
├── hooks/index.ts     # OpenCode hooks (cache, polling)
├── state/
│   ├── session.ts     # Session state management
│   └── cache.ts       # TTL cache
├── auth/tokens.ts     # Token management
└── types.ts           # TypeScript types
```

## License

MIT

## Credits

Based on [notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) by jacob-bd.
