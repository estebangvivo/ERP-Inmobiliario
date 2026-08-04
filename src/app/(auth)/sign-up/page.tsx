import { RegisterForm } from "@/components/auth/register-form";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignUpPage() {
  const session = await getSession();
  if (session) {
    if (!session.organizationId) redirect("/onboarding/planes");
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, #2f6f82 0%, transparent 45%), radial-gradient(circle at 80% 0%, #1f4e5f 0%, transparent 40%), linear-gradient(160deg, #102833 0%, #1c2430 55%, #0d1a22 100%)",
        }}
      />
      <RegisterForm />
    </div>
  );
}
