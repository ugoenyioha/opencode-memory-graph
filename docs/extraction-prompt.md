# Extraction prompt

The prompt template sent to the LLM to extract entities and relationships from conversation chunks. The plugin fills in the `{{variables}}` before sending.

---

## System prompt

```
You are a knowledge extraction system for a coding assistant's memory. Your job
is to read conversation fragments and extract structured knowledge: entities
(things worth remembering) and relationships between them.

Focus on information that would be valuable in future coding sessions — decisions
made, technologies chosen or rejected, patterns established, errors encountered,
lessons learned, and user preferences discovered.

Extract only explicitly stated information. Do not infer relationships that are
not clearly stated or strongly implied by the conversation. If the user uses
self-references ("I", "me", "my"), attribute the information to the user entity.

Be conservative. Extracting nothing from a message is fine — not every message
contains durable knowledge.
```

---

## User prompt

````
Analyze the following conversation fragment and extract entities and relationships.

## Context

Project: {{project_name}}
Session: {{session_id}}
Timestamp: {{timestamp}}

## Existing entities (for deduplication)

{{existing_entities}}

## Conversation

{{conversation}}

## Instructions

Extract entities and relationships from the conversation above. Return valid JSON
matching the schema below. Follow these rules:

1. **Entity types** — use one of the types listed below. Core types are always
   available. Domain-specific types depend on the active packs.

   Core: Decision, Lesson, Preference, Task, Concept

   {{pack_labels}}

2. **Deduplication** — if an entity matches one in "Existing entities" (same name
   and type, or clearly the same real-world concept), emit an `update` instead
   of a `create`. Include the existing entity's UUID. Entities should only be
   considered duplicates if they refer to the same real-world object or concept,
   not just because they share similar names.

3. **Deletions** — if new information contradicts or supersedes an existing
   entity, emit a `delete` with the existing entity's UUID and a brief reason.
   Only delete when the new information is clearly more recent or accurate.
   Do NOT delete if both the old and new information could coexist (e.g.,
   "uses React" should not delete "uses Vue" — the project may use both).

4. **Lessons** — actively look for:
   - Things that went wrong or wasted time
   - Approaches that were tried and abandoned
   - Environmental gotchas or tooling traps
   - Regressions or breaking changes
   - Performance traps
   Set `severity` to "blocker" only for things that should prevent future attempts
   entirely. Use "warning" for things worth knowing and "tip" for minor notes.
   Write the `trigger` as a natural language description of the situation where
   this lesson should surface.

5. **Relationships** — use the vocabulary: implements, depends_on, replaces,
   resolves, prefers, belongs_to, uses, led_to, blocks, related_to,
   warns_against, recommends, supersedes, caused_by, validated_by.
   Write the `fact` as a complete sentence describing the relationship.

6. **Scope** — "global" for user preferences and cross-project knowledge,
   "project" for project-specific knowledge, "session" for ephemeral context.

7. **Confidence** — "confirmed" if explicitly stated by the user or verified,
   "suspected" if extracted from context, "speculative" if inferred.

8. **Updates** — when updating an existing entity, only include fields that
   changed. Always include the UUID.

## Response schema

```json
{
  "entities": [
    {
      "action": "create",
      "name": "short descriptive name",
      "label_type": "Decision",
      "summary": "one to three sentence description",
      "attributes": {},
      "scope": "project",
      "source": "auto",
      "confidence": "suspected"
    },
    {
      "action": "create",
      "name": "Kuzu is deprecated",
      "label_type": "Lesson",
      "summary": "Apple acquired Kùzu Inc...",
      "attributes": {
        "severity": "blocker",
        "category": "dead_end",
        "trigger": "choosing an embedded graph database",
        "resolution": "Use FalkorDB Lite instead",
        "time_cost": "3 hours"
      },
      "scope": "global",
      "source": "auto",
      "confidence": "confirmed"
    },
    {
      "action": "update",
      "uuid": "ent_01JXXXXXX",
      "summary": "updated summary text",
      "confidence": "confirmed"
    },
    {
      "action": "delete",
      "uuid": "ent_01JYYYYYY",
      "reason": "superseded by newer decision"
    }
  ],
  "relationships": [
    {
      "source_name": "Kuzu is deprecated",
      "target_name": "Kuzu",
      "name": "warns_against",
      "fact": "Kuzu should not be used because Apple acquired the company"
    },
    {
      "source_name": "Kuzu is deprecated",
      "target_name": "FalkorDB",
      "name": "recommends",
      "fact": "FalkorDB Lite is recommended as a replacement for Kuzu"
    }
  ]
}
```

