import "server-only";

export interface SerpApiEventResult {
  title?: string;
  type?: string;
  description?: string;
  link?: string;
  date?: string | { start_date?: string; when?: string };
  time?: string;
  address?: string[];
  venue?: { name?: string; phone_number?: string };
  thumbnail?: string;
  ticket_info?: { source?: string; link?: string; link_type?: string }[];
  event_location_map?: { link?: string };
}

interface SerpApiEventsResponse {
  events_results?: SerpApiEventResult[];
  error?: string;
}

const SERPAPI_BASE = "https://serpapi.com/search.json";

/**
 * Queries the events pack returned by SerpApi's general Google engine.
 * The dedicated google_events engine currently returns empty results for
 * queries that produce an events pack through the general engine.
 */
export async function fetchGoogleEvents(query: string, location: string): Promise<SerpApiEventResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not configured");

  const url = new URL(SERPAPI_BASE);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("location", location);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`SerpApi request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as SerpApiEventsResponse;
  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }

  return data.events_results ?? [];
}
