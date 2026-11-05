import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { EmptyBlock, ErrorBlock } from "./common";

type Subscriber = { id: number; email: string; status: "subscribed" | "unsubscribed"; createdAt: string; unsubscribedAt: string | null };

export default function NewsletterPage() {
  const list = useQuery({ queryKey: ["admin", "newsletter"], queryFn: () => api<Subscriber[]>("GET", "/admin/newsletter") });
  const [search, setSearch] = useState("");
  const rows = (list.data ?? []).filter((s) => s.email.includes(search.trim().toLowerCase()));
  const active = (list.data ?? []).filter((s) => s.status === "subscribed").length;
  const csvHref = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/newsletter.csv`;

  if (list.isError) return <ErrorBlock onRetry={() => list.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm"><span className="font-semibold" data-testid="text-subscriber-count">{active}</span> subscribed{list.data && list.data.length > active ? ` · ${list.data.length - active} unsubscribed` : ""}</p>
        <div className="flex gap-2">
          <Input className="sm:w-64" placeholder="Search email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search subscribers" />
          <Button asChild variant="outline"><a href={csvHref} download data-testid="link-newsletter-csv"><Download className="mr-1 h-4 w-4" /> CSV</a></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The CSV holds subscribed emails with a personal unsubscribe link for each — paste it into your email tool's footer. Downloads are recorded in the activity log.</p>
      <Card className="overflow-hidden">
        {list.isLoading ? (
          <CardContent className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent>
        ) : rows.length === 0 ? (
          <EmptyBlock title="No subscribers yet" description="People who sign up in the website footer show up here." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead className="w-36">Status</TableHead><TableHead className="w-48">Signed up</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{s.email}</TableCell>
                  <TableCell>{s.status === "subscribed" ? <Badge variant="secondary">Subscribed</Badge> : <Badge variant="outline">Unsubscribed</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
