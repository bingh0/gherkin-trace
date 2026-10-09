# Field run: foreign-corpus campaign ("does it survive contact?")

*2026-08-02. Instrument: gt at f84e1a2 (suite 131/131 before any run).
Purpose: stress/smoke across ten corpora gt did not grow up in — four
local projects, one 5,072-file fuzz/parity corpus, four external BDD
framework repos. External repos were run from scratchpad copies; their
clones verified untouched. All `.gherkin-trace/` dirs written into local
repos were removed after measurement.*

## Robustness headline

**Zero crashes across ~7,700 feature files.** Every failure mode was an
honest per-file quarantine (file, line, reason, statement) or a loud
refusal; the picture built from whatever survived. Time-only-diff
determinism held on every corpus double-run: gt self (byte-identical),
private corpus B (75 files × 1,561 scenarios + foreign journal),
fuzz-valid (3,000 files), behave (real-world unicode text). One apparent
break on private corpus B was a minute-boundary rollover in `refreshedAt`
— timestamp-stripped files identical.

## Corpus results

| Corpus | Legs | Files parsed | Scenarios | Exceptions | Wall |
|---|---|---|---|---|---|
| gt (self) | trio | 10/10 | 131 | 0 | ~1s |
| gnt fixture mini-trio | trio | 1/1 | 6 | 0 | <1s |
| gnt root (no features/) | — | refusal | — | — | — |
| private corpus B | features+journal | 75/75 | 1,561 | 0 | 28s |
| clinic-schedule | features only | 5/5 | 10 | 0 | <1s |
| file_organizer | features+journal | 7/8 | 60 | 1 | ~2s |
| gct fuzz-valid-out | features only | 2,313/3,000 | 6,076 | 687 | 0.9s |
| gct fuzz-out (hostile) | features only | 6/2,000 | 6 | 1,994 | 0.4s |
| gct corpus-out | features only | 32/72 | 53 | 40 | <1s |
| behave (external) | features only | 18/230 | 28 | 212 | <1s |
| cucumber-js (external) | features only | 0/76 | 0 | 76 | <1s |
| cucumber (external) | features only | 40/68 | 98 | 28 | <1s |
| vitest-cucumber (external) | features only | 3/10 | 5 | 7 | <1s |

Degraded-mode honesty held everywhere: absent legs named in `absent`,
their signal families listed in `dark`, never silently green.
clinic-schedule (nothing but feature files) is the purest confirmation
of the ratified "gt takes what it can" path.

## Findings

**F1 — Refusal exits 0.** `gt refresh` on a repo with no features dir
prints the correct loud refusal and touches nothing — but exits 0. A
script or CI step cannot distinguish refusal from success without
parsing stderr. The contract is silent on exit codes. Needs a ruling:
should refusals (and broken pictures?) carry a nonzero exit?

*Correction (2026-08-03): the exit-0 observation was a measurement
artifact — the campaign's probe piped through `head`, so `$?` captured
head's exit, not gt's. Refusals already exited 2. The real gap was
narrower: the exit map was untested and undocumented, and refresh
failure exited an accidental 3. Ruled and pinned as contract — 0
answered (degraded disclosed), 1 refresh failed partway, 2 refusal —
in `features/answering-scripts.feature`.*

**F2 — Generic scenario titles produce false-positive journal matches.**
gnt's fixture scenario titled "passes" was marked *contested* by
colliding with a 352-entry region whose vocabulary is just the
project's common words (test, node, gherkin, feature). The region was
disclosed honestly, but this is the measured noise floor of full-title
mention mining: title specificity is what earns mining precision.
Agent-authored corpora (long, specific titles) sit on the good side of
this; fixture-style titles do not. Paper datum, no action.

