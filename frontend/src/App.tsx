import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
/*
  Route-level code splitting. Everything used to land in one 994 kB bundle, so a
  phone paid for Recharts (Money charts) and the markdown renderer (Notes) just
  to open the dashboard. Each route is now its own chunk, fetched on navigation
  and then cached by the service worker under its hashed filename.
*/
// Eager: the landing page is the prerendered entry point, so lazy-loading it
// would mean shipping a static page that still waits on a second request.
import Landing from "@/pages/Landing";

const Login = lazy(() => import("@/pages/Login"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MoneyLayout = lazy(() => import("@/pages/money/MoneyLayout"));
const MoneyOverview = lazy(() => import("@/pages/money/MoneyOverview"));
const Transactions = lazy(() => import("@/pages/money/Transactions"));
const Recurring = lazy(() => import("@/pages/money/Recurring"));
const Budgets = lazy(() => import("@/pages/money/Budgets"));
const Loans = lazy(() => import("@/pages/money/Loans"));
const Goals = lazy(() => import("@/pages/money/Goals"));
const Investments = lazy(() => import("@/pages/money/Investments"));
const TasksLayout = lazy(() => import("@/pages/tasks/TasksLayout"));
const Today = lazy(() => import("@/pages/tasks/Today"));
const Upcoming = lazy(() => import("@/pages/tasks/Upcoming"));
const Inbox = lazy(() => import("@/pages/tasks/Inbox"));
const Project = lazy(() => import("@/pages/tasks/Project"));
const LabelView = lazy(() => import("@/pages/tasks/LabelView"));
const NotesLayout = lazy(() => import("@/pages/notes/NotesLayout"));
const NotesList = lazy(() => import("@/pages/notes/NotesList"));
const NoteEditor = lazy(() => import("@/pages/notes/NoteEditor"));
const ChecklistsList = lazy(() => import("@/pages/checklists/ChecklistsList"));
const ChecklistDetail = lazy(
  () => import("@/pages/checklists/ChecklistDetail"),
);
const MemoriesList = lazy(() => import("@/pages/memories/MemoriesList"));

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
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/*
  The route tree, minus the router itself. Exported so the build-time prerender
  (src/prerender.tsx) renders the exact same structure the browser hydrates —
  when the two differ at all, React throws the whole server markup away and
  re-renders from scratch, which is worse than not prerendering.
*/
export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public, indexable routes — the only ones a crawler ever sees. */}
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />

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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/money" element={<MoneyLayout />}>
            <Route index element={<MoneyOverview />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="loans" element={<Loans />} />
            <Route path="goals" element={<Goals />} />
            <Route path="investments" element={<Investments />} />
          </Route>
          <Route path="/tasks" element={<TasksLayout />}>
            <Route index element={<Today />} />
            <Route path="upcoming" element={<Upcoming />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="project/:id" element={<Project />} />
            <Route path="label/:id" element={<LabelView />} />
          </Route>
          <Route path="/notes" element={<NotesLayout />}>
            <Route index element={<NotesList />} />
            <Route path=":id" element={<NoteEditor />} />
          </Route>
          <Route path="/checklists" element={<ChecklistsList />} />
          <Route path="/checklists/:id" element={<ChecklistDetail />} />
          <Route path="/memories" element={<MemoriesList />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
