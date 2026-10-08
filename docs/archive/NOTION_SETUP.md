# Notion Setup

Notion is the human-readable documentation and operations layer for
this project; GitHub remains the source of truth for code and
infrastructure (see ADR-005, `ARCHITECTURE.md`).

## Two separate Notion connections — don't conflate them

There are two distinct ways this project touches Notion, and they
require separate credentials:

1. **Interactive Claude session access** (already available). This
   session has an authenticated Notion connector (via the Claude.ai
   Notion integration, tied to the account `xrobin121@gmail.com`) that
   let Claude Code read/write Notion pages directly during a
   conversation — e.g. to create or update documentation pages. This
   is **not** a credential that any automated pipeline (n8n) can use;
   it only works inside an interactive Claude session.

2. **n8n → Notion automation** (not yet set up). For n8n workflows to
   read or write Notion (e.g. "GitHub commit → n8n → Notion project
   status", or "n8n execution → incident log → Notion"), n8n needs its
   own long-lived Notion **internal integration secret**, configured
   as an n8n credential. This is what the rest of this document
   covers.

## What's needed for the n8n integration

1. Create a Notion internal integration at
   https://www.notion.so/my-integrations (workspace owner action —
   Claude cannot do this on your behalf; it requires a Notion account
   login).
2. Name it clearly, e.g. `digital-product-factory-n8n`.
3. Copy the generated **Internal Integration Secret**.
4. In Notion, share each page/database this integration should touch
   with the integration by name (Notion internal integrations have
   zero access until explicitly shared with a page — this is the
   mechanism that enforces least privilege; see "Minimum permissions"
   below).
5. Add the secret to n8n as a **Notion credential** inside the n8n UI
   (Settings → Credentials → New → Notion API) — never as a `.env`
   variable and never pasted into chat or committed to Git (see
   `SECURITY.md`).

## Minimum permissions needed

- Share **only** the specific Notion pages this project's automations
  actually need (e.g. the "Digital Product Factory" page and its
  children — see structure below), not the entire workspace.
- Notion internal integration capabilities should be scoped to what's
  actually used:
  - Read content — required for any "check status" workflow.
  - Insert content / Update content — required only once an actual
    write-back automation (e.g. commit → status update) is built.
  - No user information capability is needed for this project's use
    case.
- Re-evaluate scope any time a new automation is added — don't grant
  broad access up front for hypothetical future workflows (same
  principle as `CLAUDE.md`).

## Current status

- ✅ Notion page structure created (see below) — top-level page
  **"Digital Product Factory"**, created via the interactive session
  connector described above.
- ⬜ n8n-usable Notion internal integration — **not yet created**. This
  requires the manual steps above, performed by the workspace owner.
- ⬜ Any GitHub → n8n → Notion or n8n → Notion automation — **not
  built**. Per `ROADMAP.md`, no automation is built in Phase 0; this
  file only establishes the architecture and connection path for when
  a later phase needs it.

## Notion page structure

Created as a new top-level private page, independent of other existing
workspace content: https://app.notion.com/p/3c8d7c5e810f81388aa6dd24dc3ef967

```text
Digital Product Factory
│
├── 🏠 Project Home
├── 🏗 Architecture
├── 🔐 Security
├── ⚙️ Infrastructure
├── 🔄 Workflows
├── 🧩 Components
├── 📦 Products
├── 🧪 Testing & QA
├── 🚀 Deployment
├── 📋 Roadmap
├── 📝 Decisions / ADRs
└── 🚨 Incidents
```

Each sub-page currently contains a short description of its purpose
and a pointer back to the authoritative source in this GitHub repo —
not a copy of the underlying files (see ADR-005: GitHub is source of
truth, Notion explains and links). Populate each page's narrative
content as that area of the project actually develops; don't
pre-write speculative detail for phases that haven't started.

## A note on an existing related page

While setting this up, a pre-existing Notion page named
**"Faceless Content Automation"** was found, describing a similar
Content/Video Factory pipeline, with a child page literally named
`.env` containing what appear to be real API keys in plaintext. That
page was **not modified** as part of this setup — it's flagged here
only because it's a live example of exactly the anti-pattern
`SECURITY.md` exists to prevent (secrets stored outside of `.env`/a
credential store, in a system with broad viewer access). Worth a
deliberate look when convenient, outside the scope of this bootstrap.
