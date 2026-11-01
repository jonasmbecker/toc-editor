import { z } from 'zod'
import { HEX_COLOR_PATTERN } from './color'

/**
 * Zod schema for the theoryofchangebuilder.com JSON format, plus this tool's optional
 * extensions. Every subschema is `.passthrough()` so a field ToCB (or a future version of
 * either tool) writes that we don't know about yet survives import and export untouched.
 *
 * Nothing here uses `.default()`: a field absent from the input must stay absent from the
 * output, or every document we touch would gain fields it never had and fail the round-trip
 * check in the verification plan. Optional means "may be missing", not "gets filled in".
 */

export const connectionProvenanceSchema = z.enum(['verbatim', 'verbatim-structure', 'interpreted'])
export const nodeProvenanceSchema = z.enum(['verbatim', 'interpreted'])
export const diagramTypeSchema = z.enum(['theory-of-change', 'status-quo'])

/** `kind` value of the node that titles a group of cards. It is an ordinary node in the column
 * (so connections, ids and undo need no special case); the canvas draws it as a container
 * around its members, and the compatible export removes it (see `state/groups.ts`). */
export const GROUP_KIND = 'group'

/** Constraining `color` to the shared hex pattern (see `model/color.ts`) means a later
 * import/share feature can't be handed a `url(...)` or similar as a colour value. Case is
 * deliberately *not* normalised here: a parsed document must round-trip unchanged. */
const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, 'must be a 6-digit hex colour, e.g. "#2F2D2E"')

/** Only web addresses: a `javascript:` or `data:` url in an imported file fails validation
 * rather than reaching an href. */
export const WEB_URL_PATTERN = /^https?:\/\/\S+$/i

export const evidenceLinkSchema = z
  .object({
    url: z
      .string()
      .regex(WEB_URL_PATTERN, 'must be a web address starting with http:// or https://'),
    label: z.string().optional(),
  })
  .passthrough()

/** One evidence paragraph with the mechanism blocks it supports (1-based paragraph numbers of
 * `assumptions`) and its links. See `model/evidence.ts`. */
export const evidenceBlockSchema = z
  .object({
    text: z.string(),
    supports: z.array(z.number().int().positive()).optional(),
    links: z.array(evidenceLinkSchema).optional(),
  })
  .passthrough()

export const connectionSchema = z
  .object({
    targetId: z.string(),
    confidence: z.number().min(0).max(100).optional(),
    assumptions: z.string().optional(),
    evidence: z.string().optional(),
    // Extensions (optional, so a plain ToCB connection stays valid):
    id: z.string().optional(),
    provenance: connectionProvenanceSchema.optional(),
    isFeedbackLoop: z.boolean().optional(),
    evidenceBlocks: z.array(evidenceBlockSchema).optional(),
  })
  .passthrough()

export const nodeSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
    color: hexColorSchema,
    // `.finite()`: an imported file with `Infinity` here would push every derived x to
    // Infinity and hand React Flow a NaN viewport.
    width: z.number().finite(),
    yPosition: z.number().finite(),
    connections: z.array(connectionSchema),
    // Read but never regenerated; purpose unclear, kept for round-trip fidelity.
    connectionIds: z.array(z.string()).optional(),
    // Extensions:
    provenance: nodeProvenanceSchema.optional(),
    kind: z.string().optional(),
    /** Marks this node as a member of a bracketed cluster (several boxes the original diagram
     * drew as one grouped unit, e.g. "multipolar traps / race-to-bottom / race-to-market / arms
     * race"). Its value is the id of the group node (a node whose `kind` is `GROUP_KIND`) in
     * the same column. Members are ordinary nodes with ordinary connections, and a connection
     * may target the group node itself to point at the whole cluster. See `state/groups.ts`. */
    groupId: z.string().optional(),
    /** Where to read more about this card's concept: reputable web pages, shown as chips in the
     * node panel. An extension: the compatible export folds them into the text. */
    links: z.array(evidenceLinkSchema).optional(),
  })
  .passthrough()

export const columnSchema = z
  .object({
    nodes: z.array(nodeSchema),
  })
  .passthrough()

/** The format version this editor reads and writes. Older files are migrated on import
 * (`model/migrate.ts`); a newer one is refused rather than half-read. */
export const MAP_FORMAT_VERSION = 2

/** One layer of a matrix map (version 2): declared once on the document, and a section names it
 * in `row`. A card's layer follows from its section, so the two can never disagree. */
export const rowSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    /** The plain question the row answers, shown in its header ("What people can do"). */
    question: z.string().optional(),
  })
  .passthrough()

export const sectionSchema = z
  .object({
    title: z.string(),
    columns: z.array(columnSchema),
    // Extensions (version 2):
    /** Id of the row this section sits in. Absent: the section is on the shared spine. */
    row: z.string().optional(),
    /** A short remark shown on the section header, e.g. a disputed placement. */
    note: z.string().optional(),
  })
  .passthrough()

/**
 * Reserved for the later intervention-linking feature. v1 never writes to this array; the
 * point is that the shape exists now so node/connection ids stay stable under it.
 */
