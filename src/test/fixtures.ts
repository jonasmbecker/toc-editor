import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CONNECTION_EXTENSION_KEYS,
  DOCUMENT_EXTENSION_KEYS,
  NODE_EXTENSION_KEYS,
  SECTION_EXTENSION_KEYS,
  type Connection,
  type DocumentNode,
  type ToCDocument,
} from '../model/schema'
import { allNodes } from '../state/tree'

/** Every extension key present in the document, level by level (a node's required `id` is
 * not the connection-level `id` extension), as "level.key" strings for a readable failure. */
export function extensionKeysIn(doc: ToCDocument): string[] {
  const present = (level: string, value: object, keys: string[]) =>
    keys.filter((key) => key in value).map((key) => `${level}.${key}`)
  const nodes = allNodes(doc)
  const connections = nodes.flatMap((node) => node.connections)
  return [
    ...present('document', doc, DOCUMENT_EXTENSION_KEYS),
    ...doc.sections.flatMap((section) => present('section', section, SECTION_EXTENSION_KEYS)),
    ...nodes.flatMap((node) => present('node', node, NODE_EXTENSION_KEYS)),
    ...connections.flatMap((c) => present('connection', c, CONNECTION_EXTENSION_KEYS)),
  ]
}

/** The real theoryofchangebuilder files under `fixtures/`, resolved from this file rather than
 * the working directory so the tests run from any cwd. */
const FIXTURES_DIR = resolve(__dirname, '../../fixtures')

export function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
}

export function readFixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8')
}

/** The f009 COM-B draft, the first version 1 file with `layer` on its cards: the input the
 * version 2 migration turns into a matrix. Kept out of the top folder, which mirrors tocs/. */
export const COM_B_DRAFT_FIXTURE = 'migration/com-b-draft-v1.json'

/** A minimal valid node for synthetic test documents. */
export function makeNode(
  id: string,
  connections: Connection[] = [],
  overrides: Partial<Pick<DocumentNode, 'title' | 'text' | 'color' | 'width' | 'yPosition'>> = {},
): DocumentNode {
  return {
    id,
    title: id,
    text: '',
    color: '#FFFFFF',
    width: 100,
    yPosition: 0,
    connections,
    ...overrides,
  }
}

/** A document with one column per section, each holding the given nodes. */
export function makeDocument(...sections: DocumentNode[][]): ToCDocument {
  return {
    color: '#000000',
    title: 'synthetic',
    sections: sections.map((nodes, i) => ({ title: `S${i + 1}`, columns: [{ nodes }] })),
  }
}
