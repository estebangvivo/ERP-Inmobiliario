import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--muted-foreground)]">
          Módulo reservado en el shell de SimpleInmo. La navegación por rol ya está
          activa.
        </p>
      </CardContent>
    </Card>
  );
}
