import { createContext, useContext } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type Permission =
  | "dashboard.view" | "orders.view" | "orders.update" | "orders.markPaid" | "orders.refund"
  | "products.manage" | "content.manage" | "reviews.moderate" | "uploads.create"
  | "settings.branding" | "settings.payments" | "users.manage" | "audit.view" | "newsletter.view";

type AdminSession = { user: AuthUser; permissions: string[] };
export const AdminSessionContext = createContext<AdminSession | null>(null);

/** The signed-in staff member and a `can()` check. The server enforces the same rules; this only hides buttons. */
export function useAdmin() {
  const s = useContext(AdminSessionContext);
  if (!s) throw new Error("useAdmin outside AdminSessionContext");
  return { user: s.user, can: (p: Permission) => s.permissions.includes(p) };
}
