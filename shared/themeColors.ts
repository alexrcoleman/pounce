export const FELT_GREEN_THEME_COLOR = "#0a4624";
export const TABLE_TAN_THEME_COLOR = "#cd9b60";

const FELT_GREEN_PATHNAMES = new Set([
  "/",
  "/how-to-play",
  "/join",
  "/join/[roomid]",
]);

export function getPageThemeColor(pathname: string): string {
  return FELT_GREEN_PATHNAMES.has(pathname)
    ? FELT_GREEN_THEME_COLOR
    : TABLE_TAN_THEME_COLOR;
}
