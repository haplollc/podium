export function stringArg(args: Record<string, unknown>, names: string[], label = names[0]): string {
  for (const name of names) {
    const value = args[name]
    if (value !== undefined && value !== null) return String(value)
  }
  throw new Error(`Missing required argument "${label}" (accepted keys: ${names.join(', ')})`)
}
