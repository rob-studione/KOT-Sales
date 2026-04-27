import { Suspense } from "react";
import { AuthRecoveryClient } from "@/components/login/AuthRecoveryClient";

export const dynamic = "force-dynamic";

export default function AuthRecoveryPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:py-16">
      <Suspense fallback={<div className="h-[520px] w-full max-w-[440px]" />}>
        <AuthRecoveryClient />
      </Suspense>
    </main>
  );
}
