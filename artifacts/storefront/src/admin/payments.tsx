import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getGetSiteSettingsQueryKey, useGetSiteSettings, type CheckoutSettings } from "@workspace/api-client-react";
import { checkoutSchema } from "@workspace/business";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, type PaymentsStatus, type ProviderStatus } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";
import { useMoney } from "@/lib/theme";
import { ErrorBlock } from "./common";

const STATUS_KEY = ["admin", "payments-status"];
const zoneId = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "zone";

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("Copied"))}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ProviderCard({ p, on, onToggle }: { p: ProviderStatus; on: boolean; onToggle: (v: boolean) => void }) {
  const ready = p.configured && p.currencySupported;
  return (
    <Card className="shadow-none" data-testid={`card-provider-${p.id}`}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {p.label}
            {p.configured ? <Badge variant={p.mode === "live" ? "default" : "secondary"}>{p.mode === "live" ? "Live keys" : "Test / sandbox keys"}</Badge> : <Badge variant="outline">Keys missing</Badge>}
          </CardTitle>
          <CardDescription className="text-xs">MTN MoMo, Airtel Money and cards. Customers pay on the provider's secure page; the amount always comes from the server.</CardDescription>
        </div>
        <Switch checked={on} disabled={!ready && !on} onCheckedChange={onToggle} aria-label={`Offer ${p.label}`} data-testid={`switch-${p.id}`} />
      </CardHeader>
      {(!p.configured || !p.currencySupported) && (
        <CardContent className="px-4 pb-4 pt-0 text-xs text-muted-foreground">
          {on && <p className="mb-1 font-medium text-amber-700">Switched on, but hidden at checkout until the keys below are added.</p>}
          {!p.configured && <p>Add these to the server's <code>.env</code> (or hosting secrets), then restart: <code className="font-mono">{p.missing.join(", ")}</code>. See DEPLOYMENT.md.</p>}
          {!p.currencySupported && <p className="text-destructive">This provider doesn't support your shop currency.</p>}
        </CardContent>
      )}
    </Card>
  );
}

export default function PaymentsPage() {
  const money = useMoney();
  const queryClient = useQueryClient();
  const settings = useGetSiteSettings();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => api<PaymentsStatus>("GET", "/admin/payments/status") });
  const [form, setForm] = useState<CheckoutSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings.data && !form) setForm(structuredClone(settings.data.checkout));
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (body: CheckoutSettings) => api<CheckoutSettings>("PUT", "/admin/payments/settings", body),
    onSuccess: (checkout) => {
      toast.success("Payment & delivery settings saved");
      setForm(structuredClone(checkout));
      queryClient.invalidateQueries({ queryKey: getGetSiteSettingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (settings.isError || status.isError) return <ErrorBlock onRetry={() => { settings.refetch(); status.refetch(); }} />;
  if (!form || !status.data) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;

  const st = status.data;
  const set = (patch: Partial<CheckoutSettings>) => setForm({ ...form, ...patch });
  const setDelivery = (patch: Partial<CheckoutSettings["delivery"]>) => set({ delivery: { ...form.delivery, ...patch } });
  const setPickup = (patch: Partial<CheckoutSettings["pickup"]>) => set({ pickup: { ...form.pickup, ...patch } });
  const setMethod = (id: keyof CheckoutSettings["methods"], v: boolean) => set({ methods: { ...form.methods, [id]: v } });
  const onlineOn = form.methods.flutterwave || form.methods.pesapal;

  const submit = () => {
    setError("");
    const parsed = checkoutSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check the form");
    save.mutate(parsed.data as CheckoutSettings);
  };

  return (
    <div className="space-y-6">
      {onlineOn && !st.publicUrlIsHttps && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>PUBLIC_URL is not https</AlertTitle>
          <AlertDescription>Online payments need your real https web address in <code>PUBLIC_URL</code>, so customers come back to the shop and payment notices reach the server. Now: <code>{st.publicUrl}</code></AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How customers can pay</CardTitle>
          <CardDescription>Only methods that are switched on here <em>and</em> have keys on the server appear at checkout. Prices are in {st.currency}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Card className="shadow-none">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">Cash on delivery / pay at pickup <Badge variant="secondary">No keys needed</Badge></CardTitle>
                <CardDescription className="text-xs">Staff mark the order as paid when the money arrives (cash or a mobile-money transfer to your number).</CardDescription>
              </div>
              <Switch checked={form.methods.cod} onCheckedChange={(v) => setMethod("cod", v)} aria-label="Offer cash on delivery" data-testid="switch-cod" />
            </CardHeader>
          </Card>
          {st.providers.map((p) => <ProviderCard key={p.id} p={p} on={form.methods[p.id]} onToggle={(v) => setMethod(p.id, v)} />)}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5"><CardTitle>Delivery</CardTitle><CardDescription>Zones and their fees. Customers pick one at checkout.</CardDescription></div>
            <Switch checked={form.delivery.enabled} onCheckedChange={(v) => setDelivery({ enabled: v })} aria-label="Offer delivery" data-testid="switch-delivery" />
          </CardHeader>
          <CardContent className="space-y-3">
            {form.delivery.zones.map((z, i) => (
              <div key={i} className="flex items-end gap-2" data-testid={`zone-${i}`}>
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label className="text-xs">Zone</Label>}
                  <Input value={z.name} maxLength={60} placeholder="e.g. Kampala Central" onChange={(e) => {
                    const zones = [...form.delivery.zones];
                    zones[i] = { ...z, name: e.target.value, id: z.id.startsWith("new-") || !z.id ? zoneId(e.target.value) : z.id };
                    setDelivery({ zones });
                  }} />
                </div>
                <div className="w-32 space-y-1">
                  {i === 0 && <Label className="text-xs">Fee</Label>}
                  <Input type="number" min={0} step="any" value={z.fee} onChange={(e) => {
                    const zones = [...form.delivery.zones];
                    zones[i] = { ...z, fee: Math.max(0, Number(e.target.value) || 0) };
                    setDelivery({ zones });
                  }} />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${z.name}`} onClick={() => setDelivery({ zones: form.delivery.zones.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={form.delivery.zones.length >= 30} onClick={() => setDelivery({ zones: [...form.delivery.zones, { id: `new-${Date.now().toString(36)}`, name: "", fee: 0 }] })}><Plus className="mr-1 h-4 w-4" /> Add zone</Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="free-over">Free delivery over</Label>
                <Input id="free-over" type="number" min={0} step="any" value={form.delivery.freeOver} onChange={(e) => setDelivery({ freeOver: Math.max(0, Number(e.target.value) || 0) })} />
                <p className="text-xs text-muted-foreground">{form.delivery.freeOver > 0 ? `Orders of ${money(form.delivery.freeOver)} or more` : "0 = never free"}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="min-order">Minimum order</Label>
                <Input id="min-order" type="number" min={0} step="any" value={form.minOrder} onChange={(e) => set({ minOrder: Math.max(0, Number(e.target.value) || 0) })} />
                <p className="text-xs text-muted-foreground">0 = no minimum</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="d-note">Delivery note shown at checkout</Label>
              <Input id="d-note" maxLength={200} value={form.delivery.note} placeholder="e.g. Same-day delivery for orders before 2 pm" onChange={(e) => setDelivery({ note: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5"><CardTitle>Pickup</CardTitle><CardDescription>Let customers collect orders themselves.</CardDescription></div>
              <Switch checked={form.pickup.enabled} onCheckedChange={(v) => setPickup({ enabled: v })} aria-label="Offer pickup" data-testid="switch-pickup" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label htmlFor="p-address">Pickup address</Label><Input id="p-address" maxLength={200} value={form.pickup.address} onChange={(e) => setPickup({ address: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="p-note">Pickup note</Label><Input id="p-note" maxLength={200} value={form.pickup.note} placeholder="e.g. Open 8 am – 6 pm" onChange={(e) => setPickup({ note: e.target.value })} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Phone numbers</CardTitle><CardDescription>Customers can type local numbers (0772 123456); they're stored as +{form.phoneCountryCode || "…"}772123456.</CardDescription></CardHeader>
            <CardContent className="space-y-1">
              <Label htmlFor="cc">Default country code</Label>
              <Input id="cc" inputMode="numeric" maxLength={4} className="w-32" value={form.phoneCountryCode} onChange={(e) => set({ phoneCountryCode: e.target.value.replace(/\D/g, "") })} />
              <p className="text-xs text-muted-foreground">Uganda 256, Kenya 254, Tanzania 255, Rwanda 250. Leave empty to require +country code.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {error && <p role="alert" className="mr-auto text-sm text-destructive" data-testid="text-payments-error">{error}</p>}
        <Button variant="outline" onClick={() => settings.data && setForm(structuredClone(settings.data.checkout))}>Undo changes</Button>
        <Button onClick={submit} disabled={save.isPending} data-testid="button-save-payments">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server setup</CardTitle>
          <CardDescription>Paste these into the provider dashboards. Key values are never shown here — they live only in the server's environment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyField label="Flutterwave webhook URL (Settings → Webhooks)" value={st.webhooks.flutterwave} />
          <CopyField label="Pesapal IPN URL (registered automatically)" value={st.webhooks.pesapal} />
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <Badge variant="outline" className="gap-1">{st.notifications.email === "smtp" ? <CheckCircle2 className="h-3 w-3" /> : null} Email: {st.notifications.email}</Badge>
            <Badge variant="outline" className="gap-1">{st.notifications.sms.startsWith("africastalking") ? <CheckCircle2 className="h-3 w-3" /> : null} SMS: {st.notifications.sms}</Badge>
            <Badge variant="outline">Rate limits: {st.rateLimits === "redis" ? "Redis (shared)" : "in memory (single server)"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
