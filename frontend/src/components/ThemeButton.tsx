import { Moon, Sun } from "lucide-react";
import { useSystemTheme, useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";

export function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const system = useSystemTheme();
  const isDark = (theme === "system" ? system : theme) === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label="Toggle theme"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTheme(isDark ? "light" : "dark", {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      }}
    >
      <Icon />
    </Button>
  );
}
