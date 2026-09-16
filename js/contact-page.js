/**
 * Contact Form Controller — Slimky Hair
 * Real WhatsApp Click-to-Chat Implementation
 * 
 * Features:
 * - Official Slimky Hair destination: +234 816 910 4565 (wa.me/2348169104565)
 * - Required fields: Name, Phone/WhatsApp, Subject, Message
 * - Optional field: Email (omits "Email:" line entirely if not provided)
 * - Strict URL encoding preserving line breaks, special characters, and emojis
 * - Opens WhatsApp with pre-filled message for visitor to manually press Send
 * - Zero fake success screens or automated API simulation
 */

export const SLIMKY_WHATSAPP_NUMBER = '2348169104565';
export const SLIMKY_DISPLAY_PHONE = '+234 816 910 4565';
export const SLIMKY_TEL_URI = 'tel:+2348169104565';

/**
 * Cleanly formats the WhatsApp inquiry message from user input.
 * Strictly avoids an empty "Email:" line if email is omitted.
 *
 * @param {Object} formData
 * @param {string} formData.name - Visitor full name (Required)
 * @param {string} [formData.email] - Visitor email address (Optional)
 * @param {string} formData.phone - Visitor phone / WhatsApp (Required)
 * @param {string} formData.subject - Selected inquiry subject (Required)
 * @param {string} formData.message - Inquiry message body (Required)
 * @returns {string} Plain-text WhatsApp message ready for encoding
 */
export function formatWhatsAppInquiryMessage(formData) {
  const name = (formData.name || '').trim();
  const email = (formData.email || '').trim();
  const phone = (formData.phone || '').trim();
  const subject = (formData.subject || '').trim();
  const message = (formData.message || '').trim();

  const lines = [
    'Hello Slimky Hair,',
    '',
    'I would like to make an inquiry.',
    '',
    'Name:',
    name,
    ''
  ];

  if (email) {
    lines.push('Email:', email, '');
  }

  lines.push(
    'Phone / WhatsApp:',
    phone,
    '',
    'Subject:',
    subject,
    '',
    'Message:',
    message,
    '',
    'Thank you.'
  );

  return lines.join('\n');
}

/**
 * Constructs the standard WhatsApp click-to-chat URL with the pre-filled encoded text.
 *
 * @param {Object} formData
 * @returns {string} Fully formatted wa.me URL
 */
export function buildWhatsAppInquiryUrl(formData) {
  const messageText = formatWhatsAppInquiryMessage(formData);
  return `https://wa.me/${SLIMKY_WHATSAPP_NUMBER}?text=${encodeURIComponent(messageText)}`;
}

// Browser Controller
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

  const nameInput = document.getElementById('contact-name');
  const emailInput = document.getElementById('contact-email');
  const phoneInput = document.getElementById('contact-phone');
  const subjectSelect = document.getElementById('contact-subject');
  const messageInput = document.getElementById('contact-message');
  const submitBtn = document.getElementById('contact-submit-btn');
  const submitText = document.getElementById('contact-submit-text');
  const redirectNotice = document.getElementById('contact-redirect-notice');
  const errorBanner = document.getElementById('contact-error-banner');

  // Validation patterns
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phoneRegex = /^[\d\s()+\-]{7,20}$/;

  /**
   * Helper to set / clear field error styling and ARIA attributes
   */
  function validateField(field, condition, errorMessage) {
    if (!field) return true;
    const group = field.closest('.contact-field-group');
    const errorElem = group ? group.querySelector('.contact-field-error') : null;

    if (!condition) {
      field.classList.add('is-invalid');
      field.setAttribute('aria-invalid', 'true');
      if (group) group.classList.add('has-error');
      if (errorElem) {
        errorElem.textContent = errorMessage;
        errorElem.id = errorElem.id || `${field.id}-error`;
        field.setAttribute('aria-describedby', errorElem.id);
      }
      return false;
    } else {
      field.classList.remove('is-invalid');
      field.removeAttribute('aria-invalid');
      if (group) group.classList.remove('has-error');
      if (errorElem) {
        errorElem.textContent = '';
        field.removeAttribute('aria-describedby');
      }
      return true;
    }
  }

  /**
   * Validate a single form field
   */
  function validateSingleField(field) {
    if (field === nameInput) {
      return validateField(nameInput, nameInput.value.trim().length >= 2, 'Please enter your full name (at least 2 characters).');
    }
    if (field === emailInput) {
      const val = emailInput.value.trim();
      // Email is OPTIONAL. If empty, it is completely valid.
      if (!val) {
        return validateField(emailInput, true, '');
      }
      return validateField(emailInput, emailRegex.test(val), 'Please enter a valid email address (or leave blank).');
    }
    if (field === phoneInput) {
      const val = phoneInput.value.trim();
      const cleaned = val.replace(/\D/g, '');
      return validateField(phoneInput, phoneRegex.test(val) && cleaned.length >= 8, 'Please enter a valid phone or WhatsApp number (minimum 8 digits).');
    }
    if (field === subjectSelect) {
      return validateField(subjectSelect, subjectSelect.value.trim() !== '', 'Please select an inquiry topic.');
    }
    if (field === messageInput) {
      return validateField(messageInput, messageInput.value.trim().length >= 15, 'Please provide more details (minimum 15 characters).');
    }
    return true;
  }

  // Real-time re-validation on input once marked invalid
  [nameInput, emailInput, phoneInput, subjectSelect, messageInput].forEach(input => {
    if (!input) return;
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      if (input.classList.contains('is-invalid')) {
        validateSingleField(input);
      }
    });
  });

  // Submission handler — Builds WhatsApp URL and opens chat
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (errorBanner) {
      errorBanner.classList.remove('is-visible');
    }

    // Validate all fields
    const isNameValid = validateSingleField(nameInput);
    const isEmailValid = validateSingleField(emailInput);
    const isPhoneValid = validateSingleField(phoneInput);
    const isSubjectValid = validateSingleField(subjectSelect);
    const isMessageValid = validateSingleField(messageInput);

    const isFormValid = isNameValid && isEmailValid && isPhoneValid && isSubjectValid && isMessageValid;

    if (!isFormValid) {
      const firstInvalid = contactForm.querySelector('.is-invalid');
      if (firstInvalid) {
        firstInvalid.focus();
      }
      return;
    }

    // Extract form data
    const payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      subject: subjectSelect.value.trim(),
      message: messageInput.value.trim()
    };

    // Construct WhatsApp Click-to-Chat URL
    const targetUrl = buildWhatsAppInquiryUrl(payload);

    // Provide immediate transition feedback
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
    }
    if (submitText) {
      submitText.textContent = 'Opening WhatsApp...';
    }
    if (redirectNotice) {
      redirectNotice.style.display = 'block';
    }

    // Expose target URL for verification and automated tests
    if (typeof window !== 'undefined') {
      window.__lastWhatsAppInquiryUrl = targetUrl;
    }

    // Redirect visitor directly into WhatsApp conversation
    // window.location.href avoids browser popup blockers on both desktop and mobile
    window.location.href = targetUrl;

    // Fallback: in case navigation is delayed, keep button responsive
    setTimeout(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
      }
      if (submitText) {
        submitText.textContent = 'Send Message';
      }
    }, 2500);
  });
});
}
