const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );

function showAlert(el, type, msg){
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('d-none');
}

document.addEventListener('DOMContentLoaded', () => {
  const requestForm = document.getElementById('requestForm');
  const resetForm = document.getElementById('resetForm');
  const reqMsg = document.getElementById('reqMsg');
  const resetMsg = document.getElementById('resetMsg');
  const stepRequest = document.getElementById('stepRequest');
  const stepReset = document.getElementById('stepReset');

  const emailInput = document.getElementById('fp_email');
  const otpInput = document.getElementById('fp_otp');
  const newInput = document.getElementById('fp_new');
  const confirmInput = document.getElementById('fp_confirm');

  if (!API_URL){
    showAlert(reqMsg, 'warning', 'Backend API URL is not configured.');
    return;
  }

  if (requestForm){
    requestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      reqMsg.classList.add('d-none');
      const email = emailInput.value.trim();
      if (!email) return showAlert(reqMsg, 'danger', 'Please enter your email');
      try{
        const res = await fetch(`${API_URL}/auth/request-reset`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) return showAlert(reqMsg, 'danger', data.error || 'Failed to send reset code');
        showAlert(reqMsg, 'success', 'Reset code sent. Check your inbox (and spam).');
        stepRequest.classList.add('d-none');
        stepReset.classList.remove('d-none');
      }catch(err){
        console.error('request-reset error:', err);
        showAlert(reqMsg, 'danger', 'Network error. Try again.');
      }
    });
  }

  if (resetForm){
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      resetMsg.classList.add('d-none');
      const email = emailInput.value.trim();
      const otp = otpInput.value.trim();
      const newPass = newInput.value;
      const confirm = confirmInput.value;
      if (!email || !otp || !newPass) return showAlert(resetMsg, 'danger', 'Please fill all fields');
      if (newPass !== confirm) return showAlert(resetMsg, 'danger', 'Passwords do not match');
      try{
        const res = await fetch(`${API_URL}/auth/reset-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp, new_password: newPass })
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) return showAlert(resetMsg, 'danger', data.error || 'Failed to reset password');
        showAlert(resetMsg, 'success', 'Password reset successful. You can now log in.');
        setTimeout(()=>{ window.location.href = 'index.html'; }, 1500);
      }catch(err){
        console.error('reset-password error:', err);
        showAlert(resetMsg, 'danger', 'Network error. Try again.');
      }
    });
  }
});
