import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

export async function getEmployeeProfile(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.employeeProfiles)
    .where(eq(schema.employeeProfiles.userId, userId));
  return row;
}

export async function getEmployerWithCompany(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      fullName: schema.employerProfiles.fullName,
      position: schema.employerProfiles.position,
      company: {
        name: schema.companies.name,
        site: schema.companies.site,
        industry: schema.companies.industry,
        size: schema.companies.size,
        description: schema.companies.description,
      },
    })
    .from(schema.employerProfiles)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.employerProfiles.companyId))
    .where(eq(schema.employerProfiles.userId, userId));
  // leftJoin даёт company с null-полями, если компании ещё нет
  const company = row?.company?.name != null ? row.company : null;
  return { fullName: row?.fullName ?? "", position: row?.position ?? "", company };
}

export async function getConsents(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.consentRecords)
    .where(eq(schema.consentRecords.userId, userId))
    .orderBy(schema.consentRecords.createdAt);
}
