import { describe, expect, it } from 'vitest'
import { labelsFor } from './labels'
import { CONFIDENCE_HIGH_MIN, CONFIDENCE_MEDIUM_MIN } from '../canvas/config'

describe('labelsFor', () => {
  it('changes only the wording with the diagram type', () => {
    expect(labelsFor('status-quo').mechanism.label).toBe('Mechanism')
    expect(labelsFor('theory-of-change').mechanism.label).toBe('Assumptions')
    expect(labelsFor(undefined).typeName).toBe('Theory of change')
  })

  it('quotes the confidence thresholds from the one config', () => {
    const note = labelsFor('theory-of-change').footnote
    expect(note).toContain(`solid at ${CONFIDENCE_HIGH_MIN}`)
    expect(note).toContain(`dashed from ${CONFIDENCE_MEDIUM_MIN}`)
    expect(labelsFor('status-quo').footnote).toContain('saved as "assumptions"')
  })
})
