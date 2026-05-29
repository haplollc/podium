import { execa } from 'execa'

export type Install = 'brew' | 'npm' | 'unknown'

/** Guess how podium was installed from the path of the running executable. */
export function detectInstall(execPath = process.argv[1] ?? ''): Install {
  if (execPath.includes('/Cellar/') || execPath.includes('/opt/homebrew/')) return 'brew'
  if (execPath.includes('/node_modules/') || execPath.includes('/lib/node_modules/')) return 'npm'
  return 'unknown'
}

export function updateCommand(install: Install): string {
  if (install === 'brew') return 'brew upgrade podium'
  return 'npm install -g podium-cli@latest'
}

export async function runUpdate(): Promise<void> {
  const cmd = updateCommand(detectInstall())
  console.log(`Updating via: ${cmd}`)
  await execa(cmd, { shell: true, stdio: 'inherit' })
}
