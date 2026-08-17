import { redirect } from "next/navigation";

type Params = Promise<{ id: string }>;

export default async function UsuarioEditPage({ params }: { params: Params }) {
  const { id } = await params;
  redirect(`/personas/${id}`);
}
