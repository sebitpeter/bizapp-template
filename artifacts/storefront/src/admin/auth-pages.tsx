import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";

export const PASSWORD_MIN = 12;

function Shell({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children}
      </Card>
    </div>
  );
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** First run: no staff account exists yet, so create the owner. */
export function SetupPage({ needsToken }: { needsToken: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ setupToken: "", name: "", username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (form.password.length < PASSWORD_MIN) return setError(`Password must be at least ${PASSWORD_MIN} characters.`);
    if (form.password !== form.confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const { confirm: _c, setupToken, ...rest } = form;
      await api("POST", "/auth/setup", { ...rest, ...(setupToken ? { setupToken } : {}) });
      toast.success("Owner account created — welcome!");
      await queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell icon={<Rocket className="h-5 w-5" />} title="Set up your shop admin" description="Create the owner account. You can add staff and managers afterwards.">
      <form onSubmit={submit} data-testid="form-setup">
        <CardContent className="space-y-3">
          {needsToken && <Field id="s-token" label="Setup token" hint="The SETUP_TOKEN value from the server's environment settings." type="password" autoComplete="off" required value={form.setupToken} onChange={set("setupToken")} />}
          <Field id="s-name" label="Your name" required maxLength={100} value={form.name} onChange={set("name")} autoComplete="name" />
          <Field id="s-username" label="Username" hint="Letters, numbers, dot, dash or underscore." required maxLength={32} value={form.username} onChange={set("username")} autoComplete="username" autoCapitalize="none" />
          <Field id="s-email" label="Email" type="email" required maxLength={254} value={form.email} onChange={set("email")} autoComplete="email" />
          <Field id="s-password" label="Password" hint={`At least ${PASSWORD_MIN} characters. A short sentence works well.`} type="password" required maxLength={200} value={form.password} onChange={set("password")} autoComplete="new-password" />
          <Field id="s-confirm" label="Confirm password" type="password" required maxLength={200} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={busy} data-testid="button-setup">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create owner account</Button>
        </CardFooter>
      </form>
    </Shell>
  );
}

/** Change-password form; used for the forced change after a reset and from the Account page. */
export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (form.newPassword.length < PASSWORD_MIN) return setError(`New password must be at least ${PASSWORD_MIN} characters.`);
    if (form.newPassword !== form.confirm) return setError("The two new passwords don't match.");
    if (form.newPassword === form.currentPassword) return setError("Choose a password different from the current one.");
    setBusy(true);
    try {
      await api("POST", "/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Password changed. Other devices were signed out.");
      await queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="form-change-password">
      <Field id="cp-current" label={forced ? "Temporary password" : "Current password"} type="password" required maxLength={200} value={form.currentPassword} onChange={set("currentPassword")} autoComplete="current-password" />
      <Field id="cp-new" label="New password" hint={`At least ${PASSWORD_MIN} characters; not containing your username.`} type="password" required maxLength={200} value={form.newPassword} onChange={set("newPassword")} autoComplete="new-password" />
      <Field id="cp-confirm" label="Confirm new password" type="password" required maxLength={200} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy} data-testid="button-change-password">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Change password</Button>
    </form>
  );
}

export function ForcedChangePage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Shell icon={<KeyRound className="h-5 w-5" />} title="Choose a new password" description="Your password was set by the shop owner. Pick your own before continuing.">
      <CardContent className="space-y-3">
        <ChangePasswordForm forced />
        <button type="button" onClick={onSignOut} className="w-full text-center text-xs text-muted-foreground hover:underline">Sign out instead</button>
      </CardContent>
    </Shell>
  );
}
