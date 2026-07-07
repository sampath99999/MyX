import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MoneyLayout from "@/pages/money/MoneyLayout";
import MoneyOverview from "@/pages/money/MoneyOverview";
import Transactions from "@/pages/money/Transactions";
import Recurring from "@/pages/money/Recurring";
import Budgets from "@/pages/money/Budgets";
import Loans from "@/pages/money/Loans";
import Goals from "@/pages/money/Goals";
import TasksLayout from "@/pages/tasks/TasksLayout";
import Today from "@/pages/tasks/Today";
import Inbox from "@/pages/tasks/Inbox";
import Project from "@/pages/tasks/Project";

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/money" element={<MoneyLayout />}>
              <Route index element={<MoneyOverview />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="recurring" element={<Recurring />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="loans" element={<Loans />} />
              <Route path="goals" element={<Goals />} />
            </Route>
            <Route path="/tasks" element={<TasksLayout />}>
              <Route index element={<Today />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="project/:id" element={<Project />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