**F3 — The per-scenario disclosure channel saturates at scale.** On
private corpus B (1,561 scenarios × a journal that discusses those exact
topics daily), 1,557 scenarios hit the 500-result provenance bound, producing
1,557 near-identical notes. Each note is honest; together they bury
every other diagnostic. The disclosure mechanism scales O(scenarios)
when the condition is corpus-wide. Wants aggregation: "1,557 of 1,561
scenarios hit the provenance bound" as one corpus-level note.

**F4 — Tier absence floods attention.** Private corpus B has no
`features/design/` tier, so all 1,561 scenarios rank "unrefined" — a
31,852-line attention
list with zero discrimination. Contract-correct, useless in practice.
Same shape as F3: the absence of an entire tier is one corpus-level
fact, not N per-scenario alerts. Needs a ruling on whether attention
should collapse corpus-wide conditions (or whether non-two-tier repos
are simply outside attention's charter and should be told so).

**F5 — The recall-enumeration pressure point fired twice more.**
gnt store: 1,833/1,995 entries visible (91.9%); file_organizer:
294/335 (87.8%). Fourth and fifth measurements after the charter run's
94%/58%. The trigger condition ("if lossy, propose tc stats query") is
now backed by five measurements on five distinct stores, all lossy.
Cross-project action: propose the treecontext stats/enumeration query.

**F6 — Dialect strictness is the entire external-adoption gap.** gnt's
parser (by doctrine: no doc strings, no `Rule:`, no step-keyword-led
description prose, identity/tag rules) rejects most real-world Gherkin:
behave 8% parse rate, cucumber-js 0%, cucumber 59%, vitest-cucumber
30%. Doc strings alone account for the bulk (cucumber-js 75/76
rejections; behave 174/212 — tolerance would take them to ~99% and
~83%). `Rule:` blocks and description-prose are next. On grammar-valid
fuzz input the doctrine cost is ~23% (687/3,000, all duplicate-title
and tag-conflict rejections). This quantifies the practitioner
question: gt cannot today build "a gherkin feature file graph to help
him" over a cucumber-era corpus. Whether to widen is a gnt-side
decision (gt inherits `parseFeature`) — the evidence is now on record
either way. Note the quarantine machinery handled all of it perfectly;
this is a coverage gap, not a robustness gap.

**F7 — gnt's manifest emits machine-absolute paths (found via tc
adoption).** Executing the self-hosting ruling, treecontext adopted gnt
0.8.0 (pin bump, charter suite green 888/30-todo, manifest opt-in on
the journal runner, tc 9925ac4). The 112-row manifest came out with
absolute `file` paths because `runFeatures(HERE, ...)` receives an
absolute dir — violating the manifest's own no-churn doctrine and
breaking portable joins (gt joins corpus-relative; the campaign's
fixture-manifest mismatch was the same defect seen from the other
side). Fix is format-level (relativize against the manifest's
location), lockstep gnt/gct; evidence filed in gnt's coordination
channel. tc's manifest is gitignored until it lands.

## Addendum: gnt restructured (what the flagship would look like)

Owner asked what gnt would look like if its scattered fixtures were
restructured into a parseable corpus. Assembled in scratchpad: all 10
fixture features regrouped under `features/<fixture-dir>/`, the
`.manifest-out/*.ndjson` outputs merged into one run-manifest with
paths rewritten relative, gnt's journal attached. Result — the first
foreign corpus where every attention tier discriminates:

- **8/10 parse; the 2 quarantines are gnt's own negative fixtures**
  (duptitle, no-scenarios), rejected with the same doctrine rationale
  gnt's own tests assert — an accidental parser-parity check between
  gt's inherited `parseFeature` and gnt's test expectations.
