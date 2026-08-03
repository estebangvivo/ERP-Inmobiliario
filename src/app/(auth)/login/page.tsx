import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, #2f6f82 0%, transparent 45%), radial-gradient(circle at 80% 0%, #1f4e5f 0%, transparent 40%), linear-gradient(160deg, #102833 0%, #1c2430 55%, #0d1a22 100%)",
        }}
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
