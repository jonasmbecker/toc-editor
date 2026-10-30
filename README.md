# toc-editor

A small, shareable editor for theory-of-change diagrams and status-quo causal maps. It reads
and writes the [theoryofchangebuilder.com](https://www.theoryofchangebuilder.com/) JSON format,
adds feedback loops, a status-quo diagram type and view-only sharing links, and ships with the
digitised metacrisis status-quo map as a template.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jonasmbecker/toc-editor)

The button clones this repository into your own GitHub account and creates a Netlify site
from it. Everything the site needs is in `netlify.toml`: build command, functions, SPA
redirect and security headers. There are no environment variables to set. Sharing uses
[Netlify Blobs](https://docs.netlify.com/blobs/overview/), which is on for every site.

## What it does

- **Home screen**: open the metacrisis status-quo map, a blank theory of change, a blank
  status-quo map, or drop a theoryofchangebuilder JSON file.
- **Canvas**: sections as column groups, cards stacked by their stored `yPosition`, arrows
  styled by confidence (solid, dashed, dotted), both-ways arrows for feedback loops.
- **Editing**: node panel (title, text, colour, move between columns), connection details
  (confidence, direction, mechanism and evidence blocks), undo and redo, a local draft that
  survives a reload.
- **Export**: full JSON (everything kept) or a compatible file for theoryofchangebuilder.com.
- **Sharing**: Share stores the diagram and gives you an edit link (`/d/…`) and a view-only
  link (`/v/…`). A viewer can make their own editable copy. Edits save as you type, with a
  conflict notice if two tabs save the same version.

The bundled template is never a shared record: opening it from the home screen loads a fresh
copy, and sharing it creates a new record with its own links. Nobody can edit the canonical map
through a shared link.

## Local development

```bash
npm install
npm run dev            # the editor alone, on http://localhost:5173 (no sharing API)
npx netlify-cli serve --offline   # production build plus the sharing function, on http://localhost:8888
```

`netlify serve` builds the app, then runs it with the function in `netlify/functions/` against a
local blob store, so Share works offline. `--offline` skips the Netlify login. The Netlify CLI
is fetched on demand by `npx`; it is not a dependency of the project.

Use `netlify serve`, not `netlify dev`: `netlify dev` applies the production
Content-Security-Policy from `netlify.toml` to the Vite dev server, whose inline React
refresh preamble that policy blocks, so the page stays blank. `serve` runs the production
bundle, which has no inline scripts, and so also tests the real headers locally.

## Scripts

- `npm run dev`: Vite dev server
- `npm run build`: type-check (app and functions) and build for production
- `npm run test`: the vitest suite once; `npm run test:watch` to keep it running
- `npm run lint`: eslint; `npm run format`: prettier, writing in place

## Deploying your own

1. Press the Deploy to Netlify button above, or import the repository in Netlify
   (Add new site, Import an existing project, pick the GitHub repository).
2. Netlify reads `netlify.toml`. No settings to change, no environment variables.
3. Every push to the default branch redeploys. To redeploy without a change, press
   Trigger deploy in the Netlify site's Deploys tab.

Check the headers after the first deploy:

```bash
curl -sI https://<your-site>.netlify.app/ | grep -iE "content-security-policy|x-frame-options|referrer-policy|permissions-policy"
```

## Data model

The document format is a strict superset of theoryofchangebuilder.com's own JSON. Every field it
writes (`color`, `title`, `sections[].columns[].nodes[]` with `connections[]`, `textSize`,
`curvature`, `columnPadding`, `sectionPadding`) is read and written unchanged, and unknown keys
survive a round trip untouched. The extensions, all optional, are:

| Level      | Field               | Meaning                                                        |
| ---------- | ------------------- | -------------------------------------------------------------- |
| document   | `schemaVersion`     | `1`                                                            |
| document   | `diagramType`       | `"theory-of-change"` or `"status-quo"`; changes labels only    |
| document   | `interventionLinks` | reserved: links from an intervention diagram into this one     |
| node       | `provenance`        | `"verbatim"` or `"interpreted"` (read off a photo, or guessed) |
| node       | `kind`              | free-text node kind                                            |
| node       | `groupId`           | members of a bracketed cluster share one id                    |
| connection | `id`                | stable id, so a connection can be addressed                    |
| connection | `provenance`        | `"verbatim"`, `"verbatim-structure"` or `"interpreted"`        |
| connection | `isFeedbackLoop`    | the arrow runs both ways                                       |

**Export for theoryofchangebuilder** removes every extension field and expands each both-ways
connection into two ordinary connections, one in each direction, so the file opens there. On
import, such a mutual pair is collapsed back into one both-ways connection. The lists live in
`src/model/schema.ts` (`DOCUMENT_EXTENSION_KEYS`, `NODE_EXTENSION_KEYS`,
`CONNECTION_EXTENSION_KEYS`).

`fixtures/` holds six real files, five from theoryofchangebuilder.com and the metacrisis
status-quo map. The test suite imports each, exports it and checks the result equals the input.

## theoryofchangebuilder.com compatibility

- **Automated, every test run**: the five theoryofchangebuilder fixtures round-trip through
  import and compatible export deep-equal to the original (apart from `_metadata.exportedAt`).
- **Manual upload to the live site**: not yet done. The embedded browser used during the build
  could not reach the external site. Record the date here after the first successful upload of
  `theory-of-metacrisis-status-quo_v1` (compatible export) and `ToC_NARM-sexualurgency-ED_v1`.

| Check                                     | Date       | Result      |
| ----------------------------------------- | ---------- | ----------- |
| Round-trip of the five fixtures (vitest)  | 2026-10-30 | passes      |
| Upload of a compatible export to the site | pending    | not yet run |

## Sharing and safety

There is no login. A link is the only key: 128-bit random tokens made server-side, stored as
SHA-256 hashes (the view token is also kept in clear, so the edit link can show it again). A
view token can never return an edit token. User text is rendered as text, never HTML. Bodies
are capped at 1 MB and creates are rate-limited per address. The headers in `netlify.toml`
block inline scripts, framing and referrer leaks.
