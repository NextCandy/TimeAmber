import { createServerFn } from "@tanstack/react-start";

import { loadVisitorWeather } from "@/lib/weather.server";

export const loadVisitorWeatherFn = createServerFn({ method: "GET" }).handler(loadVisitorWeather);
