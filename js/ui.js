/* ==========================================================================
   OMA · общие элементы интерфейса: шапка, переключатель версий, корзина, тосты
   ========================================================================== */
(function (global) {
    'use strict';

    var OMA = global.OMA;

    function onCartPage() {
        var page = document.body.dataset.page;
        return page === 'client' || page === 'master';
    }

    function cartAnchor() {
        return document.getElementById('cart') ||
            document.getElementById('client-cart') ||
            document.getElementById('live-cart');
    }

    /* --------------------------------------------------------------- шапка */

    var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>';
    var ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12h11.2L21 8H6"></path><circle cx="9.5" cy="20" r="1.5"></circle><circle cx="18.5" cy="20" r="1.5"></circle></svg>';

    function siteHeader() {
        var page = document.body.dataset.page;
        var host = document.getElementById('site-header');
        if (!host) return;

        function navItem(href, label, key, extraClass) {
            var active = page === key ? ' active' : '';
            return '<a href="' + href + '" class="' + (extraClass || '') + active + '">' + label + '</a>';
        }

        host.innerHTML =
            '<div class="promo-strip"><a href="index.html#catalog">' +
            '<span class="promo-strip__full">Бесплатная доставка материалов от 100 BYN →</span>' +
            '<span class="promo-strip__short">Доставка от 100 BYN →</span>' +
            '</a></div>' +
            '<div class="topbar"><div class="topbar__inner">' +
            '<span class="topbar__city">Минск</span>' +
            '<a class="topbar__phone" href="tel:+375173301000">+375 (17) 330-10-00</a>' +
            '<nav class="topbar__links">' +
            '<a href="masters.html">Мастера</a>' +
            '<a href="index.html#help">Помощь</a>' +
            '<a href="index.html#contact">Адреса магазинов</a>' +
            '</nav></div></div>' +
            '<header class="header"><div class="header__inner">' +
            '<a class="logo" href="index.html" aria-label="ОМА"><img src="img/logo.png" alt="ОМА"></a>' +
            '<form class="search" role="search">' +
            '<input id="global-search" type="search" placeholder="Что ищем? Например, краску или ламинат" aria-label="Поиск по сайту">' +
            '<button class="search__btn" type="submit" aria-label="Найти">' + ICON_SEARCH + '</button>' +
            '</form>' +
            '<div class="header-actions">' +
            '<button class="account-button" id="account-open" type="button">Войти / регистрация</button>' +
            '<button class="cart-button" id="cart-open" type="button">' + ICON_CART +
            '<span>Корзина</span><b id="cart-count">0</b></button>' +
            '</div></div></header>' +
            '<nav class="nav"><div class="nav__inner">' +
            '<a class="nav__catalog' + (page === 'catalog' ? ' active' : '') + '" href="index.html#catalog">' +
            '<span class="nav__burger">☰</span>Каталог</a>' +
            navItem('masters.html', 'Услуги мастера', 'masters', 'nav__link--blue') +
            navItem('client.html#object-passport', 'Паспорта объектов', 'passport', 'nav__link--purple') +
            navItem('client.html#chat', 'Чаты', 'chat', 'nav__link--green') +
            '<a href="client.html">Кабинет</a>' +
            '<a href="index.html?search=%D0%98%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B">Инструменты</a>' +
            '<a href="index.html?search=%D0%9A%D1%80%D0%B0%D1%81%D0%BA%D0%B8">Краски</a>' +
            '<a href="index.html?search=%D0%9E%D1%81%D0%B2%D0%B5%D1%89%D0%B5%D0%BD%D0%B8%D0%B5">Освещение</a>' +
            '<a href="index.html?search=%D0%9F%D0%BB%D0%B8%D1%82%D0%BA%D0%B0">Плитка</a>' +
            '</div></nav>';

        var form = host.querySelector('.search');
        var search = document.getElementById('global-search');
        if (form && search) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                var value = search.value.trim();
                location.href = 'index.html' + (value ? '?search=' + encodeURIComponent(value) : '#catalog');
            });
        }

        var cartButton = document.getElementById('cart-open');
        if (cartButton) {
            cartButton.addEventListener('click', function () {
                if (onCartPage()) {
                    var anchor = cartAnchor();
                    if (anchor) {
                        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        anchor.classList.add('is-flashing');
                        setTimeout(function () { anchor.classList.remove('is-flashing'); }, 1200);
                    }
                } else {
                    openCartDrawer();
                }
            });
        }
        var accountButton = document.getElementById('account-open');
        if (accountButton) accountButton.addEventListener('click', openRegistration);
        updateCartBadge();
    }

    function openRegistration() {
        var existing = document.getElementById('registration-backdrop');
        if (existing) existing.remove();
        var backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'registration-backdrop';
        backdrop.innerHTML =
            '<section class="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">' +
            '<button class="registration-modal__close" type="button" data-close-registration aria-label="Закрыть">×</button>' +
            '<span class="eyebrow">ОМА</span><h2 id="registration-title">Войти или зарегистрироваться</h2>' +
            '<p class="note">Выберите роль один раз — нужный кабинет откроется после регистрации.</p>' +
            '<form id="registration-form">' +
            '<label><span>Имя</span><input class="input" name="name" required placeholder="Как к вам обращаться"></label>' +
            '<label><span>Телефон или e-mail</span><input class="input" name="contact" required placeholder="+375..."></label>' +
            '<div class="registration-roles">' +
            '<button class="registration-role" type="submit" data-role="client"><b>Я заказчик</b><small>Паспорта объектов, чат и заказ</small></button>' +
            '<button class="registration-role" type="submit" data-role="master"><b>Я мастер</b><small>Услуги, заявки и сметы</small></button>' +
            '</div></form></section>';
        document.body.append(backdrop);
        backdrop.addEventListener('click', function (event) {
            if (event.target === backdrop || event.target.closest('[data-close-registration]')) {
                backdrop.remove();
                return;
            }
            var roleButton = event.target.closest('[data-role]');
            if (!roleButton) return;
            event.preventDefault();
            var form = document.getElementById('registration-form');
            var data = new FormData(form);
            if (!data.get('name') || !data.get('contact')) return;
            localStorage.setItem('oma:profile', JSON.stringify({
                name: String(data.get('name')).trim(),
                contact: String(data.get('contact')).trim(),
                role: roleButton.dataset.role
            }));
            location.href = roleButton.dataset.role === 'master' ? 'master.html' : 'client.html';
        });
    }

    /* -------------------------------------------------------------- подвал */

    function siteFooter() {
        var host = document.getElementById('site-footer');
        if (!host) return;
        host.innerHTML =
            '<footer class="footer" id="contact">' +
            '<div class="footer__grid">' +
            '<div><b>ОМА · гипермаркет</b><p>Стройматериалы, инструменты и мастера — всё для ремонта в одном месте.</p></div>' +
            '<div><b>Покупателям</b><a href="index.html">Каталог</a><a href="masters.html">Выбрать мастера</a>' +
            '<a href="client.html">Кабинет клиента</a><a href="index.html#help">Как это работает</a></div>' +
            '<div><b>Мастерам</b><a href="master.html">Кабинет мастера</a><a href="masters.html">Заявки клиентов</a></div>' +
            '<div><b>Контакты</b><span>+375 (17) 330-10-00</span><span>ooo@oma.by</span>' +
            '<span>Минск, пр-т Победителей 84</span></div>' +
            '</div>' +
            '<div class="footer__note">© 1992–2026 ООО «ОМА» · Всё для дома и ремонта</div>' +
            '</footer>';
    }

    /* --------------------------------------------------------------- тосты */

    function toast(text, tone) {
        var host = document.getElementById('toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toast-host';
            document.body.append(host);
        }
        /* одинаковые подряд тосты не дублируем: обновляем текст и продлеваем показ */
        var same = Array.prototype.filter.call(host.children, function (node) {
            return node.dataset.text === text;
        })[0];
        if (same) {
            clearTimeout(Number(same.dataset.timer));
            var timerId = setTimeout(function () { dismiss(same); }, 2400);
            same.dataset.timer = String(timerId);
            return;
        }
        var node = document.createElement('div');
        node.className = 'toast' + (tone ? ' toast--' + tone : '');
        node.dataset.text = text;
        node.textContent = text;
        host.append(node);
        while (host.children.length > 3) host.firstElementChild.remove();
        node.dataset.timer = String(setTimeout(function () { dismiss(node); }, 2400));
    }

    function dismiss(node) {
        if (!node || !node.isConnected) return;
        node.classList.add('is-leaving');
        setTimeout(function () { node.remove(); }, 300);
    }

    /* -------------------------------------------------------------- корзина */

    function updateCartBadge() {
        var badge = document.getElementById('cart-count');
        if (!badge) return;
        badge.textContent = OMA.cartCount(OMA.getState().clientCart);
    }

    function renderCartDrawerItems(cart) {
        if (!cart.items.length) {
            return '<div class="empty">Корзина пока пуста. Добавьте материалы из каталога или откройте корзину мастера в чате.</div>';
        }
        return cart.items.map(function (item) {
            return '<div class="cart-item">' +
                '<img src="' + item.image + '" alt="">' +
                '<div><p>' + item.name + '</p><small>' + OMA.money(item.price) + ' BYN × ' + item.qty + '</small>' +
                (item.from ? '<span class="from-badge">от мастера ' + item.from.masterName + '</span>' : '') +
                '</div>' +
                '<button class="remove" type="button" data-remove="' + item.productId + '">Удалить</button>' +
                '</div>';
        }).join('');
    }

    function openCartDrawer() {
        closeCartDrawer();
        var cart = OMA.getState().clientCart;
        var backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'cart-backdrop';
        backdrop.innerHTML =
            '<aside class="cart" role="dialog" aria-label="Корзина">' +
            '<div class="cart-head"><h2>Корзина (' + OMA.cartCount(cart) + ')</h2>' +
            '<button type="button" aria-label="Закрыть" data-close="1">×</button></div>' +
            '<div class="cart-items">' + renderCartDrawerItems(cart) + '</div>' +
            '<div class="cart-total"><span>Итого</span><span>' + OMA.money(OMA.cartTotal(cart)) + ' BYN</span></div>' +
            '<a class="button button-dark cart-checkout" href="client.html#cart">Перейти к оплате</a>' +
            '</aside>';
        document.body.append(backdrop);

        backdrop.addEventListener('click', function (event) {
            if (event.target === backdrop || event.target.closest('[data-close]')) {
                closeCartDrawer();
                return;
            }
            var removeId = event.target.dataset.remove;
            if (removeId) {
                var result = OMA.actions.clientRemove(Number(removeId));
                if (result && result.ok === false && result.message) toast(result.message, 'warn');
                closeCartDrawer();
                openCartDrawer();
                updateCartBadge();
            }
        });
    }

    function closeCartDrawer() {
        var existing = document.getElementById('cart-backdrop');
        if (existing) existing.remove();
    }

    /* --------------------------------------------------------------- запуск */

    function boot(options) {
        var settings = options || {};
        siteHeader();
        siteFooter();
        OMA.subscribe(function (state) {
            updateCartBadge();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeCartDrawer();
        });
        document.addEventListener('click', function (event) {
            if (event.target.closest('[data-open-registration]')) openRegistration();
        });

        if (settings.onState) {
            OMA.subscribe(settings.onState);
        }

        var reset = document.getElementById('demo-reset');
        if (reset) {
            reset.addEventListener('click', function () {
                if (confirm('Сбросить демо-данные (корзину, чат, сметы)?')) {
                    OMA.actions.reset();
                    location.reload();
                }
            });
        }
    }

    global.OMAUI = {
        boot: boot,
        header: siteHeader,
        footer: siteFooter,
        toast: toast,
        openCartDrawer: openCartDrawer,
        closeCartDrawer: closeCartDrawer,
        updateCartBadge: updateCartBadge
    };
})(window);
