export function propertyImageSrc(image: { id: string; url?: string | null }) {
  if (image.url?.startsWith("http://") || image.url?.startsWith("https://")) {
    return image.url;
  }
  if (image.url?.startsWith("data:")) {
    return image.url;
  }
  return `/api/media/property-images/${image.id}`;
}
