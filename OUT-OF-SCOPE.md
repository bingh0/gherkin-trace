# Out of scope — the fence

> Ratified at the /scope interview's Phase 4 readback, 2026-07-27.

Scope declined is as load-bearing as scope accepted. Each entry: what, why,
when ruled.

## Declined

- **Generic code-AST knowledge graph** — the ambition this project exists
  *instead of*. Intractably large; gherkin-trace's whole tractability
  argument is that Gherkin is a controlled dialect in an owned toolchain.
  Scope is feature files + journal, nothing else. (2026-07-24; reaffirmed
  2026-07-29 with practitioner evidence: BDD professionals across web,
  backend, and firmware domains all name *intent* as BDD's purpose — and
  code structure is what coding agents are already very good at deriving
  themselves. The right coupling to code is execution feedback via binding
  status, not structure.)
- **Graph database server** (Memgraph, Neo4j, …) — a server dependency for
  ~7 node types and ~4 edge classes; the projection fits SQLite. Violates
  the tiny-tool lane. (2026-07-24; implementation decision, recorded here
  per /scope rule 3)
- **tree-sitter parsing** — gnt's `parseFeature` is the dialect authority;
  a second parser is a second opinion about what a feature file means.
  Incremental/error-tolerant parsing solves editor problems a batch
  projection tool doesn't have. (2026-07-24; implementation decision)
- **Writing to sources** — feature files, binding registries, the journal
  are never modified. Read-only consumer, permanent, not revisitable.
  Refusals name where the change belongs (feature edits → the normal BDD
  flow, journal writes → treecontext, review status → mined only).
  (2026-07-24; sharpened 2026-07-27; reaffirmed 2026-08-22 — the standing
  bell was a lexical match on the owner's multi-instance setup note, not a
  reopening; the ruling is permanent as written)
- **Being part of gherkin-\*-test or treecontext** — the join lives in a
  third place; the substrates stay independent of it and of each other.
  gnt must remain usable without treecontext; treecontext must remain
  BDD-agnostic; every gnt feature carries a cargo-parity cost that
  exploratory work must not incur. (2026-07-24)
- **Mixed-generation pictures** — a broken file's nodes are never carried
  forward from a prior refresh; a picture is one refresh's truth or it is
  marked broken. (2026-07-27)
- **Manufactured silence, in every form** — no empty answers before a
  first refresh, no "nothing is hot" when the discussion-density
  distribution has no natural break, no serving a stale picture as current
  after a crashed refresh. "Cannot tell" is always said, never converted
  to "all clear". (2026-07-27)
- **Auto-refresh on query** — reads never acquire side effects; a query
  before the first refresh is refused with an error that teaches.
  Guarded by: "A query before the first refresh is refused with
  directions". (2026-07-27)
- **Scale policing** — no corpus-size caps, no past-the-envelope warnings.
  (2026-07-27; see Reversed below)
- **Truncating exception lists** — overflow is grouped by region with the
  full detail intact, never cut. Guarded by: "Exception overflow is
  grouped, never truncated", "The exception view lists orphans and
  unrefined intent". (2026-07-27)
- **Graded review confidence** — reviewed is binary on unambiguous mined
  evidence; ambiguity goes to a visible ruling-candidates list with
  pointers, never a score. (2026-07-27)
- **Best-guess identity adoption** — an unconfirmable rename is a visible
  break (delete + create) plus rename candidates with evidence, never a
  silently adopted link: a wrong guess transfers review status to a
  scenario the human never ruled on. (2026-07-27)
- **Hand-declared status of any kind** — review status, heat, identity
  resolution: all mined from evidence, never asserted by a participant.
  Flags invite gaming and reporting fatigue. (Phase 2 principle,
  fence-explicit 2026-07-27) *Carve-in, ratified 2026-08-11 (R24): a
  Sanctioned-changes entry transcribes a dated scoping ruling — the same
  transcription discipline this fence file itself runs on — so treating
  it as review provenance (R20) is reading a ratified artifact, not
  honoring a participant's flag.* (2026-07-27; carve-in 2026-08-11)
