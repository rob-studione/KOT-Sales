import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Prisijungimas",
  description: "Prisijunk prie KOT Sales paskyros",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:py-16">
      <Suspense fallback={<div className="h-[520px] w-full max-w-[440px]" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
