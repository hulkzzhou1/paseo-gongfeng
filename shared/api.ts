import { z } from "zod";

export const apiError = z.enum([
  "unconfigured", "unauthorized", "forbidden", "not_found", "rate_limited",
  "network_error", "service_error", "invalid_response", "storage_error", "account_changed",
]);
export type ApiError = z.infer<typeof apiError>;