- **Rank boosting from signal pile-up** — an attention item sits at its
  top signal's tier; co-occurring signals are displayed evidence beneath
  it, not ranking arithmetic. (2026-07-27)
- **Mining fence rulings from the journal** — the out-of-scope file is
  the sole fence authority; positive intent is mined, negative intent is
  transcribed. A fence-shaped remark in conversation that never reached
  the file is not a fence — the file is a ratified artifact like the
  feature files, reversal is an edit that clears every signal at the
  next refresh, and fuzzy fence mining would invent fence-candidates for
  territory the human never consciously fenced. Transcription is a
  human/skill discipline. (2026-08-01, ruled during respecting-the-fence
  review)
- **Agent-voice fence pressure** — fence-under-pressure fires on
  user-authored discussion only. The flag detects the owner's own
  interest reopening their own ruling; agent chatter must not ring the
  reconsider bell, else cheap tokens farm re-litigation prompts. Agent
  drift into fenced territory is caught by breach detection, at the act.
  Guarded by: "User discussion after the ruling reads as
  fence-under-pressure", "A reaffirmed ruling clears
  fence-under-pressure". (2026-08-01, ruled during respecting-the-fence
  review)

## Sanctioned changes

> Ratification records for changes to bound scenarios, written before the
> build that makes them (scope C6, direction-carrying per the dilution
> interview's R5). Each entry: file, scenario title, direction, what
> changes, sanctioning ruling. A sanction is armed by the first edit
> touching its scenario, spent at the green after a covering in-direction
> edit (a deletion is spent at the thread end), and dies only by
> consumption or deletion of its entry.

- **features/review-provenance.feature** / "A post-ruling change with
  traced discussion reports as declared" — direction: **deletes-scenario**.
  Moves into dilution.feature as the declared-edit tier: the dilution
  family absorbs reviewed-then-changed. (R6 absorption, dilution interview
  2026-08-06/11; entry written 2026-08-11, pre-build)
- **features/review-provenance.feature** / "A post-ruling change with a
  silent journal is a quiet change" — direction: **deletes-scenario**.
  Moves into dilution.feature as the quiet-edit tier. (R6; entry written
  2026-08-11, pre-build)
- **features/routing-attention.feature** / "A quiet change outranks a
  declared change" — direction: **deletes-scenario**. Its ordering carries
  into dilution.feature's ladder scenarios (quiet edit above declared
  edit, preserved exactly). (R6/R9; entry written 2026-08-11, pre-build)
- **features/routing-attention.feature** / "A quiet removal outranks a
  quiet edit" — direction: **deletes-scenario**. Its ordering carries into
  dilution.feature's ladder chain (quiet removal above verdict-coupled
  above assertion decline above quiet edit). (R6/R9; entry written
  2026-08-11, pre-build)
- **features/dilution.feature** / "The dilution timeline lays out a
  sighted scenario's history in dated order" — direction: **rewords**.
  Drafting defect caught at build (interactive gate): the compound
  entry's date preceded the edit, so the entry would consume the very
  sighting the Given requires; the date moves after the edit. The
  behavior claim is unchanged. (build session 2026-08-11; entry written
  pre-edit)
- **features/respecting-the-fence.feature** / "An arguable match reads as
  a breach candidate" — direction: **rewords**. Under the D1
  topic-anchored rule (matcher-tuning thread, 2026-08-11) a two-token
  fence topic has no arguable band — two shared tokens is full
  containment — so the scenario's Given gains a second, richer-topic
  ruling and the arguable scenario retitles inside the body; the
  behavior claim (arguable match → possible breach, ranked between
  breaches and pressure) is unchanged. (D1 ruling; entry written
  2026-08-11, pre-edit)

