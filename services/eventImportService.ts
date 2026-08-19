import "server-only";
import { db } from "@/lib/db";
import { fetchGoogleEvents, type SerpApiEventResult } from "@/lib/serpapi";
import { parseGoogleEventDate } from "@/lib/parseEventDate";
import { CITY_COORDINATES } from "@/lib/geocoding";
import { slugify } from "@/lib/utils";
import { ALL_ACCESSIBILITY_FEATURES } from "@/lib/accessibility";

const IMPORT_BOT_EMAIL = "imports@onthespot.internal";

const TARGET_CITIES: { city: string; state: string }[] = [
  { city: "Waco", state: "TX" },
  { city: "Austin", state: "TX" },
  { city: "Dallas", state: "TX" },
  { city: "Houston", state: "TX" },
];

// Rough keyword → category-slug mapping. Google's events data doesn't
// include a clean category field, so this is a best-effort classifier;
// events that don't match anything are imported with no category rather
// than a guessed wrong one.
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/comedy|stand-?up/i, "comedy"],
  [/concert|live music|band|singer|dj\b/i, "concert"],
  [/museum|exhibit|gallery/i, "museum"],
  [/festival|fair\b/i, "festival"],
  [/food|tasting|brewery|culinary/i, "food"],
  [/adaptive|wheelchair|para-?sport/i, "adaptive-sports"],
  [/game|esports|arcade|tabletop/i, "gaming"],
  [/art\b|painting|craft/i, "art"],
  [/class|workshop|seminar|lecture/i, "education"],
  [/meetup|community|social\b/i, "community-meetup"],
  [/sport|game\b|match|tournament/i, "sports"],
];

function guessCategorySlug(title: string, description: string): string | null {
  const text = `${title} ${description}`;
  for (const [pattern, slug] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

async function getOrCreateImportBotUser() {
  const existing = await db.user.findUnique({ where: { email: IMPORT_BOT_EMAIL } });
  if (existing) return existing;

  // Placeholder hash — this account can never log in (no password reset
  // flow issues a token for it, and it's excluded from any "browse hosts"
  // UI); it exists purely as a FK target for createdById attribution.
  return db.user.create({
    data: {
      name: "OnTheSpot Data Sync",
      email: IMPORT_BOT_EMAIL,
      passwordHash: "!",
      role: "USER",
      status: "ACTIVE",
      profile: { create: { username: "onthespot-data-sync" } },
    },
  });
}

async function uniqueSlug(title: string): Promise<string> {
  const root = slugify(title) || "event";
  let candidate = root;
  let n = 1;
  while (await db.event.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

function jitter(base: number, spreadMiles: number) {
  const spreadDegrees = spreadMiles / 69;
  return base + (Math.random() - 0.5) * 2 * spreadDegrees;
}

export interface ImportSummary {
  city: string;
  fetched: number;
  imported: number;
  skippedDuplicate: number;
  skippedUnparseableDate: number;
  errors: string[];
}

async function importOneEvent(
  result: SerpApiEventResult,
  city: string,
  state: string,
  botUserId: string,
): Promise<"imported" | "duplicate" | "unparseable" | "invalid"> {
  if (!result.title || !result.link) return "invalid";

  const externalId = result.link;
  const existing = await db.event.findUnique({
    where: { externalSource_externalId: { externalSource: "GOOGLE_EVENTS", externalId } },
    select: { id: true },
  });
  if (existing) return "duplicate";

  const parsedDate = parseGoogleEventDate(result.date?.start_date, result.date?.when);
  if (!parsedDate) return "unparseable";

  const coords = CITY_COORDINATES[`${city.toLowerCase()},${state.toLowerCase()}`];
  const venueName = result.venue?.name || result.address?.[0] || "Venue TBA";
  const addressLine1 = result.address?.slice(1).join(", ") || result.address?.[0] || "Address not provided";
  const description = result.description?.trim() || `Imported from Google Events. See original listing: ${result.link}`;
  const ticketUrl = result.ticket_info?.[0]?.link ?? result.link;
  const hasTicketLink = Boolean(result.ticket_info?.length);

  const category = guessCategorySlug(result.title, result.description ?? "");
  const categoryRow = category ? await db.category.findUnique({ where: { slug: category } }) : null;

  const slug = await uniqueSlug(result.title);

  await db.event.create({
    data: {
      slug,
      title: result.title,
      description: `${description}\n\nImported automatically from Google Events. Accessibility details have not yet been confirmed — an OnTheSpot moderator or the venue can update them.`,
      createdById: botUserId,
      status: "PENDING_REVIEW",
      externalSource: "GOOGLE_EVENTS",
      externalId,
      startAt: parsedDate.startAt,
      endAt: parsedDate.endAt,
      venueName,
      addressLine1,
      city,
      state,
      zip: "00000",
      latitude: coords ? jitter(coords.lat, 1) : 0,
      longitude: coords ? jitter(coords.lng, 1) : 0,
      indoorOutdoor: "INDOOR",
      isFree: !hasTicketLink,
      price: null,
      ticketUrl: hasTicketLink ? ticketUrl : null,
      coverImageUrl: result.thumbnail || null,
      categories: categoryRow ? { create: [{ categoryId: categoryRow.id }] } : undefined,
      accessibility: {
        create: ALL_ACCESSIBILITY_FEATURES.map((feature) => ({
          feature,
          state: "UNKNOWN",
          note: "Not yet confirmed — this event was imported automatically.",
        })),
      },
      images: result.thumbnail ? { create: [{ url: result.thumbnail, position: 0 }] } : undefined,
    },
  });

  return "imported";
}

export async function runGoogleEventsImport(): Promise<ImportSummary[]> {
  const botUser = await getOrCreateImportBotUser();
  const summaries: ImportSummary[] = [];

  for (const { city, state } of TARGET_CITIES) {
    const summary: ImportSummary = {
      city: `${city}, ${state}`,
      fetched: 0,
      imported: 0,
      skippedDuplicate: 0,
      skippedUnparseableDate: 0,
      errors: [],
    };

    try {
      const results = await fetchGoogleEvents(`events in ${city}, ${state}`);
      summary.fetched = results.length;

      for (const result of results) {
        try {
          const outcome = await importOneEvent(result, city, state, botUser.id);
          if (outcome === "imported") summary.imported += 1;
          else if (outcome === "duplicate") summary.skippedDuplicate += 1;
          else if (outcome === "unparseable") summary.skippedUnparseableDate += 1;
        } catch (err) {
          summary.errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }

    summaries.push(summary);
  }

  await db.auditLog.create({
    data: {
      actorId: botUser.id,
      action: "GOOGLE_EVENTS_IMPORT_RUN",
      entityType: "SYSTEM",
      entityId: "import",
      metadata: JSON.parse(JSON.stringify(summaries)),
    },
  });

  return summaries;
}
