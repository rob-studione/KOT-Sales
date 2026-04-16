<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Database / Supabase

Prieš commitinant ar deployinant kodą, kuris naudoja naujus DB stulpelius ar lenteles, **pirmiausia pritaikykite migracijas** (`supabase/migrations/`) prieš atitinkamą aplinką. Kitu atveju SSR užklausos (pvz. `.eq("is_kpi_tracked", true)`) gali kristi su klaida ar grąžinti tuščius rezultatus.
