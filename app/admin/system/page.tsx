import { requireRole } from "@/lib/authz";
import { getAllPlatformSettings } from "@/lib/settings";
import { stripeConfigured } from "@/lib/stripe";
import { cloudinaryConfigured } from "@/lib/cloudinary";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SystemSettingsForm } from "./SystemSettingsForm";
import { GoogleEventsSyncButton } from "./GoogleEventsSyncButton";

export const metadata = { title: "System settings" };

export default async function AdminSystemPage() {
  await requireRole("ADMIN");
  const settings = await getAllPlatformSettings();
  const serpApiConfigured = Boolean(process.env.SERPAPI_KEY);

  const integrations = [
    { name: "Stripe (payments)", configured: stripeConfigured },
    { name: "Cloudinary (image storage)", configured: cloudinaryConfigured },
    { name: "Mapbox (maps)", configured: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) },
    { name: "SerpApi (Google Events import)", configured: serpApiConfigured },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold">System settings</h1>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold">Monetization pricing</h2>
        <SystemSettingsForm
          partnerPremium={settings.partnerPremiumPriceCents}
          userPremium={settings.userPremiumPriceCents}
          featured={settings.featuredEventPriceCentsPerWeek}
        />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold">Integrations</h2>
        <ul className="flex flex-col gap-2">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-center justify-between text-sm">
              {i.name}
              <Badge tone={i.configured ? "confirmed" : "unknown"}>{i.configured ? "Configured" : "Not configured"}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Missing integrations fall back to local/demo behavior — the app remains fully usable without them.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">Google Events import</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-500">
          Pulls upcoming events for Waco, Austin, Dallas, and Houston from Google Events (via SerpApi) into the
          moderation queue as unreviewed submissions. Runs automatically once a day; you can also trigger it here.
        </p>
        <GoogleEventsSyncButton configured={serpApiConfigured} />
      </Card>
    </div>
  );
}
