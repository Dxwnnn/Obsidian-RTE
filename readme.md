# Obsidian-RTE

A plugin for Obsidian that enables real-time collaborative editing across multiple devices and networks — similar to Google Docs, but built on top of your existing Obsidian vault.

---

## How It Works

ObsidianCollab uses two external services to handle different parts of the collaboration pipeline:

- **Supabase** is used exclusively for real-time sync between connected clients. It acts as a temporary buffer for live Yjs deltas while a document is actively being edited. Nothing is stored in Supabase permanently.
- **GitHub** is used for long-term persistence. The vault is a Git repository, and snapshots are committed and pushed automatically. This is the source of truth when loading a note.

---

## Architecture Overview

### Real-time editing (Supabase)
- When a user types, Yjs generates a small binary delta representing the change.
- That delta is broadcast to all other connected clients via Supabase Realtime Broadcast. It never touches the database.
- A temporary copy of the delta is held in Supabase DB as a short-term buffer, in case a client needs to catch up.
- Deltas older than 5 minutes are automatically deleted via a Supabase cron job.
- When the last connected user closes the document, all remaining deltas for that note are deleted from Supabase.

### Snapshots (GitHub via Git)
- The vault folder is a Git repository.
- A snapshot (git commit + push) is triggered every 60 seconds while a document is open, on every manual save (Ctrl+S), and when the last user disconnects.
- Snapshots are never stored in Supabase. Supabase only holds live deltas.
- On load, the plugin runs a git pull to ensure the local vault is up to date, then loads the note from the local file system.

### Offline catch-up
- If a user was offline while changes were made, they simply open Obsidian and the plugin runs git pull automatically.
- The latest committed snapshot from GitHub is pulled down and the note loads with all changes intact.
- No data is lost as long as the last active user's final snapshot was pushed before closing.

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Real-time sync | Supabase Realtime Broadcast | Live delta relay between connected clients |
| Short-term buffer | Supabase DB (Postgres) | Temporary delta storage, auto-purged |
| Long-term persistence | GitHub via Git | Permanent snapshot history, source of truth |
| Conflict-free merging | Yjs (CRDT) | Merges simultaneous edits without conflicts |
| Editor binding | y-codemirror.next | Connects Yjs to Obsidian's CodeMirror 6 editor |
| Snapshot compression | Git core.compression 9 | Reduces repo size, keeps files human-readable |

---

## Supabase DB Schema

```sql
-- Temporary delta buffer (auto-purged after 5 minutes)
create table deltas (
  id uuid primary key default gen_random_uuid(),
  note_path text not null,
  vault_id text not null,
  delta bytea not null,
  created_at timestamptz default now()
);

-- Auto-delete deltas older than 5 minutes
select cron.schedule('purge-old-deltas', '* * * * *', $$
  delete from deltas
  where created_at < now() - interval '5 minutes';
$$);

-- GitHub metadata per note (needed to push updates correctly)
create table note_meta (
  note_path text not null,
  vault_id text not null,
  github_sha text,
  last_synced_at timestamptz,
  primary key (vault_id, note_path)
);
```

---

## GitHub Repo Structure

```
vault-repo/
  daily/
    2026-05-24.md
  projects/
    my-project.md
  zettelkasten/
    idea-001.md
```

Each note maps directly to a `.md` file in the repo. Git handles versioning, diffs, and history automatically.

---

## Build Order

1. **Scaffold the plugin** — set up the TypeScript project using the official Obsidian sample plugin template
2. **Set up Supabase** — create the `deltas` and `note_meta` tables, configure the cron job, grab API keys
3. **Set up GitHub** — initialise the vault folder as a Git repository, connect to a remote
4. **Wire up Yjs + CodeMirror 6** — integrate `y-codemirror.next` for conflict-free editor binding
5. **Connect Yjs to Supabase** — broadcast deltas to other clients via Supabase Realtime
6. **Add Git snapshot logic** — shell out to Git via Node.js `child_process` to commit and push on save, timer, and disconnect
7. **Add load logic** — run `git pull` on vault open, load note from local file system
8. **Polish** — add presence indicators, a settings page for API keys, and error handling

---

## Requirements

### Your machine
- Node.js v16+
- npm
- Git (installed and available in PATH)
- Obsidian desktop app (Windows or macOS)

### Accounts & services
- Supabase account — for real-time sync
- GitHub account + repository — for snapshot storage

---

## Cross-platform Support

The plugin is fully compatible with both **Windows** and **macOS** (and Linux). Obsidian exposes Node.js APIs to plugins, and Git is available on all platforms. No OS-specific code is required.

---

## Key Design Principles

- **Supabase stays near-empty** — it only ever holds a few minutes worth of deltas per open document
- **GitHub is the source of truth** — all permanent data lives there, for free, with full version history
- **No custom server needed** — everything runs through Supabase and GitHub; nothing to self-host
- **Local-first** — the vault remains a normal folder of `.md` files; the plugin layers collaboration on top without changing the core Obsidian experience
