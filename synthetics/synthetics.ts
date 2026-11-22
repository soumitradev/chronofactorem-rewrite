import { readFile } from "node:fs/promises";
import type { Page } from "playwright";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const setTheme = async (page: Page, theme: Theme) => {
  await page.emulateMedia({ colorScheme: theme });
  await page.waitForFunction(
    (name) => document.documentElement.classList.contains(name),
    theme,
  );
};

// one synthetic = one screen worth looking at. Currently written for the starter-pack
// seed scenario. `as` is a user key from that scenario, or the email of someone
// who hasn't signed up yet (omit it to stay logged out), and `{key}` in the
// url becomes the id of that seeded timetable. `act` runs after the page
// settles, for screens that need interactions to reach. announcements default
// to read so their toast doesn't cover every screen, unless
// `unreadAnnouncements` is set. `hide` covers parts that are on screen but not
// what the synthetic is about, see `Part`
export type Synthetic = {
  name: string;
  as?: string;
  url: string;
  act?: (page: Page) => Promise<void>;
  unreadAnnouncements?: boolean;
  hide?: Part[];
};

// parts that show up on most screens, marked with data-shot in the frontend
// ("grid" covers the phone day and week controls too).
// each is left visible on a few synthetics that are about it and hidden
// behind a hatch everywhere else, so a change to one only touches its own
// synthetics' screenshots instead of most of them. a new synthetic that hides
// nothing is always safe, it just shows more
export type Part = "navbar" | "timetable-header" | "grid" | "side-menu";

// on phones the side menu lives behind a button
const openMenu = async (page: Page) => {
  const menu = page.getByRole("button", { name: "Courses and exams" });
  const tabs = page.getByRole("tablist", { name: "Timetable details" });
  await menu.or(tabs).first().waitFor();
  if (await menu.isVisible()) await menu.click();
};

const openTab = (name: string) => async (page: Page) => {
  await openMenu(page);
  await page.getByRole("tab", { name }).click();
};

// the search box is debounced into ?q=, and the results only filter once
// that lands
const search = async (page: Page, term: string) => {
  await openMenu(page);
  await page.getByRole("searchbox", { name: "Search Courses" }).fill(term);
  await page.waitForURL((url) => url.searchParams.get("q") === term);
};

const openCourse = async (page: Page, code: string, title: string) => {
  await search(page, code);
  await page.getByText(title).first().click();
  await page.getByRole("heading", { name: title }).waitFor();
};

const openAddedCourse = async (page: Page, name: RegExp, code: string) => {
  await openMenu(page);
  // grid blocks share the course name, so stay inside the menu
  await page.getByRole("tabpanel").getByRole("button", { name }).click();
  const removeButton = page.getByRole("button", {
    name: `Remove ${code} from timetable`,
  });
  await removeButton.waitFor();
  return removeButton;
};

// the desktop grid with days across; phones and tablets have no toggle
const vertical = async (page: Page) => {
  const toggle = page.getByLabel("Make timetable vertical");
  if (await toggle.isVisible()) await toggle.click();
};

