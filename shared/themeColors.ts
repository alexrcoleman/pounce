export const FELT_GREEN_THEME_COLOR = "#16593c";
export const TABLE_TAN_THEME_COLOR = "#cd9b60";

const FELT_GREEN_PATHNAMES = new Set(["/", "/join", "/join/[roomid]"]);

export function getPageThemeColor(pathname: string): string {
  return FELT_GREEN_PATHNAMES.has(pathname)
    ? FELT_GREEN_THEME_COLOR
    : TABLE_TAN_THEME_COLOR;
}
