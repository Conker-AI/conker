/** Day numbers (0 is Sunday) in the order a week list shows them, from Settings > You > First day of the week. */
export function weekOrder(start: 'sunday' | 'monday'): number[] {
  return start === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
}
