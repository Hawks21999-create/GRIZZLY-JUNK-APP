import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/server";
import { getCustomer } from "@/server/customers";
import { getLeadSources } from "@/server/settings";

export const metadata = { title: "Edit Customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, sources, user] = await Promise.all([getCustomer(id), getLeadSources(), getCurrentUser()]);
  if (!c) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${c.name}`} back={`/customers/${id}`} />
      <CustomerForm
        id={id}
        initial={{
          name: c.name,
          phone: c.phone ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
          city: c.city,
          state: c.state,
          zip: c.zip,
          lat: c.lat,
          lng: c.lng,
          leadSourceId: c.leadSourceId,
          notes: c.notes ?? "",
        }}
        leadSources={sources.map((l) => ({ id: l.id, name: l.name }))}
        mapsEnabled={Boolean(process.env.GOOGLE_MAPS_API_KEY)}
        canDelete={user?.role !== "EMPLOYEE"}
      />
    </div>
  );
}
