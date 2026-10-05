import { Building2, Calendar, Car, KeyRound, Megaphone, SlidersHorizontal, Truck, UserCog, Users } from "lucide-react";

export const SETTINGS_SECTIONS = [
  { key: "business", label: "Business", desc: "Name, starting address, phone, email, currency", icon: Building2 },
  { key: "vehicles", label: "Vehicles", desc: "MPG, fuel price, maintenance & depreciation per mile", icon: Car },
  { key: "workers", label: "Workers & Labor Rates", desc: "Crew members and hourly cost", icon: Users },
  { key: "dump", label: "Dump Facilities", desc: "Landfills / transfer stations and typical fees", icon: Truck },
  { key: "defaults", label: "Job Defaults & Mileage", desc: "Default vehicle, dump, labor rate, route settings", icon: SlidersHorizontal },
  { key: "lead-sources", label: "Lead Sources", desc: "Marketing sources on the job form", icon: Megaphone },
  { key: "integrations", label: "Google Maps & Calendar", desc: "Mileage API status and calendar sync", icon: Calendar },
  { key: "users", label: "Users", desc: "Logins for you and your team", icon: UserCog },
  { key: "account", label: "My Account", desc: "Change password, sign out everywhere", icon: KeyRound },
] as const;