export const synthetics: Synthetic[] = [
  { name: "login", url: "/login" },
  { name: "about", url: "/about" },
  { name: "not-found", url: "/this-page-does-not-exist", hide: ["navbar"] },
  {
    name: "get-degrees",
    as: "f20260004@hyderabad.bits-pilani.ac.in",
    url: "/getDegrees?year=1",
  },

  {
    name: "home",
    as: "alice",
    url: "/",
    unreadAnnouncements: true,
    // the toast closes itself after a few seconds, hovering keeps it open
    // for each theme's shot
    act: (page) => page.getByText("New Announcements", { exact: true }).hover(),
  },
  { name: "home-empty", as: "esha", url: "/", hide: ["navbar"] },
  { name: "home-higher-degree", as: "hd", url: "/", hide: ["navbar"] },
  { name: "edit-profile", as: "alice", url: "/editProfile", hide: ["navbar"] },

  {
    name: "edit-empty",
    as: "alice",
    url: "/edit/{alice-empty}",
    hide: ["navbar", "timetable-header"],
  },
  {
    name: "edit-warnings",
    as: "alice",
    url: "/edit/{alice-warnings}",
    hide: ["navbar", "grid"],
  },
  { name: "edit-packed", as: "alice", url: "/edit/{alice-packed}" },
  {
    name: "edit-long-name",
    as: "alice",
    url: "/edit/{alice-long-name}",
    hide: ["navbar", "grid", "side-menu"],
  },
  {
    name: "edit-dual-degree",
    as: "bob",
    url: "/edit/{bob-draft}",
    hide: ["navbar", "grid"],
  },
  {
    name: "edit-higher-degree",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "grid"],
  },
  {
    name: "edit-search",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: (page) => search(page, "CS F"),
  },
  {
    name: "edit-course-clashes",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: (page) => openCourse(page, "CS F407", "Artificial Intelligence"),
  },
  {
    name: "edit-search-focus",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: async (page) => {
      await openMenu(page);
      await page.getByRole("searchbox", { name: "Search Courses" }).focus();
    },
  },
  {
    name: "edit-course-back-hover",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: async (page) => {
      await openCourse(page, "CS F407", "Artificial Intelligence");
      await page.getByRole("button", { name: "Back" }).hover();
    },
  },
  // MEL G643 has the longest course name in the scenario, and no practical
  // yet so it shows up in the warnings too
  { name: "edit-long-course-name", as: "hd", url: "/edit/{hd-draft}" },
  {
    name: "edit-long-course-name-vertical",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "side-menu"],
    act: vertical,
  },
  {
    name: "edit-long-course-name-courses",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "timetable-header", "grid"],
    act: openMenu,
  },
  {
    name: "edit-long-course-name-picker",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "timetable-header", "grid"],
    act: async (page) => {
      await openMenu(page);
      // the phone agenda behind the sheet has the code too
      await page
        .locator("[data-course-id]")
        .filter({ hasText: "MEL G643" })
        .first()
        .click();
      await page
        .getByRole("heading", { name: /^Verification, Test/ })
        .waitFor();
    },
  },
  {
    name: "edit-long-course-name-exams",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "timetable-header", "grid"],
    act: openTab("Exams"),
  },
  {
    name: "edit-long-course-name-warnings",
    as: "hd",
    url: "/edit/{hd-draft}",
    hide: ["navbar", "grid"],
    act: async (page) => {
      await page.getByRole("button", { name: /warnings$/ }).click();
      await page.getByText("is missing a P section").first().waitFor();
    },
  },
  {
    name: "edit-courses",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: openMenu,
  },
  {
    name: "edit-course-added",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: async (page) => {
      await openAddedCourse(page, /^Object Oriented Prog/, "CS F213");
    },
  },
  {
    name: "edit-course-removed",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: async (page) => {
      // devices share the seeded timetable, so fake the removal
      let removed: string | undefined;
      await page.route("**/api/timetable/*/removeCourse", (route) => {
        removed = route.request().postDataJSON().courseId;
        return route.fulfill({
          json: { message: "course removed", sectionIds: [] },
        });
      });
      await page.route(/\/api\/timetable\/[^/]+$/, async (route) => {
        if (removed === undefined) return route.fallback();
        const response = await route.fetch();
        const timetable = await response.json();
        timetable.sections = timetable.sections.filter(
          (section: { courseId: string }) => section.courseId !== removed,
        );
        return route.fulfill({ response, json: timetable });
      });
      const removeButton = await openAddedCourse(
        page,
        /^Object Oriented Prog/,
        "CS F213",
      );
      await removeButton.click();
      await page.getByText("Added · 8", { exact: true }).waitFor();
      // hovering keeps the toast open for each theme's shot
      await page.getByText("Removed CS F213", { exact: true }).hover();
    },
  },
  {
    name: "edit-exams",
    as: "alice",
    url: "/edit/{alice-packed}",
    hide: ["navbar", "timetable-header", "grid"],
    act: openTab("Exams"),
  },
  {
    name: "finalize",
    as: "alice",
    url: "/finalize/{alice-packed}",
    hide: ["navbar"],
  },

  {
    name: "view-own",
    as: "alice",
    url: "/view/{alice-public}",
    hide: ["navbar"],
  },
  {
    // the downloaded png in each theme, shown in place of the page. vertical,
    // where the blocks have room for course names
    name: "view-export",
    as: "alice",
    url: "/view/{alice-public}",
    act: async (page) => {
      await vertical(page);
      const images: string[] = [];
      for (const theme of THEMES) {
        await setTheme(page, theme);
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "PNG" }).first().click();
        const download = await downloadPromise;
        images.push(await readFile(await download.path(), "base64"));
      }
      await page.emulateMedia({ colorScheme: THEMES[0] });
      const img = (png: string) =>
        `<img style="display:block;width:100%" src="data:image/png;base64,${png}">`;
      // both theme classes, so the runner's wait for each theme passes
      await page.setContent(
        `<html class="light dark"><body style="margin:0">${images.map(img).join("")}</body></html>`,
      );
    },
  },
  {
    name: "view-someone-else",
    as: "bob",
    url: "/view/{alice-public}",
    hide: ["navbar", "grid", "side-menu"],
  },
  {
    name: "view-logged-out",
    url: "/view/{alice-public}",
    hide: ["grid", "side-menu"],
  },
  {
    name: "view-private-by-link",
    as: "bob",
    url: "/view/{alice-private}",
    hide: ["navbar", "grid", "side-menu"],
  },
  {
    name: "view-draft-blocked",
    as: "bob",
    url: "/view/{alice-warnings}",
    hide: ["navbar"],
  },
  {
    name: "view-archived",
    as: "alice",
    url: "/view/{alice-archived}",
    hide: ["navbar", "grid", "side-menu"],
  },
];
