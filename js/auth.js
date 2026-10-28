(function () {
    var role = localStorage.getItem('oma:role');
    var path = window.location.pathname;

    if (!role && path !== '/login.html') {
        window.location.href = 'login.html';
    } else if (role === 'client' && (path === '/master.html' || path === '/masters.html')) {
        // Можно оставить доступ, или перенаправить. Пока оставляем.
    } else if (role === 'master' && path === '/client.html') {
        // Можно оставить доступ, или перенаправить. Пока оставляем.
    }
})();
