import { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import lazyWithRetry from "@/lib/lazyWithRetry";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { syncDocumentMeta } from "@/lib/seo";
/*
  Route-level code splitting. Everything used to land in one 994 kB bundle, so a
  phone paid for Recharts (Money charts) and the markdown renderer (Notes) just
  to open the dashboard. Each route is now its own chunk, fetched on navigation
  and then cached by the service worker under its hashed filename.
*/
// Eager: the landing page is the prerendered entry point, so lazy-loading it
// would mean shipping a static page that still waits on a second request.
import Landing from "@/pages/Landing";
import EmiCalculator from "@/pages/EmiCalculator";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
/*
  The calculators are public, prerendered and heavily interlinked, so they share
  the landing page's eager treatment: a lazy chunk here would mean a crawler (and
  a visitor arriving from search) waiting on a second request for the content
  that is the entire reason the page exists.
*/
import CalculatorsHub, { CalculatorRoute } from "@/pages/calculators/CalculatorsHub";

const Login = lazyWithRetry(() => import("@/pages/Login"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const ForgotPassword = lazyWithRetry(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));
const VerifyEmail = lazyWithRetry(() => import("@/pages/VerifyEmail"));
// Unlinked and never prerendered — see pages/Admin.tsx.
const Admin = lazyWithRetry(() => import("@/pages/Admin"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const MoneyLayout = lazyWithRetry(() => import("@/pages/money/MoneyLayout"));
const MoneyOverview = lazyWithRetry(() => import("@/pages/money/MoneyOverview"));
const Transactions = lazyWithRetry(() => import("@/pages/money/Transactions"));
const Recurring = lazyWithRetry(() => import("@/pages/money/Recurring"));
const Budgets = lazyWithRetry(() => import("@/pages/money/Budgets"));
const Loans = lazyWithRetry(() => import("@/pages/money/Loans"));
const Goals = lazyWithRetry(() => import("@/pages/money/Goals"));
const Investments = lazyWithRetry(() => import("@/pages/money/Investments"));
const TasksLayout = lazyWithRetry(() => import("@/pages/tasks/TasksLayout"));
const Today = lazyWithRetry(() => import("@/pages/tasks/Today"));
const Upcoming = lazyWithRetry(() => import("@/pages/tasks/Upcoming"));
const Inbox = lazyWithRetry(() => import("@/pages/tasks/Inbox"));
const Project = lazyWithRetry(() => import("@/pages/tasks/Project"));
const LabelView = lazyWithRetry(() => import("@/pages/tasks/LabelView"));
const NotesLayout = lazyWithRetry(() => import("@/pages/notes/NotesLayout"));
const NotesList = lazyWithRetry(() => import("@/pages/notes/NotesList"));
const NoteEditor = lazyWithRetry(() => import("@/pages/notes/NoteEditor"));
const ChecklistsList = lazyWithRetry(() => import("@/pages/checklists/ChecklistsList"));
const ChecklistDetail = lazyWithRetry(() => import("@/pages/checklists/ChecklistDetail"));
const MemoriesList = lazyWithRetry(() => import("@/pages/memories/MemoriesList"));
const MealsLayout = lazyWithRetry(() => import("@/pages/meals/MealsLayout"));
const MealsToday = lazyWithRetry(() => import("@/pages/meals/MealsToday"));
const MealsTrends = lazyWithRetry(() => import("@/pages/meals/MealsTrends"));
const FoodLibrary = lazyWithRetry(() => import("@/pages/meals/FoodLibrary"));

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, verificationRequired } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  /*
    When the server locks unverified accounts out of their data, the app has to
    say so rather than let them in and fail. Skipping the code at signup used to
    land people on a dashboard where every panel returned 403 and the only clue
    was a banner — the door was locked, and the UI pretended otherwise.

    `=== false` rather than a falsy check: the field is absent on sessions from
    before verification shipped, and those accounts are not unverified.
  */
  if (verificationRequired && user.email_verified === false && pathname !== "/verify-email") {
    return <Navigate to="/verify-email" replace />;
  }
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
/** Title and canonical follow the route, not just the initial HTML. */
/** /money/transactions/:id, the shape the details modal used to have. */
function TransactionRedirect() {
  const { id } = useParams();
  return <Navigate to={`/money/transactions?view_id=${id}`} replace />;
}

function DocumentMeta() {
  const { pathname } = useLocation();
  useEffect(() => syncDocumentMeta(pathname), [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <DocumentMeta />
      <Routes>
        {/* Public, indexable routes — the only ones a crawler ever sees. */}
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/emi-calculator" element={<EmiCalculator />} />
        <Route path="/calculators" element={<CalculatorsHub />} />
        <Route path="/calculators/:slug" element={<CalculatorRoute />} />

        {/* Reachable while signed out — a locked-out user has no session. */}
        <Route
          path="/forgot"
          element={
            <PublicOnly>
              <ForgotPassword />
            </PublicOnly>
          }
        />
        <Route path="/reset" element={<ResetPassword />} />

        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <Admin />
            </Protected>
          }
        />
        <Route
          path="/verify-email"
          element={
            <Protected>
              <VerifyEmail />
            </Protected>
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
            {/*
              The details modal used to be a path segment and is now ?view_id=
              (see pages/money/Transactions.tsx). This keeps every link written
              in the old shape working — search results people bookmarked, and
              anything already shared.
            */}
            <Route path="transactions/:id" element={<TransactionRedirect />} />
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
          <Route path="/meals" element={<MealsLayout />}>
            <Route index element={<MealsToday />} />
            <Route path="trends" element={<MealsTrends />} />
            <Route path="foods" element={<FoodLibrary />} />
          </Route>
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
