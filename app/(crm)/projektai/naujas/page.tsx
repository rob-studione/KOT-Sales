import Link from "next/link";
import { ProjectCreateForm } from "@/components/crm/ProjectCreateForm";
import { fetchCrmUsers } from "@/lib/crm/crmUsers";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export default async function NaujasProjektasPage() {
  let users: Awaited<ReturnType<typeof fetchCrmUsers>> = [];
  try {
    const supabase = await createSupabaseSsrReadOnlyClient();
    users = await fetchCrmUsers(supabase);
  } catch {
    // Supabase nekonfigūruotas — forma vis tiek rodoma su įspėjimu
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href="/projektai"
          className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          ← Visi projektai
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-zinc-900">Sukurti projektą</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Pasirinkite sąskaitų intervalą ir kriterijus. Patvirtinus, klientų sąrašas užfiksuojamas ir nebekeičiamas automatiškai.
      </p>
      <div className="mt-6">
        <ProjectCreateForm users={users} />
      </div>
    </div>
  );
}