## Declined — spec dilution family (interview 2026-08-06 → 2026-08-11)

- **Dilution as a gate** — gt watches and reports; it never blocks a run,
  a refresh, or a build. (R-fence 1, ruled 2026-08-11)
- **Phrasing judgment** — semantic quality of an edit stays with /audit.
  Named limit, ruled deliberately: semantic weakening *inside* a
  legitimate direction ("exactly 3" → "at least 1" under a rewords
  sanction) passes by design — direction is anti-laundering hardening,
  not a semantic judge. (R5 probe, 2026-08-06)
- **Spec-quality score** — no health certification anywhere, including no
  "no sightings" verdict line in the timeline query: absence of sightings
  is visible, never endorsed. (R21, ruled 2026-08-11)
- **Reporting obligations** — the attention list and the timeline query
  are the only dilution surfaces; nobody owes a dilution report.
  (ruled 2026-08-11)
- **Pre-first-review watching** — a scenario weakened after green but
  before its first review (or first sanction, per R20) is invisible.
  Accepted hole; reopening gated on field evidence. (R7, ruled 2026-08-11)
- **Counter-evasion arms race** — no phrasing heuristics aimed at agents
  that read gt and shuffle wording to dodge. The backstop is structural:
  dodging requires diffs in reviewed files, every diff fires at some
  tier, and the list reaches the owner. (R15, ruled 2026-08-11)
- **Dilution watching of unreviewed and design-tier motion** — invisible
  to dilution. A sanction entry itself anchors watching (R20), so
  "unreviewed" means no review ruling and no sanction. (R7/R20, ruled
  2026-08-11)
- **Retirement / mark-as-seen mechanism** — item lifetimes derive from
  history (next-verdict for confirmations, standing-until-resolved for
  unconsumed-sanction notices, corpus-next-run for orphaned
  confirmations), never from owner interaction state. (R11/R16/R17/R18, ruled 2026-08-11)

## Roads not taken — spec dilution family

Rejected options on contested rulings, so a later reader finds a decision
where they would otherwise find an open question.

- **Sibling families instead of absorption** (R6): dilution and
  reviewed-then-changed as parallel signal families — rejected; one
  scenario hit by both would pile up twice for one phenomenon.
- **Direction-optional / free-text sanctions** (R5, probe-survived
  2026-08-06): rejected; a directionless entry covers any in-window edit,
  which is weakening under ratification cover — the cheapest-legal-move
  pattern applied to sanctions themselves. Compound entries carrying
  multiple directions ARE allowed; the degradation pressure was named
  and accepted.
- **Legacy directionless entries honored** (R10): rejected in both
  soft forms (covers-window-noted, covers-window-silent) — a
  directionless entry is malformed and loud; older fences must be
  amended before gt honors them.
- **Tuned windows** (R8): adjacent-manifests-only and any tuned-N commit
  window — rejected for the red span: pure temporal order, no thresholds
  to game.
- **Flat or in-lane family ranking** (R9): rejected for defiance-at-the-top:
  a direction violation defied a written ruling and ranks breach-class.
- **Sanction expiry at any green** (R12 original, superseded by
  R16/R23): the "no lingering blank checks" rationale is formally
  superseded — a scoping-time sanction must survive the gap to build.
  Sanctions linger dormant until touched; the mitigations are the
  standing unconsumed-sanction notice and entry deletion as the
  retirement act.
- **Scenario-wide expiry on uncovered edits** (R23): rejected — an
  unrelated edit must not annihilate pending ratifications; entries die
  only by consumption or deletion.
- **Per-direction spend for compound entries** (R19): rejected —
  whole-entry-at-first-green stands; the split-build trap is authoring
  discipline (land all directions before green, or write separate
  entries), recorded for the scope-skill C6 handoff.
- **One live entry per scenario** (R23): rejected — concurrent entries
  are legal; an edit is judged against the union of live entries, and a
  violation fires only when live entries exist and none covers.
