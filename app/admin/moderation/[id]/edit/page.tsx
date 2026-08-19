import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { toDateTimeLocalValue } from "@/lib/utils";
import { PartnerEventWizard } from "@/components/events/PartnerEventWizard";
import { updateAdminEventAction } from "./actions";

export const metadata = { title: "Edit event" };

export default async function EditModeratedEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;

  const [event, categories] = await Promise.all([
    db.event.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        accessibility: true,
        images: { orderBy: { position: "asc" } },
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">Edit event</h1>
        <p className="text-sm text-neutral-500">
          Complete and verify this listing before making a moderation decision.
        </p>
      </div>
      <PartnerEventWizard
        categories={categories}
        action={updateAdminEventAction}
        reviewDescription="Review the corrected listing and confirm the accessibility information. Saving keeps the event in the moderation queue."
        submitLabel="Save changes"
        defaults={{
          eventId: event.id,
          title: event.title,
          description: event.description,
          categories: event.categories.map((category) => category.category.slug),
          startAt: toDateTimeLocalValue(event.startAt),
          endAt: toDateTimeLocalValue(event.endAt),
          isRecurring: event.isRecurring,
          recurrenceRule: event.recurrenceRule ?? undefined,
          venueName: event.venueName,
          addressLine1: event.addressLine1,
          city: event.city,
          state: event.state,
          zip: event.zip,
          latitude: event.latitude,
          longitude: event.longitude,
          indoorOutdoor: event.indoorOutdoor,
          isFree: event.isFree,
          price: event.price ? Number(event.price) : undefined,
          ticketUrl: event.ticketUrl ?? undefined,
          minAge: event.minAge ?? undefined,
          maxAge: event.maxAge ?? undefined,
          coverImageUrl: event.coverImageUrl ?? undefined,
          image2: event.images[1]?.url,
          image3: event.images[2]?.url,
          accessibilityContactName: event.accessibilityContactName ?? undefined,
          accessibilityContactEmail: event.accessibilityContactEmail ?? undefined,
          accessibilityContactPhone: event.accessibilityContactPhone ?? undefined,
          accessibilityAnswers: event.accessibility.map((answer) => ({
            feature: answer.feature,
            state: answer.state,
            note: answer.note,
          })),
        }}
      />
    </div>
  );
}
