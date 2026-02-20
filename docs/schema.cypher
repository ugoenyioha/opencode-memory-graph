// =============================================================================
// opencode-memory-graph — FalkorDB Schema
// =============================================================================
//
// This file defines the complete graph schema: indexes, constraints, and
// example node/edge creation patterns. Run these queries against a FalkorDB
// graph named "memory" (or whatever the plugin config specifies).
//
// IMPORTANT: FalkorDB does not support MAP as a stored property type.
// The `attributes` field in the ontology is stored as a JSON string and
// parsed/serialized in the application layer.
//
// Embedding dimension: 384 (all-MiniLM-L6-v2)
// Temporal fields use INTEGER (Unix ms) rather than FalkorDB datetime types
// for simpler cross-language serialization and range queries.
//
// =============================================================================


// -----------------------------------------------------------------------------
// 1. Range indexes — fast lookups on frequently filtered properties
// -----------------------------------------------------------------------------

// Entity indexes
CREATE INDEX FOR (e:Entity) ON (e.uuid)
CREATE INDEX FOR (e:Entity) ON (e.name)
CREATE INDEX FOR (e:Entity) ON (e.scope)
CREATE INDEX FOR (e:Entity) ON (e.confidence)
CREATE INDEX FOR (e:Entity) ON (e.created_at)
CREATE INDEX FOR (e:Entity) ON (e.validated_at)

// Episode indexes
CREATE INDEX FOR (ep:Episode) ON (ep.uuid)
CREATE INDEX FOR (ep:Episode) ON (ep.session_id)
CREATE INDEX FOR (ep:Episode) ON (ep.created_at)

// Edge indexes (relationship properties)
CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.uuid)
CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.name)
CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.valid_at)
CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.invalid_at)
CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.created_at)

CREATE INDEX FOR ()-[r:MENTIONS]-() ON (r.created_at)
CREATE INDEX FOR ()-[r:NEXT]-() ON (r.created_at)


// -----------------------------------------------------------------------------
// 2. Full-text indexes — keyword search over names and summaries
// -----------------------------------------------------------------------------

CALL db.idx.fulltext.createNodeIndex('Entity', 'name', 'summary')
CALL db.idx.fulltext.createNodeIndex('Episode', 'content')


// -----------------------------------------------------------------------------
// 3. Vector indexes — semantic similarity search (384-dim, cosine)
// -----------------------------------------------------------------------------

// Entity name embeddings — used by memory_search for entity retrieval
CREATE VECTOR INDEX FOR (e:Entity) ON (e.name_embedding) OPTIONS {
  dimension: 384,
  similarityFunction: 'cosine',
  M: 16,
  efConstruction: 200,
  efRuntime: 10
}

// Edge fact embeddings — used by memory_search for relationship retrieval
CREATE VECTOR INDEX FOR ()-[r:RELATES_TO]->() ON (r.fact_embedding) OPTIONS {
  dimension: 384,
  similarityFunction: 'cosine',
  M: 16,
  efConstruction: 200,
  efRuntime: 10
}

// Lesson trigger embeddings — used by proactive surfacing on each message
// Stored on the Entity node (not a separate label) since FalkorDB uses a
// single-label index. We filter by label list in the application layer.
CREATE VECTOR INDEX FOR (e:Entity) ON (e.trigger_embedding) OPTIONS {
  dimension: 384,
  similarityFunction: 'cosine',
  M: 16,
  efConstruction: 200,
  efRuntime: 10
}


// -----------------------------------------------------------------------------
// 4. Constraints — data integrity
// -----------------------------------------------------------------------------

// Unique UUID constraints. These require a range index on the same property
// (created above), and are enforced asynchronously.
//
// Syntax: GRAPH.CONSTRAINT CREATE <graph> UNIQUE NODE <label> PROPERTIES 1 <prop>
// These are issued via the Redis command interface, not Cypher. The TypeScript
// setup code will call them via the FalkorDB client.
//
// GRAPH.CONSTRAINT CREATE memory UNIQUE NODE Entity PROPERTIES 1 uuid
// GRAPH.CONSTRAINT CREATE memory UNIQUE NODE Episode PROPERTIES 1 uuid


