export const WHATSAPP_PHONE = '6282110004871';
export const WHATSAPP_MESSAGE = 'Halo Ruka Motorworks, saya tertarik untuk konsultasi mengenai motor custom.';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}`;

export function getWhatsAppLink(message = '') {
  if (!message) return WHATSAPP_URL;
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}