- **The manifest join surfaced real never-run coverage**: 5 scenarios
  in-corpus but absent from the merged manifest (the @only pair, the
  @todo fixture, the unbound gap, counter's un-manifested run) ranked
  top of attention as "coverage that never ran" — above 14 unrefined.
  Tier absorption worked ("5 absorbed into higher tiers").
- **The picture's verdict is true**: everything unreviewed, undesigned,
  heat 12/13 regions unexamined — correct, because gnt is not
  self-hosted BDD; its fixtures are test data, not product intent, and
  its journal's 1,995 entries deliberate gnt's design under titles that
  exist as no feature file. F2 recurred on schedule: the generic titles
  ("passes", "fails", "ready") all matched the same common-vocabulary
  contested region.

The what-if this run actually prices: if gnt self-hosted — real UAT
features for its own behavior plus its own manifest on full runs — the
12 unexamined heat regions holding its design deliberation would become
linkable provenance. The restructure is mechanical; the missing piece
is intent-bearing features, not tooling.

## Addendum: what third-party corpora taught us (2026-08-03)

*Purpose, stated plainly: we surveyed third-party feature-file corpora to see
whether anything in them is worth learning for making gt better inside the ABDD
workflow. This is an instrument-improvement survey that produced measurements —
not a comparative study, and not evidence for the doctrine. F6 already priced
what strictness costs; this does not attempt to price what it buys.*

**These corpora are not a control arm, and are not being graded.** behave,
cucumber-js, cucumber (rs) and vitest-cucumber are framework self-test suites,
written by many hands over many years, maintained and read by humans. A small
reusable step vocabulary is the *correct* design for that goal — it is what
step definitions exist for, and it buys them maintainability and low
duplication. ABDD's opposite habit (long, self-contained, mostly-unique step
text) is correct for *its* goal and would be poor engineering in theirs. Every
difference recorded below is a difference in objective, not in quality, and any
reading of these numbers as "their Gherkin is worse" is a misreading this
document explicitly disclaims.

**The maturity asymmetry, stated before the numbers.** These are shipped,
released projects with years of production users, contributors, deprecation
cycles and backward-compatibility obligations — cucumber is the origin of the
practice itself. ABDD is at present a philosophy with an early-phase toolchain:
the `scope` skill, gnt/gct, treecontext, and gt — which is **not yet
released**. Comparing a corpus that has absorbed a decade of real-world edge
cases against corpora that have never faced a single external user is not a
comparison of methods. Some of what reads as "clean" on the ABDD side is
simply *youth*, and some of what reads as accretion on theirs is the record of
having survived contact with reality. That asymmetry runs against the
flattering direction and is restated as confound 4 below.

**What we actually learned — the finding is a triple negative.** Three
candidate gt features surfaced from the survey and all three were declined the
same day:

1. **A survey parse tier** (read inside files gt quarantines) — in-lane value
   is structurally zero, since native corpora parse cleanly. All its value
   would be on corpora gt does not serve.
2. **A cross-file step graph** — the cross-file relationship that matters in an
   ABDD corpus is design→UAT refinement, which gt already models as links. A
   step graph would re-derive it noisily. gt's own mid-band was two entries,
   both trivial.
3. **A Background/inline variation detector** — the measure it would rest on
   failed its own power check (below) and is withdrawn.

The survey's value to gt was therefore confirming that three plausible
directions are dead ends, for reasons that hold. That is the useful result.
The measurements below are supporting data.

**Method.** Text-level scan of `**/*.feature`, deliberately *not* through gt's
parser — a rejecting front door cannot measure a corpus it refuses, so all
corpora are measured on equal footing. Step lines are normalized (keyword
stripped; quoted literals, `<placeholders>` and numerals → `<>`; lowercased;
whitespace collapsed). Three measures: cross-file step sharing, a construct
census, and a **Background/inline variation signature** — one step text
appearing as a `Background:` step in ≥1 file while being inlined into *every*
scenario of ≥1 other file.

ABDD-authored — 54 files:

