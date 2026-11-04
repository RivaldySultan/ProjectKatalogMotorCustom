import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import { formatRupiah } from '../../lib/products';
import './ConsultationForm.css';

const EMPTY_FIELDS = {
  fullName: '',
  phone: '',
  email: '',
  city: '',
  donorMotor: '',
  donorMotorOther: '',
  budgetRange: '',
  requirements: '',
  consent: false,
};

function validateFields(fields, files) {
  const errors = {};
  const phone = fields.phone.trim().replace(/[()\s-]/g, '');

  if (!fields.fullName.trim()) errors.fullName = 'Nama lengkap wajib diisi.';
  else if (fields.fullName.trim().length > 100) errors.fullName = 'Nama maksimal 100 karakter.';

  if (!phone) errors.phone = 'Nomor WhatsApp wajib diisi.';
  else if (!/^\+?\d{8,15}$/.test(phone)) {
    errors.phone = 'Masukkan 8–15 digit; tanda + di depan boleh digunakan.';
  }

  if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim())) {
    errors.email = 'Masukkan alamat email yang valid.';
  }

  if (!fields.city.trim()) errors.city = 'Kota domisili wajib diisi.';
  if (!fields.donorMotor) errors.donorMotor = 'Pilih status motor donor.';
  if (fields.donorMotor === 'other' && !fields.donorMotorOther.trim()) {
    errors.donorMotorOther = 'Jelaskan motor donor yang digunakan.';
  }
  if (!fields.budgetRange.trim()) errors.budgetRange = 'Kisaran anggaran wajib diisi.';
  if (!fields.requirements.trim()) errors.requirements = 'Ceritakan kebutuhan build.';
  else if (fields.requirements.trim().length < 10) {
    errors.requirements = 'Jelaskan kebutuhan build dengan minimal 10 karakter.';
  }
  if (!fields.consent) errors.consent = 'Persetujuan untuk dihubungi wajib diberikan.';
  if (files.length > 3) errors.photos = 'Maksimal 3 foto dapat dikirim.';

  return errors;
}