Return ONLY the JSON object. No explanation, no markdown fencing.
````

---

## Design notes

### Pack-aware prompt assembly

The extraction prompt is assembled dynamically from the active domain packs. The `{{pack_labels}}` variable is populated with label names, descriptions, and examples from each active pack. For example, with `["coding", "ops"]` active:

```
Core: Decision, Lesson, Preference, Task, Concept

Coding: Project (repository identity), Pattern (coding conventions),
Component (files, modules), Error (errors and resolutions), Tool (technologies)

Ops: Service (external systems), Endpoint (API endpoints and quirks),
Procedure (multi-step workflows), Schema (API formats), Credential (credential types)
```

Each pack also contributes a short extraction hint paragraph that tells the LLM what to look for in that domain. These are appended to the system prompt.

### Why a single prompt (not multi-step)

Graphiti uses 6+ separate LLM calls per extraction (extract → classify → edges → attributes → summaries → dedup). Mem0 uses 3 (entities → relationships → deletions). We use 1.

The tradeoff is quality vs. latency/cost. Our reasoning:

- Coding conversations are more structured than general chat. Users state decisions explicitly, errors have stack traces, preferences are direct. This reduces ambiguity.
- A single extraction on every message must be cheap (~1-2s, not ~10-20s).
- Our 10 fixed entity types act as a lightweight ontology that constrains the LLM's output. Graphiti needs a classification step because their types are open-ended.
- If quality is insufficient after real-world testing, we can split into Mem0's 3-step pattern without changing the graph schema.

### Token budget

The extraction prompt should stay under ~2000 tokens (excluding the conversation fragment). The conversation fragment itself is capped at the last 10 messages or ~4000 tokens, whichever is smaller.

### Batching

Extraction runs asynchronously after each message. Messages are debounced — if multiple messages arrive within 2 seconds, they're batched into a single extraction call.

### Existing entities context

The `{{existing_entities}}` variable is populated with a compact list of recently active entities (name, type, UUID) so the LLM can deduplicate and detect conflicts. Capped at 50 entities to keep context small. This is inspired by Mem0's approach of sending existing memories alongside new facts for ADD/UPDATE/DELETE decisions.

Format:

```
- ent_01J... | Tool | FalkorDB
- ent_01J... | Decision | Use FalkorDB for both modes
- ent_01J... | Lesson | Kuzu is deprecated
```

### Delete action

The `delete` action (inspired by Mem0's conflict detection) allows the LLM to mark existing entities as superseded. Under the hood, a delete sets `expired_at` on the entity and its edges (Graphiti-style temporal invalidation) rather than physically removing nodes. This preserves the historical record while keeping search results current.

Mem0's key insight applies here: "Do NOT delete if there is a possibility of the same type of relationship but different destination nodes." We encode this in the prompt instructions.

### Dedup strategy

We use embedding cosine similarity (Mem0's approach) as a first pass, then fall back to name+type matching. Graphiti's LLM-based dedup is more accurate but too expensive for per-message extraction. Our dedup happens in the extraction prompt itself via the `{{existing_entities}}` context — the LLM emits `update` instead of `create` when it recognizes a match.

### Error handling

If the LLM returns invalid JSON, the extraction is dropped silently. Extraction is best-effort — failing to extract from one message doesn't affect the system.

### Model selection

The extraction prompt is designed to work with any capable model. The plugin sends it through the same LLM provider configured in OpenCode. For token efficiency, it uses the cheapest available model that can reliably produce structured JSON.
