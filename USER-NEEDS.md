# USER-NEEDS.md — the gherkin-trace visualizer / visual reports

> **RECONSTRUCTED LEDGER — NOT RATIFIED.** Produced 2026-08-23 by inference
> from the project record, not elicited from the visionary in a live
> interview. Weights are marked `?` and stay guesses until the Phase-1½
> readback confirms or corrects them. Every entry is a candidate until the
> visionary says otherwise; the consuming /scope interview treats this file
> as its Phase-1½ baseline seed and reconciles against it, never as settled
> contract.
>
> **Deliberately code-blind.** This file names no source files, no line
> numbers, and no implementation mechanisms, so that the interview and the
> feature files it drafts are formed by intent alone. Implementation-level
> observations gathered during reconstruction are excluded from this file
> on purpose; they are held out-of-band and surface only at the
> post-draft reconciliation pass, where drafted-blind features are compared
> against what exists. Discrepancies either way are findings, not choices.
>
> Subject: the "picture plates" — static visual pages that render what a
> traceability refresh already knows (its committed picture, report, status
> blob, and fence) into one human-readable artifact. A prototype exists;
> nothing binds it yet — that gap is what this ledger exists to close.

## How the interviewer should consume this

- Treat each need as the Phase-1½ sketch baseline: confirm or correct the
  statement, then confirm or fix its weight.
