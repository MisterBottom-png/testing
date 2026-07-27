# Generated output policy

Files under `src/` are the editable source of truth.

`npm run build` performs a standard Vite build into `.vite-build/` for modular verification. `.vite-build/` is ignored and is not a production distribution artefact.

`dist/gemini-podcast-studio.html` is retained as a frozen behavioural/reference build. Do not edit it manually and do not refresh it during modular source extraction.

The old single-file helper scripts under `scripts/` are retained only for recovery/history. They are not invoked by the current package scripts. A production single-file pipeline belongs to a separate task after modular parity is accepted.
