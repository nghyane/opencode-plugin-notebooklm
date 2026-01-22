---
name: notebooklm
description: Google NotebookLM integration for research, sources, and AI content generation
---

# NotebookLM Skill

Google NotebookLM integration for managing notebooks, sources, and AI-generated content.

## Capabilities

- **Notebook Management**: Create, list, query, delete notebooks
- **Source Management**: Add URLs, text, Google Drive documents
- **AI Query**: Ask questions about your sources
- **Research**: Deep web research with auto-import
- **Content Generation**: Audio overviews, study guides, mind maps, FAQs

## Available Tools

| Tool | Description |
|------|-------------|
| `notebook_list` | List all notebooks |
| `notebook_create` | Create new notebook |
| `notebook_get` | Get notebook details and sources |
| `notebook_query` | Ask AI about sources |
| `notebook_delete` | Delete notebook |
| `notebook_rename` | Rename notebook |
| `source_add` | Add URL/text/Drive source (auto-detect) |
| `source_get` | Get source content |
| `source_delete` | Delete source |
| `research_start` | Start web research (auto-polls) |
| `studio_create` | Generate content (audio, study guide, etc) |
| `studio_delete` | Delete generated artifact |

## Typical Workflow

1. **List notebooks**: `notebook_list` to see existing notebooks
2. **Create or select**: `notebook_create` or use existing ID
3. **Add sources**: `source_add` with URL, text, or Drive ID
4. **Query AI**: `notebook_query` to ask questions about sources
5. **Generate content**: `studio_create` for audio, study guides, etc
6. **Research**: `research_start` for web research on new topics

## Smart Features

- **Auto notebook selection**: If only one notebook exists, it's auto-selected
- **Auto source detection**: URLs, Drive IDs, and text are auto-detected
- **Auto polling**: Research and studio operations wait until complete by default

## Examples

### Add a URL and ask about it
```
source_add({ content: "https://example.com/article" })
notebook_query({ query: "Summarize the main points" })
```

### Research a topic
```
research_start({ query: "AI trends 2025", wait: true })
```

### Generate audio overview
```
studio_create({ type: "audio_overview", confirm: true })
```
