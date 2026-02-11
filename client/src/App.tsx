import { DesignModeCapture } from "@/components/design/DesignModeCapture";
import { DesignPanel } from "@/components/design/DesignPanel";
import { DesignModeToggle } from "@/components/design/DesignModeToggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { DesignModeProvider } from "./contexts/DesignModeContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import GameArena from "./pages/GameArena";
import Admin from "./pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/arena"} component={GameArena} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <DesignModeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <DesignModeCapture />
            <DesignPanel />
            <DesignModeToggle />
          </TooltipProvider>
        </DesignModeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
