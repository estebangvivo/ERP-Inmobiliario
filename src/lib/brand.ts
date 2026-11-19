export const BRAND_NAME = "SimpleInmo";
export const BRAND_SLOGAN = "La gestión inmobiliaria, simplificada";
export const BRAND_LEGAL_NAME = "SimpleInmo SA";
export const BRAND_LOGO_SRC = "/brand/simpleinmo-logo.png?v=4";
/** Solo el isotipo (sin texto), para sidebar y favicon. */
export const BRAND_MARK_SRC = "/brand/simpleinmo-mark.png?v=1";
/** Contacto legal / privacidad (público). */
export const BRAND_PRIVACY_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || "privacidad@simpleinmo.com";
export const BRAND_SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "soporte@simpleinmo.com";
export const BRAND_PRIVACY_PATH = "/privacidad";
export const BRAND_TERMS_PATH = "/condiciones";
