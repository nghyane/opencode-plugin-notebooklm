# OpenCode Plugin: NotebookLM

Access Google NotebookLM from OpenCode AI coding assistant.

## Features

- **32 tools** for full NotebookLM access
- Create & manage notebooks
- Add sources (URLs, text, Google Drive)
- Query AI about your sources
- Generate audio overviews, videos, infographics
- Create slide decks, reports, flashcards, quizzes
- Deep research with web/Drive search

## Installation

### Option 1: npm package

```bash
# In your project
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

Before using, authenticate with Google:

```bash
# Run the auth CLI (requires Chrome)
notebooklm-mcp-auth
```

Or manually save cookies:

```typescript
// In OpenCode, use the save_auth_tokens tool
save_auth_tokens({ cookies: "your-cookie-header-from-devtools" })
```

## Tools Reference

### Notebook Management (11 tools)

| Tool | Description |
|------|-------------|
| `notebook_list` | List all notebooks |
| `notebook_create` | Create a new notebook |
| `notebook_get` | Get notebook details with sources |
| `notebook_describe` | Get AI-generated summary |
| `notebook_query` | Ask AI about sources |
| `notebook_delete` | Delete notebook (requires confirm) |
| `notebook_rename` | Rename a notebook |
| `notebook_add_url` | Add URL/YouTube as source |
| `notebook_add_text` | Add pasted text as source |
| `notebook_add_drive` | Add Google Drive doc as source |
| `chat_configure` | Configure chat settings |

### Source Management (5 tools)

| Tool | Description |
|------|-------------|
| `source_describe` | Get AI summary of source |
| `source_get_content` | Get raw text content |
| `source_list_drive` | List sources with Drive freshness |
| `source_sync_drive` | Sync Drive sources |
| `source_delete` | Delete source (requires confirm) |

### Research (3 tools)

| Tool | Description |
|------|-------------|
| `research_start` | Start deep/fast research |
| `research_status` | Poll research progress |
| `research_import` | Import discovered sources |

### Studio Generation (11 tools)

| Tool | Description |
|------|-------------|
| `audio_overview_create` | Generate audio overview |
| `video_overview_create` | Generate video overview |
| `infographic_create` | Generate infographic |
| `slide_deck_create` | Generate slide deck |
| `report_create` | Generate report |
| `flashcards_create` | Generate flashcards |
| `quiz_create` | Generate quiz |
| `data_table_create` | Generate data table |
| `mind_map_create` | Generate mind map |
| `studio_status` | Check generation status |
| `studio_delete` | Delete artifact (requires confirm) |

### Auth (2 tools)

| Tool | Description |
|------|-------------|
| `refresh_auth` | Reload auth tokens |
| `save_auth_tokens` | Save cookies manually |

## Usage Examples

### Create notebook and add sources

```
> Create a notebook about React hooks and add some documentation
```

### Query your sources

```
> Ask the notebook: "What are the best practices for useEffect cleanup?"
```

### Generate content

```
> Generate an audio overview of my notebook
> Create a slide deck for the React hooks topic
```

### Research

```
> Do deep research on "React Server Components best practices"
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# Type check
bun run typecheck
```

## License

MIT

## Credits

Based on [notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) by jacob-bd.
