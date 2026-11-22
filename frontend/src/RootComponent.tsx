import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { NavBar } from "./components/Navbar";
import { Toaster } from "./components/ui/toaster";

export default function RootComponent() {
  // useRouterState re-renders on navigation, reading router.state doesn't
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showNavbar = pathname !== "/login" && pathname !== "/getDegrees";

  return (
    <div className="min-h-dvh flex flex-col">
      <Toaster />
      {showNavbar && <NavBar />}
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <ReactQueryDevtools buttonPosition="bottom-right" />
          <TanStackRouterDevtools position="bottom-left" />
        </>
      )}
    </div>
  );
}
