// Checks a theory map: content.json (everything but positions) and layout.json (positions).
// No dependencies, so the theory repo's check runs it with plain `node`:
//   node validate-map.mjs [path/to/content.json] [path/to/layout.json]
// (defaults: map/content.json and map/layout.json in the working directory).
//
// This is the master copy. The editor's tests (src/files/validateMap.test.ts) run it against
// every fixture and a set of broken maps and require it to agree with the editor's own schema.
// The theory repo keeps an identical copy at scripts/validate-map.mjs, so contributors can run
// it without the editor; its workflow fails when that copy differs from this one.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const HEX = /^#[0-9a-fA-F]{6}$/
const WEB_URL = /^https?:\/\/\S+$/i
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v) => typeof v === 'string'

/** Every card with a readable location, walking whatever shape is there. */
function collectNodes(content) {
  const nodes = []
  for (const [si, section] of (Array.isArray(content.sections) ? content.sections : []).entries()) {
    for (const [ci, column] of (section?.columns ?? []).entries()) {
      for (const [ni, node] of (column?.nodes ?? []).entries()) {
        nodes.push({ node, where: `section ${si + 1}, column ${ci + 1}, card ${ni + 1}` })
      }
    }
  }
  return nodes
}

function checkDocument(content, fail) {
  if (!isString(content.title)) fail('content.json: "title" must be text')
  if (!HEX.test(content.color ?? ''))
    fail('content.json: "color" must be a hex colour like #2F2D2E')
  if (!Array.isArray(content.sections)) fail('content.json: "sections" must be a list')
  if (content.version !== undefined && content.version !== 2) {
    fail('content.json: "version" must be 2 (this check knows formats 1 and 2)')
  }
  if (content.schemaVersion !== undefined && content.schemaVersion !== 1) {
    fail('content.json: "schemaVersion" must be 1')
  }
}

// Version 2 matrix: rows are declared once, a section names one in `row`, row sections come
// before the shared spine, and a card's layer is its section's row.
function checkRows(content, nodes, fail) {
  const v2 = content.version === 2
  const declared = new Set()
  if (content.rows !== undefined) {
    if (!Array.isArray(content.rows)) fail('content.json: "rows" must be a list')
    for (const [ri, row] of (Array.isArray(content.rows) ? content.rows : []).entries()) {
      if (!isObject(row) || !isString(row.id) || row.id === '') fail(`row ${ri + 1}: needs an "id"`)
      else if (declared.has(row.id)) fail(`row "${row.id}" is declared twice`)
      else declared.add(row.id)
      if (isObject(row) && !isString(row.title)) fail(`row ${ri + 1}: "title" must be text`)
    }
  }
  let spineSeen = false
  for (const [si, section] of (Array.isArray(content.sections) ? content.sections : []).entries()) {
    if (section?.row === undefined) spineSeen = true
    else if (!declared.has(section.row))
      fail(`section ${si + 1}: row "${section.row}" is not declared`)
    else if (spineSeen)
      fail(`section ${si + 1}: a row section must come before the shared sections`)
  }
  for (const { node, where } of nodes) {
    if (v2 && isObject(node) && 'layer' in node) {
      fail(`${where}: a card's layer is its section's row in version 2`)
    }
  }
}

function checkCards(nodes, fail) {
  const ids = new Set()
  for (const { node, where } of nodes) {
    if (!isObject(node)) {
      fail(`${where}: is not a card`)
      continue
    }
    const name = `card "${node.id ?? where}"`
    if (!isString(node.id) || node.id === '') fail(`${where}: card has no id`)
    else if (ids.has(node.id)) fail(`${name}: id is used twice`)
    else ids.add(node.id)
    if (!isString(node.title)) fail(`${name}: "title" must be text`)
    if (!isString(node.text)) fail(`${name}: "text" must be text`)
    if (!HEX.test(node.color ?? '')) fail(`${name}: "color" must be a hex colour like #E3F2FD`)
    if ('width' in node || 'yPosition' in node) {
      fail(`${name}: positions belong in layout.json, not content.json`)
    }
    if (!Array.isArray(node.connections)) fail(`${name}: "connections" must be a list`)
  }
  return ids
}

function checkLinks(nodes, ids, fail) {
  for (const { node } of nodes) {
    if (!isObject(node)) continue
    const name = `card "${node.id}"`
    for (const connection of Array.isArray(node.connections) ? node.connections : []) {
      if (!ids.has(connection?.targetId)) {
        fail(`${name}: a link points at "${connection?.targetId}", which is not a card`)
      }
      const confidence = connection?.confidence
      if (typeof confidence === 'number' && (confidence < 0 || confidence > 100)) {
        fail(`${name}: confidence must be between 0 and 100`)
      }
    }
    if (node.groupId !== undefined && !ids.has(node.groupId)) {
      fail(`${name}: groupId "${node.groupId}" is not a card`)
    }
  }
}

// Every web address anywhere in the content must start with http:// or https://.
function checkUrls(value, path, fail) {
  if (Array.isArray(value)) value.forEach((v, i) => checkUrls(v, `${path}[${i}]`, fail))
  else if (isObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'url') {
        if (!isString(v) || !WEB_URL.test(v)) {
          fail(`${path}: web address "${v}" must start with http:// or https://`)
        }
      } else checkUrls(v, `${path}.${key}`, fail)
    }
  }
}

// layout.json: one position per card, nothing extra, numbers only, ids sorted.
function checkLayout(layout, ids, fail) {
  if (!isObject(layout.cards)) {
    fail('layout.json: "cards" must be an object keyed by card id')
    return
  }
  for (const id of ids) {
    const place = layout.cards[id]
    if (!place) fail(`layout.json: no position for card "${id}"`)
    else if (!Number.isFinite(place.width) || !Number.isFinite(place.yPosition)) {
      fail(`layout.json: card "${id}" needs numeric "width" and "yPosition"`)
    }
  }
  for (const id of Object.keys(layout.cards)) {
    if (!ids.has(id)) fail(`layout.json: position for "${id}", which is not a card in content.json`)
  }
  const keys = Object.keys(layout.cards)
  if (keys.join('\n') !== [...keys].sort().join('\n')) {
    fail('layout.json: card ids must be in alphabetical order')
  }
}

/** Every problem with the pair, in plain words; an empty list means the map is valid. */
export function validateMap(content, layout) {
  const errors = []
  const fail = (message) => errors.push(message)
  if (!isObject(content)) return ['content.json: must be a JSON object']
  if (!isObject(layout)) return ['layout.json: must be a JSON object']
  checkDocument(content, fail)
  const nodes = collectNodes(content)
  checkRows(content, nodes, fail)
  const ids = checkCards(nodes, fail)
  checkLinks(nodes, ids, fail)
  checkUrls(content.sections ?? [], 'content', fail)
  checkLayout(layout, ids, fail)
  return errors
}

function load(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    errors.push(`${path}: cannot be read as JSON (${error.message})`)
    return null
  }
}

function main([contentPath = 'map/content.json', layoutPath = 'map/layout.json']) {
  const errors = []
  const content = load(contentPath, errors)
  const layout = load(layoutPath, errors)
  if (content && layout) errors.push(...validateMap(content, layout))
  if (errors.length > 0) {
    console.error(
      `Map check failed with ${errors.length} problem${errors.length === 1 ? '' : 's'}:`,
    )
    for (const e of errors) console.error(` - ${e}`)
    process.exit(1)
  }
  const cards = collectNodes(content).length
  const format = content.version === 2 ? 'format 2' : 'format 1'
  console.log(
    `Map check passed (${format}): ${cards} cards, positions complete, all web addresses are http(s).`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
