import { describe, expect, it } from "vitest";
import { businessExpenseSchema, jobInputSchema, vehicleSchema } from "@/lib/validation";
import { parseJobNumber, formatJobNumber } from "@/lib/constants";
import { phoneDigits } from "@/lib/phone";

const base = {
  customer: { name: "Jane", phone: "770-555-0123", email: "Jane@Example.com" },
  address: "100 Main St",
  date: "2026-10-05",
  time: "09:00",
  durationMinutes: 120,
  jobType: "GARAGE_CLEANOUT",
  status: "SCHEDULED",
  quotedPrice: 650,
  deposit: 0,
  paymentStatus: "NOT_PAID",
  leadCost: 0,
  workersCount: 2,
  estLaborHours: 3,
  labor: [],
  estDumpCost: 85,
  expenses: [],
};

describe("job validation", () => {
  it("accepts a valid job and normalizes email", () => {
    const r = jobInputSchema.parse(base);
    expect(r.customer.email).toBe("jane@example.com");
  });
  it("rejects negative money, bad dates and bad emails", () => {
    expect(jobInputSchema.safeParse({ ...base, quotedPrice: -5 }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...base, time: "25:00" }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...base, customer: { ...base.customer, email: "nope" } }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...base, customer: { ...base.customer, name: " " } }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...base, status: "HACKED" }).success).toBe(false);
  });
  it("rejects a deposit larger than the price", () => {
    expect(jobInputSchema.safeParse({ ...base, deposit: 700 }).success).toBe(false);
  });
  it("rejects duplicate workers", () => {
    const id = "6f1f3a1e-1111-4a1a-9a1a-111111111111";
    expect(jobInputSchema.safeParse({ ...base, labor: [{ employeeId: id, estHours: 1 }, { employeeId: id, estHours: 1 }] }).success).toBe(false);
  });
  it("vehicle MPG must be positive", () => {
    expect(vehicleSchema.safeParse({ name: "Van", fuelType: "DIESEL", mpg: 0, fuelPrice: 3.8, maintenancePerMile: 0.2, depreciationPerMile: 0.15, active: true }).success).toBe(false);
  });
  it("business expense amount must be > 0", () => {
    expect(businessExpenseSchema.safeParse({ date: "2026-10-01", category: "FUEL", amount: 0, coveredByJobCosts: true }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("job numbers", () => {
    expect(formatJobNumber(1)).toBe("GJR-0001");
    expect(formatJobNumber(12345)).toBe("GJR-12345");
    expect(parseJobNumber("GJR-0012")).toBe(12);
    expect(parseJobNumber("gjr12")).toBe(12);
    expect(parseJobNumber("Smith")).toBeNull();
  });
  it("phone normalization for duplicate detection", () => {
    expect(phoneDigits("(770) 555-0123")).toBe("7705550123");
    expect(phoneDigits("+1 770.555.0123")).toBe("7705550123");
    expect(phoneDigits("12")).toBeNull();
  });
});
