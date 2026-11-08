import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import { getWhatsAppLink } from '../../lib/whatsapp';
import { useCustomerSession } from '../../lib/customerAuth';
import { useToast } from '../ui/useToast';
import {
  formatRupiah,
  getActiveProducts,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildName,
  isProductActive,
} from '../../lib/products';
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
  referenceMotorId: '',
  consent: false,
};

function getReferenceLabel(product) {
  const buildName = getProductBuildName(product);
  const basis = getProductBasis(product);
  const name = product.name || buildName || product.id;
  const series = buildName && buildName !== name ? ` / ${buildName}` : '';
  return `${name}${series}${basis ? ` — ${basis}` : ''}`;
}

function validateFields(fields, files) {
  const errors = {};
  const phone = fields.phone.trim().replace(/[()\s-]/g, '');

  if (!fields.fullName.trim()) errors.fullName = 'Full name is required.';
  else if (fields.fullName.trim().length > 100) errors.fullName = 'Name must be 100 characters or fewer.';

  if (!phone) errors.phone = 'WhatsApp number is required.';
  else if (!/^\+?\d{8,15}$/.test(phone)) {
    errors.phone = 'Enter 8–15 digits; a leading + is optional.';
  }

  if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!fields.city.trim()) errors.city = 'City is required.';
  if (!fields.donorMotor) errors.donorMotor = 'Select your donor motorcycle status.';
  if (fields.donorMotor === 'other' && !fields.donorMotorOther.trim()) {
    errors.donorMotorOther = 'Describe the donor motorcycle you plan to use.';
  }
  if (!fields.budgetRange.trim()) errors.budgetRange = 'Budget range is required.';
  if (!fields.requirements.trim()) errors.requirements = 'Tell us about your build requirements.';
  else if (fields.requirements.trim().length < 10) {
    errors.requirements = 'Describe your build requirements in at least 10 characters.';
  }
  if (!fields.consent) errors.consent = 'Consent to be contacted is required.';
  if (files.length > 3) errors.photos = 'You can upload up to 3 photos.';

  return errors;
}

