# Final Cleanup Report

Generated: 2026-05-19

## Removed

- `waiter.js` - unused root duplicate replaced by `frontend/scripts/waiter-app.js`.
- `menu-data.json` - stale scaffold file with no active references.
- `server-local.log`, `server-local.err.log`, `server-3013.log`, `server-3013.err.log` - old generated logs.
- `temp_speech.mp3` - stale generated speech artifact.
- Root `__pycache__/` generated during Python validation.
- Temporary QA order files and empty QA table cart files created during validation.

## Preserved

- Local AI and voice modules.
- Runtime order/history/table data.
- Existing media assets.
- `food/TrumpMenu.json` compatibility snapshot.
- Existing legacy shell HTML files that redirect to the premium frontend.

## Cleanup Safety

Each removed file was checked for references before removal. Business data directories were not bulk-cleaned.
