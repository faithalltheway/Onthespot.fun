"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { extractEventFormRaw } from "@/lib/eventFormData";
import { eventFormSchema, parseAccessibilityAnswers } from "@/lib/validations/event";
import { updateEvent } from "@/services/eventCreationService";
import type { PartnerEventState } from "@/app/partner/events/new/actions";

export async function updateAdminEventAction(
  _previousState: PartnerEventState,
  formData: FormData,
): Promise<PartnerEventState> {
  const admin = await requireRole("ADMIN");
  const eventId = String(formData.get("eventId") ?? "");

  const event = eventId
    ? await db.event.findUnique({ where: { id: eventId }, select: { id: true } })
    : null;
  if (!event) return { error: "This event could not be found." };

  const raw = extractEventFormRaw(formData);
  const parsed = eventFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  if (formData.get("accessibilityConfirmed") !== "true") {
    return { error: "Confirm that you reviewed the accessibility information before saving." };
  }

  const images = [raw.coverImageUrl, formData.get("image2"), formData.get("image3")]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const accessibilityAnswers = parseAccessibilityAnswers(formData);

  await updateEvent(
    eventId,
    { ...parsed.data, images, accessibilityAnswers },
    admin.id,
    "PENDING_REVIEW",
  );

  revalidatePath("/admin/moderation");
  revalidatePath(`/admin/moderation/${eventId}`);
  redirect(`/admin/moderation/${eventId}?edited=1`);
}
