/** A skill's file name ("meeting-notes") as the owner reads it ("Meeting notes"). A name with spaces or capitals is already readable and stays. */
export function skillLabel(name: string): string {
  if (!/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(name)) return name
  const words = name.replace(/[-_.]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
