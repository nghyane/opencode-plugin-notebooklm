# OpenCode Plugin: NotebookLM

Access Google NotebookLM from OpenCode AI coding assistant.

## Features

- **8 tools** with context inference
- Auto-detect source type (URL/Drive/Text)
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
| `source_add` | Add URL, Drive doc, or text (auto-detect) |

### Research & Studio (2 tools)

| Tool | Description |
|------|-------------|
| `research_start` | Start web research (fast/deep mode) |
| `studio_create` | Generate content (audio/report/flashcards/etc) |

### Auth (1 tool)

| Tool | Description |
|------|-------------|
| `save_auth_tokens` | Save cookies from browser |

## Skills

Optional workflow guides available in `skills/`:

| Skill | Description |
|-------|-------------|
| `nlm-list` | List notebooks workflow |
| `nlm-add` | Add sources workflow |
| `nlm-query` | Query workflow |
| `nlm-research` | Research workflow |
| `nlm-studio` | Studio content workflow |

Use with: `skill({ name: 'nlm-query' })`

## Smart Features

### Context Inference

Notebook ID is auto-inferred when:
- Only one notebook exists (auto-selected)
- A notebook was recently accessed (session state)

```
# No need to specify notebook_id if context is set
notebook_query({ query: "What are the main topics?" })
```

### Auto-Detect Source Type

`source_add` automatically detects:
- **URL**: Starts with `http://` or `https://`
- **Google Drive**: Alphanumeric ID pattern (20+ chars)
- **Text**: Everything else

```
# These all use source_add
source_add({ content: "https://example.com/article" })           # URL
source_add({ content: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs" })     # Drive
source_add({ content: "Some text...", title: "My Notes" })       # Text
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
│   └── tokens.ts         # Token parsing, validation, storage
├── hooks/
│   └── index.ts          # OpenCode hooks (session events)
├── state/
│   ├── session.ts        # Session state (active notebook, conversation)
│   └── cache.ts          # TTL cache with auto-sweep
└── client/
    ├── index.ts          # NotebookLMClient (singleton with refresh mutex)
    ├── transport.ts      # RPC transport with retry/backoff
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

skills/
├── nlm-list/SKILL.md     # List notebooks workflow
├── nlm-add/SKILL.md      # Add sources workflow
├── nlm-query/SKILL.md    # Query workflow
├── nlm-research/SKILL.md # Research workflow
└── nlm-studio/SKILL.md   # Studio content workflow
```

### Key Design Patterns

- **Singleton client** with refresh mutex (prevents auth stampede)
- **Service layer** per domain (notebook, source, query, research, studio)
- **Transport layer** with retry/backoff and auth refresh
- **State management**: Session (in-memory) + Cache (TTL-based)
- **Proactive auth**: Token expiry check before requests

## License

MIT

## Credits

Based on [notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) by jacob-bd.
