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
  })
  .passthrough()

export const columnSchema = z
  .object({
    nodes: z.array(nodeSchema),
  })
  .passthrough()

export const sectionSchema = z
  .object({
    title: z.string(),
    columns: z.array(columnSchema),
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
    schemaVersion: z.literal(1).optional(),
    diagramType: diagramTypeSchema.optional(),
    interventionLinks: z.array(interventionLinkSchema).optional(),
  })
  .passthrough()
  .superRefine((doc, ctx) => {
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

/**
 * The keys this tool adds on top of the theoryofchangebuilder.com format, per level. The one
 * list the compatible export strips from, kept next to the schema so a new extension field
 * cannot be added above without being named here.
 */
export const DOCUMENT_EXTENSION_KEYS = ['schemaVersion', 'diagramType', 'interventionLinks']
export const NODE_EXTENSION_KEYS = ['provenance', 'kind', 'groupId']
export const CONNECTION_EXTENSION_KEYS = ['id', 'provenance', 'isFeedbackLoop', 'evidenceBlocks']

export type EvidenceLink = z.infer<typeof evidenceLinkSchema>
export type EvidenceBlock = z.infer<typeof evidenceBlockSchema>
export type Connection = z.infer<typeof connectionSchema>
export type DocumentNode = z.infer<typeof nodeSchema>
export type Column = z.infer<typeof columnSchema>
export type Section = z.infer<typeof sectionSchema>
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
