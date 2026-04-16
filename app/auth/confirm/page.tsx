import { Suspense } from "react";
import { AuthConfirmClient } from "@/components/login/AuthConfirmClient";

export const dynamic = "force-dynamic";

export default function AuthConfirmPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-sky-50/90 px-4 py-12 sm:py-16">
      <Suspense fallback={<div className="h-[520px] w-full max-w-[460px]" />}>
        <AuthConfirmClient />
      </Suspense>
    </main>
  );
}

