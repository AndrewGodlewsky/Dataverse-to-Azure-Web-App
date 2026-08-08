# Notes

Working notes and stated preferences. Not a journal — see `learning-records/` for
decision-grade insight.

## Stated preferences

- **Session length**: 30–45 minutes. Fewer, meatier lessons; each covers a whole layer.
  Because longer sessions leak more, every lesson after the first opens with a short
  retrieval check on the previous one (spacing).
- **Starting point**: new to Azure *and* Dataverse. Define terms on first use; never
  assume portal navigation is familiar.
- **Format**: HTML lessons in `lessons/`, opened in the browser. Reference cards in
  `reference/` are the things worth printing.

## Teaching decisions

- **Ground everything in this repo.** The user owns a real, built, undeployed system.
  Abstract examples are wasted here — every lesson should point at a real file, a real
  line of `docs/options-atlas.md`, or a real figure in `docs/options-diagrams.html`.
- **Lesson order follows the deployment path**, not the atlas's chapter order: frame →
  identity → provisioning → deploy → real tables → limits. That way each lesson unblocks
  the next real-world step rather than completing a taxonomy.
- **The eleven diagrams are already a teaching asset.** Lessons should point at a figure
  by number rather than redrawing it.

## Syllabus (all nine written 2026-08-08)

`01` frame · `02` app identity · `03` viewer identity · `04` provisioning ·
`05` shipping · `06` real data · `07` the ceilings · `08` the frontend ·
`09` operating + credential upgrade. Index at `lessons/index.html`.

**Caveat on writing them upfront.** Lessons 02–09 were authored in one sitting at the
user's request, before any evidence of how lesson 01 landed. They are therefore aimed at
a *predicted* learner. Treat every one after the first as provisional: when a learning
record shows the real floor is higher or lower than assumed, rewrite the affected lesson
in place rather than adding a remedial one. Numbering is stable; content is not.

Each lesson opens with a one-question retrieval check on its predecessor — that is the
spacing mechanism compensating for the 30–45 minute session length.

## Corrections made while teaching

- **`server/index.js` comment is wrong.** It claims App Service maps `WEBSITES_PORT` to
  `PORT` inside the container; the docs say the setting is not injected at all. Behaviour
  is correct by coincidence of both being 8080. Taught as a callout in lesson 01.
- **Figure 9 of `docs/options-diagrams.html` was wrong** and has been fixed. It claimed
  the cross-filter loop needs no server round trip; in this implementation the filter
  becomes a query string and the dependent views refetch (usually from cache). Lesson 08
  states the correction explicitly.

## Open questions to ask later

- Does IT already have the app registration request, or is that still unsent? Changes
  whether lesson 3 can be hands-on.
- Is there an Azure subscription with Contributor rights available today? Early lessons
  assume not.
