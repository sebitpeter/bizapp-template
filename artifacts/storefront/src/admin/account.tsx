import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/api";
import { ChangePasswordForm } from "./auth-pages";
import { useAdmin } from "./session";

export default function AccountPage() {
  const { user } = useAdmin();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Your details</CardTitle><CardDescription>Ask an owner if any of this needs to change.</CardDescription></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd>{user.name}</dd>
            <dt className="text-muted-foreground">Username</dt><dd data-testid="text-username">@{user.username}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABEL[user.role]} — <span className="text-muted-foreground">{ROLE_HELP[user.role]}</span></dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>You'll stay signed in here; other devices are signed out.</CardDescription></CardHeader>
        <CardContent><ChangePasswordForm /></CardContent>
      </Card>
    </div>
  );
}
