import { KlientaiSubNav } from "@/components/crm/KlientaiSubNav";

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-6 min-w-0">
        <KlientaiSubNav />
      </div>
      {children}
    </div>
  );
}
