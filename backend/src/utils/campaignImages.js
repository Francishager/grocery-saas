export function campaignImageDeliveryUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return null;

  const marker = '/image/upload/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return value;

  const afterUpload = value.slice(markerIndex + marker.length);
  if (/^(?:f_auto\/|[^/]*f_auto)/.test(afterUpload)) return value;
  return `${value.slice(0, markerIndex + marker.length)}f_auto/q_auto,c_limit,w_1600,h_1200/${afterUpload}`;
}

export function campaignImageUrls(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => campaignImageDeliveryUrl(typeof image === 'string' ? image : image?.url))
    .filter(Boolean);
}
