# Field run: treecontext charter corpus ("dogfood corpus one")

*2026-08-01. The ratified experiment from the design doc, first execution.
Instrument: gt at cc7f764. Corpus: the treecontext repository's `tests/**` — 22
gnt-bound feature files, 204 scenarios (the design doc estimated ~75; the
charter kept growing). Two journal stores exist because the repo moved:
`treecontext-45c558` (47M, the current repo's young store, 8 sessions /
1,900 entries) and `treecontext-mcp` (86M, the mcp-era archive holding the
charter's actual deliberation history, 12,634 entries). gt takes one
journal per refresh, so the run was executed once against each.*

Both refreshes: ~3.5s wall clock, all 204 scenarios projected, binding
status and fence signals correctly dark (no run manifest — treecontext has
not adopted gnt 0.8.0's manifest option; no OUT-OF-SCOPE.md).

## Findings

**F1 — Heat withheld on the young store (honest, and informative).**
Session densities [463, 408, 340, 165, 164, 115, 106, 1] have no dominant
gap; the natural-break cut refused and said so. Session-sized regions of a
working store produce smooth density slopes — the "no honest break" case
is common on real data, not a corner. This feeds the deferred
region-granularity graduation trigger: session-level granularity may be
too coarse for stores with few long sessions.

**F2 — Retro-prediction failed across the era boundary: zero provenance
correlation on the archive store.** 82 regions formed, a clean heavy cut
(two ~900-entry sessions), but every region shows `correlated: 0`.
Full-title mention mining cannot reach mcp-era discussion because (a) the
charter's titles evolved and the moved repo's shallow history (5
first-parent commits touching tests/) cannot thread identities back to
the old titles, and (b) old discussion rarely quotes today's exact titles.
This is the pre-registered evidence for the deferred **treecontext
scenario-anchoring metadata convention**: mined provenance proved too
sparse without it, at least across repo moves and title evolution. The
heat-retro-predicts-rulings question (session-attribution,
compaction-lifecycle) is unanswerable through this instrument until
provenance recall improves.

**F3 — The recall-enumeration pressure point, measured at scale.** The
young store enumerates at 94% (1,786/1,900); the archive store at **58%**
(7,304/12,634). Tool-capture entries (JSON bodies) lack the function words
the enumeration query rides on. Density counting over auto-capture-heavy
stores materially undercounts — the strongest field case yet for the
treecontext aggregate/stats query graduation path.

**F4 — Region terms polluted by capture noise.** The hottest regions
present as {tool, input, call, graph} — tool-call vocabulary, not topic
vocabulary. Term extraction should likely weight user/assistant prose over
tool captures (treecontext's role-weights surface anticipates exactly
this). Candidate refinement for the heat layer; not contract-tier.

**F5 — Identity breaks surfaced as designed.** Six charter scenarios whose
titles were edited within the reachable 5-commit window closed as
unconfirmed renames with candidates offered — visible breaks, no silent
adoption. Correct behavior; also a reminder that squashed/moved-repo
history sharply limits rename confirmation.

**F6 — 461 sessionless + 24 sessionless entries (per store) named in
notes** — the honest-degradation notes fired on real data exactly as the
gate-2 fixes intended.

## Instrument verdict

The tool held its honesty contract on a real corpus: every absence named,
nothing manufactured, refusals where the evidence could not be ordered.
The experiment's step 3 (heat retro-prediction of ruling clusters) is
blocked on provenance recall (F2), which is itself the experiment's most
valuable output: the graduation evidence the fence entries asked for.

Next steps this run motivates, in graduation order (report → convention →
lint):
1. treecontext: aggregate/stats query proposal now has two measured data
   points (F3). Owner's call to open it.
2. treecontext: scenario-anchoring metadata convention has its first
   too-sparse-without-it evidence (F2).
3. gt heat: role-weighted term extraction and possibly finer-than-session
   regions (F1, F4) — implementation-tier, no contract change.
4. treecontext repo: adopting the gnt manifest option would light up
   binding signals for the charter (one `manifest:` option in its four
   runFeatures calls).
