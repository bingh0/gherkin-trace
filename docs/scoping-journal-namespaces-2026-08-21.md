# Scoping input — journal namespaces (orchestration-swarm awareness)

*2026-08-21. This is a scoping INPUT for the visionary's next gt scoping
session, produced from a review of treecontext 0.1.0-rc.2's namespace
architecture against gt @ c5e25f3. It is deliberately not a spec: no
feature files are pre-written, no scenario titles proposed. Everything
here goes through gt's own gate.*

## Why now

treecontext rc.1/rc.2 shipped database-enforced multi-user: every
worktree of a project resolves to the project's one store; each writer
(session, subagent) lands in its own namespace — a row in the `trees`
table, one degenerate tree per namespace, every query tree-scoped by
construction. Crossing the boundary is always an explicit act:
`treecontext_merge_from_agent` copies a lane's rows into the trunk with
provenance (`_merge_label` always; `_namespace` = source lane; new node
ids — `preserveIds: false`), and `stores merge` carries every namespace
of a predecessor store across. The subagent hand-back protocol itself
(spawn in worktree → write own lane → merge back) is ruled ccr-side
scoping and stays out of treecontext's program — which means the
*reading* side of that protocol lands here, on gt.

Collaborators' hook-based audit-log constraint systems are waiting on
gt's release; orchestration is the shape they will run it in.

## What gt does today (facts, not complaints)

- gt opens exactly one namespace per refresh: `FlatStore.open({namespace})`
  via the treecontext library, `--journal-namespace` defaulting to
  `project` (`src/journal.js:62-67`, `bin/gt.js:40`). No SQL is issued
  against the journal; scoping is genuine tree-level partitioning.
- The empty-store guard names the namespace-typo failure mode loudly
  (`src/refresh.js:292-296`). That is the whole of gt's namespace
  awareness.
- gt reads two metadata keys per hit: `role` and `session_id`
  (`src/refresh.js:314-325`). It has zero awareness of `_namespace`,
  `_merge_label`, or `_merge_source_store`. Merged-in rows are mined
  exactly as native trunk rows.
- Other lanes in the store are invisible: gt neither enumerates them nor
  discloses their existence. Motion in an unmerged subagent lane is
  simply dark, undisclosed.

## The rulings the interview has to make

**Q1 — do merged lane rows count as evidence?** Today a merged subagent
lane's rows are eligible as ruling evidence, review provenance, and
fence pressure. The sharpest specimen: fence-under-pressure fires on
USER-authored discussion only (ruled 2026-08-01 — the owner's own
interest reopening their own ruling). But a merged subagent lane's
`role: user` rows are *orchestrator-authored prompts*, not the owner.
An orchestrator prompt naming fence topics would ring the owner's
reconsider bell. The merge stamps survive on every merged row, so the
discriminator exists — whether to use it, and how (discount, disclose,
or exclude per signal family), is the ruling.

**Q2 — are unmerged lanes darkness?** gt's honesty tenet says unbuilt
classifiers must never read as computed-and-quiet. A store carrying N
lanes beyond the mined one, with M nodes, is knowable from gt's own
snapshot at trivial cost. Whether that becomes a disclosed darkness
("N other namespaces exist, unmined") or stays out of the picture is a
ruling — with the note that treecontext's own charter calls the trunk
"the project namespace" and lanes "working branches that earn their way
in through an explicit merge," which argues gt should *name* lanes but
never mine them.

**Q3 — is multi-namespace mining fenced?** Reading lanes directly
(union across namespaces) would bypass the earn-your-way-in protocol —
gt would see subagent chatter the orchestration deliberately never
ratified into the trunk. Prior form suggests this belongs on the fence
with the reasoning transcribed, so a later session finds a decision.

**Q4 — provenance attribution surface.** If merged rows stay eligible
(Q1), should provenance/heat records carry the lane attribution
(`_merge_label` / `_namespace`) so the human can see *which agent's*
conversation backs a review claim? Evidence-shaped, not score-shaped.