// =============================================================================
// 5. Node shapes — CREATE examples showing the full property set
// =============================================================================

// -- Entity node (base shape, all labels share this) -------------------------
//
// CREATE (e:Entity {
//   uuid:              'ent_01JXXXXXX',
//   name:              'FalkorDB',
//   summary:           'Graph database used for both local and remote modes',
//   name_embedding:    vecf32([...384 floats...]),
//   label_type:        'Tool',
//   labels:            ['Entity', 'Tool'],
//   attributes:        '{"url":"https://falkordb.com"}',  // JSON string, NOT a map
//   scope:             'project',
//   source:            'auto',
//   confidence:        'confirmed',
//   validated_at:      1708387200000,
//   ttl:               null,
//   created_at:        1708387200000
// })
//
// Lesson-specific fields live in `attributes` JSON and also as top-level
// properties when they need indexing (trigger_embedding):
//
// CREATE (e:Entity {
//   uuid:              'ent_01JXXXXXX',
//   name:              'Kuzu is deprecated',
//   summary:           'Apple acquired Kùzu Inc. in October 2025...',
//   name_embedding:    vecf32([...384 floats...]),
//   label_type:        'Lesson',
//   labels:            ['Entity', 'Lesson'],
//   attributes:        '{"severity":"blocker","category":"dead_end","trigger":"choosing an embedded graph database","resolution":"Use FalkorDB Lite instead","time_cost":"3 hours"}',
//   trigger_embedding: vecf32([...384 floats...]),
//   scope:             'global',
//   source:            'user',
//   confidence:        'confirmed',
//   validated_at:      1708387200000,
//   ttl:               null,
//   created_at:        1708387200000
// })

// -- Episode node ------------------------------------------------------------
//
// CREATE (ep:Episode {
//   uuid:         'epi_01JXXXXXX',
//   content:      'User asked about embedded graph databases...',
//   source:       'message',
//   session_id:   'ses_01JXXXXXX',
//   created_at:   1708387200000,
//   valid_at:     1708387200000
// })

// -- Episode chain -----------------------------------------------------------
//
// MATCH (a:Episode {uuid: 'epi_01'}), (b:Episode {uuid: 'epi_02'})
// CREATE (a)-[:NEXT {created_at: 1708387200000}]->(b)

// -- Episode -> Entity mention -----------------------------------------------
//
// MATCH (ep:Episode {uuid: 'epi_01'}), (e:Entity {uuid: 'ent_01'})
// CREATE (ep)-[:MENTIONS {created_at: 1708387200000}]->(e)


// =============================================================================
// 6. Edge shape — RELATES_TO (all semantic relationships)
// =============================================================================

// All entity-to-entity relationships use the RELATES_TO type with a `name`
// property that captures the semantic relationship (implements, depends_on,
// replaces, warns_against, etc.). This keeps the index count manageable while
// still allowing typed queries via WHERE r.name = 'implements'.
//
// CREATE (a)-[:RELATES_TO {
//   uuid:           'rel_01JXXXXXX',
//   name:           'warns_against',
//   fact:           'Kuzu should not be used because Apple acquired the company',
//   fact_embedding: vecf32([...384 floats...]),
//   valid_at:       1708387200000,
//   invalid_at:     null,
//   expired_at:     null,
//   episodes:       ['epi_01JXXXXXX'],
//   attributes:     '{}',
//   created_at:     1708387200000
// }]->(b)


// =============================================================================
// 7. Common query patterns
// =============================================================================

// -- Vector search: find similar entities by name ----------------------------
//
// CALL db.idx.vector.queryNodes('Entity', 'name_embedding', 10, vecf32($query_vec))
// YIELD node, score
// WHERE node.scope IN ['global', $project_scope]
//   AND (node.invalid_at IS NULL OR node.invalid_at = 0)
// RETURN node.uuid, node.name, node.label_type, node.summary, score
// ORDER BY score DESC

