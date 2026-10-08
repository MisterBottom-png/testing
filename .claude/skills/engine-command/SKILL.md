---
name: engine-command
description: "Add or port a user-visible action as an A-Studio engine command (id, label, menu path, shortcut, params, enabled, run, tests). Use for any new tool, menu item, dialog action, or MCP-callable operation."
---

Every user-visible behaviour is a command in `astudio-engine`; the UI, CLI, control channel and MCP call it by id.

1. Before P3 the engine is not merged: follow the upstream pattern of the side the feature comes from.
   - PhotoCraft: `crates/engine/src/*_cmds.rs`, registered in `commands.rs`; ids from `crates/ui-egui/src/menu_catalog.rs`.
   - VectorCraft: `crates/engine/src/cmd/*`, registered as a `CommandSpec`.
   Use `upstream-scout` to find the closest existing command and copy its shape.
2. Choose the id: lower-case dotted, area first (`layer.newVector`, `filter.blur.gaussian`). After P3, prefix
   `pixel.` or `vector.` only when both sides already use the same id.
3. Fill every field: id, label, menu path, shortcut (per mode, see `docs/11-ui-spec.md`), params doc,
   `enabled`, `run`.
4. `run` returns `Err` for any bad params or document state; it never panics. Validate params first.
5. Tests: one for the happy path, one for each kind of bad param, one undo/redo test. Add the command to the
   command-sweep fuzz list.
6. The UI only calls `app.run(id, params)`; no logic in panels.
