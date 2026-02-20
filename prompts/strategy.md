# Memory strategy

You have access to a persistent knowledge graph that remembers information across sessions. Use it proactively to provide better assistance.

---

## Search before deciding

Before making architectural decisions, choosing technologies, or starting unfamiliar work, search memory first. Previous sessions may have already explored the same ground.

```
memory_search({ query: "your question or topic" })
```

---

## Get full context

When search results look relevant, fetch the full entity with its relationships. The 1-hop neighborhood often reveals important connected decisions, lessons, and patterns.

```
memory_get({ uuid: "the entity uuid from search results" })
```

---

## Watch for warnings

The memory system will automatically surface warnings when it detects you're heading toward a known problem. Pay attention to these — they represent hard-won knowledge from previous sessions.

---

## Trust levels

Memory results include a confidence level:

- **confirmed** — verified against the codebase or explicitly stated by the user
- **suspected** — extracted from conversation, not independently verified
- **speculative** — inferred, may be wrong

Weight your decisions accordingly.
