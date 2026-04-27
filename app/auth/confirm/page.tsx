import { Suspense } from "react";
import { AuthConfirmClient } from "@/components/login/AuthConfirmClient";

export const dynamic = "force-dynamic";

export default function AuthConfirmPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:py-16">
      <Suspense fallback={<div className="h-[520px] w-full max-w-[440px]" />}>
        <AuthConfirmClient />
      </Suspense>
    </main>
  );
}

