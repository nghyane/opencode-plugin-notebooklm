# NotebookLM Plugin Rules

## Context Inference

- Always auto-select notebook if only one exists
- Remember notebook_id in session state across tool calls
- After adding a source, suggest querying about its content
- After research completes, summarize what was found

## Tool Usage

- Use `source_add` for all source types (auto-detects URL/Drive/text)
- For long operations (research, studio), use default `wait=true`
- Always set `confirm=true` for destructive operations

## Content Generation

- Before generating audio/studio content, confirm with user
- Suggest appropriate content types based on notebook content
- For study materials: suggest study_guide, faq, or flashcards
- For summaries: suggest audio_overview or briefing_doc

## Error Handling

- If auth expired (401/403): Guide user to get fresh cookies from browser DevTools
- If rate limited (429): Suggest waiting 30 seconds before retry
- If notebook not found: List available notebooks

## Best Practices

- Prefer querying existing sources before adding new ones
- Summarize research results concisely
- When adding multiple sources, batch them efficiently
