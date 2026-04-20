import "@/lib/api";
import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { ThemeProvider } from "@/hooks/use-theme";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Loader2 } from "lucide-react";

// ── Lazy Loaded Pages ─────────────────────────────────────────────────────────

const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Devices = lazy(() => import("@/pages/Devices"));
const SendMessage = lazy(() => import("@/pages/SendMessage"));
const BulkMessages = lazy(() => import("@/pages/BulkMessages"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const AutoReply = lazy(() => import("@/pages/AutoReply"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Webhook = lazy(() => import("@/pages/Webhook"));
const Plugins = lazy(() => import("@/pages/Plugins"));
const ApiDocs = lazy(() => import("@/pages/ApiDocs"));
const Billing = lazy(() => import("@/pages/Billing"));
const Profile = lazy(() => import("@/pages/Profile"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminPackages = lazy(() => import("@/pages/admin/AdminPackages"));
const AdminVouchers = lazy(() => import("@/pages/admin/AdminVouchers"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const ApiSettings = lazy(() => import("@/pages/ApiSettings"));
const DeviceSettings = lazy(() => import("@/pages/DeviceSettings"));
const CsBot = lazy(() => import("@/pages/CsBot"));
const AntiBanned = lazy(() => import("@/pages/AntiBanned"));
const Laporan = lazy(() => import("@/pages/Laporan"));
const LiveChat = lazy(() => import("@/pages/LiveChat"));
const Templates = lazy(() => import("@/pages/Templates"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const ContactGroups = lazy(() => import("@/pages/ContactGroups"));
const DripCampaign = lazy(() => import("@/pages/DripCampaign"));
const Blacklist = lazy(() => import("@/pages/Blacklist"));
const Links = lazy(() => import("@/pages/Links"));
const GroupMessage = lazy(() => import("@/pages/GroupMessage"));
const NumberChecker = lazy(() => import("@/pages/NumberChecker"));
const BotProducts = lazy(() => import("@/pages/BotProducts"));
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AdminLandingPage = lazy(() => import("@/pages/admin/AdminLandingPage"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminTransactions = lazy(() => import("@/pages/admin/AdminTransactions"));
const AdminWaBotCenter = lazy(() => import("@/pages/admin/AdminWaBotCenter"));
const Reseller = lazy(() => import("@/pages/Reseller"));
const GatewayCommand = lazy(() => import("@/pages/GatewayCommand"));

const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center p-8">
    <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role !== "admin") {
    return <DashboardLayout><Unauthorized /></DashboardLayout>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect to="/" />;

  return <>{children}</>;
}

function HomeRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <DashboardLayout><Dashboard /></DashboardLayout>;
  }

  return <LandingPage />;
}

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
          <HomeRoute />
        </Route>
        <Route path="/devices">
          <ProtectedRoute><Devices /></ProtectedRoute>
        </Route>
        <Route path="/send">
          <ProtectedRoute><SendMessage /></ProtectedRoute>
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
        <Route path="/contacts">
          <ProtectedRoute><Contacts /></ProtectedRoute>
        </Route>
        <Route path="/webhook">
          <ProtectedRoute><Webhook /></ProtectedRoute>
        </Route>
        <Route path="/plugins">
          <ProtectedRoute><Plugins /></ProtectedRoute>
        </Route>
        <Route path="/api-docs">
          <ProtectedRoute><ApiDocs /></ProtectedRoute>
        </Route>
        <Route path="/billing">
          <ProtectedRoute><Billing /></ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute><Profile /></ProtectedRoute>
        </Route>
        <Route path="/api-settings">
          <ProtectedRoute><ApiSettings /></ProtectedRoute>
        </Route>
        <Route path="/admin/settings">
          <AdminRoute><AdminSettings /></AdminRoute>
        </Route>
        <Route path="/admin/users">
          <AdminRoute><AdminUsers /></AdminRoute>
        </Route>
        <Route path="/admin/packages">
          <AdminRoute><AdminPackages /></AdminRoute>
        </Route>
        <Route path="/admin/vouchers">
          <AdminRoute><AdminVouchers /></AdminRoute>
        </Route>
        <Route path="/admin/notifications">
          <AdminRoute><AdminNotifications /></AdminRoute>
        </Route>
        <Route path="/admin/landing">
          <AdminRoute><AdminLandingPage /></AdminRoute>
        </Route>
        <Route path="/admin/analytics">
          <AdminRoute><AdminAnalytics /></AdminRoute>
        </Route>
        <Route path="/admin/transactions">
          <AdminRoute><AdminTransactions /></AdminRoute>
        </Route>
        <Route path="/admin/wa-bot-center">
          <AdminRoute><AdminWaBotCenter /></AdminRoute>
        </Route>
        {/* Legacy redirects */}
        <Route path="/admin/server-settings">
          <Redirect to="/admin/settings" />
        </Route>
        <Route path="/admin/update">
          <Redirect to="/admin/settings" />
        </Route>
        <Route path="/admin/payment-gateway">
          <Redirect to="/admin/settings" />
        </Route>
        <Route path="/admin/ai-settings">
          <Redirect to="/admin/settings" />
        </Route>
        <Route path="/device-settings">
          <ProtectedRoute><DeviceSettings /></ProtectedRoute>
        </Route>
        <Route path="/anti-banned">
          <ProtectedRoute><AntiBanned /></ProtectedRoute>
        </Route>
        <Route path="/live-chat">
          <ProtectedRoute><LiveChat /></ProtectedRoute>
        </Route>
        <Route path="/cs-bot">
          <ProtectedRoute><CsBot /></ProtectedRoute>
        </Route>
        <Route path="/laporan">
          <ProtectedRoute><Laporan /></ProtectedRoute>
        </Route>
        <Route path="/templates">
          <ProtectedRoute><Templates /></ProtectedRoute>
        </Route>
        <Route path="/analytics">
          <ProtectedRoute><Analytics /></ProtectedRoute>
        </Route>
        <Route path="/contact-groups">
          <ProtectedRoute><ContactGroups /></ProtectedRoute>
        </Route>
        <Route path="/drip">
          <ProtectedRoute><DripCampaign /></ProtectedRoute>
        </Route>
        <Route path="/reseller">
          <ProtectedRoute><Reseller /></ProtectedRoute>
        </Route>
        <Route path="/blacklist">
          <ProtectedRoute><Blacklist /></ProtectedRoute>
        </Route>
        <Route path="/links">
          <ProtectedRoute><Links /></ProtectedRoute>
        </Route>
        <Route path="/number-checker">
          <ProtectedRoute><NumberChecker /></ProtectedRoute>
        </Route>
        <Route path="/group-message">
          <ProtectedRoute><GroupMessage /></ProtectedRoute>
        </Route>
        <Route path="/bot-products">
          <ProtectedRoute><BotProducts /></ProtectedRoute>
        </Route>
        <Route path="/gateway-command">
          <ProtectedRoute><GatewayCommand /></ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const inner = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <DeviceProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRouter />
            </WouterRouter>
          </DeviceProvider>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );

  return (
    <ThemeProvider>
      {inner}
    </ThemeProvider>
  );
}

export default App;