| Corpus | Files | Distinct steps | Shared >1 file | Doc strings | `Rule:` | Background | Inconsistencies |
|---|---|---|---|---|---|---|---|
| gherkin-trace | 12 | 333 | 3.9% | 0 | 0 | 0 | n/a‡ |
| clinic-schedule | 7 | 25 | 12.0% | 0 | 0 | 7 of 7 files | 0 (opp. 3) |
| private corpus A | 9 | 93 | 2.2% | 0 | 0 | 8 of 9 files | 0 (opp. 2) |
| file_organizer | 26† | 45 | 75.6%† | 0 | 0 | 0 | n/a‡ |

Third-party (framework self-test suites, human-maintained) — 384 files:

| Corpus | Files | Distinct steps | Shared >1 file | Doc strings | `Rule:` | Background | Variation |
|---|---|---|---|---|---|---|---|
| behave | 230 | 217 | 26.3% | 2,285 in 200 files | 68 in 28 files | 110 in 83 files | present (opp. 57) |
| cucumber-js | 76 | 140 | 18.6% | 543 in 76 of 76 | 5 in 4 files | 47 in 46 files | present (opp. 26) |
| cucumber (rs) | 68 | 57 | 26.3% | 7 in 5 files | 15 in 13 files | 14 in 11 files | present (opp. 15) |
| vitest-cucumber | 10 | 67 | 9.0% | 41 in 7 files | 0 | 5 in 5 files | 0 (opp. 6) |

† file_organizer's 26 files are three near-duplicate copies of nine features
(`features/`, `rust/features_augmented/`, `rust/features_original/`). Its
sharing figure is file duplication, not coupling, and must not be read as a
coupling result.

‡ Not applicable, not zero — see below.

### Two columns that prove nothing

Doc strings and `Rule:` are *definitional*. gnt's parser rejects both, so an
ABDD corpus containing either would not parse, let alone run. "0 of 54 files"
restates the doctrine. It is evidence of compliance, tabulated for
completeness, and carries no argumentative weight whatsoever. It says nothing
about the third-party corpora, where both constructs are ordinary and
appropriate.

### One measure withdrawn for lack of power

The Background/inline variation signature was the interesting-looking result
and it does not survive its own methodology check. Firing requires a step
shared across ≥2 files where at least one file hoists it into a `Background:`.
That opportunity is what the "opp." figures above count — and in the ABDD
corpora it barely exists:

- **gherkin-trace and file_organizer have zero `Background:` blocks anywhere.**
  The signature is *structurally impossible* in both. Reporting them as "0"
  would be reporting a measurement that could not have come out any other way.
- The other two have an opportunity of 3 and 2 shared steps.
- **vitest-cucumber, the third-party corpus with the smallest opportunity (6),
  also fires zero** — behaving exactly like the ABDD corpora.

The measure tracks opportunity, not authoring regime. A "0 of 4 vs 3 of 4"
headline would be an artifact of corpus size and Background usage, presented as
a doctrine effect. **Withdrawn.** Reviving it would need a corpus large enough
to give it power and a denominator (variations per shared-step-with-Background)
rather than a raw count.

A second reason to withdraw it, independent of power: "inconsistency" is the
wrong word for what it detects. In a 230-file suite maintained by many people
across years, hoisting a step to `Background:` in one file and inlining it in
another is frequently a deliberate local readability choice. The signature
cannot distinguish that from drift, and gt has no standing to call it a defect
in someone else's project.

### The one axis that survives

**Step-text density**, which no rule in the doctrine constrains. Distinct step
texts per file:

| ABDD-authored | | | third-party | |
|---|---|---|---|---|
| gherkin-trace | 27.8 | | vitest-cucumber | 6.7 |
| private corpus A | 10.3 | | cucumber-js | 1.8 |
| clinic-schedule | 3.6 | | behave | 0.94 |
| file_organizer | 1.7† | | cucumber (rs) | 0.84 |

