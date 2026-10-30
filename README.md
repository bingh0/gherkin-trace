# gherkin-trace

Traceability and drift detection for agent-managed BDD. A read-only tool that
joins Gherkin feature files, their binding status, and a project's working
memory (chat/journal history) into one queryable picture — so an agent can see
where spec lacks traceable intent, and a human can see where their scarce
review attention is actually needed.

**Status: contract complete.** The reviewed contract is 12 UAT-tier feature
files — 132 authored scenarios, 135 after outline expansion (2 outlines) —
produced by [/scope](https://github.com/bingh0/gherkin-node-test) structured
scoping interviews: the founding eight files human-ratified file by file, the
later families ratified as conversation rulings with the journal as the
record (the human reads no gt feature files — the tool's own working method).
One design-tier file sits outside the reviewed contract
(`features/design/sidecar-blob.feature`, 8 scenarios). The suite is 188/188. `run-manifest.ndjson` at the repo root is the committed
account of the last run — the same artifact gt joins against in host
projects, dogfooded from this repo's first commit.

**Release status: public beta** (the 0.1.0 line). It works, it is
dogfooded, and it carries no compatibility guarantee yet in either
direction: the picture's schema, the JSON shapes the queries print, the
report layout, and the CLI flags may all change between beta releases.
Pin the exact version you tested against.

## The problem

When an agent manages the feature files *and* the build, the human reviews
intent — a small set of behavior-only scenarios — and everything below that
line is unreviewed by design. A binding ratchet
([gherkin-node-test](https://github.com/bingh0/gherkin-node-test) /
gherkin-cargo-test) guarantees the unreviewed tier can't mechanically rot:
bindings can't silently lose coverage. But the ratchet says nothing about
whether the spec is *right*. An unreviewed tier can wander arbitrarily far
from reviewed intent, and the runner will loudly, faithfully defend the
drift.

The missing guarantee is the **link**: every unreviewed scenario traceable to
the reviewed intent it refines, machine-checked — plus a way to see where
intent itself is thin. Without the link, tiers are just folders.

## The three-tool ecosystem

| Tool | Role | Polices |
| --- | --- | --- |
| gherkin-\*-test | control plane (runner, linter, ratchet) | **mechanical rot** — bindings vs. features |
| [treecontext](https://github.com/bingh0/treecontext) | memory substrate (journal, chat history) | what actually happened — rulings, discussion, corrections |
| gherkin-trace | the join | **semantic drift** — features vs. intent |

gherkin-trace knows both substrates; they never know about it or each other.

The lie each tool polices has an address on the aBDD
[failure ladder](https://github.com/bingh0/gherkin-node-test/blob/main/docs/failure-ladder.md): mechanical rot is the runner's floor, `cino:spec`
(green because the scenario was weakened — a temporal fact only history
shows) is the rung this tool's picture exists to sight, and `cino:decision`
is why the journal is read. One canonical copy of the ladder; this README
links and does not restate it.

## Use

### Install

gt is a dev-time tool of the host project, installed beside the runner it
reads:

```sh
npm install --save-dev gherkin-trace gherkin-node-test
```

Node >= 24.16. gt's SQLite is Node's built-in `node:sqlite`, so there is
no native dependency and nothing to build or approve at install; Node 22
ships that module with a warning on every load and an older API, hence
the floor. `gherkin-node-test >= 0.8.0` is a required peer. treecontext
is an optional peer — without it, journal mining is dark and the report
says so. To light it up, install `treecontext-mcp >= 0.1.0-beta.3` (the
release whose library door is node:sqlite) into the **same project** so
gt can resolve it by name; a global install does not make it resolvable
from the project. gt looks for it as `treecontext-mcp` (its npm name)
first, then as `treecontext` (its package name, which a sibling checkout
links as):

```sh
npm install --save-dev treecontext-mcp
```

Passing `--journal` before it is installed does not break the picture:
the refresh builds without it, names the journal absent with the install
hint in its notes, and the journal's signal families stay dark. An
installed treecontext older than beta.3 is treated the same way: the
refresh names the journal absent with the upgrade hint.

Two commands are installed, `gt` and `gherkin-trace`, both the same
program. If another tool already owns `gt` on your PATH (the Graphite CLI
does), use `gherkin-trace` or `npx gherkin-trace`.

Installing from the repo instead of the registry works the same way,
provided your GitHub auth can reach it:

```sh
npm install --save-dev github:bingh0/gherkin-trace
```

**(b) To develop gt, or run its suite.** Clone and install; the suite's
treecontext fixtures come from the registry package:

```sh
git clone https://github.com/bingh0/gherkin-trace.git
cd gherkin-trace && npm ci
```

The devDependency is `treecontext-mcp`, installed under the name
`treecontext` so the suite and `tsc --noEmit` resolve the same name a
sibling checkout links as. To develop against a local treecontext checkout
instead, build it, then link it over the registry copy for the session:

```sh
npm install --no-save ../treecontext-mcp
```

Scope-built fences are found automatically: gt probes
`features/OUT-OF-SCOPE.md` (the scoping contract's canonical location)
before the repo root, so a scope-v4 repo needs no `--fence` flag.

Running gt in the beta? [`docs/BETA-RUNS.md`](docs/BETA-RUNS.md) is the
opt-in run-record convention — strictly opt-in, and gt collects nothing.

### Running it

```sh
gt refresh --journal ~/.treecontext/stores/<store>/treecontext.db
gt report > gherkin-trace-report.md
```

Queries print JSON (the agent is the primary consumer); `report` prints the
human artifact.

- `refresh` — project feature files, binding status, and journal into the
  picture
- `report` — emit the refresh report (markdown, stdout)
- `attention` — the ranked attention list
- `exceptions` — orphan design scenarios and unrefined UAT intent
- `orphans` — orphan design scenarios only
- `invariant` — the reviewed-set invariant check
- `heat` — discussion regions, hottest first
- `dilution <title>` — one scenario's full dated dilution timeline
- `up <title>` — what intent a scenario traces to
- `down <title>` — what refines a scenario
- `neighborhood <title>` — everything around a scenario

Options:

- `--root <dir>` — project root (default: cwd)
- `--features <dir>` — features directory (default: `<root>/features`)
- `--manifest <path>` — run manifest (default: `<root>/run-manifest.ndjson`)
- `--journal <path>` — treecontext journal store (default: none)
- `--journal-namespace <ns>` — journal namespace (default: `project`)
- `--fence <path>` — out-of-scope file (default: probe
  `<features>/OUT-OF-SCOPE.md` first, then `<root>/OUT-OF-SCOPE.md`; if both
  exist the features one is read and the shadowed root file is named in
  notes)

Exit codes are contract:

- **0 — answered.** Picture built or query answered; degraded states are
  disclosed in the output, never fatal.
- **1 — failure.** A refresh failed partway (the picture is marked broken),
  or an unexpected error.
- **2 — refusal.** Declined with its teaching on stderr and nothing touched;
  contract refusals and usage errors alike — a typo'd command must never read
  as a broken picture.

The write-shaped commands `mark-reviewed`, `edit-feature` and
`write-journal` exist only to refuse. Each exits 2 with a teaching on stderr
naming the human as the owner of that act — a feature edit belongs to the
normal BDD flow, a journal write to treecontext, and reviewed status is mined
from ruling evidence, never set by hand. Nothing is touched.

A refresh projects three read-only sources — `features/**.feature` (parsed by
gnt, the dialect authority), the gnt run manifest, and a treecontext journal
store — into `.gherkin-trace/picture.db`. Every picture is one refresh's
truth, rebuilt from scratch; identical sources rebuild identical bytes, and
the refresh time lives outside the picture so committed reports diff to
exactly one line when nothing else changed. An absent source degrades the
picture loudly: the report names what is absent and which signal families are
dark. "Cannot tell" is always said, never converted to "all clear".

## What the picture computes

- **Identity through renames** — scenario identity is file path + title,
  threaded through git history; a body-untouched rename confirms, an
  unconfirmable one breaks visibly with evidence-scored candidates, and a
  user journal ruling can heal a broken thread. Links, discussion, and
  review status follow the thread.
- **Review provenance** — reviewed status is *mined* from human rulings in
  the journal, never declared; it expires when the body changes after the
  ruling, conservatively when the order can't be established. Ambiguous
  evidence surfaces as candidates, never a score.
- **Conversation heat** — discussion regions classified settled / contested /
  uncaptured / unexamined / quiet by whether talk outlived the spec, with
  "heavy" cut at the natural break in density — or withheld, and said so,
  when no honest break exists.
- **The fence** — `OUT-OF-SCOPE.md` is first-class negative intent:
  fenced silence is explained, user discussion after a ruling reads as
  fence-under-pressure, and scenarios inside fenced territory rank first in
  the attention list.
- **Spec dilution** — green-preserving strength loss on bound scenarios. The
  fence's **Sanctioned changes** entries are the ratification record for
  edits to bound scenarios: an entry lies dormant until an edit touches its
  scenario (so a scoping-time entry outlives the gap to build), an edit is
  judged against the union of live entries, and the whole entry — compound
  directions included — is spent at the scenario's first green after a
  covered edit. An edit-then-green with no covering entry fires as
  unsanctioned weakening. `gt dilution "<title>"` answers with one
  scenario's full dated timeline; a title that is not watched is refused
  with a teaching rather than answered with an empty timeline.

## File contracts

### The run manifest

NDJSON, one row per scenario. gnt/gct >= 0.9.0 write a first line
`{"run-manifest":1}` — the declared format; 0.8.0 files carry bare rows only,
and gt reads both. Rows are `{"file","title","status"}`, with `status` one of
`passed` / `failed` / `skipped` / `todo` / `unbound`. Declared-format rows
resolve relative to the manifest file's own location; bare rows join verbatim
as root-relative. An unknown declared format fails the refresh loudly, naming
both formats and the file — a corrupt account must not be read as a thin one.

### The fence (`OUT-OF-SCOPE.md`)

The file is probed beside the feature files first
(`features/OUT-OF-SCOPE.md`, the scoping contract's canonical location),
then at the repo root; when both exist the features one is read and the
shadowed root file is named in notes — disclosed, never guessed. An
explicit `--fence` wins and probes nothing.

Only entries under a heading that is, or opens with, `Declined` are active
fence entries. An
entry's effective date is the latest ISO date its text carries;
reaffirmation and reversal are edits to the file. The file is the sole fence
authority — mining fence rulings from the journal is itself fenced: positive
intent is mined, negative intent is transcribed.

A Declined entry may name the scenarios that enforce it with
`Guarded by: "<title>", "<title>"` in the entry body, because an enforcing
scenario carries the fence's vocabulary by construction and bag-of-words
cannot see the "never". A named guardian is exempt from that entry's breach
tiers and is cited as a guardian instead; unlisted lookalikes still fire.

A **Sanctioned changes** section holds the dilution entries. Each is a `- `
bullet opening with the bold feature-file path, then the scenario title in
double quotes, then an explicit `direction:` / `directions:` marker carrying
one or more of `drops` / `rewords` / `adds` / `deletes-scenario`, and an ISO
date in a trailing parenthetical. A directionless entry is malformed and
fires loudly — it covers nothing.

### The report

`gt report` emits markdown with four fixed sections: **Attention**, **Review
and coverage**, **Heat**, **Inputs**. The refresh time lives outside the
picture, so a committed report diffs to exactly one line when nothing else
changed.

## Design tenets

- **Read-only consumer.** Never writes to feature files, binding registries,
  or the journal — not even SQLite sidecar files (the journal is
  snapshot-copied and queried from the copy). Asked for a write, it refuses
  naming the owner.
- **The graph is a projection.** Rebuildable from its sources at any time —
  a cache, not a store of record. No migrations problem, deletable without
  scars.
- **Conventions start external.** Links and scenario identity are resolved by
  this tool from what already exists (directories, names, git history,
  journal provenance). A convention graduates into a gnt lint rule or a
  treecontext metadata field only after a field run proves it load-bearing.
- **Narrow lane.** Like ccr and gherkin-\*-test: tiny, extremely narrowly
  scoped. No generic code knowledge graphs, no dashboards-first, no graph
  database servers.

## Developing

The npm package carries code and types only; the contract (`features/`),
the fence, and the field-run documents live in the repo. The test suite
builds real journal fixtures against treecontext through the registry
package `treecontext-mcp`, installed as a devDependency under the name
`treecontext`; CI is a plain checkout and `npm ci` across Linux, macOS, and
Windows, ending in a packed-tarball smoke (see `.github/workflows/ci.yml`).
Consumers are unaffected — treecontext is an optional peer, resolved under
whichever of its two names is installed (`treecontext-mcp` from the
registry, `treecontext` from a checkout).

## Documents

- [`docs/design-2026-07-24.md`](docs/design-2026-07-24.md) — preliminary
  design plan (informally scoped in conversation; the /scope-style record)
- [`OUT-OF-SCOPE.md`](OUT-OF-SCOPE.md) — the fence: everything declined or
  deferred, with why
- `features/` — UAT-tier feature files (the human-reviewed contract, all
  bound and green)
- [`docs/sample-report.md`](docs/sample-report.md) — a committed sample of
  the refresh report, generated over this repo's own corpus without a
  journal (regenerate with `gt refresh && gt report`). The live dogfood
  report, `gherkin-trace-report.md`, mines a real conversation journal and
  stays local — gitignored, like the run records it is built from.
- [`docs/field-runs/2026-08-01-treecontext-charter.md`](docs/field-runs/2026-08-01-treecontext-charter.md)
  — first field run over a dogfood corpus
- [`docs/field-runs/2026-08-02-foreign-corpus-campaign.md`](docs/field-runs/2026-08-02-foreign-corpus-campaign.md)
  — ten foreign corpora, ~7,700 feature files, zero crashes
- [`docs/scoping-appeasement-signatures-2026-08-03.md`](docs/scoping-appeasement-signatures-2026-08-03.md)
  — scoping input: the family that became `dilution` (built; the doc opens
  with its discharge record)
- [`docs/scoping-journal-namespaces-2026-08-21.md`](docs/scoping-journal-namespaces-2026-08-21.md)
  — scoping input: journal-namespace awareness for orchestration
- [`docs/BETA-RUNS.md`](docs/BETA-RUNS.md) — the opt-in run-record
  convention, in force since the private beta (gt collects nothing;
  entries are sent by hand or not at all)
- [`CHANGELOG.md`](CHANGELOG.md) — what changed, per release
