import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, EyeOff, Star, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { getListReviewsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";
import { EmptyBlock, ErrorBlock } from "./common";

type Status = "pending" | "approved" | "hidden";
type AdminReview = { id: number; customerName: string; quote: string; rating: number; verified: boolean; productName: string | null; status: Status; createdAt: string };

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Status>("pending");
  const key = ["admin", "reviews", tab];
  const reviews = useQuery({ queryKey: key, queryFn: () => api<AdminReview[]>("GET", `/admin/reviews?status=${tab}`) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey() });
  };
  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) => api("PATCH", `/admin/reviews/${id}`, { status }),
    onSuccess: (_d, v) => { toast.success(v.status === "approved" ? "Review is now on the website" : v.status === "hidden" ? "Review hidden" : "Moved back to pending"); refresh(); },
    onError: (err) => toast.error("Couldn't update", { description: errorMessage(err) }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api("DELETE", `/admin/reviews/${id}`),
    onSuccess: () => { toast.success("Review deleted"); refresh(); },
    onError: (err) => toast.error("Couldn't delete", { description: errorMessage(err) }),
  });

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-reviews-pending">Waiting</TabsTrigger>
          <TabsTrigger value="approved">On the website</TabsTrigger>
          <TabsTrigger value="hidden">Hidden</TabsTrigger>
        </TabsList>
      </Tabs>
      {reviews.isError ? (
        <ErrorBlock onRetry={() => reviews.refetch()} />
      ) : reviews.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !reviews.data?.length ? (
        <EmptyBlock title={tab === "pending" ? "No reviews waiting" : "Nothing here"} description="New customer reviews wait here until a manager approves them." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reviews.data.map((r) => (
            <Card key={r.id} data-testid={`card-review-${r.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.customerName}</span>
                    {r.verified && <Badge variant="secondary" className="gap-1"><BadgeCheck className="h-3 w-3" /> Verified order</Badge>}
                  </div>
                  <span className="flex" aria-label={`${r.rating} of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}</span>
                </div>
                <p className="whitespace-pre-line text-sm">“{r.quote}”</p>
                <p className="text-xs text-muted-foreground">{r.productName ? `${r.productName} · ` : ""}{new Date(r.createdAt).toLocaleString()}</p>
                <div className="flex flex-wrap gap-2">
                  {r.status !== "approved" && <Button size="sm" onClick={() => moderate.mutate({ id: r.id, status: "approved" })} data-testid={`button-approve-${r.id}`}><Check className="mr-1 h-3.5 w-3.5" /> Approve</Button>}
                  {r.status !== "hidden" && <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: r.id, status: "hidden" })}><EyeOff className="mr-1 h-3.5 w-3.5" /> Hide</Button>}
                  {r.status !== "pending" && <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: r.id, status: "pending" })}><Undo2 className="mr-1 h-3.5 w-3.5" /> Back to waiting</Button>}
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove.mutate(r.id)} aria-label="Delete review"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
