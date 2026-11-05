import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { statusLabel } from "@/lib/business";

export function EmptyBlock({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Empty className="rounded-xl border border-dashed bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <Inbox />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function ErrorBlock({ onRetry, message = "We couldn't load this. Check that the API server is running." }: { onRetry: () => void; message?: string }) {
  return (
    <EmptyBlock icon={<AlertTriangle />} title="Something went wrong" description={message} action={<Button variant="outline" onClick={onRetry}>Try again</Button>} />
  );
}

const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-900 border-amber-200",
  Preparing: "bg-orange-100 text-orange-900 border-orange-200",
  "Out for Delivery": "bg-sky-100 text-sky-900 border-sky-200",
  Completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-medium ${STATUS_STYLE[status] ?? ""}`} data-testid={`status-${status.replaceAll(" ", "-")}`}>
      {statusLabel(status)}
    </Badge>
  );
}
