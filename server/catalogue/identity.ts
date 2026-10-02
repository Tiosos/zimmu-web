import { openSync, readSync, closeSync } from 'node:fs'
import { GUID } from './auth'

export function identityBindings(
  raw: unknown,
  issuer: string,
  companyId: string,
): ReadonlyMap<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Identity bindings must be an object.')
  const data = raw as Record<string, unknown>
  if (
    Object.keys(data).some((key) => !['issuer', 'companyId', 'users'].includes(key)) ||
    data.issuer !== issuer ||
    data.companyId !== companyId
  )
    throw new Error('Identity bindings must match the configured issuer and company.')
  if (!Array.isArray(data.users)) throw new Error('Identity bindings users must be an array.')
  const users = data.users
  if (users.length > 10000) throw new Error('Too many identity bindings.')
  const result = new Map<string, string>()
  const staff = new Set<string>()
  for (const user of users) {
    if (
      !user ||
      typeof user !== 'object' ||
      Array.isArray(user) ||
      Object.keys(user).some((key) => !['subject', 'staffId'].includes(key))
    )
      throw new Error('Invalid identity binding entry.')
    const { subject, staffId: id } = user as Record<string, unknown>
    if (
      typeof subject !== 'string' ||
      !subject ||
      subject.length > 255 ||
      /\s/.test(subject) ||
      [...subject].some((char) => char.charCodeAt(0) < 32) ||
      typeof id !== 'string' ||
      !GUID.test(id)
    )
      throw new Error('Invalid subject or stable staff UUID.')
    const canonical = id.toLowerCase()
    if (result.has(subject))
      throw new Error('A Keycloak subject cannot have multiple staff identities.')
    if (staff.has(canonical))
      throw new Error('A staff UUID cannot be assigned to multiple Keycloak accounts.')
    staff.add(canonical)
    result.set(subject, canonical)
  }
  return result
}
export function loadIdentityBindings(
  path: string,
  issuer: string,
  companyId: string,
): ReadonlyMap<string, string> {
  const fd = openSync(path, 'r')
  try {
    const data = Buffer.alloc(1024 * 1024 + 1)
    let length = 0
    while (length < data.length) {
      const read = readSync(fd, data, length, data.length - length, null)
      if (!read) break
      length += read
    }
    if (length > 1024 * 1024) throw new Error('Identity bindings file exceeds 1 MiB.')
    return identityBindings(
      JSON.parse(data.subarray(0, length).toString('utf8')),
      issuer,
      companyId,
    )
  } finally {
    closeSync(fd)
  }
}
