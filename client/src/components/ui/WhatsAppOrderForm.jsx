import { useRef, useState } from 'react';
import Icon from './Icon';
import { getWhatsAppLink } from '../../lib/whatsapp';
import { getProductBuildName } from '../../lib/products';
import { createWhatsAppOrderMessage } from '../../lib/whatsappOrder';
import './WhatsAppOrderForm.css';

const EMPTY_FIELDS = { name: '', address: '', city: '', note: '' };

export default function WhatsAppOrderForm({
  product,
  specifications,
  className = '',
  label = 'Order via WhatsApp',
}) {
  const dialogRef = useRef(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [whatsAppLink, setWhatsAppLink] = useState('');
  const [notice, setNotice] = useState('');
  const buildName = getProductBuildName(product) || product.name;

  const setField = (field, value) => {
    setFields((current) => ({ ...current, [field]: value }));
  };

  const openDialog = () => {
    setFields(EMPTY_FIELDS);
    setWhatsAppLink('');
    setNotice('');
    dialogRef.current?.showModal();
  };

  const submit = (event) => {
    event.preventDefault();
    const link = getWhatsAppLink(createWhatsAppOrderMessage(product, specifications, fields));
    setWhatsAppLink(link);
    setNotice('Rincian pesanan sudah disiapkan. Periksa pesan di WhatsApp lalu tekan Kirim untuk mengirimkannya ke admin.');
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button className={className} onClick={openDialog} type="button">
        <span>{label}</span>
        <span aria-hidden="true" className="rm-wa-order__trigger-icon">
          <Icon name="arrow-up-right" size={18} />
        </span>
      </button>
      <dialog
        aria-labelledby={`rm-wa-order-title-${product.id}`}
        className="rm-wa-order"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
        ref={dialogRef}
      >
        <div className="rm-wa-order__header">
          <div>
            <p className="rm-wa-order__eyebrow">ORDER VIA WHATSAPP</p>
            <h2 id={`rm-wa-order-title-${product.id}`}>Data pemesan</h2>
            <p className="rm-wa-order__build">{buildName} · {product.name}</p>
          </div>
          <button
            aria-label="Tutup formulir"
            className="rm-wa-order__close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            ×
          </button>
        </div>
        <p className="rm-wa-order__intro">Isi data berikut. Rincian motor dan spesifikasinya akan disertakan dalam pesan WhatsApp.</p>
        <form className="rm-wa-order__form" onSubmit={submit}>
          <label>
            <span>Nama lengkap <b>*</b></span>
            <input autoComplete="name" maxLength={120} minLength={2} onChange={(event) => setField('name', event.target.value)} required value={fields.name} />
          </label>
          <label>
            <span>Alamat lengkap <b>*</b></span>
            <textarea autoComplete="street-address" maxLength={1000} minLength={8} onChange={(event) => setField('address', event.target.value)} required rows={3} value={fields.address} />
          </label>
          <label>
            <span>Kota <b>*</b></span>
            <input autoComplete="address-level2" maxLength={120} minLength={2} onChange={(event) => setField('city', event.target.value)} required value={fields.city} />
          </label>
          <label>
            <span>Catatan <small>(opsional)</small></span>
            <textarea maxLength={1000} onChange={(event) => setField('note', event.target.value)} rows={2} value={fields.note} />
          </label>
          {notice ? (
            <div className="rm-wa-order__notice" role="status">
              <p>{notice}</p>
              <a href={whatsAppLink} rel="noopener noreferrer" target="_blank">Buka WhatsApp</a>
            </div>
          ) : null}
          <div className="rm-wa-order__actions">
            <button className="rm-wa-order__cancel" onClick={() => dialogRef.current?.close()} type="button">Batal</button>
            <button className="rm-wa-order__submit" type="submit">
              {whatsAppLink ? 'Buka WhatsApp lagi' : 'Lanjut ke WhatsApp'}
              <Icon name="arrow-up-right" size={17} />
            </button>
          </div>
          <p className="rm-wa-order__disclaimer">Pesan akan terbuka sebagai draft. Tekan Kirim di WhatsApp untuk menghubungi admin; pemesanan belum tercatat sebelum dikonfirmasi admin.</p>
        </form>
      </dialog>
    </>
  );
}
