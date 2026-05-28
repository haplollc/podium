import type { Tool } from './types.js'

export const skillTool: Tool = {
  schema: {
    name: 'Skill',
    description: 'Load and follow a reusable skill by name. A user typing /<name> refers to a skill — invoke it here. The returned body is instructions you should then carry out.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name (from the available-skills list)' },
        args: { type: 'string', description: 'Optional arguments passed to the skill' },
      },
      required: ['name'],
    },
  },
  async run(args, ctx) {
    const name = String(args.name)
    if (!ctx.skills) return 'Error: skills are unavailable in this context.'
    const body = await ctx.skills.getBody(name, args.args ? String(args.args) : '')
    return body ?? `Error: unknown skill "${name}".`
  },
}
