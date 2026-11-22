import { Link } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Shuffle, Sun, User } from "lucide-react";
import { useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { courseHues, hueStyle } from "@/lib/courseHues";

const PREVIEW_CODES = ["CS F213", "MATH F211", "CS F215", "ECON F211"];

const THEMES = [
  { value: "light", name: "Light", Icon: Sun },
  { value: "dark", name: "Dark", Icon: Moon },
  { value: "system", name: "Auto", Icon: Monitor },
] as const;

type Theme = (typeof THEMES)[number]["value"];

const OPTIONS = THEMES.map(({ value, name, Icon }) => ({
  value,
  label: (
    <>
      <Icon className="size-3.5" />
      {name}
    </>
  ),
}));

export function AvatarMenu({ user }: { user: { name: string } }) {
  const { theme, setTheme, colorSeed, shuffleColors } = useTheme();
  const themeIndex = THEMES.findIndex((t) => t.value === theme);
  const themeName = THEMES[themeIndex]?.name;
  const previewHues = [...courseHues(PREVIEW_CODES, colorSeed).values()];
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const change = (next: Theme, fallback: HTMLElement) => {
    const r = fallback.getBoundingClientRect();
    setTheme(
      next,
      pointer.current ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    );
    pointer.current = null;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="My account"
          className="relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-sunk text-base font-semibold text-ink transition-colors duration-(--d-1) after:absolute after:-inset-[4px] after:content-[''] hover:bg-line lg:size-8 lg:text-sm lg:after:hidden"
        >
          <span aria-hidden="true">{user.name[0]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          My Account
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/editProfile">
            <User className="size-4" />
            <span>Edit Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          // an item so arrow keys reach the row; left/right then change the theme
          className="my-1 p-0 focus:bg-transparent"
          onSelect={(e) => e.preventDefault()}
          aria-label={`Theme: ${themeName}`}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) {
              // the Segmented handles these itself; keep Radix from also
              // moving focus between menu items
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.stopPropagation();
              }
              return;
            }
            const step =
              e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            e.stopPropagation();
            change(THEMES[(themeIndex + step + 3) % 3].value, e.currentTarget);
          }}
          onPointerDownCapture={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
          }}
        >
          <Segmented
            size="sm"
            aria-label="Theme"
            className="w-full"
            value={theme}
            options={OPTIONS}
            onValueChange={(v) => {
              const el = document.activeElement as HTMLElement | null;
              change(v, el ?? document.body);
            }}
          />
          <span role="status" className="sr-only">
            {`Theme: ${themeName}`}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            shuffleColors();
          }}
        >
          <Shuffle className="size-4" />
          <span className="flex-1">Shuffle colours</span>
          <span aria-hidden="true" className="flex items-center gap-1">
            {previewHues.map((hue, i) => (
              <span
                key={PREVIEW_CODES[i]}
                className="course-tint size-2.5 rounded-[3px] bg-(--swatch)"
                style={hueStyle(hue)}
              />
            ))}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            // the backend clears the auth cookies and ends the logto sso session
            window.location.href = "/api/auth/logout";
          }}
        >
          <LogOut className="size-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
