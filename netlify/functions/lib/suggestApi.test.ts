// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeMapFile } from '../../../src/files/split'
import { migrateDocument } from '../../../src/model/migrate'
import { GithubError } from './githubApp'
import { handleSuggest, type SuggestDeps } from './suggestApi'
import {
  BASE_SHA,
  TRAUMA,
  addLink,
  baseFiles,
  card,
  fakeRepo,
  freshDeps,
  send,
  suggestion,
} from './suggestTestKit'
import type { PullRequestSpec, TheoryRepo } from './theoryRepo'

let repo: TheoryRepo
let opened: PullRequestSpec[]
let deps: SuggestDeps

const post = (body: unknown, headers?: Record<string, string>) => send(deps, body, headers)

beforeEach(() => {
  ;({ repo, opened } = fakeRepo())
  deps = freshDeps(repo)
})

afterEach(() => vi.restoreAllMocks())
describe('a valid suggestion', () => {
  it('opens a pull request and answers with its address and the preview', async () => {
    const response = await post(suggestion(addLink))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      url: 'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12',
      number: 12,
      previewUrl: 'https://toceditor.netlify.app/?suggestion=12',
    })
    expect(opened).toHaveLength(1)
  })

  it('titles the pull request with the change and cuts the branch from the base commit', async () => {
    await post(suggestion(addLink))
    const [spec] = opened
    expect(spec.title).toBe(`Added link: "Intergenerational war trauma" → "Collective 'freeze'"`)
    expect(spec.slug).toBe('added-link-intergenerational-war-trauma')
    expect(spec.baseSha).toBe(BASE_SHA)
    expect(spec.commitMessage).toBe(`${spec.title}\n\nSuggested through the map editor by Ana.`)
  })

  it("commits content.json only when only the theory changed, in the repo's own format", async () => {
    const request = suggestion(addLink)
    await post(request)
    const [spec] = opened
    expect(spec.files.map((file) => file.path)).toEqual(['map/content.json'])
    // Written in the current format: a version 1 map on main is upgraded by its first suggestion.
    const migrated = migrateDocument(request.content)
    if (!migrated.ok) throw new Error(migrated.errors.join('; '))
    expect(spec.files[0].text).toBe(serializeMapFile(migrated.value))
    expect(spec.files[0].text).toContain('"version": 2')
    expect(spec.files[0].text).not.toBe(serializeMapFile(baseFiles.content))
  })

  it('does not list the format upgrade as a change when main still holds a version 1 map', async () => {
    // The editor migrates on load, so what it sends is version 2 while main is still version 1.
    const request = suggestion(addLink)
    const migrated = migrateDocument(request.content)
    if (!migrated.ok) throw new Error(migrated.errors.join('; '))
    expect(await post({ ...request, content: migrated.value })).toHaveProperty('status', 201)
    const [spec] = opened
    expect(spec.body(12)).not.toMatch(/schemaVersion|version/)
    expect(spec.title).not.toMatch(/version/i)
  })

  it('commits layout.json only when only positions changed', async () => {
    await post(suggestion((doc) => (card(doc, TRAUMA).yPosition += 50)))
    expect(opened[0].files.map((file) => file.path)).toEqual(['map/layout.json'])
    expect(opened[0].title).toBe('Moved 1 card on the map')
  })

  it('commits both files when a card is removed, so no position is left behind', async () => {
    await post(
      suggestion((doc) => {
        const column = doc.sections[0].columns[0]
        column.nodes = column.nodes.filter((node) => node.id !== 'need-brown-attunement')
        for (const other of doc.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))) {
          other.connections = other.connections.filter(
            (c) => c.targetId !== 'need-brown-attunement',
          )
        }
      }),
    )
    const [spec] = opened
    expect(spec.files.map((file) => file.path)).toEqual(['map/content.json', 'map/layout.json'])
    expect(spec.files[1].text).not.toContain('need-brown-attunement')
  })

  it("writes the positions of the contributor's cards only, dropping stray layout entries", async () => {
    const request = suggestion(addLink)
    request.layout.cards['not-a-card'] = { width: 1, yPosition: 1 }
    await post(request)
    expect(opened[0].files.some((file) => file.text.includes('not-a-card'))).toBe(false)
  })

  it('puts the contributor, the reason, the plain-words changes and the preview in the body', async () => {
    await post(suggestion(addLink, { name: 'Ana Souza', reason: 'Seen in my practice.\nTwice.' }))
    const [spec] = opened
    const created = spec.body(null)
    expect(created).toContain('## What this suggestion changes')
    expect(created).toContain(
      `- Added link: "Intergenerational war trauma" → "Collective 'freeze'"`,
    )
    expect(created).toContain('> Seen in my practice.\n> Twice.')
    expect(created).toContain('Suggested by **Ana Souza**')
    expect(created).not.toContain('?suggestion=')
    expect(spec.body(12)).toContain(
      '**See the proposed map:** https://toceditor.netlify.app/?suggestion=12',
    )
  })
})

