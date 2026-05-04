import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login/LoginForm";
import styles from "./login-page.module.css";

export const metadata: Metadata = {
  title: "Prisijungimas",
  description: "Prisijunk prie KoT Sales paskyros",
};

export default function LoginPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.animLayer} aria-hidden>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.wave} />
      </div>
      <div className={styles.content}>
        <Suspense fallback={<div className="h-[520px] w-full max-w-[440px]" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
