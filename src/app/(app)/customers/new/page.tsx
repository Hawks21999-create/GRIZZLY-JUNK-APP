import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";
import { getLeadSources } from "@/server/settings";

export const metadata = { title: "New Customer" };

export default async function NewCustomerPage() {
  const sources = await getLeadSources();
  return (
    <div>
      <PageHeader title="New Customer" back="/customers" />
      <CustomerForm
        id={null}
        initial={{ name: "", phone: "", email: "", address: "", city: null, state: null, zip: null, lat: null, lng: null, leadSourceId: null, notes: "" }}
        leadSources={sources.map((l) => ({ id: l.id, name: l.name }))}
        mapsEnabled={Boolean(process.env.GOOGLE_MAPS_API_KEY)}
      />
    </div>
  );
}
