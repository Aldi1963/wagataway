import "@/lib/api";
import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { ThemeProvider } from "@/hooks/use-theme";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import Dashboard from "@/pages/Dashboard";
import Devices from "@/pages/Devices";
import SendMessage from "@/pages/SendMessage";
import BulkMessages from "@/pages/BulkMessages";
import Schedule from "@/pages/Schedule";
import AutoReply from "@/pages/AutoReply";
import Contacts from "@/pages/Contacts";
import Webhook from "@/pages/Webhook";
import Plugins from "@/pages/Plugins";
import ApiDocs from "@/pages/ApiDocs";
import Billing from "@/pages/Billing";
import Profile from "@/pages/Profile";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminPackages from "@/pages/admin/AdminPackages";
import AdminVouchers from "@/pages/admin/AdminVouchers";
import AdminNotifications from "@/pages/admin/AdminNotifications";
import ApiSettings from "@/pages/ApiSettings";
import DeviceSettings from "@/pages/DeviceSettings";
import CsBot from "@/pages/CsBot";
import AntiBanned from "@/pages/AntiBanned";
import Laporan from "@/pages/Laporan";
import LiveChat from "@/pages/LiveChat";
import Templates from "@/pages/Templates";
import Analytics from "@/pages/Analytics";
import ContactGroups from "@/pages/ContactGroups";
import DripCampaign from "@/pages/DripCampaign";
import Blacklist from "@/pages/Blacklist";
import Links from "@/pages/Links";
import GroupMessage from "@/pages/GroupMessage";
import NumberChecker from "@/pages/NumberChecker";
import BotProducts from "@/pages/BotProducts";
import Unauthorized from "@/pages/Unauthorized";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import AdminLandingPage from "@/pages/admin/AdminLandingPage";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminTransactions from "@/pages/admin/AdminTransactions";
import AdminWaBotCenter from "@/pages/admin/AdminWaBotCenter";
import Reseller from "@/pages/Reseller";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [googleClientId, setGoogleClientId] = useState(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""
  );

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => { if (d.googleClientId) setGoogleClientId(d.googleClientId); })
      .catch(() => {});
  }, []);

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
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          {inner}
        </GoogleOAuthProvider>
      ) : (
        inner
      )}
    </ThemeProvider>
  );
}

export default App;
