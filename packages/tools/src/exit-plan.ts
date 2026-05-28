import type { Tool } from './types.js'

export const exitPlanTool: Tool = {
  schema: {
    name: 'ExitPlanMode',
    description: 'Call this when you have finished planning and are ready to act. Pass the plan you intend to carry out; the user is asked to approve it before plan mode is lifted.',
    parameters: {
      type: 'object',
      properties: {
        plan: { type: 'string', description: 'The implementation plan, in markdown' },
      },
      required: ['plan'],
    },
  },
  async run(args, ctx) {
    if (!ctx.exitPlan) return 'Error: plan mode is not active.'
    await ctx.exitPlan(String(args.plan))
    return 'Plan presented to the user for approval.'
  },
}