- **Pure-growth true silence** (R22): rejected — growth is silent in the
  mass column only (no assertion-decline on a growing series); the edit
  itself still fires at its ordinary absorbed tier, red-span coupling
  included.
- **Timeline query refusing clean scenarios** (R21): rejected — the query
  is a lens, not an alarm; it answers for any reviewed scenario.

## Reversed

- **~~Building for hundreds→thousands scenario scale~~** — declined
  2026-07-24 as "a practitioner's client-work scale, not this
  ecosystem's"; **reversed 2026-07-27**: professional BDD practitioners
  are scaling hundreds → thousands of scenarios as agents author more.
  Huge corpora are the expected steady state; refresh runs unpoliced at
  any size. Scale-up is contract, not fence.

## Deferred

- **`@id` / `@realizes` tag conventions** — external resolution first
  (paths, titles, git rename tracking, journal provenance). Tags are
  adopted only if field runs show external resolution losing links; the
  visible identity breaks ruled in Phase 3 are the field data that
  decides. (2026-07-24)
- **Traceability lint rule in gnt** — "the price of admission before any
  design tier is trusted," but built only after gherkin-trace field runs
  show drift actually happening and which links are load-bearing.
  (2026-07-24)
- **Interactive visualizer** — deferred, not declined (visionary ruling,
  2026-07-24): a gherkin-trace viz in the treecontext-viz mold is a natural
  later addition, but only after field runs show which views matter. What
  IS in scope now: the static refresh report — a generated human-readable
  artifact (counts, exception lists, heat) emitted from the projection,
  diffable and committable so drift shows in git history. A heat-map view
  over the five-state taxonomy is the anticipated first face. (2026-07-24)
- **treecontext scenario-anchoring metadata convention** — a possible
  graduation (journal entries citing scenario identity for sharper
  provenance edges), proposed to treecontext only if mined provenance
  proves too noisy without it. (2026-07-24)
- **Region granularity in the contract** — a region's behavioral identity
  is pinned (presented in terms drawn from its own discussion, correlated
  scenarios named, entries cited as evidence; formation determinism forced
  by identical-rebuild), and formation *mechanism* is implementation-tier.
  Granularity — how finely discussion divides into regions — stays
  consciously unpinned: it moves density counts and therefore the natural
  break, but any floor written before the miner exists would be arbitrary.
  Graduation trigger: dogfood runs on the treecontext charter corpus
  showing region counts thrashing between refreshes over a stable journal
  graduate granularity to contract-tier. (2026-07-31, ruled during
  conversation-heat review)
- **Pinning the confirmed-rename-with-body-edits composition** — what
  makes a rename "confirmable" is evidence machinery (git rename
  tracking, paths, titles), mechanism-free in the contract; the floors
  are pinned (body-untouched confirms, unconfirmable breaks visibly).
  The middle band's outcome is derivable — identity and links survive,
  review expires to reviewed-then-changed — and stays unpinned unless
  field runs show agents arguing review should survive a confirmed
  rename with body edits. (2026-08-01, ruled during surviving-renames
  review)
- **Attention tier for deleted-reviewed intent** — the report line is
  pinned (surviving-renames) and the quiet-above-declared ranking is
  pinned (routing-attention), but deletion's own tier is deferred to the
  change-provenance amendment, where deletion joins the quiet-change
  tier under one unified semantics instead of two rulings needing later
  reconciliation. (2026-08-01, ruled during routing-attention review;
  **resolved 2026-08-01** by the change-provenance amendment — deletion
  is a change, the declared/quiet split applies identically, and a
  quiet removal outranks a quiet edit)
- **treecontext aggregate/stats query** — pre-registered pressure point:
  conversation heat needs density counts and treecontext's surface is a
  recall interface; a small stats query is proposed to treecontext only if
  heat mining through recall proves lossy — never direct reads of its
  SQLite schema. (2026-07-24)
