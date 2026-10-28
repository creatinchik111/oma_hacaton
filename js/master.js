/* ==========================================================================
   OMA · версия мастера: чат, смета, живая корзина клиента, оплата
   ========================================================================== */
(function (global) {
    'use strict';

    var OMA = global.OMA;
    var money = OMA.money;
    var $ = function (selector, root) { return (root || document).querySelector(selector); };

    var ui = {
        search: '',
        lastMessageCount: 0,
        prevItems: null,
        identity: localStorage.getItem('oma:master-id')
    };

    function state() { return OMA.getState(); }

    /* Мастер «в кабинете»: явно выбранный в селекте или тот, кого выбрал клиент. */
    function masterId() {
        var current = state();
        if (ui.identity) return Number(ui.identity);
        if (current.activeMasterId) return current.activeMasterId;
        var first = OMA.masters()[0];
        return first ? first.id : null;
    }

    function setHTML(selector, html) {
        var node = $(selector);
        if (!node) return;
        if (node.innerHTML !== html) node.innerHTML = html;
    }

    function tierLabel(product) {
        return (global.TIERS && global.TIERS[product.tier]) || '';
    }

    function renderPassport() {
        var current = state();
        var chat = OMA.chatFor(current, current.activeMasterId);
        var passport = current.passports.filter(function (item) {
            return item.id === (chat && chat.passportId);
        })[0] || current.objectPassport;
        var body = $('#master-passport-body');
        if (!body || !passport) return;

        var materialHTML = passport.materials.length ? passport.materials.map(function (item) {
            var alternatives = OMA.products().filter(function (product) {
                return product.id !== item.productId &&
                    product.category === item.category &&
                    product.price <= passport.budget;
            }).slice(0, 2);
            return '<div class="master-material">' +
                '<div><b>' + item.name + '</b><small>Нужно: ' + item.qty + ' шт. · ' + money(item.price) + ' BYN/шт. · ' + item.status + '</small></div>' +
                '<button class="button button-ghost button--sm" type="button" data-add-to-draft="' + item.productId + '" data-add-qty="' + item.qty + '">Взять этот</button>' +
                (alternatives.length ? '<div class="material-alternatives"><span>Альтернатива по бюджету:</span>' +
                    alternatives.map(function (alternative) {
                        return '<button class="link-button" type="button" data-add-to-draft="' + alternative.id + '" data-add-qty="' + item.qty + '">' + alternative.name + ' · ' + money(alternative.price) + ' BYN</button>';
                    }).join('') + '</div>' : '<small class="note">В каталоге нет более доступной альтернативы в этой категории.</small>') +
                '</div>';
        }).join('') : '<p class="note">Клиент ещё не добавил материалы в паспорт.</p>';

        body.innerHTML =
            '<div class="passport-toolbar">' +
            '<label><span>Паспорт, выбранный клиентом</span><select class="select" id="master-passport-select">' +
            current.passports.map(function (item) {
                return '<option value="' + item.id + '"' + (item.id === current.activePassportId ? ' selected' : '') + '>' + item.name + '</option>';
            }).join('') +
            '</select></label>' +
            '<span class="chip chip--yellow">клиент передал мастеру</span>' +
            '</div>' +
            '<div class="passport-summary">' +
            '<div><span>Объект</span><b>' + passport.objectType + '</b></div>' +
            '<div><span>Бюджет материалов</span><b>' + money(passport.budget) + ' BYN</b></div>' +
            '</div>' +
            '<div class="passport-detail"><b>Состав объекта</b><p>' + (passport.rooms || 'не указан') + '</p></div>' +
            '<div class="passport-detail"><b>Проблема</b><p>' + (passport.problem || 'не указана') + '</p></div>' +
            '<div class="passport-materials"><h3>Материалы и подбор</h3>' + materialHTML + '</div>';
    }

    /* ------------------------------------------------------------- статус-бар */

    function renderStatus() {
        var current = state();
        var cart = current.clientCart;
        var chips = [];

        chips.push('<span class="chip chip--dark">клиент: ' + current.client.name.split(' ')[0] + '</span>');
        chips.push(cart.items.length
            ? '<span class="chip">в корзине клиента · ' + OMA.cartCount(cart) + ' шт.</span>'
            : '<span class="chip">корзина клиента пуста</span>');
        chips.push(cart.status === 'paid'
            ? '<span class="chip chip--green">✓ оплачено ' + OMA.stampTime(cart.paidAt) + '</span>'
            : '<span class="chip chip--yellow">ожидает оплаты</span>');
        if (cart.delivery) chips.push('<span class="chip">доставка: ' + cart.delivery.label + '</span>');
        if (cart.visit) chips.push('<span class="chip">приезд: ' + cart.visit.label + '</span>');

        $('#statusbar').innerHTML = chips.join('');
    }

    /* ----------------------------------------------------------------- шапка */

    function renderBar() {
        var master = OMA.masterById(masterId());
        var options = OMA.masters().map(function (item) {
            return '<option value="' + item.id + '"' + (item.id === masterId() ? ' selected' : '') + '>' + item.name + '</option>';
        }).join('');

        var html = (master
            ? '<img class="master-bar__avatar" src="' + master.image + '" alt="' + master.name + '">' +
            '<div><b>' + master.name + ' · PRO</b>' +
            '<small>' + master.specialty + ' · ' + master.experience + ' · ★ ' + master.rating + ' · ' + master.city + '</small></div>'
            : '<div><b>Мастер</b></div>') +
            '<div class="master-bar__right">' +
            '<label class="small" style="color:#c9c4ae" for="identity">вы вошли как</label>' +
            '<select class="select" id="identity" aria-label="Мастер">' + options + '</select>' +
            '<a class="button button-light button--sm" href="client.html#chat">Открыть чат клиента</a>' +
            '</div>';

        setHTML('#master-bar', html);
    }

    /* ------------------------------------------------------------------- чат */

    function cartCard(message) {
        var current = state();
        var proposal = OMA.proposalById(current, message.proposalId);
        if (!proposal) return '';
        var master = OMA.masterById(proposal.masterId);
        var actions = '';

        if (proposal.status === 'shared') {
            actions = '<span class="chip chip--yellow">отправлена · ждёт открытия</span>';
        } else if (proposal.status === 'opened') {
            actions = '<span class="chip chip--opened">клиент открыл · редактирует</span>' +
                '<button class="link-button" type="button" data-scroll="live-cart">живая корзина</button>';
        } else if (proposal.status === 'paid') {
            actions = '<span class="chip chip--green">✓ оплачено · ' + OMA.stampTime(proposal.paidAt) + '</span>';
        }

        return '<div class="msg msg--cart"><div class="chat-cart">' +
            '<span class="chat-cart__kicker">Вы отправили корзину</span>' +
            '<span class="chat-cart__title">' + (master ? master.name : 'Вы') + ' · ' +
            proposal.items.length + ' поз. · ' + OMA.proposalCount(proposal) + ' шт.</span>' +
            '<span class="chat-cart__meta">Итого ' + money(OMA.proposalTotal(proposal)) + ' BYN</span>' +
            '<div class="chat-cart__actions">' + actions + '</div>' +
            '</div></div>';
    }

    function messageHTML(message, role) {
        if (message.kind === 'system') return '<div class="msg msg--system">' + message.text + '</div>';
        if (message.kind === 'cart') return cartCard(message);
        return '<div class="msg' + (message.from === role ? ' msg--mine' : '') + '">' + message.text +
            '<span class="msg__meta">' + OMA.stampTime(message.ts) + '</span></div>';
    }

    function renderChat() {
        var current = state();
        var master = OMA.masterById(masterId());
        var chat = master ? OMA.chatFor(current, master.id) : null;
        var input = $('#chat-input');
        var submit = $('#chat-form button');
        var log = $('#chat-log');

        var chosen = OMA.masterById(current.activeMasterId);
        var waitingForOther = chosen && master && chosen.id !== master.id;

        if (!chat) {
            $('#chat-head').innerHTML = '<div><b>' + current.client.name + '</b><small>диалог ещё не открыт</small></div>';
            $('#chat-chip').textContent = 'нет диалога';
            log.innerHTML = '<div class="msg msg--system">' +
                (waitingForOther
                    ? 'Клиент сейчас работает с мастером ' + chosen.name + '. Выберите себя в списке выше или попросите клиента выбрать вас.'
                    : 'Клиент ещё не открыл с вами чат. Как только он выберет вашу карточку, здесь появится диалог.') +
                '</div>';
            input.disabled = true;
            submit.disabled = true;
            return;
        }

        input.disabled = false;
        submit.disabled = false;
        $('#chat-head').innerHTML = '<div><b>' + current.client.name + '</b><small>' + current.client.phone + ' · ' + current.client.address + '</small></div>';
        $('#chat-chip').textContent = 'на связи';

        log.innerHTML = chat.messages.length
            ? chat.messages.map(function (message) { return messageHTML(message, 'master'); }).join('')
            : '<div class="msg msg--system">Диалог открыт. Напишите клиенту первое сообщение.</div>';

        if (chat.messages.length !== ui.lastMessageCount) {
            log.scrollTop = log.scrollHeight;
            ui.lastMessageCount = chat.messages.length;
        }

        if (OMA.unreadFor(current, chat, 'master') > 0) {
            OMA.actions.markSeen('master');
        }
    }

    /* --------------------------------------------------- живая корзина клиента */

    function renderLiveCart() {
        var current = state();
        var cart = current.clientCart;
        var body = $('#live-cart-body');
        var indicator = $('#live-indicator .live__time');

        indicator.textContent = cart.updatedAt ? 'обновлено ' + OMA.stampTime(cart.updatedAt) : 'ожидание';

        if (!cart.items.length) {
            body.innerHTML = '<p class="note">Клиент пока не добавил товары. Как только он откроет вашу корзину или добавит что-то сам — всё появится здесь.</p>';
            ui.prevItems = {};
            return;
        }

        var changed = {};
        var previous = ui.prevItems || {};
        cart.items.forEach(function (item) {
            if (previous[item.productId] !== item.qty) changed[item.productId] = true;
        });
        ui.prevItems = cart.items.reduce(function (map, item) {
            map[item.productId] = item.qty;
            return map;
        }, {});

        var html = '<div class="cart-lines">' + cart.items.map(function (item) {
            return '<div class="cart-line' + (changed[item.productId] ? ' flash' : '') + '">' +
                '<img src="' + item.image + '" alt="">' +
                '<div><p class="cart-line__name">' + item.name + '</p>' +
                '<div class="cart-line__meta">' +
                '<span class="chip">' + item.qty + ' шт.</span>' +
                (item.from ? '<span class="from-badge">из вашей сметы</span>' : '<span class="chip chip--yellow">добавил клиент</span>') +
                '</div></div>' +
                '<div class="cart-line__sum">' + money(item.price * item.qty) + ' BYN</div>' +
                '</div>';
        }).join('') + '</div>';

        html += '<div class="cart-total-row"><span>Итого · ' + OMA.cartCount(cart) + ' шт.</span><b>' +
            (cart.status === 'paid' ? '<span class="check" style="margin-right:8px">✓</span>' : '') +
            money(OMA.cartTotal(cart)) + ' BYN</b></div>';

        if (cart.status === 'paid') {
            html += '<div class="paid-banner" style="margin-top:14px"><span class="check">✓</span>' +
                '<span>Клиент оплатил · ' + OMA.stampTime(cart.paidAt) + '</span></div>';
        } else {
            html += '<div class="order-card__foot" style="margin-top:12px">' +
                '<span class="chip chip--yellow">ожидает оплаты</span>' +
                '<span class="chip">правки клиента приходят сразу</span></div>';
        }

        if (cart.delivery || cart.visit) {
            html += '<div class="order-card__schedule">' +
                (cart.delivery ? '<div><span>Доставка материалов:</span> <b>' + cart.delivery.label + '</b></div>' : '') +
                (cart.visit ? '<div><span>Приезд мастера:</span> <b>' + cart.visit.label + '</b></div>' : '') +
                '</div>';
        }

        body.innerHTML = html;
    }

    /* ------------------------------------------------------------------ смета */

    function renderBuilder() {
        var current = state();
        var master = OMA.masterById(masterId());
        var draft = OMA.draftFor(current, masterId());
        var body = $('#builder-body');
        var stateChip = $('#builder-state');
        var paid = current.clientCart.status === 'paid';

        if (!master) {
            body.innerHTML = '<p class="note">Сначала выберите, кто вы.</p>';
            return;
        }

        if (paid) {
            stateChip.innerHTML = '<span class="chip chip--green">заказ оплачен</span>';
            body.innerHTML = '<p class="note">Клиент оплатил корзину. Новая смета в демо-режиме недоступна — сбросьте данные, чтобы пройти сценарий заново.</p>';
            return;
        }

        if (!draft) {
            var lastShared = OMA.proposalsFor(current, masterId()).filter(function (proposal) {
                return proposal.status !== 'draft';
            }).slice(-1)[0];

            stateChip.innerHTML = '<span class="chip chip--draft">черновик</span>';
            body.innerHTML = '<p class="note">Соберите смету из каталога справа — и отправьте её клиенту одной кнопкой.</p>' +
                (lastShared
                    ? '<div class="chip chip--opened" style="margin-top:12px">последняя смета: ' +
                    (lastShared.status === 'paid' ? 'оплачена' : lastShared.status === 'opened' ? 'у клиента' : 'отправлена') +
                    ' · ' + money(OMA.proposalTotal(lastShared)) + ' BYN</div>'
                    : '');
            return;
        }

        stateChip.innerHTML = '<span class="chip chip--draft">' + OMA.proposalCount(draft) + ' шт.</span>';

        body.innerHTML =
            '<div class="builder">' + draft.items.map(function (item) {
                return '<div class="builder-line">' +
                    '<span class="builder-line__name">' + item.name + '</span>' +
                    '<div class="qty qty--sm"><button type="button" data-builder-step="-1" data-id="' + item.productId + '" aria-label="Меньше">−</button>' +
                    '<span>' + item.qty + '</span>' +
                    '<button type="button" data-builder-step="1" data-id="' + item.productId + '" aria-label="Больше">+</button></div>' +
                    '<span class="builder-line__sum">' + money(item.price * item.qty) + ' BYN</span>' +
                    '</div>';
            }).join('') + '</div>' +
            '<div class="builder__total"><span>Итого</span><b>' + money(OMA.proposalTotal(draft)) + ' BYN</b></div>' +
            '<div class="pay-box">' +
            '<button class="button button-dark button--wide" type="button" data-share="' + draft.id + '">Поделиться корзиной</button>' +
            '<p class="cart-hint">Клиент получит в чате кнопку «Открыть корзину». Позиции попадут в его корзину с пометкой, что составили вы.</p>' +
            '</div>';
    }

    function renderMiniCatalog() {
        var current = state();
        var paid = current.clientCart.status === 'paid';
        var query = ui.search.trim().toLowerCase();
        var list = OMA.products().filter(function (product) {
            return !query || product.name.toLowerCase().indexOf(query) !== -1;
        });

        setHTML('#mini-catalog', list.length ? list.map(function (product) {
            return '<div class="mini-row">' +
                '<img src="' + product.image + '" alt="">' +
                '<div><b>' + product.name + '</b><small>' + product.category + ' · ' + tierLabel(product) + '</small>' +
                '<small class="mini-row__price">' + money(product.price) + ' BYN</small></div>' +
                '<button class="mini-row__add" type="button" data-add-to-draft="' + product.id + '"' +
                (paid ? ' disabled' : '') + ' aria-label="Добавить в смету">+</button>' +
                '</div>';
        }).join('') : '<div class="empty empty--pad">Ничего не найдено</div>');
    }

    /* ------------------------------------------------------------------ сметы */

    function orderStatus(proposal) {
        if (proposal.status === 'draft') return '<span class="status status--draft">черновик</span>';
        if (proposal.status === 'shared') return '<span class="status status--shared">отправлена клиенту</span>';
        if (proposal.status === 'opened') return '<span class="status status--opened">клиент редактирует</span>';
        if (proposal.status === 'paid') return '<span class="status status--paid">✓ оплачено</span>';
        return '<span class="status">' + proposal.status + '</span>';
    }

    function renderOrders() {
        var current = state();
        var list = OMA.proposalsFor(current, masterId()).slice().sort(function (a, b) {
            return (b.sharedAt || b.createdAt) - (a.sharedAt || a.createdAt);
        });
        var body = $('#orders-body');

        if (!list.length) {
            body.innerHTML = '<p class="note">Пока нет смет. Соберите первую из каталога — она появится здесь после отправки.</p>';
            return;
        }

        body.innerHTML = list.map(function (proposal) {
            var paid = proposal.status === 'paid';
            var when = proposal.sharedAt ? OMA.stampTime(proposal.sharedAt) : 'черновик';
            var items = proposal.items.slice(0, 4).map(function (item) {
                return '<div class="order-card__item"><span>' + item.name + '</span><span>' + item.qty + ' шт.</span></div>';
            }).join('');
            var more = proposal.items.length > 4
                ? '<div class="order-card__item"><span class="muted">и ещё ' + (proposal.items.length - 4) + ' поз.</span></div>'
                : '';

            return '<div class="order-card' + (paid ? ' order-card--live' : '') + '">' +
                '<div class="order-card__top">' +
                '<b>Смета · ' + money(OMA.proposalTotal(proposal)) + ' BYN</b>' +
                orderStatus(proposal) +
                '</div>' +
                '<div class="order-card__items">' + items + more + '</div>' +
                '<div class="order-card__total"><span>Итого</span><span>' + money(OMA.proposalTotal(proposal)) + ' BYN</span></div>' +
                '<div class="order-card__foot">' +
                '<span class="small muted">' + when + '</span>' +
                (paid
                    ? '<span class="small muted">оплачено в ' + OMA.stampTime(proposal.paidAt) + '</span>'
                    : '<span class="chip">' + proposal.items.length + ' поз. · ' + OMA.proposalCount(proposal) + ' шт.</span>') +
                '</div>' +
                (paid && (current.clientCart.delivery || current.clientCart.visit)
                    ? '<div class="order-card__schedule">' +
                    (current.clientCart.delivery ? '<div><span>Доставка:</span> <b>' + current.clientCart.delivery.label + '</b></div>' : '') +
                    (current.clientCart.visit ? '<div><span>Приезд мастера:</span> <b>' + current.clientCart.visit.label + '</b></div>' : '') +
                    '</div>'
                    : '') +
                '</div>';
        }).join('');
    }

    /* ------------------------------------------------------------------- рендер */

    function render() {
        renderStatus();
        renderBar();
        renderPassport();
        renderChat();
        renderLiveCart();
        renderBuilder();
        renderMiniCatalog();
        renderOrders();
    }

    function scrollTo(id) {
        var node = document.getElementById(id);
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        node.classList.add('is-flashing');
        setTimeout(function () { node.classList.remove('is-flashing'); }, 1200);
    }

    /* ------------------------------------------------------------------ события */

    function bindEvents() {
        $('#search-products').addEventListener('input', function (event) {
            ui.search = event.target.value;
            renderMiniCatalog();
        });

        $('#master-bar').addEventListener('change', function (event) {
            if (event.target.id !== 'identity') return;
            ui.identity = event.target.value;
            localStorage.setItem('oma:master-id', ui.identity);
            ui.lastMessageCount = 0;
            ui.prevItems = null;
            render();
        });

        document.addEventListener('change', function (event) {
            if (event.target.id === 'master-passport-select') {
                OMA.actions.selectPassport(event.target.value);
                OMAUI.toast('Паспорт открыт');
            }
        });

        $('#chat-form').addEventListener('submit', function (event) {
            event.preventDefault();
            var input = $('#chat-input');
            var result = OMA.actions.sendMessage('master', input.value);
            if (result && result.ok) {
                input.value = '';
                ui.lastMessageCount = 0;
                render();
            }
        });

        document.addEventListener('click', function (event) {
            var target = event.target;

            var scrollTarget = target.closest('[data-scroll]');
            if (scrollTarget) {
                scrollTo(scrollTarget.dataset.scroll);
                return;
            }

            var add = target.closest('[data-add-to-draft]');
            if (add) {
                OMA.actions.masterAdd(masterId(), Number(add.dataset.addToDraft), Number(add.dataset.addQty) || 1);
                OMAUI.toast('Добавлено в смету');
                return;
            }

            var step = target.closest('[data-builder-step]');
            if (step) {
                var draft = OMA.draftFor(state(), masterId());
                if (!draft) return;
                var productId = Number(step.dataset.id);
                var line = draft.items.filter(function (item) { return item.productId === productId; })[0];
                OMA.actions.masterSetQty(draft.id, productId, (line ? line.qty : 1) + Number(step.dataset.builderStep));
                return;
            }

            var remove = target.closest('[data-builder-remove]');
            if (remove) {
                var currentDraft = OMA.draftFor(state(), masterId());
                if (currentDraft) OMA.actions.masterRemove(currentDraft.id, Number(remove.dataset.builderRemove));
                return;
            }

            var share = target.closest('[data-share]');
            if (share) {
                var shared = OMA.actions.masterShare(share.dataset.share);
                if (shared && shared.ok) {
                    OMAUI.toast('Корзина отправлена клиенту — ждём открытия');
                    scrollTo('chat');
                } else if (shared && shared.message) {
                    OMAUI.toast(shared.message, 'warn');
                }
                return;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        OMAUI.boot();
        bindEvents();
        OMA.subscribe(render);
        render();
    });
})(window);
