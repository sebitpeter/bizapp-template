import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Lock, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ROLE_HELP, ROLE_LABEL, type Role, type StaffUser } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";
import { ErrorBlock } from "./common";
import { useAdmin } from "./session";

const ROLES: Role[] = ["staff", "manager", "owner"];
const KEY = ["admin", "users"];

export default function StaffPage() {
  const { user: me } = useAdmin();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: KEY, queryFn: () => api<StaffUser[]>("GET", "/admin/users") });
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "disable" | "reset"; user: StaffUser } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pick<StaffUser, "role" | "disabled" | "name" | "email">> }) => api<StaffUser>("PATCH", `/admin/users/${id}`, body),
    onSuccess: (u) => { toast.success(`Saved ${u.name}`); refresh(); },
    onError: (err) => toast.error("Couldn't save", { description: errorMessage(err) }),
  });
  const reset = useMutation({
    mutationFn: (u: StaffUser) => api<{ temporaryPassword: string }>("POST", `/admin/users/${u.id}/reset-password`),
    onSuccess: (r, u) => { setSecret({ who: u.name, password: r.temporaryPassword }); refresh(); },
    onError: (err) => toast.error("Couldn't reset the password", { description: errorMessage(err) }),
  });

  if (users.isError) return <ErrorBlock onRetry={() => users.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r} className="shadow-none">
            <CardHeader className="p-4">
              <CardTitle className="text-sm">{ROLE_LABEL[r]}</CardTitle>
              <CardDescription className="text-xs">{ROLE_HELP[r]}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} data-testid="button-add-staff"><Plus className="mr-1 h-4 w-4" /> Add staff member</Button>
      </div>

      <Card className="overflow-hidden">
        {users.isLoading ? (
          <CardContent className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="w-40">Role</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
                <TableHead className="w-56 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((u) => {
                const self = u.id === me.id;
                return (
                  <TableRow key={u.id} data-testid={`row-user-${u.username}`} className={u.disabled ? "opacity-60" : ""}>
                    <TableCell>
                      <p className="font-medium">{u.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="text-xs text-muted-foreground">@{u.username} · {u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Select value={u.role} disabled={self || patch.isPending} onValueChange={(v) => patch.mutate({ id: u.id, body: { role: v as Role } })}>
                        <SelectTrigger className="h-8" aria-label={`Role of ${u.name}`} data-testid={`select-role-${u.username}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {u.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge>}
                        {u.locked && <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
                        {u.mustChangePassword && !u.disabled && <Badge variant="outline">Must change password</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {!self && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reset", user: u })} data-testid={`button-reset-${u.username}`}><KeyRound className="mr-1 h-3.5 w-3.5" /> Reset</Button>
                          {u.disabled ? (
                            <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: u.id, body: { disabled: false } })}><UserCheck className="mr-1 h-3.5 w-3.5" /> Enable</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "disable", user: u })} data-testid={`button-disable-${u.username}`}><UserX className="mr-1 h-3.5 w-3.5" /> Disable</Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Disabling someone or changing their role signs them out everywhere straight away. Accounts lock for a while after repeated wrong passwords; enabling or resetting unlocks them.</p>

      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={(name, password) => { setCreating(false); setSecret({ who: name, password }); refresh(); }} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "disable" ? `Disable ${confirm.user.name}?` : `Reset ${confirm?.user.name}'s password?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "disable"
                ? "They will be signed out and can't sign in until you enable the account again. Their past actions stay in the activity log."
                : "They will be signed out and get a new one-time password, which you'll see once. They must choose their own password when they next sign in."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "disable") patch.mutate({ id: confirm.user.id, body: { disabled: true } });
                else reset.mutate(confirm.user);
                setConfirm(null);
              }}
              data-testid="button-confirm"
            >
              {confirm?.kind === "disable" ? "Disable" : "Reset password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>One-time password for {secret?.who}</DialogTitle>
            <DialogDescription>Give it to them in person or by phone. It is shown only now — it isn't stored anywhere readable. They'll be asked to change it at first sign-in.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wide" data-testid="text-temp-password">{secret?.password}</code>
            <Button variant="outline" size="icon" aria-label="Copy" onClick={() => secret && navigator.clipboard?.writeText(secret.password).then(() => toast.success("Copied"))}><Copy className="h-4 w-4" /></Button>
          </div>
          <DialogFooter><Button onClick={() => setSecret(null)}>I've noted it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", role: "staff" as Role });
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ user: StaffUser; temporaryPassword: string }>("POST", "/admin/users", form),
    onSuccess: (r) => { setForm({ name: "", username: "", email: "", role: "staff" }); onCreated(r.user.name, r.temporaryPassword); },
    onError: (err) => setError(errorMessage(err)),
  });
  const set = (k: "name" | "username" | "email") => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(""); create.mutate(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
          <DialogDescription>They'll sign in with their username, email and a one-time password you'll see next.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="form-add-staff">
          <div className="space-y-1.5"><Label htmlFor="u-name">Full name</Label><Input id="u-name" required maxLength={100} value={form.name} onChange={set("name")} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="u-username">Username</Label><Input id="u-username" required maxLength={32} autoCapitalize="none" value={form.username} onChange={set("username")} /></div>
            <div className="space-y-1.5"><Label htmlFor="u-email">Email</Label><Input id="u-email" type="email" required maxLength={254} value={form.email} onChange={set("email")} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HELP[form.role]}</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-create-staff">{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
