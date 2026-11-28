# ST-04 — Task intelligence (v1)

**Status:** v1 shipped (rule-based)

## Behaviour

On **task create** (before assign), server runs `applyTaskIntelligence`:

- **Checklist** — merged with any client checklist (type templates + category defaults)
- **Timeline** — milestones from `dueAt` (interview, trip, applications, meetings)
- **Suggestions** — contextual hints in workspace + first tip in assign conversation

## API

- Automatic on `POST /api/personal-sarah/tasks`
- `POST /api/personal-sarah/tasks/:id/intelligence` — refresh timeline/suggestions/checklist merge

## Client

- Workspace **Progress**: timeline, suggestions, **Refresh plan**
- Hub **Sarah’s next actions** uses approval + suggestion hints
- Task store fields: `timeline[]`, `suggestions[]`, `meta.intelligenceGeneratedAt`

## Not in v1 (ST-05+)

- LLM-generated plans
- Execution actions from suggestions
- Cross-task learning / routines (ST-06)