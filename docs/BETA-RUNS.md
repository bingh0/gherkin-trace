# Beta run records

**Strictly opt-in.** gt collects nothing and phones nowhere — it is a
read-only local tool and stays one. Participating means appending an entry
below, in your own copy of this file, and sending it to the maintainer when
you choose to. Not participating means doing nothing; nothing is withheld
from you either way.

What is useful is the shape of real corpora and where gt's signals earned or
wasted your attention. Terse is fine. Skip any field you can't answer or
don't want to answer — a partial entry beats no entry.

## Entry template

```
## YYYY-MM-DD — <project label>

- **gt:** <version, or commit sha if installed from the repo>
- **Project:** <name it however you're comfortable — a label is fine>
- **Corpus:** <N feature files / N scenarios> (from the report's Inputs section)
- **Journal:** journal-backed refresh | dark (no --journal)
- **Top tier:** <tier> — <rough counts, e.g. "6 items, then ~40 unrefined">
- **Surprising:** <false positives; refusals that confused you; signals that
  earned or wasted your attention; anything the report said that you did not
  believe>
- **Exit codes:** <if you drive gt from scripts or hooks — which codes you saw,
  and on what>
```

## Entries

Newest first. The one below is an example over a fictional project — keep it
or delete it, it is not data.

## 2026-08-14 — "Kestrel" (example; fictional label)

- **gt:** 0.0.1 (github:bingh0/gherkin-trace @ c5e25f3)
- **Project:** Kestrel — order-routing service, scoped with /scope v4.
- **Corpus:** 19 feature files / 141 scenarios (7 design-tier).
- **Journal:** journal-backed. First refresh was accidentally dark — the store
  path under `~/.treecontext/stores/` is per-project and I passed the wrong one;
  the report named the journal absent, which is how I caught it.
- **Top tier:** possible-breach — 4 items, all against one fence entry
  ("No retry semantics in the router"), then ~30 unrefined and ~50 unreviewed
  below.
- **Surprising:** Three of the four possible-breaches were the scenarios that
  *enforce* that fence entry. `Guarded by:` in the fence entry body cleared
  them on the next refresh — worth documenting louder, it looked like a bug
  first. Heat was withheld ("no honest break") on a 4-session store; annoying
  but I believe it. The `dilution` refusal on an unwatched title read as an
  error at first glance; the teaching on stderr is correct, I just wasn't
  reading stderr.
- **Exit codes:** 0 on refresh and report from a pre-commit hook. One 2 from a
  typo'd subcommand — the hook treated it as a failed picture until I split
  2 from 1, which is on me; the contract is documented.
