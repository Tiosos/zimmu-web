import { describe, expect, it } from 'vitest'
import {
  carcaseBoxes as facadeBoxes,
  carcaseContactPairs as facadeContacts,
  carcaseCuts as facadeCuts,
  carcaseHoleArrays as facadeHoleArrays,
  carcaseJoints as facadeJoints,
  carcaseMachining as facadeMachining,
  carcaseRoles as facadeRoles,
  validateCarcaseParams as facadeValidate,
} from '../carcaseRoles'
import { validateCarcaseParams } from './validation'
import { carcaseBoxes, carcaseRoles } from './layout'
import { carcaseJoints } from './joinery'
import { carcaseContactPairs } from './contacts'
import { carcaseCuts } from './cuts'
import { carcaseHoleArrays, carcaseMachining } from './machining'

describe('carcase domain module boundaries', () => {
  it('keep the compatibility facade wired to the same implementation', () => {
    expect(validateCarcaseParams).toBe(facadeValidate)
    expect(carcaseBoxes).toBe(facadeBoxes)
    expect(carcaseRoles).toBe(facadeRoles)
    expect(carcaseJoints).toBe(facadeJoints)
    expect(carcaseContactPairs).toBe(facadeContacts)
    expect(carcaseCuts).toBe(facadeCuts)
    expect(carcaseHoleArrays).toBe(facadeHoleArrays)
    expect(carcaseMachining).toBe(facadeMachining)
  })
})
