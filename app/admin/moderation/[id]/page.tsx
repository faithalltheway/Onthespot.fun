import { notFound } from "next/navigation";
import Image from "next/image";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatDateRange, formatPrice, titleCase } from "@/lib/utils";
import { AccessibilityBreakdown } from "@/components/events/AccessibilityBreakdown";
import { Badge } from "@/components/ui/Badge";
import { ModerationActions } from "./ModerationActions";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Review event" };

export default async function ModerationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edited?: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const { edited } = await searchParams;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true, verificationStatus: true } },
      createdBy: { select: { name: true, email: true } },
      categories: { include: { category: true } },
      accessibility: true,
      images: { orderBy: { position: "asc" } },
    },
  });
  if (!event) notFound();

  const isImported = Boolean(event.externalSource);

  return (
    <div className="flex flex-col gap-4">
      {edited === "1" && (
        <p role="status" className="rounded-control border border-border bg-surface-muted px-4 py-3 text-sm font-medium">
          Event changes saved. Review the corrected listing before approving it.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{event.title}</h1>
        <div className="flex items-center gap-2">
          {isImported && (
            <Badge tone="accent">
              Imported from Google Events
              {event.externalId && (
                <>
                  {" "}
                  ·{" "}
                  <a href={event.externalId} target="_blank" rel="noreferrer" className="underline">
                    original listing
                  </a>
                </>
              )}
            </Badge>
          )}
          <Badge tone="unknown">{event.status.replace("_", " ")}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr_320px]">
        <section aria-labelledby="event-info-heading" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <h2 id="event-info-heading" className="text-sm font-bold uppercase tracking-wide text-neutral-500">
            Event information
          </h2>
          {event.coverImageUrl && (
            <div className="relative aspect-video overflow-hidden rounded-control bg-surface-muted">
              <Image src={event.coverImageUrl} alt="" fill unoptimized className="object-cover" />
            </div>
          )}
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-semibold">Host</dt>
              <dd>
                {isImported
                  ? "Unknown — sourced from Google Events, not submitted by a registered host"
                  : `${event.organization?.name ?? event.createdBy.name} (${event.createdBy.email})`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">When</dt>
              <dd>{formatDateRange(event.startAt, event.endAt)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Where</dt>
              <dd>
                {event.venueName}, {event.addressLine1}, {event.city}, {event.state} {event.zip} ·{" "}
                {titleCase(event.indoorOutdoor)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Price</dt>
              <dd>{formatPrice(event.isFree, event.price?.toString())}</dd>
            </div>
            <div>
              <dt className="font-semibold">Categories</dt>
              <dd>{event.categories.map((c) => c.category.name).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Description</dt>
              <dd className="whitespace-pre-line text-neutral-600 dark:text-neutral-300">{event.description}</dd>
            </div>
          </dl>
        </section>

        <div>
          <AccessibilityBreakdown
            accessibility={event.accessibility}
            hostName={event.organization?.name ?? event.createdBy.name}
            lastVerifiedAt={event.accessibilityLastVerifiedAt}
          />
          {(event.accessibilityContactName || event.accessibilityContactEmail) && (
            <p className="mt-3 text-xs text-neutral-500">
              Accessibility contact: {event.accessibilityContactName} {event.accessibilityContactEmail}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <LinkButton href={`/admin/moderation/${event.id}/edit`} variant="outline" className="w-full">
            Edit event
          </LinkButton>
          <ModerationActions eventId={event.id} />
        </div>
      </div>
    </div>
  );
}
