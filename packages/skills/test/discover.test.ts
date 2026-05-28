import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discoverSkills } from '../src/discover.js'
import { SkillRegistry, buildSkillListing } from '../src/registry.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'maestro-skills-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

async function writeSkill(root: string, name: string, desc: string, body: string) {
  await mkdir(path.join(root, name), { recursive: true })
  await writeFile(path.join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`)
}

describe('discoverSkills + registry', () => {
  it('discovers skills and serves their bodies on demand', async () => {
    await writeSkill(dir, 'greet', 'Greet someone', 'Say hi to $1.')
    const metas = await discoverSkills([dir])
    expect(metas).toHaveLength(1)
    expect(metas[0]).toMatchObject({ name: 'greet', description: 'Greet someone' })

    const reg = new SkillRegistry(metas)
    expect(reg.has('greet')).toBe(true)
    expect(await reg.getBody('greet', 'Sam')).toBe('Say hi to Sam.')
    expect(await reg.getBody('missing')).toBeNull()
  })

  it('earlier roots win on name collision', async () => {
    const dir2 = await mkdtemp(path.join(tmpdir(), 'maestro-skills2-'))
    await writeSkill(dir, 'dup', 'from-first', 'first')
    await writeSkill(dir2, 'dup', 'from-second', 'second')
    const metas = await discoverSkills([dir, dir2])
    expect(metas).toHaveLength(1)
    expect(metas[0].description).toBe('from-first')
    await rm(dir2, { recursive: true, force: true })
  })

  it('buildSkillListing renders name + description lines', () => {
    const listing = buildSkillListing([
      { name: 'a', description: 'does a', path: '/x' },
      { name: 'b', description: 'does b', path: '/y' },
    ])
    expect(listing).toContain('- a: does a')
    expect(listing).toContain('- b: does b')
    expect(buildSkillListing([])).toBe('')
  })
})
