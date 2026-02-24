// lib/dispatch.ts

type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

function shouldRunNowForBiz(opts: {
  tz: string | null | undefined;
  weekdays: Weekday[];
  hour: number;
  minute: number;
  windowMins?: number;
}) {
  const { tz, weekdays, hour, minute, windowMins = 5 } = opts;
  if (!tz) return false;

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const weekday = get("weekday") as Weekday | undefined;
    const hh = Number(get("hour"));
    const mm = Number(get("minute"));

    if (!weekday || !weekdays.includes(weekday)) return false;
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;

    const total = hh * 60 + mm;
    const target = hour * 60 + minute;

    return total >= target - windowMins && total <= target + windowMins;
  } catch {
    return false;
  }
}

// Daily: 08:15 local Mon–Fri
export function shouldRunDailyNow(tz: string | null | undefined) {
  return shouldRunNowForBiz({
    tz,
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    hour: 7,
    minute: 15,
    windowMins: 5,
  });
}

// Weekly: Monday 07:15 local
export function shouldRunWeeklyNow(tz: string | null | undefined) {
  return shouldRunNowForBiz({
    tz,
    weekdays: ["Mon"],
    hour: 7,
    minute: 15,
    windowMins: 5,
  });
}