// -- Vector search: find similar relationships by fact -----------------------
//
// CALL db.idx.vector.queryRelationships('RELATES_TO', 'fact_embedding', 10, vecf32($query_vec))
// YIELD relationship, score
// WHERE relationship.invalid_at IS NULL
// RETURN relationship.uuid, relationship.name, relationship.fact, score
// ORDER BY score DESC

// -- Proactive lesson surfacing: find matching triggers ----------------------
//
// CALL db.idx.vector.queryNodes('Entity', 'trigger_embedding', 5, vecf32($message_vec))
// YIELD node, score
// WHERE node.label_type = 'Lesson' AND score > $threshold
// RETURN node.uuid, node.name, node.summary, node.attributes, score
// ORDER BY score DESC

// -- Full-text search: keyword match on entity names -------------------------
//
// CALL db.idx.fulltext.queryNodes('Entity', $query_text)
// YIELD node, score
// RETURN node.uuid, node.name, node.label_type, score
// ORDER BY score DESC
// LIMIT 20

// -- 1-hop neighborhood: get entity with relationships -----------------------
//
// MATCH (e:Entity {uuid: $uuid})
// OPTIONAL MATCH (e)-[r:RELATES_TO]-(neighbor:Entity)
// WHERE r.invalid_at IS NULL
// RETURN e, collect({
//   direction: CASE WHEN startNode(r) = e THEN 'out' ELSE 'in' END,
//   rel_name: r.name,
//   rel_fact: r.fact,
//   neighbor_uuid: neighbor.uuid,
//   neighbor_name: neighbor.name,
//   neighbor_type: neighbor.label_type
// }) AS relationships

// -- Core tier loading: get always-on entities at session start ---------------
//
// MATCH (e:Entity)
// WHERE e.scope IN ['global', $project_scope]
//   AND e.label_type IN ['Project', 'Pattern', 'Preference']
// RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
// ORDER BY e.created_at DESC
// LIMIT 50
//
// UNION
//
// MATCH (e:Entity)
// WHERE e.label_type = 'Lesson'
//   AND e.scope IN ['global', $project_scope]
// WITH e, json.fromJsonMap(e.attributes) AS attrs
// WHERE attrs.severity = 'blocker'
// RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
// ORDER BY e.created_at DESC
// LIMIT 10

// -- Working tier loading: get session-active entities -----------------------
//
// MATCH (e:Entity)
// WHERE e.scope = 'session'
//   OR (e.label_type IN ['Task', 'Decision', 'Error']
//       AND e.created_at > $recent_cutoff)
// RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
// ORDER BY e.created_at DESC
// LIMIT 30

// -- Temporal query: currently valid decisions --------------------------------
//
// MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
// WHERE r.name IN ['implements', 'led_to', 'supersedes']
//   AND r.invalid_at IS NULL
//   AND a.label_type = 'Decision'
// RETURN a.name, r.name AS rel, b.name, r.fact
// ORDER BY r.valid_at DESC

// -- Entity deduplication check: find existing entity by name similarity ------
//
// CALL db.idx.vector.queryNodes('Entity', 'name_embedding', 5, vecf32($new_name_vec))
// YIELD node, score
// WHERE score > 0.9 AND node.label_type = $label_type
// RETURN node.uuid, node.name, score
// ORDER BY score DESC
// LIMIT 1

// -- Validation: find stale entities that need re-validation -----------------
//
// MATCH (e:Entity)
// WHERE e.validated_at < $thirty_days_ago
//   AND e.label_type IN ['Component', 'Decision', 'Tool', 'Pattern']
//   AND e.scope = 'project'
// RETURN e.uuid, e.name, e.label_type, e.attributes
// ORDER BY e.validated_at ASC
// LIMIT 20

// -- Cleanup: find expired session entities ----------------------------------
//
// MATCH (e:Entity)
// WHERE e.scope = 'session'
//   AND e.ttl IS NOT NULL
//   AND e.created_at + (e.ttl * 86400000) < $now
// RETURN e.uuid, e.name
