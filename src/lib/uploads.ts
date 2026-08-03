/** Stubs de media para solicitudes de mejora (sin módulo uploads aún). */

export function collectMediaFilesFromFormData(
  _formData: FormData,
  _field: string,
): File[] {
  return [];
}

export async function saveFeatureRequestMediaFile(_input: {
  organizationId: string;
  requestId: string;
  file: File;
}): Promise<{ fileUrl: string }> {
  throw new Error(
    "La carga de archivos en mejoras aún no está habilitada en este ERP.",
  );
}
