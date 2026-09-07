/**
 * Isabela Provincial Assessor Tax Mapping System
 * Minimal Authentication Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const submitBtn = document.getElementById('submit-btn');
  const formAlert = document.getElementById('form-alert');
  const rolePills = document.querySelectorAll('.role-pill');
  const toast = document.getElementById('ex-toast');
  const liveClock = document.getElementById('live-clock');

  // Role credentials preset map
  const rolePresets = {
    'PROVINCIAL_ASSESSOR': {
      user: 'assessor.pgi',
      pass: 'IsabelaAssessor2026!',
      label: 'Provincial Assessor'
    },
    'GIS_TAX_MAPPER': {
      user: 'taxmapper.gis',
      pass: 'IsabelaGIS#2026',
      label: 'GIS Tax Mapping Lead'
    },
    'MUNICIPAL_APPRAISER': {
      user: 'appraiser.ilagan',
      pass: 'Appraise2026!',
      label: 'LGU Appraiser'
    },
    'RECORDS_OFFICER': {
      user: 'records.inquiry',
      pass: 'Records2026!',
      label: 'Records & Inquiries'
    }
  };

  // 1. Password Visibility Toggle
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      
      const icon = togglePasswordBtn.querySelector('svg');
      if (icon) {
        if (isPassword) {
          icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
        } else {
          icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
        }
      }
    });
  }

  // 2. Role Pill Selector & Autofill
  rolePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rolePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const roleKey = pill.getAttribute('data-role');
      if (rolePresets[roleKey]) {
        usernameInput.value = rolePresets[roleKey].user;
        passwordInput.value = rolePresets[roleKey].pass;
        hideAlert();
        showToast(rolePresets[roleKey].label);
      }
    });
  });

  // 3. Form Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showAlert('Officer ID and password required.', 'error');
        return;
      }

      const originalBtnText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showAlert(`Access granted. Redirecting...`, 'success');
          setTimeout(() => {
            window.location.href = result.redirect_url || '/dashboard';
          }, 600);
        } else {
          showAlert(result.message || 'Invalid credentials.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      } catch (err) {
        showAlert('Gateway connection error.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    });
  }

  // Alert
  function showAlert(msg, type = 'error') {
    if (!formAlert) return;
    formAlert.textContent = msg;
    formAlert.className = `form-alert visible ${type}`;
  }

  function hideAlert() {
    if (!formAlert) return;
    formAlert.className = 'form-alert';
    formAlert.textContent = '';
  }

  // Toast
  let toastTimeout;
  function showToast(msg) {
    if (!toast) return;
    const toastText = toast.querySelector('.toast-text') || toast;
    toastText.textContent = msg;
    toast.classList.add('visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2400);
  }

  // Real-time PST Clock
  function updateClock() {
    if (!liveClock) return;
    const now = new Date();
    const options = {
      timeZone: 'Asia/Manila',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    liveClock.textContent = `PST ${now.toLocaleTimeString('en-GB', options)}`;
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Video Autoplay Safeguard
  const taxmapVideo = document.getElementById('taxmap-video');
  if (taxmapVideo) {
    taxmapVideo.play().catch(() => {
      // Browser autoplay policy muted-fallback handler
      taxmapVideo.muted = true;
      taxmapVideo.play().catch(() => {});
    });
  }
});
