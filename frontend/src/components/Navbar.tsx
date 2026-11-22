import { Link, useRouterState } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateTimetable } from "@/data-access/timetables";
import { useUser } from "@/data-access/user";
import { preloadEditorOnIntent } from "@/lib/preloadOnIntent";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { router } from "../router";
import Announcements from "./Announcements";
import { AvatarMenu } from "./AvatarMenu";
import ReportIssue from "./ReportIssue";
import { ThemeButton } from "./ThemeButton";

type User = NonNullable<ReturnType<typeof useUser>["data"]>;

export function NavBar() {
  // mount one bar only, or the announcement fetch and its toast run twice
  const isDesktop = useIsDesktop();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isEditPage =
    pathname.includes("/edit/") || pathname.includes("/finalize/");

  const {
    data: user,
    error: userError,
    isError: isUserError,
    isFetching: isUserFetching,
  } = useUser();

  // a 401 here just means the visitor is logged out, not that something broke
  const isUnauthenticated =
    isUserError &&
    userError instanceof AxiosError &&
    userError.response?.status === 401;

  const { mutate: createTimetable, isPending: isCreating } =
    useCreateTimetable();

  const create = () =>
    createTimetable(void null, {
      onSuccess: (_response) => {
        router.navigate({
          to: "/edit/$timetableId",
          params: { timetableId: _response.data.id },
        });
      },
    });

  if (!isUserFetching && isUserError && !isUnauthenticated) {
    return (
      <ReportIssue
        error={JSON.stringify(
          userError ? userError.message : "user query result is undefined",
        )}
      />
    );
  }

  const props = {
    user,
    showCreate: !!user && !isEditPage,
    isCreating,
    create,
    showLogin: !user && isUnauthenticated,
  };
  return isDesktop ? <DesktopNav {...props} /> : <AppBar {...props} />;
}

type BarProps = {
  user: User | undefined;
  showCreate: boolean;
  isCreating: boolean;
  create: () => void;
  showLogin: boolean;
};

function NavActions({
  user,
  showCreate,
  isCreating,
  create,
  showLogin,
  createButton,
}: BarProps & {
  createButton: (props: {
    disabled: boolean;
    onClick: () => void;
  }) => React.ReactNode;
}) {
  if (!user) {
    return (
      <>
        <ThemeButton />
        {showLogin && (
          <Button variant="quiet" size="sm" asChild>
            <Link to="/login">Login</Link>
          </Button>
        )}
      </>
    );
  }
  return (
    <>
      {showCreate && createButton({ disabled: isCreating, onClick: create })}
      <Announcements />
      <AvatarMenu user={user} />
    </>
  );
}

function AppBar(props: BarProps) {
  return (
    <header
      data-shot="navbar"
      className="app-navbar flex h-[52px] w-full shrink-0 items-center justify-between border-b border-line bg-bg px-4"
    >
      <div className="flex items-center gap-1">
        {props.user ? (
          <Link
            to="/"
            className="relative flex h-11 items-center text-[19px] font-medium tracking-[-0.02em] text-ink"
          >
            Chrono
          </Link>
        ) : (
          <span className="text-[19px] font-medium tracking-[-0.02em] text-ink">
            Chrono
          </span>
        )}
        <Button variant="quiet" size="icon" aria-label="About" asChild>
          <Link to="/about">
            <Info />
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <NavActions
          {...props}
          createButton={(button) => (
            <Button
              size="icon"
              aria-label="Create a timetable"
              {...button}
              {...preloadEditorOnIntent()}
            >
              <Plus className="size-5" />
            </Button>
          )}
        />
      </div>
    </header>
  );
}

function DesktopNav(props: BarProps) {
  return (
    <header
      data-shot="navbar"
      className="app-navbar flex h-[60px] w-full shrink-0 items-center gap-8 border-b border-line bg-bg px-7"
    >
      {props.user ? (
        <Link
          to="/"
          className="text-[20px] font-medium tracking-[-0.025em] text-ink"
        >
          ChronoFactorem
        </Link>
      ) : (
        <span className="text-[20px] font-medium tracking-[-0.025em] text-ink">
          ChronoFactorem
        </span>
      )}
      <nav className="flex h-full items-center gap-6" aria-label="Main">
        {props.user && (
          <Link to="/" className="nav-link">
            Timetables
          </Link>
        )}
        <Link to="/about" className="nav-link">
          About
        </Link>
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <NavActions
          {...props}
          createButton={(button) => (
            <Button
              size="sm"
              {...button}
              {...preloadEditorOnIntent()}
              className="mr-1"
            >
              <Plus />
              Create a timetable
            </Button>
          )}
        />
      </div>
    </header>
  );
}
