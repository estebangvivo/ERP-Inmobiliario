/**
 * Notificaciones in-app aún no están en este ERP.
 * Se deja como no-op para no romper el flujo de mejoras.
 */
export async function notifyPlatformSuperadmins(_input: {
  type: string;
  title: string;
  body: string;
  href: string;
  excludeUserId?: string;
  contextOrganizationId?: string | null;
}) {
  return;
}

export async function notifyFeatureRequestUser(_input: {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  href: string;
}) {
  return;
}
