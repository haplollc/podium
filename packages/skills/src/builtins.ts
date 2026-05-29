import type { SkillMeta } from './types.js'

/**
 * Built-in skills shipped with Podium. Inlined (not files) so they survive
 * bundling and are available on a fresh install. A user's own SKILL.md with the
 * same name overrides these.
 */
export const builtinSkills: SkillMeta[] = [
  {
    name: 'commit',
    description: 'Stage and commit the current changes with a clear conventional-commit message.',
    body: [
      'Create a git commit for the current changes:',
      '1. Run `git status` and `git diff` (and `git diff --staged`) to understand what changed.',
      '2. Stage the relevant files with `git add`.',
      '3. Commit with a concise conventional-commit message (feat/fix/docs/refactor/test/chore) that explains the *why*.',
      'If extra arguments were given, treat them as guidance for the message: $ARGUMENTS',
      'Show the final `git log -1 --stat` so the user can confirm.',
    ].join('\n'),
  },
  {
    name: 'review',
    description: 'Review the current uncommitted changes for bugs and quick improvements.',
    body: [
      'Review the working-tree changes:',
      '1. Run `git diff` (and `git diff --staged`) to see what changed.',
      '2. Call out, in priority order: correctness bugs, risky edge cases, then small clarity/efficiency improvements.',
      'Be concise and specific — reference files and lines. Skip nitpicks. If it looks good, say so plainly.',
    ].join('\n'),
  },
  {
    name: 'explain',
    description: 'Explain a file or symbol clearly and concisely.',
    body: [
      'Explain the following (a file path or symbol): $ARGUMENTS',
      'Read it first (use Read/Grep), then explain in a few sentences: what it does, how it is used,',
      'and how it fits into the surrounding code. Prefer a short worked example over prose. No filler.',
    ].join('\n'),
  },
  {
    name: 'test',
    description: "Find and run this project's tests, then summarize the results.",
    body: [
      "Run this project's tests:",
      '1. Discover the test command (check package.json `scripts`, a Makefile, or common runners like vitest/jest/pytest/go test).',
      '2. Run it with Bash.',
      '3. Report pass/fail counts and summarize any failures with the smallest useful excerpt — do not paste the whole log.',
      'If extra arguments were given, pass them to the test command: $ARGUMENTS',
    ].join('\n'),
  },
]
