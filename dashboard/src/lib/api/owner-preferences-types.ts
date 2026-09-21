export type OwnerPreferences = {
  quietHours: { enabled: boolean; start: string; end: string; timeZone: string; urgentExceptions: boolean }
  urgency: "meaningful" | "urgent_only" | "off"
  dailyBudget: { suggestions: number; researchMinutes: number; costCents: number }
  idleTimeoutMinutes: 0 | 5 | 15 | 30 | 60
}
export interface OwnerPreferencesClient {
  load(): Promise<OwnerPreferences>
  save(value: OwnerPreferences): Promise<OwnerPreferences>
}
