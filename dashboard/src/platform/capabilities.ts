import type { Capability } from "../domain/model";
import type { Command, CommandContext } from "./contributions";
export function capabilityReason(
  capabilities: Capability[] | undefined,
  id?: string,
): string | undefined {
  if (!id) return;
  const capability = capabilities?.find((item) => item.id === id);
  if (!capability) return "Capability evidence is unavailable.";
  if (capability.supported !== true)
    return capability.reason ?? "Not supported by this fixture connection.";
  if (capability.authorised !== true)
    return capability.reason ?? "The owner has not authorised this operation.";
}
export function commandReason(
  command: Command,
  context: CommandContext,
  capabilities: Capability[] | undefined,
) {
  const reason = capabilityReason(capabilities, command.capability);
  if (reason) return reason;
  const applies = command.available(context);
  return applies === true
    ? undefined
    : typeof applies === "string"
      ? applies
      : "Does not apply to this selection.";
}
