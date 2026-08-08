# ADR template

Copy this block into the current month's file (`YYYY/YYYY-MM.md`). Do not improvise the
shape — a consistent anatomy is what makes a decision log scannable years later.

Fill every field. A field with nothing to say gets `None` or `n/a` with a reason —
never a blank, and never a deleted heading.

---

```markdown
## ADR-NNNN — <short imperative title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated | Rejected
- **Date:** YYYY-MM-DD
- **Domain:** <one of the domains in DECISIONS.md>
- **Confidence:** High | Medium | Low
- **Supersedes:** ADR-NNNN | None
- **Superseded by:** ADR-NNNN | None

### Context

What forced a decision. The constraint, the pressure, the thing that broke. Include
what was true at the time that a reader a year from now will not know. State the
architecturally significant requirement this serves.

### Options considered

| Option | For | Against |
|--------|-----|---------|
| A. <the one chosen> | | |
| B. | | |
| C. do nothing | | |

List the real alternatives, including the one you rejected most reluctantly. An ADR
with one option is a memo, not a decision record.

### Decision

What was chosen, stated so it stands alone. A reader should be able to act on this
paragraph without opening anything it links to.

**Tradeoff accepted:** what this costs. Name it explicitly — the decision was made
knowing this, and hiding it makes the record useless later.

### Consequences

- **Positive:** what becomes possible or cheaper.
- **Negative:** what becomes harder, slower, or riskier. Never omit this section.
- **Follow-on work:** what this obliges someone to do next, if anything.

### Related

Links to supplemental material — the spec, the plan, the PR, the deliberation. The
decision above must not depend on these to be understood.
```

---

## Confidence, and why it is a field

A significant decision is sometimes made with low confidence — insufficient data, time
pressure, a reversible-enough bet. Recording that is more useful than pretending
certainty: it tells a future reader whether to treat the record as settled or as the
best call available at the time, and it marks the decisions worth revisiting first.

| Confidence | Use when |
|---|---|
| **High** | Evidence-backed, alternatives genuinely tested, low chance of reversal |
| **Medium** | Reasoned but not measured; would not be surprised to revisit |
| **Low** | Made under uncertainty or time pressure. Flag it and say what would change your mind |

## Numbering

`ADR-NNNN` is **globally sequential across all years and files** and never reused. The
next number is the highest in `DECISIONS.md` plus one — check there, not in the current
month's file, because a decision may have landed in a different month.

## Superseding

Superseding is two edits, and both are required:

1. The **new** record sets `Supersedes: ADR-NNNN`.
2. The **old** record's `Status` becomes `Superseded by ADR-NNNN` and its
   `Superseded by` field is filled.

That second edit is the **only** permitted modification to an accepted record. Nothing
else in it changes — not the context, not the decision, not the consequences. The old
record continues to say what it always said; only its status pointer moves.
