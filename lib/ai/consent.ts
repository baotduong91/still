import { AppError } from "@/lib/awp/errors";
import { cloudConsentHeader } from "./cloud-status";
export function requireCloudConsent(
  request: Request,
  input: unknown,
  appOnly = false,
) {
  if (
    !input ||
    typeof input !== "object" ||
    !("provider" in input) ||
    input.provider !== "cloud"
  )
    return;
  // AWP agents retain explicit provider=cloud as their opt-in. Browser requests
  // additionally affirm the Settings choice; no new AWP input field is added.
  const browser =
    appOnly ||
    request.headers.has("origin") ||
    request.headers.has("sec-fetch-site");
  if (browser && request.headers.get(cloudConsentHeader) !== "true")
    throw new AppError(
      "FORBIDDEN",
      "Enable cloud sharing in Settings before sending a personal prompt.",
    );
}
