# Scoping input — appeasement signatures (a proposed signal family)

> **DISCHARGED (owner ruling, 2026-08-22).** The dilution interview
> (2026-08-06 → 2026-08-11) was this session: the three candidate
> signatures below became the verdict-coupled, assertion-decline, and
> sanctioned-deletion/quiet-removal tiers; the benign-twin confound was
> resolved by the C6 Sanctioned-changes ratification record; the four
> fence candidates became the Declined dilution-family entries; and the
> family got its name from the visionary — **spec dilution**. This doc
> stays as the origin record. The sequencing condition below is therefore
> met: /audit scoping is unblocked.

*2026-08-03. This is a scoping INPUT for the visionary's next gt scoping
session, produced from the strictness-doctrine debate held in gnt the same
day (recorded there in `docs/lint-admission.md` and in gnt's treecontext
journal). It is deliberately not a spec: no feature files are pre-written,
no scenario titles proposed. Everything here goes through gt's own gate or
it doesn't go in.*

## Why this lands in gt

gnt adopted a four-test admission doctrine for lint rules. Test 2 — the
cheapest-legal-move audit — evicts a whole class of checks from gnt's
lint: rules whose easiest appeasement is spec-weakening or
phrase-shuffling must never gate a run. The doctrine ruled a three-layer
placement for the evicted class:

- **gnt lint** — mechanical, gates, only rules passing all four tests.
- **gt** — temporal, never gates, routes human attention.
- **/audit** — judgment over a snapshot, pull-based checklist.

gt is the structural home for the evicted class because of two properties
no other layer has:

1. **gt never gates, so gt cannot be Goodharted the way a lint can.**
   A gating rule redirects builder pressure to the cheapest legal
   appeasement — the agent needs the green. gt's output is an attention
   ranking read by the owner. There is no green to win; only the human
   retires an attention item. Heuristics that are unsound as gates are
   sound as attention signals. (Residual risk, for honesty: a builder
   agent that pre-reads gt reports mid-build and phrase-shuffles to stay
   off the list re-imports the problem. The backstop is that the list
   still reaches the owner and staying off it requires diffs in reviewed
   files.)
2. **gt is the only historian.** The failure mode below is invisible in
   any snapshot — a weakened scenario lints clean and runs green *by
   construction*. The signature is in the trajectory. gnt is forbidden
   statefulness by its own fence; gt already owns identity threads that
   survive renames.

Relation to the existing signal families: signal 2
(conversation-to-spec ratio) is documented as "the drift detector for the
ratchet's blind spot." This family is its sibling — the **appeasement
detector for the ratchet's other blind spot**: the binding ratchet polices
the debt ledger, not the spec's strength.

## The failure mode being watched

The binding ratchet makes an unbound scenario expensive (red until bound
or declared). The cheapest legal response is not always to bind it — it
can be to **edit the scenario text until binding is trivial**: an
assertion dropped, a Then made vaguer, a hard example row deleted. The
spec moves to meet the code. Every such edit is diff-visible in a reviewed
file, so the human gate covers it in principle — but it is the subtlest
diff class there is, and review attention is the system's scarcest
resource. gt's job is exactly this: allocate that attention.

## Candidate signatures

All three are computable from artifacts gt already reads — feature-file
git history, manifest git history, identity threads. No journal content
reads, no LLM pass, no reporting duty; the organic-capture principle
(visionary, 2026-07-24) is honored as-is.

1. **Edit-then-green coincidence.** A scenario whose *text* changed in the
   same window its manifest status went failing/unbound → passed. The spec
   moved and then the verdict flipped. This is a temporal-order
   discriminator — the same trick the heat taxonomy uses (does discussion
   outlive the last spec change?), applied to spec-vs-status ordering.
   Identity-thread-aware, so retitling cannot launder the sequence.
2. **Assertion-mass decline.** A scenario's Then/And step count shrinking
   across its timeline while its status stays (or goes) green. Dropped
   assertions are the quietest weakening there is; a per-identity count
   series makes them loud. Countable from parses gt already performs.
3. **Reviewed-set shrinkage.** Scenario deletions from the reviewed tier.
   gnt structurally cannot object to a deletion — the ledger entry
   vanishes with the ledger line; the committed manifest's git history
   holds the only evidence. Someone should be reading it, and gt already
   reads manifests.

## Known confound (the interesting scoping question)

Edit-then-green has a benign twin: a visionary correction from a review
session, followed by binding, produces the *same* git sequence. The spec
moving to meet corrected intent is the healthy story; the spec moving to
meet lazy code is the pathological one. Git cannot distinguish authors of
intent. Candidate discriminator, offered not ruled: the **direction of
assertion mass accompanying the edit** — an edit that *grows or holds*
assertion mass and then goes green reads as strengthen-then-bind; an edit
that *sheds* assertion mass and then goes green is the suspect shape.
Whether that discriminator is good enough, or whether the signature
simply carries both cases at a low attention tier and lets the human
recognize their own corrections, is a visionary ruling.

## What this family must refuse to become (fence candidates)

- **Never a gate.** No exit code, no red, no lint-hood. The moment any of
  these signatures gates a run, test 2 applies and the family is
  self-defeating.
- **No phrasing judgment.** Vague-then-class semantics (is this outcome
  line weak?) stay out — that is /audit's snapshot-judgment lane. gt
  watches *change*, /audit judges *state*.
- **No spec-quality score.** Signatures are evidence pointers ranked for
  attention, not a metric. A number invites optimizing the number.
- **No new reporting duty.** Everything is mined from git and manifests;
  agents are never asked to declare an edit's intent.

## Open questions for the interview (visionary decisions, behavior-space)

1. Attention tier: does a weakening sighting rank with fence-adjacent
   items (alert) or below them? Does the confound above demote
   edit-then-green until corroborated by assertion-mass decline?
2. Window semantics: same commit, or within N commits/days? (The heat
   taxonomy's natural-break discipline — no tuned thresholds — probably
   applies, but that is a ruling, not an inheritance.)
3. Tier scope: UAT only, or both tiers? Appeasement of *reviewed intent*
   is the graver event; design-tier weakening may be ordinary refactoring.
4. Interaction with ratification: scenario edits while a file is still
   wip-pending-ratification are drafting, not weakening. Where is the
   line — first ratification? first green?
5. Naming: "appeasement signatures" is this note's working name; the
   family should get its name from the interview, in the visionary's
   vocabulary, like every other signal family did.

## Sequencing note

The owner has ruled (2026-08-03) that this gt scoping session precedes the
/audit scoping session — the boundary drawn here (what gt can compute from
history) defines /audit's residual (what needs judgment over a snapshot),
and /audit is the more flexible instrument, so the rigid contract gets
drawn first.
