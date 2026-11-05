import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { getListContentQueryKey, useListContent, useListReviews, useUpdateContent, type ContentEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-error";
import { EmptyBlock, ErrorBlock } from "./common";

const MAX = 2000;

export default function ContentPage() {
  const content = useListContent();
  const reviews = useListReviews();

  if (content.isError) return <ErrorBlock onRetry={() => content.refetch()} />;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {content.isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
        ) : !content.data?.length ? (
          <EmptyBlock title="No text blocks" description="Text blocks come from business/seed/data.json when the database is first seeded." />
        ) : (
          content.data.map((entry) => <ContentCard key={entry.key} entry={entry} />)
        )}
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Recent reviews</CardTitle>
          <CardDescription>Shown on the storefront.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviews.isLoading ? <Skeleton className="h-24 w-full" /> : !reviews.data?.length ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : reviews.data.slice(0, 5).map((r) => (
            <div key={r.id} className="border-b pb-3 last:border-0">
              <div className="flex gap-0.5 text-amber-500" aria-label={`${r.rating} stars`}>{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3" fill="currentColor" />)}</div>
              <p className="mt-1 text-sm">“{r.quote}”</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.customerName}{r.productName ? ` · ${r.productName}` : ""}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ContentCard({ entry }: { entry: ContentEntry }) {
  const queryClient = useQueryClient();
  const update = useUpdateContent();
  const [value, setValue] = useState(entry.value);
  const dirty = value !== entry.value;

  const save = () =>
    update.mutate(
      { key: entry.key, data: { value } },
      {
        onSuccess: () => { toast.success(`Saved “${entry.label}”`); queryClient.invalidateQueries({ queryKey: getListContentQueryKey() }); },
        onError: (err) => toast.error("Couldn't save", { description: errorMessage(err) }),
      },
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{entry.label}</CardTitle>
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{entry.key}</code>
        </div>
        {entry.key === "hero_title" && <CardDescription>Tip: two sentences (“Made slow. Gone fast.”) — the second is shown in your brand colour.</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} maxLength={MAX} rows={entry.key === "story" ? 5 : 3} aria-label={entry.label} data-testid={`textarea-content-${entry.key}`} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{value.length}/{MAX}</span>
          <div className="flex gap-2">
            {dirty && <Button variant="ghost" size="sm" onClick={() => setValue(entry.value)}>Undo</Button>}
            <Button size="sm" onClick={save} disabled={!dirty || update.isPending} data-testid={`button-save-content-${entry.key}`}>{update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
