# Changelog

0.1.0 is the first public line, released as a public beta: no compatibility
guarantee in either direction between beta releases. 0.0.x was the
private beta line.

## 0.2.0 (unreleased — ships together with treecontext-mcp 0.1.0-beta.3)

- **The SQLite driver is Node's built-in `node:sqlite`; there is no native
  dependency.** `better-sqlite3` and `@types/better-sqlite3` are gone, and
  with them the install script npm 12 asks every consumer to approve (a
  global install used to fail on it), the README's approve-and-rebuild
  section, and gt's own `allowScripts`. The picture database and the
  journal snapshot both open through node:sqlite; the picture's contents
  and order are unchanged (the schema stores text only, rows sort and
  serialize as before), and its bytes now follow the SQLite the running
  Node carries rather than a bundled one. treecontext-mcp 0.1.0-beta.3 made the same move, and its library
  door changed with it: `openNodeSqlite(path)` replaces
  `wrapBetterSqlite(raw)`, so gt no longer holds a raw handle on a journal
  snapshot — treecontext opens and owns it.
  - **Node floor `>= 24.16`** (was 22.17). Node 22's `node:sqlite` warns on
    every load and has an older API; 24.16 is also treecontext's floor.
  - **treecontext floor `>= 0.1.0-beta.3`**, declared on both optional peer
    names. A version floor alone cannot catch a stale sibling checkout, so
    the journal seam also checks the door for `openNodeSqlite` itself: a
    treecontext that resolves but predates it is an absent source like a
    missing one (the 2026-10-08 ruling extended) — the refresh builds from
    the other sources, names the journal absent with the upgrade teaching
    in its notes, and heat, provenance, and review status go dark. Against
    0.1.0 that case threw `wrapBetterSqlite is not a function` and refused
    every query after. New scenario in `building-the-picture.feature`.
  - CI: the Node 22 lane is replaced by an exact 24.16.0 lane so the floor
    is witnessed; the tarball smoke no longer approves any install script.

## 0.1.0 (public beta)

- **treecontext from the registry for development too.** The suite's
  devDependency is `treecontext-mcp`, installed under the name `treecontext`
  so the fixtures and the type-check resolve the same name a sibling
  checkout links as; CI is a plain checkout and `npm ci`, with macOS and
  Windows lanes beside the three Linux Node lanes and a packed-tarball smoke
  on every lane.

- **treecontext resolved under either name.** The journal seam imports
  treecontext as `treecontext-mcp` (its npm name) first and `treecontext`
  (its package name, what a sibling checkout links as) second; the first
  that resolves wins. Both are declared optional peers.
- **A journal named without treecontext installed is an absent source**
  (ruled 2026-10-08), not a broken picture: the refresh builds from the
  other sources, names the journal absent with the install teaching in its
  notes, and heat, provenance, and review status go dark. It used to fail
  the refresh with a raw module-not-found error and refuse every query
  after.
- **gherkin-node-test 0.11 rebase.** The suite runs under gnt 0.11's
  binding-fidelity guards: ten step definitions whose scenarios the fence's
  Sanctioned-changes section had already moved into the dilution family
  (the quiet-change and declared-change ladder of 2026-08-11) are deleted —
  the unused-definition guard found them; one definition that captured a
  date it never consumed now uses a non-capturing group. Step captures are
  typed `string | DataTable` since gnt 0.10; this suite has no data-table
  steps, so its definitions go through one strings-only definer in
  `test/world.js` rather than a cast at each of 450 sites. Runtime
  behavior is unchanged; the peer range `>= 0.8.0` stands.
- **`gt --version`** prints the installed version (it used to print the
  usage text). `--help` and `--version` are listed in the usage.
- **A second command name.** `gherkin-trace` is installed beside `gt`,
  for PATHs where another tool (the Graphite CLI) already owns `gt`.
- **Node floor `>= 22.17`**, matching the floor gherkin-node-test 0.10 set.
- **npm 12 install-script block documented.** `better-sqlite3`'s native
  build is an install script npm 12 skips by default; the README carries the
  one-time approval, and gt's own `package.json` approves it for a
  developer checkout.
- README rewritten for the public install: npm first, repo install second,
  the developer checkout on the registry package; the treecontext
  peer-install note (same project, not global); the beta compatibility
  stance.

## 0.0.3 (private beta)

- **Harness notifications never speak as the owner** (ruled 2026-08-21,
  both classifiers). Journal entries whose content is harness-notification
  markup (`<task-notification>` …) are excluded from user-authored
  evidence — fence pressure, review-ruling mining, ruling candidates, and
  healing rulings — while still counting as journal mass for heat and
  density. On gt's own picture this deflated the pressure band from 8
  fences to 1 (the survivor's evidence is genuinely owner-authored) and
  retired two phantom reviewed marks that rested on notification text.

## 0.0.2 (private beta)

- **Fence default probe** (ruled 2026-08-21). With no `--fence`, the fence
  is probed beside the feature files first (`features/OUT-OF-SCOPE.md`, the
  scoping contract's canonical location), then at the repo root. When both
  exist the features one is read and the shadowed root file is named in
  notes. An explicit `--fence` wins and probes nothing; a scope-v4 repo now
  needs no flag.

## 0.0.1 (private beta)

Initial release.

- **The picture.** A refresh joins three read-only sources — feature files,
  the gnt run manifest, and a treecontext journal — into
  `.gherkin-trace/picture.db`, rebuilt from scratch each time. An absent
  source degrades the picture loudly instead of quietly.
- **Five signal families.** Scenario identity threaded through renames;
  review provenance mined from human journal rulings, never declared;
  conversation heat over discussion regions; the fence, with topic-anchored
  breach tiers and `Guarded by:` guardians; and spec dilution, with the
  sanctioned-changes lifecycle (dormant until an edit, judged against the
  union of live entries, spent at the first green after a covered edit).
- **CLI surface.** `refresh`, `report`, `attention`, `exceptions`,
  `orphans`, `invariant`, `heat`, `dilution`, `up`, `down`, `neighborhood`,
  under the exit-code contract: 0 answered, 1 failure, 2 refusal.
- **Write-shaped commands refuse.** `mark-reviewed`, `edit-feature` and
  `write-journal` exit 2 with a teaching naming the owner of that act;
  nothing is touched.
- **Dual manifest format.** Bare-row manifests (gnt/gct 0.8) and
  declared-format manifests opening with `{"run-manifest":1}` (0.9) are both
  read; an unknown declared format fails the refresh loudly.
- **Read-only journal access.** The journal store is snapshot-copied and
  queried from the copy — no SQLite sidecar files are written beside the
  original.
- **Unified date format.** Run dates and history dates now share
  seconds-resolution UTC, so same-second comparisons resolve by instant
  rather than by string format.
