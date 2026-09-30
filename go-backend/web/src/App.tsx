import { lazy, Suspense } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ActiveDeviceProvider } from "@/hooks/use-active-device";
import { ThemeProvider } from "@/hooks/use-theme";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Toaster } from "sonner";

// ── Lazy Pages ────────────────────────────────────────────────────────────────
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const OAuthCallback = lazy(() => import("@/pages/OAuthCallback"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Send = lazy(() => import("@/pages/Send"));
const ScheduleHub = lazy(() => import("@/pages/ScheduleHub"));
const ContactsHub = lazy(() => import("@/pages/ContactsHub"));
const AutoReply = lazy(() => import("@/pages/AutoReply"));
const Templates = lazy(() => import("@/pages/Templates"));
const FileManager = lazy(() => import("@/pages/FileManager"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const LiveChat = lazy(() => import("@/pages/LiveChat"));
const Links = lazy(() => import("@/pages/Links"));
const Admin = lazy(() => import("@/pages/Admin"));
const Billing = lazy(() => import("@/pages/Billing"));
const ApiDocs = lazy(() => import("@/pages/ApiDocs"));
const Settings = lazy(() => import("@/pages/Settings"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Landing = lazy(() => import("@/pages/Landing"));

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

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;

  return <DashboardLayout>{children}</DashboardLayout>;
}

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Landing />;
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
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
        <Route path="/forgot-password">
          <GuestRoute><ForgotPassword /></GuestRoute>
        </Route>
        <Route path="/reset-password">
          <GuestRoute><ResetPassword /></GuestRoute>
        </Route>
        <Route path="/oauth/callback">
          <OAuthCallback />
        </Route>
        <Route path="/">
          <HomeRoute />
        </Route>
        <Route path="/send">
          <ProtectedRoute><Send /></ProtectedRoute>
        </Route>
        <Route path="/contacts">
          <ProtectedRoute><ContactsHub /></ProtectedRoute>
        </Route>
        <Route path="/contact-groups">
          <ProtectedRoute><ContactsHub /></ProtectedRoute>
        </Route>
        <Route path="/bulk">
          <ProtectedRoute><Send /></ProtectedRoute>
        </Route>
        <Route path="/schedule">
          <ProtectedRoute><ScheduleHub /></ProtectedRoute>
        </Route>
        <Route path="/auto-reply">
          <ProtectedRoute><AutoReply /></ProtectedRoute>
        </Route>
        <Route path="/templates">
          <ProtectedRoute><Templates /></ProtectedRoute>
        </Route>
        <Route path="/files">
          <ProtectedRoute><FileManager /></ProtectedRoute>
        </Route>
        <Route path="/analytics">
          <ProtectedRoute><Analytics /></ProtectedRoute>
        </Route>
        <Route path="/live-chat">
          <ProtectedRoute><LiveChat /></ProtectedRoute>
        </Route>
        <Route path="/drip">
          <ProtectedRoute><ScheduleHub /></ProtectedRoute>
        </Route>
        <Route path="/links">
          <ProtectedRoute><Links /></ProtectedRoute>
        </Route>
        <Route path="/blacklist">
          <ProtectedRoute><ContactsHub /></ProtectedRoute>
        </Route>
        <Route path="/billing">
          <ProtectedRoute><Billing /></ProtectedRoute>
        </Route>
        <Route path="/api-docs">
          <ApiDocs />
        </Route>
        <Route path="/notifications">
          <ProtectedRoute><Notifications /></ProtectedRoute>
        </Route>
        <Route path="/profile">
          <Redirect to="/settings" />
        </Route>
        <Route path="/settings">
          <ProtectedRoute><Settings /></ProtectedRoute>
        </Route>
        <Route path="/admin">
          <AdminRoute><Admin /></AdminRoute>
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
          <ActiveDeviceProvider>
          <WouterRouter>
            <AppRouter />
            <Toaster position="top-center" richColors />
          </WouterRouter>
          </ActiveDeviceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
