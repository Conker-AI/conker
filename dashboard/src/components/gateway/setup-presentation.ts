import type { SetupStatus, SetupStep } from '@/lib/gateway/control'

export const setupLabels: Record<SetupStep['id'], { title: string; description: string }> = {
  security: { title: 'Secure this Conker', description: 'Owner access and durable storage are verified.' },
  companion: { title: 'Meet your companion', description: 'Your companion has a durable identity and working defaults.' },
  model: { title: 'Choose how it thinks', description: 'The selected answer model responds successfully.' },
  memory: { title: 'Choose what it remembers', description: 'Memory is either verified or intentionally left off.' },
  capabilities: { title: 'Connect capabilities', description: 'Useful tools are available through the action boundary.' },
  boundaries: { title: 'Set action boundaries', description: 'Approval and execution policy has been reviewed.' },
  protection: { title: 'Protect the installation', description: 'A recoverable backup has been created and verified.' },
  rehearsal: { title: 'Run a real rehearsal', description: 'Conversation, memory, and approval paths work together.' },
}

export const setupStateLabels: Record<SetupStep['state'], string> = {
  not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', skipped: 'Off for now', complete: 'Verified', degraded: 'Needs attention',
}

export const setupOperations: Record<NonNullable<SetupStatus['recommendedNextOperation']>, { label: string; to: string }> = {
  configure_owner_channel: { label: 'Open system status', to: '/system' },
  repair_durable_store: { label: 'Open system status', to: '/system' },
  repair_companion_configuration: { label: 'Open system status', to: '/system' },
  configure_companion: { label: 'Shape your companion', to: '/settings/companion?tab=harness' },
  configure_model: { label: 'Choose an answer model', to: '/settings' },
  test_model: { label: 'Test the answer model', to: '/settings' },
  repair_model_provider: { label: 'Check model settings', to: '/settings' },
  configure_memory: { label: 'Open memory', to: '/memory' },
  repair_memory: { label: 'Check memory', to: '/memory' },
  configure_capabilities: { label: 'Open tools', to: '/tools' },
  repair_toolgate: { label: 'Open system status', to: '/system' },
  review_boundaries: { label: 'Review tools', to: '/tools' },
  verify_protection: { label: 'Open system status', to: '/system' },
  run_rehearsal: { label: 'Open system status', to: '/system' },
}

export const isResolvedSetupStep = (step: SetupStep) => step.state === 'complete' || step.state === 'skipped'

export function summarizeSetup(status: SetupStatus) {
  const current = status.steps.find(step => step.id === status.currentStep) ?? null
  return {
    current,
    operation: status.recommendedNextOperation ? setupOperations[status.recommendedNextOperation] : null,
    resolved: status.steps.filter(isResolvedSetupStep).length,
    remainingRequired: status.steps.filter(step => step.required && !isResolvedSetupStep(step)).length,
    attention: status.steps.filter(step => step.state === 'blocked' || step.state === 'degraded').length,
  }
}