export default function ConsultationForm({
  product,
  buildName,
  buildCode,
  basis,
}) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const photoUrls = useRef(new Set());

  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const setField = (name, value) => {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormError('');
  };

  const handleFiles = (event) => {
    const selected = [...event.target.files];
    event.target.value = '';
    setErrors((current) => ({ ...current, photos: '' }));
    setFormError('');

    if (photos.length + selected.length > 3) {
      setErrors((current) => ({ ...current, photos: 'Maksimal 3 foto dapat dikirim.' }));
      return;
    }

    const invalidFile = selected.find((file) => (
      !['image/jpeg', 'image/png'].includes(file.type)
      || file.size > 5 * 1024 * 1024
    ));
    if (invalidFile) {
      const message = !['image/jpeg', 'image/png'].includes(invalidFile.type)
        ? `${invalidFile.name}: gunakan foto JPG atau PNG.`
        : `${invalidFile.name}: ukuran foto maksimal 5 MB.`;
      setErrors((current) => ({ ...current, photos: message }));
      return;
    }

    const additions = selected.map((file) => {
      const preview = URL.createObjectURL(file);
      photoUrls.current.add(preview);
      return { file, preview };
    });
    setPhotos((current) => [...current, ...additions]);
  };

  const removePhoto = (preview) => {
    URL.revokeObjectURL(preview);
    photoUrls.current.delete(preview);
    setPhotos((current) => current.filter((photo) => photo.preview !== preview));
    setErrors((current) => ({ ...current, photos: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;

    const validationErrors = validateFields(fields, photos);
    setErrors(validationErrors);
    setFormError('');
    setSuccess('');

    if (Object.keys(validationErrors).length) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('fullName', fields.fullName.trim());
    formData.append('phone', fields.phone.trim());
    formData.append('email', fields.email.trim());
    formData.append('city', fields.city.trim());
    formData.append(
      'donorMotor',
      fields.donorMotor === 'other' ? fields.donorMotorOther.trim() : fields.donorMotor,
    );
    formData.append('budgetRange', fields.budgetRange.trim());
    formData.append('requirements', fields.requirements.trim());
    formData.append('consent', String(fields.consent));
    formData.append('productId', product.id);
    formData.append('buildName', buildName);
    formData.append('buildCode', buildCode);
    formData.append('basis', basis);
    photos.forEach(({ file }) => formData.append('photos', file, file.name));

    try {
      const response = await fetch('/api/consultations', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success || !result.data?.id) {
        if (result?.errors && typeof result.errors === 'object') {
          setErrors((current) => ({ ...current, ...result.errors }));
        }
        setFormError(
          result?.message
          || `Permintaan konsultasi belum tersimpan (${response.status}). Data tetap tersedia; silakan coba lagi.`,
        );
        return;
      }

      setSuccess(`Permintaan konsultasi tersimpan dengan nomor ${result.data.id}. Ruka akan menghubungi Anda.`);
      setFields(EMPTY_FIELDS);
      photos.forEach(({ preview }) => {
        URL.revokeObjectURL(preview);
        photoUrls.current.delete(preview);
      });
      setPhotos([]);
      setErrors({});
    } catch (error) {
      console.error('Gagal mengirim permintaan konsultasi:', error);
      setFormError('Tidak dapat terhubung ke server. Data tetap tersedia; periksa koneksi lalu coba lagi.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const basisLabel = basis || 'Basis motor dibahas saat konsultasi';

  return (
    <div className="rm-consult-form-wrap">
      <div className="rm-consult-reference">
        <p className="rm-meta">Referensi pilihanmu</p>
        <h3>{product.name} / {buildName}</h3>
        <p>{basisLabel} · {product.categoryName || 'Custom build'}</p>
        <strong>{formatRupiah(product.price)}</strong>
      </div>

      <p className="rm-consult-disclaimer">
        Konsultasi awal bukan pemesanan atau pembayaran. Biaya akhir disepakati
        bersama sebelum pengerjaan.
      </p>

      {success ? (
        <div aria-live="polite" className="rm-consult-success" role="status">
          <span aria-hidden="true">✓</span>
          <p>{success}</p>
        </div>
      ) : (
        <form className="rm-consult-form" noValidate onSubmit={handleSubmit} ref={formRef}>
          {formError ? <p className="rm-consult-form__error" role="alert">{formError}</p> : null}

          <div className="rm-consult-form__grid">
            <label className="rm-consult-field">
              <span>Nama lengkap <b>*</b></span>
              <input
                autoComplete="name"
                aria-describedby={errors.fullName ? 'consult-name-error' : undefined}
                aria-invalid={Boolean(errors.fullName)}
                maxLength={100}
                name="fullName"
                onChange={(event) => setField('fullName', event.target.value)}
                placeholder="Nama yang bisa kami panggil"
                required
                value={fields.fullName}
              />
              {errors.fullName ? <small className="is-error" id="consult-name-error">{errors.fullName}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Nomor WhatsApp <b>*</b></span>
              <input
                autoComplete="tel"
                aria-describedby={errors.phone ? 'consult-phone-error' : undefined}
                aria-invalid={Boolean(errors.phone)}
                autoCapitalize="off"
                inputMode="tel"
                maxLength={25}
                name="phone"
                onChange={(event) => setField('phone', event.target.value)}
                placeholder="Contoh: 0812 3456 7890"
                required
                type="tel"
                value={fields.phone}
              />
              {errors.phone ? <small className="is-error" id="consult-phone-error">{errors.phone}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Email <em>(opsional)</em></span>
              <input
                autoComplete="email"
                aria-describedby={errors.email ? 'consult-email-error' : undefined}
                aria-invalid={Boolean(errors.email)}
                maxLength={254}
                name="email"
                onChange={(event) => setField('email', event.target.value)}
                placeholder="nama@email.com"
                type="email"
                value={fields.email}
              />
              {errors.email ? <small className="is-error" id="consult-email-error">{errors.email}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Kota domisili <b>*</b></span>
              <input
                autoComplete="address-level2"
                aria-describedby={errors.city ? 'consult-city-error' : undefined}
                aria-invalid={Boolean(errors.city)}
                maxLength={100}
                name="city"
                onChange={(event) => setField('city', event.target.value)}
                placeholder="Contoh: Bandung"
                required
                value={fields.city}
              />
              {errors.city ? <small className="is-error" id="consult-city-error">{errors.city}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Motor donor <b>*</b></span>
              <select
                aria-describedby={errors.donorMotor ? 'consult-donor-error' : undefined}
                aria-invalid={Boolean(errors.donorMotor)}
                name="donorMotor"
                onChange={(event) => setField('donorMotor', event.target.value)}
                required
                value={fields.donorMotor}
              >
                <option value="">Pilih status motor donor</option>
                <option value={`Punya ${basisLabel}`}>Saya punya {basisLabel}</option>
                <option value="Belum punya motor donor">Belum punya motor donor</option>
                <option value="other">Saya punya motor lain</option>
              </select>
              {errors.donorMotor ? <small className="is-error" id="consult-donor-error">{errors.donorMotor}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Kisaran anggaran <b>*</b></span>
              <input
                aria-describedby={errors.budgetRange ? 'consult-budget-error' : 'consult-budget-help'}
                aria-invalid={Boolean(errors.budgetRange)}
                maxLength={100}
                name="budgetRange"
                onChange={(event) => setField('budgetRange', event.target.value)}
                placeholder="Contoh: Rp10–15 juta"
                required
                value={fields.budgetRange}
              />
              <small className={errors.budgetRange ? 'is-error' : undefined} id={errors.budgetRange ? 'consult-budget-error' : 'consult-budget-help'}>
                {errors.budgetRange || 'Anggaran awal untuk membantu menyusun rencana.'}
              </small>
            </label>

            {fields.donorMotor === 'other' ? (
              <label className="rm-consult-field rm-consult-field--full">
                <span>Nama motor donor <b>*</b></span>
                <input
                  aria-describedby={errors.donorMotorOther ? 'consult-donor-other-error' : undefined}
                  aria-invalid={Boolean(errors.donorMotorOther)}
                  maxLength={160}
                  onChange={(event) => setField('donorMotorOther', event.target.value)}
                  placeholder="Merek dan tipe motor"
                  required
                  value={fields.donorMotorOther}
                />
                {errors.donorMotorOther ? <small className="is-error" id="consult-donor-other-error">{errors.donorMotorOther}</small> : null}
              </label>
            ) : null}

            <label className="rm-consult-field rm-consult-field--full">
              <span>Ceritakan kebutuhan build <b>*</b></span>
              <textarea
                aria-describedby={errors.requirements ? 'consult-requirements-error' : 'consult-requirements-help'}
                aria-invalid={Boolean(errors.requirements)}
                maxLength={5000}
                minLength={10}
                name="requirements"
                onChange={(event) => setField('requirements', event.target.value)}
                placeholder="Gaya berkendara, kondisi motor donor, warna, jok, atau detail yang kamu inginkan..."
                required
                rows={5}
                value={fields.requirements}
              />
              <small className={errors.requirements ? 'is-error' : undefined} id={errors.requirements ? 'consult-requirements-error' : 'consult-requirements-help'}>
                {errors.requirements || 'Minimal 10 karakter, maksimal 5.000 karakter.'}
              </small>
            </label>
          </div>

          <div className="rm-consult-upload">
            <div>
              <p className="rm-consult-upload__title">Tambahkan foto donor atau referensi <em>(opsional)</em></p>
              <p className="rm-consult-upload__hint">JPG / PNG · Maks. 5 MB per foto · Hingga 3 foto</p>
            </div>
            <input
              accept="image/jpeg,image/png"
              aria-label="Foto donor atau referensi"
              aria-describedby={errors.photos ? 'consult-photos-error' : 'consult-photos-help'}
              aria-invalid={Boolean(errors.photos)}
              className="rm-visually-hidden"
              disabled={isSubmitting}
              multiple
              onChange={handleFiles}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="rm-consult-upload__button"
              disabled={photos.length >= 3 || isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <span aria-hidden="true">+</span>
              Pilih foto
            </button>
            <small className={errors.photos ? 'is-error' : undefined} id={errors.photos ? 'consult-photos-error' : 'consult-photos-help'}>
              {errors.photos || `${photos.length} dari 3 foto dipilih.`}
            </small>
            {photos.length ? (
              <ul className="rm-consult-photos">
                {photos.map(({ file, preview }) => (
                  <li key={preview}>
                    <img alt={`Pratinjau ${file.name}`} src={preview} />
                    <span title={file.name}>{file.name}</span>
                    <button
                      aria-label={`Hapus foto ${file.name}`}
                      disabled={isSubmitting}
                      onClick={() => removePhoto(preview)}
                      type="button"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <label className="rm-consult-consent">
            <input
              aria-describedby={errors.consent ? 'consult-consent-error' : undefined}
              aria-invalid={Boolean(errors.consent)}
              checked={fields.consent}
              name="consent"
              onChange={(event) => setField('consent', event.target.checked)}
              required
              type="checkbox"
            />
            <span>
              Saya setuju dihubungi Ruka melalui kontak di atas untuk membahas kebutuhan build ini. <b>*</b>
              {errors.consent ? <small className="is-error" id="consult-consent-error">{errors.consent}</small> : null}
            </span>
          </label>

          <button className="rm-consult-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Menyimpan permintaan...' : 'Kirim permintaan konsultasi'}
            {!isSubmitting ? <Icon name="arrow-up-right" size={18} /> : null}
          </button>
          <p className="rm-consult-required-note">* Wajib diisi</p>
        </form>
      )}
    </div>
  );
}
