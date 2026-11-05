import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type AuditEntry } from "@/lib/api";
import { EmptyBlock, ErrorBlock } from "./common";

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Signed in", "auth.login_failed": "Failed sign-in", "auth.locked": "Account locked (too many tries)", "auth.logout": "Signed out",
  "auth.setup": "Created the owner account", "auth.password_changed": "Changed password", "auth.password_change_failed": "Failed password change",
  "auth.oauth_failed": "Failed Google/GitHub sign-in",
  "user.create": "Added a staff member", "user.update": "Updated a staff member", "user.disable": "Disabled a staff member",
  "user.enable": "Enabled a staff member", "user.reset_password": "Reset a password",
  "settings.branding": "Changed branding", "settings.reset": "Reset branding", "settings.payments": "Changed payment & delivery settings",
  "product.create": "Added a product", "product.update": "Edited a product", "product.delete": "Deleted a product",
  "order.status": "Changed order status", "order.mark_paid": "Marked an order paid", "order.mark_refunded": "Marked an order refunded",
  "content.update": "Edited website text", "review.approve": "Approved a review", "review.hide": "Hid a review", "review.pending": "Moved a review back to pending",
  "review.delete": "Deleted a review", "upload.create": "Uploaded an image", "newsletter.export": "Downloaded the newsletter list",
};

export default function AuditPage() {
  const [action, setAction] = useState("");
  const filter = /^[a-z_.]{1,40}$/.test(action.trim()) ? action.trim() : "";
  const q = useInfiniteQuery({
    queryKey: ["admin", "audit", filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ entries: AuditEntry[]; nextBefore: number | null }>("GET", `/admin/audit?limit=50${pageParam ? `&before=${pageParam}` : ""}${filter ? `&action=${encodeURIComponent(filter)}` : ""}`),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.entries) ?? [];

  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Filter by action, e.g. user.create" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action" />
        <p className="text-xs text-muted-foreground">Passwords, keys and tokens are never logged.</p>
      </div>
      <Card className="overflow-hidden">
        {q.isLoading ? (
          <CardContent className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent>
        ) : rows.length === 0 ? (
          <EmptyBlock title="Nothing logged yet" description="Sign-ins and changes made in the admin appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="hidden lg:table-cell">Details</TableHead>
                <TableHead className="hidden md:table-cell w-32">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} data-testid={`row-audit-${e.id}`}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{e.userEmail ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">
                    <p>{ACTION_LABEL[e.action] ?? e.action}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{e.action}{e.entity ? ` · ${e.entity}${e.entityId ? ` #${e.entityId}` : ""}` : ""}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-md truncate font-mono text-[11px] text-muted-foreground lg:table-cell" title={e.details ? JSON.stringify(e.details) : ""}>{e.details ? JSON.stringify(e.details) : ""}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{e.ip ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} data-testid="button-audit-more">{q.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Load older entries</Button>
        </div>
      )}
    </div>
  );
}
