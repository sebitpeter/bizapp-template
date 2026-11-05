import { useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, ExternalLink, FileText, History, LayoutDashboard, Loader2, LogOut, Mail, MessageSquareText, Package, Palette, ShieldAlert,
  ShoppingCart, UserCircle, Users,
} from "lucide-react";
import { Link, Route, Switch, useLocation } from "wouter";
import { toast } from "sonner";
import { getGetSessionQueryKey, useGetSession, useLogout } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/lib/api";
import { copy } from "@/lib/business";
import { useSettings } from "@/lib/theme";
import AccountPage from "./account";
import AuditPage from "./audit";
import { ForcedChangePage, SetupPage } from "./auth-pages";
import BrandingPage from "./branding";
import ContentPage from "./content";
import DashboardPage from "./dashboard";
import { LampLogin } from "./lamp-login";
import NewsletterPage from "./newsletter";
import OrdersPage from "./orders";
import PaymentsPage from "./payments";
import ProductsPage from "./products";
import ReviewsPage from "./reviews";
import { AdminSessionContext, useAdmin, type Permission } from "./session";
import StaffPage from "./staff";

type NavItem = { href: string; label: string; icon: React.ComponentType; page: React.ComponentType; description: string; permission: Permission | null; group: "shop" | "settings" };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, page: DashboardPage, description: "How the shop is doing today.", permission: "dashboard.view", group: "shop" },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, page: OrdersPage, description: "Track orders, payments and deliveries.", permission: "orders.view", group: "shop" },
  { href: "/admin/products", label: "Products", icon: Package, page: ProductsPage, description: "Everything customers can buy, with prices and stock.", permission: "products.manage", group: "shop" },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareText, page: ReviewsPage, description: "Approve or hide customer reviews before they go public.", permission: "reviews.moderate", group: "shop" },
  { href: "/admin/content", label: "Website text", icon: FileText, page: ContentPage, description: "Headlines and blurbs on the storefront.", permission: "content.manage", group: "shop" },
  { href: "/admin/newsletter", label: "Newsletter", icon: Mail, page: NewsletterPage, description: "People who asked for your emails.", permission: "newsletter.view", group: "shop" },
  { href: "/admin/branding", label: "Branding", icon: Palette, page: BrandingPage, description: "Logo, colours, contact details and SEO.", permission: "settings.branding", group: "settings" },
  { href: "/admin/payments", label: "Payments & delivery", icon: CreditCard, page: PaymentsPage, description: "How customers pay, delivery zones and pickup.", permission: "settings.payments", group: "settings" },
  { href: "/admin/staff", label: "Staff", icon: Users, page: StaffPage, description: "Who can sign in, and what they're allowed to do.", permission: "users.manage", group: "settings" },
  { href: "/admin/audit", label: "Activity log", icon: History, page: AuditPage, description: "Who changed what, and when.", permission: "audit.view", group: "settings" },
  { href: "/admin/account", label: "My account", icon: UserCircle, page: AccountPage, description: "Your details and password.", permission: null, group: "settings" },
];

/** Everything under /admin: first-run setup, sign-in, forced password change, then the admin. */
export default function AdminApp() {
  const queryClient = useQueryClient();
  const session = useGetSession({ query: { retry: false, staleTime: 30_000 } as never });
  const logout = useLogout();
  const signOut = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        queryClient.clear();
        toast("Signed out");
      },
    });

  if (session.isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-muted/40" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (session.isError || !session.data) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><ShieldAlert className="h-5 w-5" /></div>
            <CardTitle>Can't reach the server</CardTitle>
            <CardDescription>The admin needs the API server to be running.</CardDescription>
          </CardHeader>
          <CardContent><Button onClick={() => session.refetch()}>Try again</Button></CardContent>
        </Card>
      </div>
    );
  }
  const data = session.data;
  if (!data.authenticated || !data.user) {
    if (data.setupRequired) return <SetupPage needsToken={!!data.setupNeedsToken} />;
    return <LampLogin oauth={data.oauth} onSignedIn={() => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() }).then(() => toast.success("Welcome back"))} />;
  }
  if (data.user.mustChangePassword) return <ForcedChangePage onSignOut={signOut} />;
  return (
    <AdminSessionContext.Provider value={{ user: data.user, permissions: data.permissions ?? [] }}>
      <AdminShell onSignOut={signOut} signingOut={logout.isPending} />
    </AdminSessionContext.Provider>
  );
}

function AdminShell({ onSignOut, signingOut }: { onSignOut: () => void; signingOut: boolean }) {
  const [location] = useLocation();
  const settings = useSettings();
  const { user, can } = useAdmin();
  const nav = NAV.filter((n) => !n.permission || can(n.permission));
  const current = nav.find((n) => n.href === location) ?? null;
  const groups = [
    { id: "shop", label: "Manage", items: nav.filter((n) => n.group === "shop") },
    { id: "settings", label: "Settings", items: nav.filter((n) => n.group === "settings") },
  ].filter((g) => g.items.length);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-3">
          <div className="flex items-center gap-2 overflow-hidden">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md bg-white/10 object-contain" />
            ) : (
              <span className="serif grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground">{settings.name.trim()[0]?.toUpperCase()}</span>
            )}
            <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{settings.name}</p>
              <p className="truncate text-xs opacity-70">{copy.admin.title}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g.id}>
              <SidebarGroupLabel className="text-sidebar-foreground/60">{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={location === item.href} tooltip={item.label}>
                        <Link href={item.href} data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="View shop">
                <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer"><ExternalLink /><span>View shop</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onSignOut} disabled={signingOut} tooltip="Sign out" data-testid="button-logout">
                <LogOut /><span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-muted/30">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold" data-testid="text-admin-page-title">{current?.label ?? "Not found"}</h1>
          </div>
          <Link href="/admin/account" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted" data-testid="link-account">
            <span className="hidden max-w-[12rem] truncate sm:inline">{user.name}</span>
            <Badge variant="secondary" data-testid="badge-role">{ROLE_LABEL[user.role]}</Badge>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          {current && (
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight">{current.label}</h2>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>
          )}
          <Switch>
            {nav.map((item) => <Route key={item.href} path={item.href} component={item.page} />)}
            <Route>
              <Card>
                <CardHeader>
                  <CardTitle>Page not found</CardTitle>
                  <CardDescription>This page doesn't exist or your role can't open it. <Link href={nav[0]?.href ?? "/admin/account"} className="underline">Go back</Link></CardDescription>
                </CardHeader>
              </Card>
            </Route>
          </Switch>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
