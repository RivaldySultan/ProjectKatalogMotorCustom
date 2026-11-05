export const WHATSAPP_PHONE = '6282110004871';
export const WHATSAPP_MESSAGE = 'Hello Ruka Motorworks, I am interested in discussing a custom motorcycle.';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}`;

export function getWhatsAppLink(message = '') {
  if (!message) return WHATSAPP_URL;
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}
