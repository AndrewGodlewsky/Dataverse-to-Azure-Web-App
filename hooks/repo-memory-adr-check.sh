#!/bin/sh
# repo-memory ADR nudge — runs from .githooks/post-commit.
#
# Prints ONE line when a commit looks architecturally significant and no ADR index
# moved with it. Never writes, never blocks, never fails a commit: post-commit runs
# after the commit exists, so a non-zero exit here would only produce noise. Every
# path returns 0.
#
# A commit touching architecture without an ADR is frequently correct — the decision
# may already be recorded, or may not qualify. This is a reminder, not a gate.

set -u

# Never let this hook take a repo down.
fail_open() { exit 0; }
trap fail_open EXIT

command -v git >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# --root so the repository's FIRST commit reports its paths instead of none.
CHANGED=$(git diff-tree --root --no-commit-id --name-only -r HEAD 2>/dev/null) || exit 0
[ -n "$CHANGED" ] || exit 0

# An accepted ADR moves three files together: the monthly record, that year's
# INDEX.md, and DECISIONS.md. Suppress the reminder only when all three moved —
# a commit that writes the record but forgets an index is exactly the case worth
# nudging, and treating any plans/architecture/ path as "done" hid it.
adr_rec=$(printf '%s\n' "$CHANGED" | grep -cE '^plans/architecture/[0-9]{4}/[0-9]{4}-[0-9]{2}\.md$')
adr_yr=$(printf '%s\n' "$CHANGED" | grep -cE '^plans/architecture/[0-9]{4}/INDEX\.md$')
adr_mst=$(printf '%s\n' "$CHANGED" | grep -cE '^plans/architecture/DECISIONS\.md$')

if [ "$adr_rec" -gt 0 ] && [ "$adr_yr" -gt 0 ] && [ "$adr_mst" -gt 0 ]; then
  exit 0  # complete ADR update — nothing to say
fi

# Partial ADR update: record or index touched, but not the full set. Say so
# specifically rather than falling through to the generic reminder.
if [ "$adr_rec" -gt 0 ] || [ "$adr_yr" -gt 0 ] || [ "$adr_mst" -gt 0 ]; then
  printf 'repo-memory: partial ADR update (record:%s year-index:%s DECISIONS:%s) — all three move together, or the index lies. /repo-memory\n' \
    "$adr_rec" "$adr_yr" "$adr_mst" >&2
  exit 0
fi

# Signals that a change may be architecturally significant, tuned to THIS repo:
# wayfinder decisions land on the map/tickets; container and CI files appear once
# the build starts. Deliberately narrow: a noisy nudge is one people learn to
# ignore, which is worse than none.
SIGNIFICANT=$(printf '%s\n' "$CHANGED" | grep -E \
  -e '^wayfinder/map\.md$' \
  -e '^wayfinder/tickets/' \
  -e '(^|/)(Dockerfile|docker-compose\.ya?ml)$' \
  -e '^\.github/workflows/' \
  || true)

[ -n "$SIGNIFICANT" ] || exit 0

COUNT=$(printf '%s\n' "$SIGNIFICANT" | grep -c . 2>/dev/null || echo 0)
FIRST=$(printf '%s\n' "$SIGNIFICANT" | head -1)

# ONE line, as promised above. Three lines on every architecture-adjacent commit
# is the noisy nudge people learn to ignore, which is worse than none.
printf 'repo-memory: %s architecture-adjacent file(s) changed (e.g. %s) with no ADR — record it with /repo-memory, or ignore if reversible or already recorded.\n' \
  "$COUNT" "$FIRST" >&2

exit 0
