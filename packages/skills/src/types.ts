export interface SkillFrontmatter {
  name: string
  description: string
  whenToUse?: string
  allowedTools?: string[]
  userInvocable?: boolean
  argumentHint?: string
}

export interface ParsedSkill extends SkillFrontmatter { body: string }

export interface SkillMeta { name: string; description: string; path: string }
