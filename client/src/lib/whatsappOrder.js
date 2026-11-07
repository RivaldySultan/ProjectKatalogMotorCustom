import { formatRupiah, getProductBasis, getProductBuildCode, getProductBuildName } from './products.js';

export function createWhatsAppOrderMessage(product, specifications, fields) {
  const buildName = getProductBuildName(product) || product.name;
  const buildCode = getProductBuildCode(product);
  const basis = getProductBasis(product);

  return [
    'Halo Ruka Motorworks, saya ingin memesan motor berikut melalui WhatsApp.',
    '',
    'DETAIL MOTOR',
    `Produk: ${product.name}`,
    `Build: ${[buildCode, buildName].filter(Boolean).join(' - ')}`,
    basis ? `Basis motor: ${basis}` : '',
    `Harga build: ${formatRupiah(product.price)}`,
    product.estimatedBuildDays ? `Estimasi pengerjaan: ${product.estimatedBuildDays} hari` : '',
    'Spesifikasi:',
    ...specifications.map(([label, value]) => `- ${label}: ${value}`),
    '',
    'DATA PEMESAN',
    `Nama: ${fields.name.trim()}`,
    `Alamat: ${fields.address.trim()}`,
    `Kota: ${fields.city.trim()}`,
    fields.note.trim() ? `Catatan: ${fields.note.trim()}` : '',
  ].filter(Boolean).join('\n');
}