- The five reconstruction-only candidates near the bottom each deserve
  exactly one question, provenance named ("this came from a checklist sweep,
  not from anything you said").
- Do not seek out or read the prototype's implementation while drafting;
  the ledger is intended to be sufficient. If a ruling seems to hinge on a
  fact about existing code, put the question to the visionary instead.
- The fence entries listed at the bottom already govern this surface; they
  bind without re-interviewing.

## The root need

**N0 (owner, wt 5?) — I want to *see* what my traceability picture already
knows, at a human glance, in an artifact I can commit, share, and open
anywhere — rendered, never judged.**
[vision sentence, restated from the owner's own framing: the effort began
as "window dressing, but for human comfort" and matured into three
delivered plates; the page's own strapline is "rendered, not judged"]

*Stakeholder fact, recorded not assumed:* on this project the visionary
genuinely is every stakeholder at once — owner, operator, and business —
so most rows name him; N9 is where the business role separates out.

## The ledger

### N1 (owner, wt 5?) — I need my project's state legible without asking like an agent
I read the plate the way I read a dashboard — where is attention, what is
hot, what am I re-litigating — without constructing queries only an agent
would enjoy.
- **Evidence:** the delivered views exist precisely to answer owner-shaped
  questions: where discussion outlives the spec, which rulings are under
  pressure again, where every scenario sits tier by tier, what happened to
  the watched ones.
- **Means:** a pre-rendered static page [chosen]; a live pane would satisfy
  the need differently and remains the fence's Deferred entry.
- **Coverage:** `partial` — the prototype demonstrates it; nothing binds it.

### N2 (owner, wt 5?) — every mark on the page must be evidence the picture already holds
The renderer adds no opinion, computes no new signal, scores nothing. If it
isn't in the picture, it doesn't appear.
- **Evidence:** the page declares itself "rendered, not judged… no new
  signals computed"; this inherits the fence entries *Dilution as a gate*
  and *Spec-quality score*, which forbid judgment surfaces anywhere in the
  toolchain.
- **Coverage:** `structural` — true of the prototype by construction; the
  future corpus should still pin it per view, because a renderer is exactly
  where decorative invention would creep in unnoticed.

### N3 (owner, wt 5?) — nothing from my conversations may leak into a shareable artifact
Counts, dates, tiers, topics, ids: fine. Conversation text, excerpts,
notification bodies: never — not in tooltips, not in labels, not in hidden
fields.
- **Evidence:** the privacy bar was enforced throughout the prototype as an
  absolute: aggregates and dates only, with hard stops that fail the build
  if forbidden content classes appear in the output.
- **Tension:** caps N9 — shareability raises the stakes of this guarantee.
- **Coverage:** `partial`.

### N4 (owner, wt 5?) — darkness and emptiness must survive rendering as darkness and emptiness
A withheld classification reads as withheld; an empty category reads as
empty; a degraded input never paints an all-clear.
- **Evidence:** the prototype's own words — "Empty means empty. The rung is
  drawn because the taxonomy has it, not because anything landed on it";
  extends the *Manufactured silence* fence onto a surface nothing binds
  yet.
- **Coverage:** `partial`.

### N5 (owner, wt 4?) — regenerating over an unchanged picture must change nothing but the stated time
Committed visual artifacts participate in git history; a diff has to mean
real drift, never rendering noise.
- **Evidence:** the project's other committed artifacts already obey this
  exact discipline byte-for-byte; the plate inherits it.
- **Tension:** caps N9 — any flourish that emits variation breaks the diff
  property.
- **Coverage:** `partial`.

### N6 (owner, wt 4?) — the plate must refuse to render a lie when its inputs disagree
If two committed sources tell different stories about the same fact, the
build stops loudly; it never quietly picks a side.
- **Evidence:** the prototype fails its build on input disagreement rather
  than rendering the winning side; serves the triangulation doctrine
  (intent ↔ plan ↔ build) — the plate is another reading of the same
  vertices and must not become a fifth opinion.
- **Coverage:** `partial`.

### N7 (owner, wt 4?) — I must be able to read it in my mode, on my devices, with my eyes — and never by colour alone
Dark mode and light mode both work; a narrow screen doesn't overflow; the
categorical colours survive colour-vision deficiency; a state is always
named in text somewhere, never only inked.
- **Evidence:** the palette was validated against accessibility criteria
  (lightness banding, adjacent-colour discrimination under CVD, contrast)
  before use, and every state is double-labelled in text.
- **Tension:** N9 wants typographic beauty; this caps it at the
  accessibility floor.
- **Coverage:** `partial` — done once, by hand; nothing keeps the next
  render honest.

### N8 (owner, wt 4?) — each view earns its place by answering a question I actually have
Where is talk outliving spec? Which of my rulings am I pressing on again?
Where does the corpus stand, tier by tier? What happened to watched
scenarios? Views that answer none of these don't ship.
- **Evidence:** the four delivered views map one-to-one to those questions;
  the fence's Deferred visualizer entry set the bar in advance — "only
  after field runs show which views matter" — and the plates were built as
  that field run. A heat view over the five-state taxonomy was the
  anticipated first face, and arrived.
- **Tension:** capped by N1 (a page is glanceable only while views stay
  few) and by the *Generic code-AST knowledge graph* fence — the subject is
  the intent graph, not code structure.
- **Coverage:** `partial` — and the graduation ruling itself is still open
  on the owner's queue.

### N9 (business, wt 3?) — the artifact must be presentable enough to stand in public
The plates double as demonstration material for the agent-driven BDD
method — shared with beta testers, shown to collaborators, publishable
alongside the paper's ecosystem.
- **Beneficiary note:** business need — the method's credibility rides on
  the artifact's finish.
- **Tension:** capped by N3 (privacy decides what may ship), N5
  (determinism decides what may vary), and N7 at the floor.
- **Coverage:** `partial`.

### N10 (owner, wt 4?) — the page shows the real picture, never a rehearsal
A plate drawn from staged, simulated, or stale state misleads more than a
missing plate; when reality arrives it displaces any demonstration stand-in.
- **Evidence:** an early plate rendered simulated classifications while the
  real ones were unavailable; the owner's ruling on landing was to render
  real values and drop or clearly demote the simulation. Nothing binds that
  against regression.
- **Coverage:** `partial`.

### N11 (owner, wt 3?) — one portable artifact, no machinery to view it
I can commit it, attach it, or open it from a file manager; whoever receives
it installs nothing, starts nothing, and sees it whole.
- **Evidence:** satisfied today by deliberate absence — no server, no app,
  no viewer step beyond opening the file (`absence` coverage).
- **Means under it:** fully pre-rendered output with no runtime behaviour
  [chosen]; the build pipeline runs in the project's own language/runtime
  [chosen — the owner rejected a foreign-interpreter build].
- **Coverage:** `absence` — served by what was deliberately not built.

### N12 (owner, wt 3?) — the way to remake it outlives any single session
I can hand the recipe to a future session, another machine, or another
person and get the same artifact back; nothing essential lives only in
someone's head or a temporary workspace.
- **Evidence:** the prototype currently exists only inside a temporary
  workspace; "visualizer graduation" is a standing item on the owner's own
  queue. This need is the backport exercise itself.
- **Coverage:** `partial`.

## Means register (demoted by the swap test — binding choices, not needs)

- Fully pre-rendered static output, no runtime behaviour — serves N11 and
  N5's diffability.
- Build pipeline in the project's own runtime — serves N11/N12; the earlier
  foreign-interpreter build was retired by ruling.
- Deterministic generation — same inputs, same bytes — serves N5.

Swapping any of these is a visionary decision, never a downstream
optimization.

## Tensions

- N3 ↔ N9 — shareability pressure against leak-proofing; N3 wins by
  default (privacy is older and fenced).
- N1 ↔ N8 — glanceability caps view count; graduation decides by evidence,
  not appetite.
- N5 ↔ N9 — determinism caps flourish.
- N7 ↔ N9 — accessibility floor beneath presentation.

## Reconstruction-only candidates (surfaced by checklist, never asked)

Provenance for each: a checklist sweep over the record, not anything the
owner said. One question apiece at the interview.

- **Performance at contracted scale** — the corpus steady state is large by
  contract; at that size, what is the slowest acceptable build?
- **Staleness at a glance** — can a reader tell a stale plate from a fresh
  one?
- **Network independence** — must the page read correctly with no network
  at all?
- **Evolvability** — a brand-new signal family lands in the picture; must
  the plate degrade gracefully, gain a view, or refuse until updated?
- **Ops burden** — who regenerates the plate, when, and what is the whole
  ritual — one command or several?
- **Diagnosability** — when a build fails partway, what does the operator
  find besides an error?

## Roads not taken (already decided by the record — do not re-litigate)

- **The force-directed graph as the primary face** — built first, found
  unreadable next to structured views; demoted to artifact-at-most. The
  structured multi-view page replaced it.
- **A foreign-interpreter build pipeline** — tried first; ruled to the
  project's own runtime (2026-08-22).
- **Simulated states while real ones were unavailable** — rendered in an
  early plate; dropped or demoted the moment reality existed (2026-08-22).
- **A live interactive visualizer now** — deferred by fence since
  2026-07-24; the plates are the field run that evidence was waiting for,
  and the graduation ruling remains the owner's to make.

## Fence entries that already govern this surface

Any scenario drafted from this ledger stands inside these; they bind
without re-interviewing: *Writing to sources*, *Manufactured silence*,
*Generic code-AST knowledge graph*, *Rank boosting from signal pile-up*,
*Hand-declared status*, *Dilution as a gate / Spec-quality score /
Reporting obligations*, *Agent-voice fence pressure*, plus the
*Interactive visualizer* deferral whose graduation condition this exercise
is intended to discharge.
