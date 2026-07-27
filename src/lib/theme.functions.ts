import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { readThemePreferenceFromCookie } from "./theme";

export const loadThemePreference = createServerFn({ method: "GET" }).handler(() =>
  readThemePreferenceFromCookie(getRequestHeader("cookie")),
);
