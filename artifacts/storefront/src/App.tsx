import { lazy, Suspense } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isUnauthorized } from "@/lib/api-error";
import { SettingsProvider } from "@/lib/theme";
import StorefrontPage from "@/storefront/storefront-page";
import { OrderPage, TrackPage, UnsubscribePage } from "@/storefront/customer-pages";
import NotFound from "@/pages/not-found";

// The admin area is loaded only when someone visits /admin, keeping the shop fast.
const AdminApp = lazy(() => import("@/admin/admin-app"));

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // If any admin request says "not logged in" (session expired), re-check the session so the login screen shows.
    onError: (error, query) => {
      if (isUnauthorized(error) && query.queryKey[0] !== getGetSessionQueryKey()[0]) {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      }
    },
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: (count, error) => !isUnauthorized(error) && count < 2 } },
});

function AdminFallback() {
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading admin…</div>;
}

function LazyAdmin() {
  return (
    <Suspense fallback={<AdminFallback />}>
      <AdminApp />
    </Suspense>
  );
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={StorefrontPage} />
      <Route path="/order/:code" component={OrderPage} />
      <Route path="/track" component={TrackPage} />
      <Route path="/unsubscribe" component={UnsubscribePage} />
      <Route path="/admin" component={LazyAdmin} />
      <Route path="/admin/*" component={LazyAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SettingsProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Routes />
          </WouterRouter>
          <Toaster theme="light" richColors position="top-right" closeButton />
        </SettingsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