describe('a suggestion that is refused', () => {
  const untouched = () => {
    expect(repo.openPullRequest).not.toHaveBeenCalled()
  }

  it('says so when nothing changed, without opening anything', async () => {
    const response = await post(suggestion(() => undefined))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain('Nothing has changed')
    untouched()
  })

  it('asks for a reload when the starting version is not on main, and reads nothing more', async () => {
    const response = await post(suggestion(addLink, { baseSha: 'c'.repeat(40) }))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain('out of date')
    expect(repo.readMap).not.toHaveBeenCalled()
    untouched()
  })

  it.each([
    ['no name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['no reason', { reason: undefined }],
    ['a reason that is not text', { reason: 42 }],
    ['no starting version', { baseSha: undefined }],
    ['a starting version that is not a commit id', { baseSha: 'main' }],
  ])('needs a name, a reason and a starting version: %s', async (_label, extra) => {
    expect((await post(suggestion(addLink, extra))).status).toBe(400)
    untouched()
  })

  it("refuses a map that fails the editor's schema before calling GitHub at all", async () => {
    const response = await post(suggestion((doc) => (card(doc, TRAUMA).color = 'red')))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain('The map is not valid')
    expect(repo.isOnMain).not.toHaveBeenCalled()
  })

  it('refuses a link address that is not a web address', async () => {
    const response = await post(
      suggestion((doc) => {
        card(doc, TRAUMA).links = [{ url: 'javascript:alert(1)' }]
      }),
    )
    expect(response.status).toBe(400)
    expect(repo.isOnMain).not.toHaveBeenCalled()
  })

  it('names a card that has no position', async () => {
    const request = suggestion(addLink)
    delete request.layout.cards[TRAUMA]
    const response = await post(request)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain(TRAUMA)
  })

  it.each([
    ['content is not an object', { content: 'text' }],
    ['layout is missing', { layout: undefined }],
    ['layout has no cards', { layout: {} }],
    ['content has no sections', { content: {} }],
    ['sections are not a list', { content: { sections: 'x' } }],
  ])('refuses map files of the wrong shape: %s', async (_label, extra) => {
    expect((await post(suggestion(addLink, extra))).status).toBe(400)
    untouched()
  })

  it('refuses anything but a JSON POST', async () => {
    expect((await post('x', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post('{nope')).status).toBe(400)
    const get = await handleSuggest(new Request('https://toc.test/x'), deps)
    expect(get.status).toBe(405)
    untouched()
  })
})

describe('when GitHub or the settings are not there', () => {
  it('answers 503, and does nothing else, while the GitHub App is not set up', async () => {
    deps = { ...deps, repo: null }
    const response = await post(suggestion(addLink))
    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: string }).error).toBe(
      'Suggestions are not switched on yet.',
    )
    expect(repo.isOnMain).not.toHaveBeenCalled()
  })

  it('answers 502 with a friendly message and logs the step, not the request', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    repo = fakeRepo({
      openPullRequest: async () => {
        throw new GithubError('commit', 403, 'Resource not accessible by integration')
      },
    }).repo
    deps = { ...deps, repo }
    const response = await post(
      suggestion(addLink, { name: 'Secret Name', reason: 'Secret reason' }),
    )
    expect(response.status).toBe(502)
    const { error } = (await response.json()) as { error: string }
    expect(error).toContain('could not be sent right now')
    expect(error).not.toContain('Resource not accessible')
    expect(logged).toHaveBeenCalledWith(
      'suggest: GitHub commit failed (403): Resource not accessible by integration',
    )
    expect(JSON.stringify(logged.mock.calls)).not.toContain('Secret')
  })

  it('answers 502 when the base map on GitHub cannot be read', async () => {
    repo = fakeRepo({ readMap: async () => ({ content: 'not json', layout: '{}' }) }).repo
    deps = { ...deps, repo }
    expect((await post(suggestion(addLink))).status).toBe(502)
  })
})