Directionally consistent — medians ≈ 7 and ≈ 1.4 — and behave carries *fewer*
distinct step texts than gherkin-trace across 19× the files. **The
distributions overlap** (1.7 vs 6.7 at the boundary), n is 4 per arm, and much
of the separation rests on one outlier. A directional observation, not an
effect size.

It is worth recording only because it has a **mechanism that is not in dispute
and does not need this data to be true**: conventional BDD deliberately builds
a small reusable step DSL — that is what step definitions are *for*, and it is
good practice for a human-maintained suite — while ABDD writes each scenario as
a self-contained intent statement because its reader is an agent reconstructing
intent without shared context. Both are correct for their objective. The
measurement quantifies a known design difference; it does not discover one.

The tooling consequence is the part that actually served gt, and it connects to
a finding already on record: long, specific, mostly-unique step and scenario
text is what earns journal mining its precision, and its absence is what
produced the F2 false-positive floor. So the corpus property and the mining
precision are one fact seen twice — and the corollary is a real limitation to
own, not a boast: **gt's mining approach would work poorly on a well-designed
conventional BDD suite**, because a compact shared step vocabulary is exactly
the input its precision depends on not having.

### Confounds — all three, none resolved

1. **Self-selection.** Unresolvable here; the ABDD corpora exist because of the
   doctrine.
2. **Size and age.** 54 files, young, vs 384 third-party, accreted over years.
   The data warns on itself: the smallest third-party corpus behaves like the
   ABDD ones.
3. **Single practice.** The four ABDD corpora share one author, one agent, and
   one doctrine. This reads as n=4; it is closer to **n=1 practice
   observed four times.**
4. **Maturity.** The largest asymmetry, and the one that does not flatter
   ABDD: the third-party projects ship releases, carry users, and have absorbed
   years of external contribution and compatibility pressure. The ABDD
   toolchain is early-phase and gt is unreleased. Corpus properties measured
   before a project has any users are not evidence that those properties
   survive having them. Nothing here should be cited as method-vs-method.

The honest verb is therefore **"consistent with"**, never "supports" and never
"demonstrates". What would settle any of it is an ABDD corpus at behave's scale
and age, authored by someone else, on a released toolchain. None exists yet —
and until one does, the comparison's honest role is to describe a *difference
in design objective between a mature practice and a young one*, not to argue
for either.

**Standing ruling (2026-08-03).** The toolchain builds what ABDD execution
needs. Third-party corpora are surveyed to learn what would improve gt, not to
be scored against ABDD's objectives, and comparison data is a baseline for the
paper rather than a product direction. Where a difference is recorded, the
difference in goals is recorded with it.

## Grant/paper numbers (one line each)

- ~7,700 foreign feature files processed, 0 crashes, 100% of failures
  honestly quarantined with file/line/reason.
- Throughput without journal: 3,000 files / 6,076 scenarios in 0.87s.
  With journal mining: 1,561 scenarios × 335k-term store in 28s.
- Determinism: byte-identical modulo timestamp on every corpus tested.
- Honesty floor: 13/13 runs disclosed absent legs and dark families;
  0 silently-green results.
- Instrument limitation, quantified: dialect coverage 0–59% on
  cucumber-ecosystem corpora, cause distribution measured (doc strings
  ≫ Rule: > description prose).
- Journal-mining noise floor: generic titles false-positive (F2);
  recall enumeration lossy on 5/5 stores measured (F5).
- Step-text density, directional only: native corpora carry a median ~7
  distinct step texts per file against ~1.4 in-the-wild; behave carries
  fewer distinct step texts than gherkin-trace across 19× the files.
  Distributions overlap, n=4 per arm, one outlier carries much of it —
  report as "consistent with", never as an effect.
- Two negative methodology results worth reporting *as* results: the
  grammar-inconsistency measure was withdrawn for lack of power (it
  tracks Background-usage opportunity, not regime), and the doc-string /
  `Rule:` counts are definitional (gnt rejects both at parse). Both are
  documented in the addendum rather than quietly dropped.
