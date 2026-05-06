// UK bank holiday lookup. Used by the poll-create flow to decide whether the
// Sunday of a given weekend is a viable play day (i.e. the following Monday
// is a bank holiday, so Sunday isn't a school night).
//
// Source: https://www.gov.uk/bank-holidays.json
//   * Free, no auth, no rate limit, machine-readable.
//   * Returns three divisions; we use "england-and-wales" — change if you
//     ever care about Scotland / NI.
//
// We cache the response for 24h via Next's fetch revalidate so we don't hit
// gov.uk on every request.

const FEED_URL = "https://www.gov.uk/bank-holidays.json";
const DIVISION = "england-and-wales";
const REVALIDATE_SECONDS = 60 * 60 * 24; // 24h

type GovUkEvent = {
  title: string;
  date: string; // YYYY-MM-DD
  notes: string;
  bunting: boolean;
};

type GovUkDivision = {
  division: string;
  events: GovUkEvent[];
};

type GovUkFeed = Record<string, GovUkDivision>;

let memoryCache: { fetchedAt: number; map: Map<string, string> } | null = null;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h in-process fallback

async function loadHolidayMap(): Promise<Map<string, string>> {
  // Hot path — same Node process, last fetched recently.
  if (memoryCache && Date.now() - memoryCache.fetchedAt < MEMORY_TTL_MS) {
    return memoryCache.map;
  }

  try {
    const res = await fetch(FEED_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`gov.uk feed returned ${res.status}`);
    const data: GovUkFeed = await res.json();
    const division = data[DIVISION];
    if (!division) throw new Error(`Division "${DIVISION}" not in feed`);

    const map = new Map<string, string>();
    for (const ev of division.events) {
      map.set(ev.date, ev.title);
    }
    memoryCache = { fetchedAt: Date.now(), map };
    return map;
  } catch (err) {
    // Network down or feed format changed. Fail soft — caller treats every
    // day as non-holiday, which just means Sunday options have to be opted
    // in manually rather than auto-suggested.
    console.error("[bank-holidays] failed to load feed:", err);
    return new Map();
  }
}

/** Returns the holiday name if the given date is a bank holiday, else null. */
export async function getBankHolidayName(date: Date | string): Promise<string | null> {
  const map = await loadHolidayMap();
  const key = typeof date === "string" ? date : toIsoDate(date);
  return map.get(key) ?? null;
}

/**
 * Sunday is "playable" when the *following* Monday is a bank holiday — no
 * work the next day so a late game is fine.
 */
export async function isSundayPlayable(sunday: Date): Promise<{
  playable: boolean;
  holidayName: string | null;
}> {
  if (sunday.getDay() !== 0) {
    return { playable: false, holidayName: null };
  }
  const monday = new Date(sunday);
  monday.setDate(monday.getDate() + 1);
  const holidayName = await getBankHolidayName(monday);
  return { playable: holidayName !== null, holidayName };
}

/** Format a Date as YYYY-MM-DD using its local components (matches gov.uk). */
export function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
