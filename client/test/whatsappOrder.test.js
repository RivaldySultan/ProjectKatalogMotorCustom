import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProductSpecifications } from '../src/lib/products.js';
import { createWhatsAppOrderMessage } from '../src/lib/whatsappOrder.js';

test('order WhatsApp message contains customer details and every product specification', () => {
  const product = {
    id: 'prod_2',
    name: 'The Longway',
    buildCode: 'RK-02',
    buildName: 'The Longway Series',
    basis: 'Yamaha Scorpio',
    categoryName: 'Chopper',
    engine: '225 cc',
    transmission: '5-speed manual',
    cockpit: 'Wide handlebar',
    finishing: 'Brown leather seat',
    fixedSpecifications: 'Paint: Matte black\nWarranty: 1 year',
    price: 25000000,
    estimatedBuildDays: 45,
  };
  const specifications = getProductSpecifications(product);
  const message = createWhatsAppOrderMessage(product, specifications, {
    name: 'Budi Santoso',
    address: 'Jl. Merdeka No. 10',
    city: 'Bandung',
    note: 'Hubungi sore hari',
  });

  assert.match(message, /Nama: Budi Santoso/);
  assert.match(message, /Alamat: Jl\. Merdeka No\. 10/);
  assert.match(message, /Kota: Bandung/);
  assert.match(message, /Catatan: Hubungi sore hari/);
  assert.match(message, /Build: RK-02 - The Longway Series/);
  assert.match(message, /Harga build: Rp\s25\.000\.000/);
  assert.match(message, /- Engine: 225 cc/);
  assert.match(message, /- Paint: Matte black/);
  assert.match(message, /Estimasi pengerjaan: 45 hari/);
});

test('optional note is omitted when blank and example specifications match product detail', () => {
  const product = {
    id: 'prod_1',
    name: 'Silverline',
    price: 10000000,
    categoryName: 'Cafe Racer',
  };
  const specifications = getProductSpecifications(product);
  const message = createWhatsAppOrderMessage(product, specifications, {
    name: 'Dewi',
    address: 'Jalan Melati 2',
    city: 'Jakarta',
    note: '   ',
  });

  assert.doesNotMatch(message, /Catatan:/);
  assert.match(message, /- Engine: 125 cc/);
  assert.match(message, /- Transmission: Manual/);
});