export const interventionLinkSchema = z
  .object({
    interventionDiagramRef: z.string(),
    targetsNodeIds: z.array(z.string()),
    targetsConnectionIds: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .passthrough()

export const documentSchema = z
  .object({
    color: hexColorSchema,
    title: z.string(),
    sections: z.array(sectionSchema),
    textSize: z.number().finite().optional(),
    curvature: z.number().finite().optional(),
    columnPadding: z.number().finite().optional(),
    sectionPadding: z.number().finite().optional(),
    _metadata: z.record(z.string(), z.unknown()).optional(),
    // Extensions:
    /** Version 1 files carry `schemaVersion: 1` or nothing; import migrates them to `version`. */
    schemaVersion: z.literal(1).optional(),
    version: z.literal(MAP_FORMAT_VERSION).optional(),
    diagramType: diagramTypeSchema.optional(),
    interventionLinks: z.array(interventionLinkSchema).optional(),
    rows: z.array(rowSchema).optional(),
  })
  .passthrough()
  .superRefine((doc, ctx) => {
    checkRows(doc, ctx)
    // Two nodes sharing an id would silently collapse in the canvas's position lookup (the
    // second overwrites the first) and misattribute every edge pointing at either one. A
    // dangling connection targetId is left to buildFlow, which can report it per-connection
    // with the source node still in view; a duplicate id is a document-wide shape problem, so
    // it belongs here instead.
    const firstSeenAt = new Map<string, string>()
    doc.sections.forEach((section, si) => {
      section.columns.forEach((column, ci) => {
        column.nodes.forEach((node, ni) => {
          const path = `sections.${si}.columns.${ci}.nodes.${ni}.id`
          const firstPath = firstSeenAt.get(node.id)
          if (firstPath) {
            ctx.addIssue({
              code: 'custom',
              path: ['sections', si, 'columns', ci, 'nodes', ni, 'id'],
              message: `duplicate node id "${node.id}" (first used at ${firstPath})`,
            })
          } else {
            firstSeenAt.set(node.id, path)
          }
        })
      })
    })
  })

type RefineContext = Parameters<Parameters<z.ZodType['superRefine']>[0]>[1]

/** Version 2 matrix rules: row ids are unique, a section names only a declared row, every row
 * section comes before the shared spine, and no card carries its own `layer` (its section's row
 * says it). */
function checkRows(
  doc: {
    rows?: { id: string }[]
    sections: { row?: string; columns: { nodes: Record<string, unknown>[] }[] }[]
  },
  ctx: RefineContext,
): void {
  const declared = new Set<string>()
  doc.rows?.forEach((row, ri) => {
    if (declared.has(row.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows', ri, 'id'],
        message: `row "${row.id}" is declared twice`,
      })
    }
    declared.add(row.id)
  })
  let spineSeen = false
  doc.sections.forEach((section, si) => {
    if (section.row === undefined) {
      spineSeen = true
    } else if (!declared.has(section.row)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections', si, 'row'],
        message: `names row "${section.row}", which the document does not declare`,
      })
    } else if (spineSeen) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections', si, 'row'],
        message: 'a row section must come before the shared sections',
      })
    }
    section.columns.forEach((column, ci) =>
      column.nodes.forEach((node, ni) => {
        if ('layer' in node) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', si, 'columns', ci, 'nodes', ni, 'layer'],
            message: "a card's layer is its section's row in version 2",
          })
        }
      }),
    )
  })
}

/**
 * The keys this tool adds on top of the theoryofchangebuilder.com format, per level. The one
 * list the compatible export strips from, kept next to the schema so a new extension field
 * cannot be added above without being named here.
 */
export const DOCUMENT_EXTENSION_KEYS = [
  'schemaVersion',
  'version',
  'diagramType',
  'interventionLinks',
  'rows',
]
export const SECTION_EXTENSION_KEYS = ['row', 'note']
export const NODE_EXTENSION_KEYS = ['provenance', 'kind', 'groupId', 'links']
export const CONNECTION_EXTENSION_KEYS = ['id', 'provenance', 'isFeedbackLoop', 'evidenceBlocks']

export type EvidenceLink = z.infer<typeof evidenceLinkSchema>
export type EvidenceBlock = z.infer<typeof evidenceBlockSchema>
export type Connection = z.infer<typeof connectionSchema>
export type DocumentNode = z.infer<typeof nodeSchema>
export type Column = z.infer<typeof columnSchema>
export type Section = z.infer<typeof sectionSchema>
export type MapRow = z.infer<typeof rowSchema>
export type InterventionLink = z.infer<typeof interventionLinkSchema>
export type ToCDocument = z.infer<typeof documentSchema>
export type ConnectionProvenance = z.infer<typeof connectionProvenanceSchema>
export type NodeProvenance = z.infer<typeof nodeProvenanceSchema>
export type DiagramType = z.infer<typeof diagramTypeSchema>

/**
 * Parses and validates a document, returning plain-words errors keyed by path instead of
 * throwing, so an import screen can list every problem at once.
 *
 * The return type is intentionally left to inference (with `as const` on `ok`) rather than
 * annotated with a hand-written `{ok:true;...} | {ok:false;...}` alias: with TypeScript 5.9,
 * annotating this function's return type with such an alias (when one branch's payload has a
 * zod `.passthrough()` index signature, as `ToCDocument` does) breaks `if (!result.ok)`
 * narrowing at every call site. Letting inference do the work, and deriving the exported type
 * from it, sidesteps the bug while keeping the same call-site shape.
 */
export function parseDocument(input: unknown) {
  const result = documentSchema.safeParse(input)
  if (result.success) {
    return { ok: true as const, document: result.data }
  }
  const issues: ParseIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))
  const errors = issues.map(
    (issue) =>
      `${issue.path.length > 0 ? issue.path.join('.') : '(document root)'}: ${issue.message}`,
  )
  return { ok: false as const, errors, issues }
}

/** One validation problem: the path as segments (empty at the root) and zod's message. */
export interface ParseIssue {
  path: string[]
  message: string
}

export type ParseDocumentResult = ReturnType<typeof parseDocument>
