import { SETTINGS_SECTIONS } from "@/components/settings-sections";
import { requireAdmin } from "@/lib/auth/server";
import { ListLink, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };



export default async function SettingsPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {SETTINGS_SECTIONS.map(({ key, label, desc, icon: Icon }) => (
          <ListLink key={key} href={`/settings/${key}`}>
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-brand-600" />
              <div className="min-w-0">
                <div className="font-semibold">{label}</div>
                <div className="truncate text-sm text-stone-500">{desc}</div>
              </div>
            </div>
          </ListLink>
        ))}
      </div>
    </div>
  );
}