**Q5 — identity across the merge.** `merge_from_agent` mints new node
ids. A `tcNodeId` gt recorded from a pre-merge refresh (e.g. run inside
the subagent's worktree against the same store, different lane) will
not match the trunk copy; dedup can also drop lane rows entirely at
merge. Does gt's provenance model need to say anything about this, or
is single-lane mining (Q3 fenced) enough to make it moot?

**Q6 — session attribution.** gt reads `metadata.session_id` only.
treecontext's canonical session identity is
`COALESCE(session_id, _cc_session_id, _session_id)` (and a `session_key`
column at the write choke point). Curated inserts carry `_cc_session_id`,
not `session_id` — gt's sessionId comes back null for them today.
Cheap to align; worth a scenario only if session attribution ever
becomes load-bearing.

**Q7 — heat density over a merged store.** `totalNodes` and the
enumeration count include merged rows. After a big lane merge, heat
density shifts by the lane's bulk. Arguably honest (the trunk really
did absorb them), arguably double-vision (the lane's heat is the
subagent's working churn, not the owner's attention). A ruling, not a
bug.

## Mechanical facts a build can rely on

- Namespace enumeration, if ruled in, is one query against gt's own
  snapshot (gt already holds a better-sqlite3 handle on a copied db):
  `SELECT namespace FROM trees WHERE ensemble_index = 0`, node counts
  via join on `nodes.tree_id`. Note this would be gt's first raw SQL
  against the journal snapshot — today everything goes through the
  treecontext library API, which has no lane-enumeration surface. Either
  cross that line knowingly or ask treecontext for a `listNamespaces`
  library call (the cleaner move; treecontext's merge code already has
  the query internally).
- `metadata._namespace` is NOT reliable attribution for native rows —
  the shipped server never stamps it on inserts or captures; only
  merge paths stamp it. `trees.namespace` via `nodes.tree_id` is the
  only authoritative source. `exclude_namespaces` on the query surface
  filters on the metadata key, so it filters merged rows only — which
  happens to be exactly the Q1 population.
- rc.2 is a Windows-only identity fix; no schema change from rc.1.
  Schema is v24; gt's `migrate: true` on the snapshot already handles
  version skew without touching the original.
- Raw-reader caveats if SQL is ever ruled in: `nodes.content` can be a
  zstd BLOB (flag byte 0x01) above a size threshold; `staging` rows are
  pre-journal and may carry NULL namespace — nodes are the journal.

## An interaction worth a verify scenario regardless of the above

treecontext now prunes high-document-frequency tokens before FTS match
(`pruneHighDfTokens`). gt's ENUMERATION_QUERY — the ~100-stopword bag
used to count the store through the recall interface — survives today
only via that function's all-or-nothing fallback. A store where *some*
enumeration words are prunable and some are not would silently drop
enumeration recall, and gt's existing shortfall note reports the count
gap without naming the cause. The known pressure point ("density
counting through a recall interface," `src/refresh.js:37-42`) just got
sharper; the stats-query graduation path already proposed to
treecontext (F5, five stores measured lossy) is the dissolving move.

## Day-one falsifiable prediction

First orchestration field run with merged subagent lanes: fence-pressure
false positives sourced from merged `role: user` rows that are
orchestrator prompts, at a rate visibly above the owner-authored
baseline. If that does not happen, Q1's exclusion case loses its
sharpest specimen and disclosure-only (Q4) is probably enough.

*Same-day specimen, no merge required:* the refresh run the day this doc
was written surfaced a new fence-pressure item ("Mining fence rulings
from the journal") whose sole evidence entry is a subagent
task-notification excerpt — harness notifications land in the user turn,
auto-capture stamps them `role: user`, and the reconsider bell rang on
text the owner never wrote. The Q1 population is broader than merged
lanes: it is every `role: user` row whose author is not the owner.
