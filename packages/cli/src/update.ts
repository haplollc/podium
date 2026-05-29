import { execa } from 'execa'

export type Install = 'brew' | 'npm' | 'unknown'

/**
 * Guess how podium was installed from the running executable's path.
 * IMPORTANT: npm globals live under Homebrew's node prefix too
 * (/opt/homebrew/lib/node_modules/...), so a brew install is specifically the
 * one inside a Cellar; anything else with node_modules is npm.
 */
export function detectInstall(execPath = process.argv[1] ?? ''): Install {
  if (execPath.includes('/Cellar/')) return 'brew'
  if (execPath.includes('/node_modules/')) return 'npm'
  if (execPath.includes('/opt/homebrew/') || execPath.includes('/usr/local/')) return 'brew'
  return 'unknown'
}

export function updateCommand(install: Install): string {
  if (install === 'brew') return 'brew upgrade podium'
  return 'npm install -g podium-cli@latest'
}

export async function runUpdate(): Promise<void> {
  const install = detectInstall()
  const cmd = updateCommand(install)
  console.log(`Updating via: ${cmd}`)
  try {
    await execa(cmd, { shell: true, stdio: 'inherit' })
  } catch {
    // Fall back to the other manager if the guess was wrong.
    const alt = install === 'brew' ? 'npm install -g podium-cli@latest' : 'brew upgrade podium'
    console.log(`That didn't work — trying: ${alt}`)
    await execa(alt, { shell: true, stdio: 'inherit' })
  }
}
