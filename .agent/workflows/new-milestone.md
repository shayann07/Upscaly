---
description: Create a new milestone with phases
argument-hint: "<milestone-name>"
---

# /new-milestone Workflow

<objective>
Define a new milestone with goal, phases, and success criteria.
</objective>

<process>

## 1. Validate SPEC Exists

**PowerShell:**
```powershell
if (-not (Test-Path ".gsd/SPEC.md")) {
    Write-Error "SPEC.md required. Run /new-project first."
}
```

**Bash:**
```bash
if [ ! -f ".gsd/SPEC.md" ]; then
    echo "Error: SPEC.md required. Run /new-project first." >&2
fi
```

---

## 2. Gather Milestone Information

Ask for:
- **Name** — Milestone identifier (e.g., "v1.0", "MVP", "Beta")
- **Goal** — What does this milestone achieve?
- **Must-haves** — Non-negotiable deliverables
- **Nice-to-haves** — Optional if time permits

---

## 3. Generate Phase Breakdown

Based on goal and must-haves, suggest phases:

```markdown
## Suggested Phases

Phase 1: {Foundation/Setup}
Phase 2: {Core Feature A}
Phase 3: {Core Feature B}
Phase 4: {Integration/Polish}
Phase 5: {Verification/Launch}
```

Ask user to confirm or modify.

---

## 4. Update ROADMAP.md

```markdown
# ROADMAP.md

> **Current Milestone**: {name}
> **Goal**: {goal}

## Must-Haves
- [ ] {must-have 1}
- [ ] {must-have 2}

## Phases

### Phase 1: {name}
**Status**: ⬜ Not Started
**Objective**: {description}

### Phase 2: {name}
**Status**: ⬜ Not Started
**Objective**: {description}

...
```

---

## 5. Update STATE.md

```markdown
## Current Position
- **Milestone**: {name}
- **Phase**: Not started
- **Status**: Milestone planned
```

---

## 5b. Reset Session Files (if starting fresh)

If DECISIONS.md or JOURNAL.md contain entries from a previous milestone, reset them to prevent monolithic growth:

**PowerShell:**
```powershell
# Only reset if files are non-empty and no archive exists yet
if ((Test-Path ".gsd/DECISIONS.md") -and (Get-Content ".gsd/DECISIONS.md" | Measure-Object -Line).Lines -gt 5) {
    Set-Content ".gsd/DECISIONS.md" "# Decisions`n`n---`n"
}
if ((Test-Path ".gsd/JOURNAL.md") -and (Get-Content ".gsd/JOURNAL.md" | Measure-Object -Line).Lines -gt 5) {
    Set-Content ".gsd/JOURNAL.md" "# Journal`n`n---`n"
}
```

**Bash:**
```bash
if [ -f ".gsd/DECISIONS.md" ] && [ "$(wc -l < .gsd/DECISIONS.md)" -gt 5 ]; then
    printf '# Decisions\n\n---\n' > .gsd/DECISIONS.md
fi
if [ -f ".gsd/JOURNAL.md" ] && [ "$(wc -l < .gsd/JOURNAL.md)" -gt 5 ]; then
    printf '# Journal\n\n---\n' > .gsd/JOURNAL.md
fi
```

> **Note:** Only resets if files have grown beyond a header. If running `/complete-milestone` first, files are already archived and reset.

---

## 6. Commit

```bash
git add .gsd/ROADMAP.md .gsd/STATE.md
git commit -m "docs: create milestone {name}"
```

---

## 7. Offer Next Steps

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MILESTONE CREATED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Milestone: {name}
Phases: {N}

───────────────────────────────────────────────────────

▶ NEXT

/plan 1 — Create Phase 1 execution plans

───────────────────────────────────────────────────────
```

</process>
