"use server";

import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/authz";
import { partnerEventFormSchema, parseAccessibilityAnswers } from "@/lib/validations/event";
import { extractEventFormRaw } from "@/lib/eventFormData";
import { createEvent, updateEvent } from "@/services/eventCreationService";
import { revalidatePath } from "next/cache";

export interface PartnerEventState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createPartnerEventAction(
  _prevState: PartnerEventState,
  formData: FormData,
): Promise<PartnerEventState> {
  const { user, organization } = await requireOrganization();

  const raw = extractEventFormRaw(formData);
  const parsed = partnerEventFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  if (formData.get("accessibilityConfirmed") !== "true") {
    return { error: "Confirm you've completed the accessibility questionnaire before submitting." };
  }

  const images = [raw.coverImageUrl, formData.get("image2"), formData.get("image3")]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const accessibilityAnswers = parseAccessibilityAnswers(formData);

  const eventId = String(formData.get("eventId") ?? "");
  let slug: string;
  if (eventId) {
    const event = await updateEvent(eventId, { ...parsed.data, images, accessibilityAnswers }, user.id, "PENDING_REVIEW");
    slug = event.slug;
  } else {
    const event = await createEvent(
      { ...parsed.data, images, accessibilityAnswers },
      { userId: user.id, organizationId: organization.id },
      "PENDING_REVIEW",
    );
    slug = event.slug;
  }

  revalidatePath("/partner/events");
  redirect(`/partner/events?submitted=${slug}`);
}
