import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/kit';
import OverviewPage from '@/pages/overview';
import { CoursesPage, ProfessorsPage } from '@/pages/directory';
import ProfessorPage from '@/pages/professor';
import CoursePage from '@/pages/course';
import MethodologyPage from '@/pages/methodology';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/professors" component={ProfessorsPage} />
          <Route path="/professors/:id" component={ProfessorPage} />
          <Route path="/courses" component={CoursesPage} />
          <Route path="/courses/:id" component={CoursePage} />
          <Route path="/methodology" component={MethodologyPage} />
          {/* After the exam is temporarily disabled; keep its implementation and saved feedback intact. */}
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
