# Phase A/B Decisions Log — Auto-Selected, Pending Your Review

Per your instruction (2026-07-10): rather than stopping to ask for every judgment call during Final Touching Phase A/Phase B, I'm defaulting to the recommended option each time and logging it here. Review at your convenience — anything you want reversed, tell me and I'll change it.

Format: **Question** → Recommended option taken → why.

---

## Git housekeeping (pre-existing pending work, "commit all")

1. **Q:** `scripts/temp_failed_images/` (138MB, self-evidently scratch debris from the July 3rd image migration) and `Sites/Trump/scripts/load-tests/powershell.exe` (a stray 0-byte file) were sitting untracked alongside everything else "commit all" was meant to cover.
   **Taken:** Left both OUT of git (not committed, not deleted — still sitting on disk untouched). Rationale: 138MB of temp images would bloat the repo against its own established "no large binaries" policy (the same reason `Video/*.mp4` is gitignored); a 0-byte `powershell.exe` is plainly an accidental artifact, not real work product. Neither is destructive to leave in place — they're just excluded from this commit.

2. **Q:** `Sites/Trump/client/tsconfig.tsbuildinfo` (a TypeScript incremental-build cache file, auto-regenerated, zero source value) was also untracked.
   **Taken:** Left out of the commit (matches the deploy script's own long-standing exclusion of this exact file).

---

*(Further entries append below as Phase A/B proceeds.)*
