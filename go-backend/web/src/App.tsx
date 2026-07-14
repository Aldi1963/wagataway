import { lazy, Suspense } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// ── Lazy Pages ────────────────────────────────────────────────────────────────
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Devices = lazy(() => import("@/pages/Devices"));
const SendMessage = lazy(() => import("@/pages/SendMessage"));
const BulkMessages = lazy(() => import("@/pages/BulkMessages"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactGroups = lazy(() => import("@/pages/ContactGroups"));
const AutoReply = lazy(() => import("@/pages/AutoReply"));
const Templates = lazy(() => import("@/pages/Templates"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const LiveChat = lazy(() => import("@/pages/LiveChat"));
const DripCampaign = lazy(() => import("@/pages/DripCampaign"));
const Links = lazy(() => import("@/pages/Links"));
const Blacklist = lazy(() => import("@/pages/Blacklist"));
const Billing = lazy(() => import("@/pages/Billing"));
const Webhooks = lazy(() => import("@/pages/Webhooks"));
const Profile = lazy(() => import("@/pages/Profile"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ── Loading ───────────────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Route Guards ──────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  return <DashboardLayout>{children}</DashboardLayout>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
}

// ── Query Client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

// ── App Router ────────────────────────────────────────────────────────────────
function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login">
          <GuestRoute><Login /></GuestRoute>
        </Route>
        <Route path="/register">
          <GuestRoute><Register /></GuestRoute>
        </Route>
        <Route path="/">
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        </Route>
        <Route path="/devices">
          <ProtectedRoute><Devices /></ProtectedRoute>
        </Route>
        <Route path="/send">
          <ProtectedRoute><SendMessage /></ProtectedRoute>
        </Route>
        <Route path="/contacts">
          <ProtectedRoute><Contacts /></ProtectedRoute>
        </Route>
        <Route path="/contact-groups">
          <ProtectedRoute><ContactGroups /></ProtectedRoute>
        </Route>
        <Route path="/bulk">
          <ProtectedRoute><BulkMessages /></ProtectedRoute>
        </Route>
        <Route path="/schedule">
          <ProtectedRoute><Schedule /></ProtectedRoute>
        </Route>
        <Route path="/auto-reply">
          <ProtectedRoute><AutoReply /></ProtectedRoute>
        </Route>
        <Route path="/templates">
          <ProtectedRoute><Templates /></ProtectedRoute>
        </Route>
        <Route path="/analytics">
          <ProtectedRoute><Analytics /></ProtectedRoute>
        </Route>
        <Route path="/live-chat">
          <ProtectedRoute><LiveChat /></ProtectedRoute>
        </Route>
        <Route path="/drip">
          <ProtectedRoute><DripCampaign /></ProtectedRoute>
        </Route>
        <Route path="/links">
          <ProtectedRoute><Links /></ProtectedRoute>
        </Route>
        <Route path="/blacklist">
          <ProtectedRoute><Blacklist /></ProtectedRoute>
        </Route>
        <Route path="/billing">
          <ProtectedRoute><Billing /></ProtectedRoute>
        </Route>
        <Route path="/webhook">
          <ProtectedRoute><Webhooks /></ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute><Profile /></ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter>
            <AppRouter />
          </WouterRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
