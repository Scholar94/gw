  window.cacReady.then(function () {
    if (!window.cacAuth || !window.cacAuth.available()) { location.replace('admin-login.html'); return; }
    window.cacAuth.onChange(function (user, role) {
      if (!user || !role) { location.replace('admin-login.html'); return; }
      window.cacRole = role; document.body.classList.add('authed');
      var el = document.querySelector('.admin-name'); if (el) el.textContent = user.email;
    });
  });