export default function ConsultationForm({
  product,
  products = [],
  buildName,
  buildCode,
  basis,
}) {
  const defaultReferenceId = product && isProductActive(product) ? product.id : '';
  const [fields, setFields] = useState(() => ({
    ...EMPTY_FIELDS,
    referenceMotorId: defaultReferenceId,
  }));
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceImageFailed, setReferenceImageFailed] = useState(false);
  const customerSession = useCustomerSession();
  const notify = useToast();
  const submitting = useRef(false);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const photoUrls = useRef(new Set());

  const referenceOptions = useMemo(() => {
    const options = getActiveProducts(products);
    if (product && isProductActive(product) && !options.some((item) => item.id === product.id)) {
      options.unshift(product);
    }
    return options;
  }, [products, product]);

  const selectedReference = fields.referenceMotorId
    ? referenceOptions.find((item) => String(item.id) === String(fields.referenceMotorId)) || null
    : null;
  const referenceImage = selectedReference
    ? getCatalogProductImage(selectedReference)
    : '';
  const selectedBasis = selectedReference ? getProductBasis(selectedReference) : basis;
  const referenceDisplayName = selectedReference
    ? (getProductBuildName(selectedReference) || selectedReference.name)
    : '';
  const referenceTitle = selectedReference
    ? `${selectedReference.name}${referenceDisplayName && referenceDisplayName !== selectedReference.name ? ` / ${referenceDisplayName}` : ''}`
    : 'Not selected';
  const consultationWhatsAppLink = getWhatsAppLink([
    'Hello Ruka Motorworks, I would like to discuss a custom motorcycle build.',
    `Name: ${fields.fullName.trim() || 'Not provided'}`,
    `WhatsApp: ${fields.phone.trim() || 'Not provided'}`,
    fields.email.trim() ? `Email: ${fields.email.trim()}` : '',
    fields.city.trim() ? `City: ${fields.city.trim()}` : '',
    `Reference motorcycle: ${referenceTitle}`,
    fields.donorMotor
      ? `Donor motorcycle: ${fields.donorMotor === 'other' ? fields.donorMotorOther.trim() || 'Other motorcycle' : fields.donorMotor}`
      : '',
    fields.budgetRange.trim() ? `Budget: ${fields.budgetRange.trim()}` : '',
    fields.requirements.trim() ? `Build requirements: ${fields.requirements.trim()}` : '',
  ].filter(Boolean).join('\n'));

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
      setErrors((current) => ({ ...current, photos: 'You can upload up to 3 photos.' }));
      notify('You can upload up to 3 photos.', 'error');
      return;
    }

    const invalidFile = selected.find((file) => (
      !['image/jpeg', 'image/png'].includes(file.type)
      || file.size > 5 * 1024 * 1024
    ));
    if (invalidFile) {
      const message = !['image/jpeg', 'image/png'].includes(invalidFile.type)
        ? `${invalidFile.name}: use a JPG or PNG image.`
        : `${invalidFile.name}: image size must not exceed 5 MB.`;
      setErrors((current) => ({ ...current, photos: message }));
      notify(message, 'error');
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
      notify('Please check the highlighted fields before submitting.', 'error');
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
    formData.append('referenceMotorId', fields.referenceMotorId);
    photos.forEach(({ file }) => formData.append('photos', file, file.name));

    try {
      const response = await fetch('/api/consultations', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success || !result.data?.id) {
        if (result?.errors && typeof result.errors === 'object') {
          setErrors((current) => ({ ...current, ...result.errors }));
        }
        setFormError(
          result?.message
          || `Your consultation request was not saved (${response.status}). Your form data is still available; please try again.`,
        );
        notify(result?.message || 'Your consultation request could not be submitted.', 'error');
        return;
      }

      setSuccess(`Your consultation request was saved. You can now chat with Ruka from your account.`);
      notify('Consultation request submitted successfully.');
      setFields({ ...EMPTY_FIELDS, referenceMotorId: defaultReferenceId });
      setReferenceImageFailed(false);
      photos.forEach(({ preview }) => {
        URL.revokeObjectURL(preview);
        photoUrls.current.delete(preview);
      });
      setPhotos([]);
      setErrors({});
    } catch (error) {
      console.error('Failed to submit consultation request:', error);
      setFormError('Unable to connect to the server. Your form data is still available; check your connection and try again.');
      notify('Unable to connect. Your consultation request was not submitted.', 'error');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const basisLabel = selectedBasis || 'Motor basis to be discussed during consultation';

  return (
    <div className="rm-consult-form-wrap">
      <div className="rm-consult-reference">
        <div className="rm-consult-reference__body">
          <p className="rm-meta">Your selected reference</p>
          <h3>{referenceTitle}</h3>
          <p>
            {selectedReference
              ? `${basisLabel} · ${selectedReference.categoryName || 'Custom build'}`
              : 'Start with a consultation · We will help you find a direction for your build'}
          </p>
          {selectedReference ? <strong>{formatRupiah(selectedReference.price)}</strong> : null}
        </div>
        {selectedReference ? (
          referenceImage && !referenceImageFailed ? (
            <img
              alt={`Reference ${selectedReference.name}`}
              className="rm-consult-reference__image"
              onError={() => setReferenceImageFailed(true)}
              src={referenceImage}
            />
          ) : (
            <span aria-hidden="true" className="rm-consult-reference__placeholder">
              {selectedReference.name.slice(0, 1).toUpperCase()}
            </span>
          )
        ) : (
          <span aria-hidden="true" className="rm-consult-reference__placeholder">?</span>
        )}
      </div>

      <p className="rm-consult-disclaimer">
        An initial consultation is not an order or payment. The final cost is agreed
        together before work begins.
      </p>

      {success ? (
        <div aria-live="polite" className="rm-consult-success" role="status">
          <span aria-hidden="true">✓</span>
          <p>{success} <Link to="/akun/konsultasi">View consultations</Link></p>
        </div>
      ) : customerSession.status !== 'authenticated' ? (
        <section aria-label="Customer login required" className="rm-consult-login">
          {customerSession.status === 'unknown' || customerSession.status === 'checking' ? (
            <p>Checking your account session...</p>
          ) : customerSession.status === 'unavailable' ? (
            <p role="alert">Your account could not be verified. Reload the page or contact us via WhatsApp.</p>
          ) : (
            <>
              <p>Log in or create a customer account to submit a web consultation and chat with Ruka.</p>
              <div className="rm-consult-login__actions">
                <Link
                  className="rm-button rm-button--primary"
                  to={`/login?return=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`}
                >
                  Customer Log In
                </Link>
                <Link
                  className="rm-consult-login__register"
                  to={`/register?return=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`}
                >
                  Create Account
                </Link>
              </div>
            </>
          )}
        </section>
      ) : (
        <form className="rm-consult-form" onSubmit={handleSubmit} ref={formRef}>
          {formError ? <p className="rm-consult-form__error" role="alert">{formError}</p> : null}

          <div className="rm-consult-form__grid">
            <label className="rm-consult-field rm-consult-field--full">
              <span>Reference motorcycle</span>
              <select
                name="referenceMotorId"
                onChange={(event) => {
                  setReferenceImageFailed(false);
                  setField('referenceMotorId', event.target.value);
                }}
                value={fields.referenceMotorId}
              >
                <option value="">Not decided / Start with a consultation</option>
                {referenceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getReferenceLabel(item)}
                  </option>
                ))}
              </select>
              <small>
                Choose a motorcycle from the catalog as a reference, or leave this blank
                if you would like to discuss it first.
              </small>
            </label>

            <label className="rm-consult-field">
              <span>Full name <b>*</b></span>
              <input
                autoComplete="name"
                aria-describedby={errors.fullName ? 'consult-name-error' : undefined}
                aria-invalid={Boolean(errors.fullName)}
                maxLength={100}
                name="fullName"
                onChange={(event) => setField('fullName', event.target.value)}
                placeholder="What should we call you?"
                required
                value={fields.fullName}
              />
              {errors.fullName ? <small className="is-error" id="consult-name-error">{errors.fullName}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>WhatsApp number <b>*</b></span>
              <input
                autoComplete="tel"
                aria-describedby={errors.phone ? 'consult-phone-error' : undefined}
                aria-invalid={Boolean(errors.phone)}
                autoCapitalize="off"
                inputMode="tel"
                maxLength={25}
                name="phone"
                onChange={(event) => setField('phone', event.target.value)}
                placeholder="Example: 0812 3456 7890"
                required
                type="tel"
                value={fields.phone}
              />
              {errors.phone ? <small className="is-error" id="consult-phone-error">{errors.phone}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Email <em>(optional)</em></span>
              <input
                autoComplete="email"
                aria-describedby={errors.email ? 'consult-email-error' : undefined}
                aria-invalid={Boolean(errors.email)}
                maxLength={254}
                name="email"
                onChange={(event) => setField('email', event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={fields.email}
              />
              {errors.email ? <small className="is-error" id="consult-email-error">{errors.email}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>City <b>*</b></span>
              <input
                autoComplete="address-level2"
                aria-describedby={errors.city ? 'consult-city-error' : undefined}
                aria-invalid={Boolean(errors.city)}
                maxLength={100}
                name="city"
                onChange={(event) => setField('city', event.target.value)}
                placeholder="Example: Bandung"
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
                <option value="">Select donor motorcycle status</option>
                <option value={`I own ${basisLabel}`}>I own {basisLabel}</option>
                <option value="I do not have a donor motorcycle">I do not have a donor motorcycle</option>
                <option value="other">I have another motorcycle</option>
              </select>
              {errors.donorMotor ? <small className="is-error" id="consult-donor-error">{errors.donorMotor}</small> : null}
            </label>

            <label className="rm-consult-field">
              <span>Budget range <b>*</b></span>
              <input
                aria-describedby={errors.budgetRange ? 'consult-budget-error' : 'consult-budget-help'}
                aria-invalid={Boolean(errors.budgetRange)}
                maxLength={100}
                name="budgetRange"
                onChange={(event) => setField('budgetRange', event.target.value)}
                placeholder="Example: Rp10–15 million"
                required
                value={fields.budgetRange}
              />
              <small className={errors.budgetRange ? 'is-error' : undefined} id={errors.budgetRange ? 'consult-budget-error' : 'consult-budget-help'}>
                {errors.budgetRange || 'An initial budget helps us put together a plan.'}
              </small>
            </label>

            {fields.donorMotor === 'other' ? (
              <label className="rm-consult-field rm-consult-field--full">
                <span>Donor motorcycle <b>*</b></span>
                <input
                  aria-describedby={errors.donorMotorOther ? 'consult-donor-other-error' : undefined}
                  aria-invalid={Boolean(errors.donorMotorOther)}
                  maxLength={160}
                  onChange={(event) => setField('donorMotorOther', event.target.value)}
                  placeholder="Motorcycle make and model"
                  required
                  value={fields.donorMotorOther}
                />
                {errors.donorMotorOther ? <small className="is-error" id="consult-donor-other-error">{errors.donorMotorOther}</small> : null}
              </label>
            ) : null}

            <label className="rm-consult-field rm-consult-field--full">
              <span>Tell us about your build requirements <b>*</b></span>
              <textarea
                aria-describedby={errors.requirements ? 'consult-requirements-error' : 'consult-requirements-help'}
                aria-invalid={Boolean(errors.requirements)}
                maxLength={5000}
                minLength={10}
                name="requirements"
                onChange={(event) => setField('requirements', event.target.value)}
                placeholder="Riding style, donor motorcycle condition, color, seat, or any details you have in mind..."
                required
                rows={5}
                value={fields.requirements}
              />
              <small className={errors.requirements ? 'is-error' : undefined} id={errors.requirements ? 'consult-requirements-error' : 'consult-requirements-help'}>
                {errors.requirements || 'At least 10 characters, up to 5,000 characters.'}
              </small>
            </label>
          </div>

          <div className="rm-consult-upload">
            <div>
              <p className="rm-consult-upload__title">Add donor or reference photos <em>(optional)</em></p>
              <p className="rm-consult-upload__hint">JPG / PNG · Max. 5 MB per photo · Up to 3 photos</p>
            </div>
            <input
              accept="image/jpeg,image/png"
              aria-label="Donor or reference photos"
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
              Choose photos
            </button>
            <small className={errors.photos ? 'is-error' : undefined} id={errors.photos ? 'consult-photos-error' : 'consult-photos-help'}>
              {errors.photos || `${photos.length} of 3 photos selected.`}
            </small>
            {photos.length ? (
              <ul className="rm-consult-photos">
                {photos.map(({ file, preview }) => (
                  <li key={preview}>
                    <img alt={`Preview of ${file.name}`} src={preview} />
                    <span title={file.name}>{file.name}</span>
                    <button
                      aria-label={`Remove ${file.name}`}
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
              I agree to be contacted by Ruka using the details above to discuss this build. <b>*</b>
              {errors.consent ? <small className="is-error" id="consult-consent-error">{errors.consent}</small> : null}
            </span>
          </label>

          <button className="rm-consult-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Saving request...' : 'Submit Consultation Request'}
            {!isSubmitting ? <Icon name="arrow-up-right" size={18} /> : null}
          </button>
          <p className="rm-consult-required-note">* Required</p>
        </form>
      )}
      <a
        className="rm-consult-whatsapp"
        href={consultationWhatsAppLink}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span>Consult directly via WhatsApp — no account required</span>
        <Icon name="arrow-up-right" size={18} />
      </a>
      <p className="rm-consult-required-note">
        WhatsApp opens a message draft and does not submit or save this web form.
      </p>
    </div>
  );
}
