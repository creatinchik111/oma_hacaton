/* ==========================================================================
   OMA · версия клиента: каталог, корзина, чат, оплата, доставка
   ========================================================================== */
(function (global) {
    'use strict';

    var OMA = global.OMA;
    var money = OMA.money;
    var $ = function (selector, root) { return (root || document).querySelector(selector); };

    var ui = {
        search: '',
        category: 'Все',
        showPicker: false,
        lastMessageCount: 0
    };

    function state() { return OMA.getState(); }

    function line(productId) {
        return state().clientCart.items.filter(function (item) {
            return item.productId === Number(productId);
        })[0] || null;
    }

    function qtyControl(productId, qty) {
        return '<div class="qty qty--sm" role="group" aria-label="Количество">' +
            '<button type="button" data-step="-1" data-id="' + productId + '" aria-label="Меньше">−</button>' +
            '<span>' + qty + '</span>' +
            '<button type="button" data-step="1" data-id="' + productId + '" aria-label="Больше">+</button>' +
            '</div>';
    }

    function tierLabel(product) {
        return (global.TIERS && global.TIERS[product.tier]) || '';
    }

    function renderPassport() {
        var current = state();
        var passport = current.objectPassport;
        var body = $('#passport-body');
        var stateChip = $('#passport-state');
        if (!body || !passport) return;
        stateChip.textContent = passport.updatedAt ? 'сохранён' : 'черновик';
        body.innerHTML =
            '<div class="passport-toolbar">' +
            '<label><span>Паспорт объекта</span><select class="select" id="passport-select">' +
            current.passports.map(function (item) {
                return '<option value="' + item.id + '"' + (item.id === current.activePassportId ? ' selected' : '') + '>' + item.name + '</option>';
            }).join('') +
            '</select></label>' +
            '<button class="button button-ghost button--sm" type="button" data-create-passport>+ Новый паспорт</button>' +
            '<button class="link-button" type="button" data-rename-passport>переименовать</button>' +
            '</div>' +
            '<form class="passport-form" id="passport-form">' +
            '<div class="form-grid">' +
            '<label><span>Тип объекта</span><select class="select" name="objectType">' +
            ['Квартира', 'Дом', 'Комната', 'Офис'].map(function (type) {
                return '<option' + (passport.objectType === type ? ' selected' : '') + '>' + type + '</option>';
            }).join('') + '</select></label>' +
            '<label><span>Бюджет на материалы, BYN</span><input class="input" type="number" min="0" step="50" name="budget" value="' + passport.budget + '"></label>' +
            '</div>' +
            '<label><span>Из чего состоит объект</span><textarea class="textarea" name="rooms" rows="3" placeholder="Например: кухня — 10 м², ванная — 6 м²">' + passport.rooms + '</textarea></label>' +
            '<label><span>Какая проблема и что нужно сделать</span><textarea class="textarea" name="problem" rows="3" placeholder="Опишите задачу для мастера">' + passport.problem + '</textarea></label>' +
            '<button class="button button-dark button--sm" type="submit">Сохранить паспорт</button>' +
            '</form>' +
            '<div class="passport-materials"><h3>Материалы клиента</h3>' +
            (passport.materials.length ? passport.materials.map(function (item) {
                return '<div class="passport-material"><span><b>' + item.name + '</b><small>' + item.qty + ' шт. · ' + item.status + '</small></span>' +
                    '<button class="link-button" type="button" data-remove-passport-material="' + item.productId + '">убрать</button></div>';
            }).join('') : '<p class="note">Добавьте материалы, которые клиент уже выбрал или хочет сравнить с альтернативами.</p>') +
            '<div class="passport-add"><select class="select" id="passport-product">' +
            OMA.products().map(function (product) {
                return '<option value="' + product.id + '">' + product.name + ' · ' + money(product.price) + ' BYN</option>';
            }).join('') + '</select><input class="input" id="passport-qty" type="number" min="1" value="1" aria-label="Количество"><button class="button button-ghost button--sm" type="button" data-add-passport-material>Добавить</button></div>' +
            '</div>';
    }

    /* ------------------------------------------------------------- статус-бар */

    function renderStatus() {
        var current = state();
        var cart = current.clientCart;
        var master = OMA.masterById(current.activeMasterId);
        var chips = [];

        chips.push(master
            ? '<span class="chip chip--dark">мастер: ' + master.name.split(' ')[0] + '</span>'
            : '<span class="chip">мастер не выбран</span>');
        chips.push(cart.items.length
            ? '<span class="chip">корзина · ' + OMA.cartCount(cart) + ' шт.</span>'
            : '<span class="chip">корзина пуста</span>');
        if (cart.status === 'paid') chips.push('<span class="chip chip--green">✓ оплачено</span>');
        if (cart.delivery) chips.push('<span class="chip chip--yellow">доставка: ' + cart.delivery.label + '</span>');
        if (cart.visit) chips.push('<span class="chip chip--yellow">приезд: ' + cart.visit.label + '</span>');

        $('#statusbar').innerHTML = chips.join('');
    }

    /* ---------------------------------------------------------------- мастер */

    function pickList(current) {
        return OMA.masters().map(function (master) {
            var active = current.activeMasterId === master.id;
            return '<button class="pick' + (active ? ' pick--active' : '') + '" type="button" data-select-master="' + master.id + '">' +
                '<img src="' + master.image + '" alt="' + master.name + '">' +
                '<span><b>' + master.name + '</b><small>★ ' + master.rating + ' · ' + master.specialty + '</small></span>' +
                '<span class="pick__cta">' + (active ? 'в чате' : 'выбрать') + '</span>' +
                '</button>';
        }).join('');
    }

    function renderMaster() {
        var current = state();
        var master = OMA.masterById(current.activeMasterId);
        var body = $('#master-body');

        if (!master) {
            $('#master-state').textContent = 'не выбран';
            body.innerHTML =
                '<p class="note" style="margin-bottom:12px">Выберите мастера — откроется чат, и он соберёт для вас корзину с материалами.</p>' +
                '<div class="pick-list">' + pickList(current) + '</div>';
            return;
        }

        var chat = OMA.chatFor(current, master.id);
        var unread = OMA.unreadFor(current, chat, 'client');
        $('#master-state').innerHTML = unread
            ? '<span class="chip chip--yellow">новых сообщений: ' + unread + '</span>'
            : 'выбран';

        body.innerHTML =
            '<div class="master-now">' +
            '<img src="' + master.image + '" alt="' + master.name + '">' +
            '<div><b>' + master.name + '</b>' +
            '<small>' + master.specialty + '</small>' +
            '</div></div>' +
            '<div class="chips" style="margin-top:12px">' +
            '<span class="chip">★ ' + master.rating + '</span>' +
            '<span class="chip">' + master.reviews + ' отзывов</span>' +
            '<span class="chip">' + master.experience + '</span>' +
            '<span class="chip">' + master.city + '</span>' +
            '</div>' +
            '<hr class="divider">' +
            '<div class="pay-box">' +
            '<button class="button button-dark button--sm" type="button" data-scroll="chat">Написать мастеру</button>' +
            '<button class="button button-ghost button--sm" type="button" data-toggle-picker="1">' +
            (ui.showPicker ? 'Скрыть список' : 'Сменить мастера') + '</button>' +
            '</div>' +
            (ui.showPicker ? '<div class="pick-list" style="margin-top:14px">' + pickList(current) + '</div>' : '');
    }

    /* --------------------------------------------------------------- каталог */

    function renderCatalog() {
        var current = state();
        var paid = current.clientCart.status === 'paid';
        var categories = ['Все'].concat(OMA.products().map(function (product) {
            return product.category;
        }).filter(function (category, index, all) {
            return all.indexOf(category) === index;
        }));

        $('#catalog-filters').innerHTML = categories.map(function (category) {
            return '<button class="chip-filter' + (ui.category === category ? ' is-active' : '') + '" type="button" data-category="' + category + '">' + category + '</button>';
        }).join('');

        var query = ui.search.trim().toLowerCase();
        var list = OMA.products().filter(function (product) {
            var byCategory = ui.category === 'Все' || product.category === ui.category;
            var bySearch = !query || product.name.toLowerCase().indexOf(query) !== -1;
            return byCategory && bySearch;
        });

        $('#client-catalog').innerHTML = list.length ? list.map(function (product) {
            var inCart = line(product.id);
            var control = paid
                ? (inCart ? '<span class="chip chip--green">в корзине · ' + inCart.qty + '</span>' : '')
                : (inCart ? qtyControl(product.id, inCart.qty)
                    : '<button class="add-button" type="button" data-add-product="' + product.id + '">В корзину</button>');
            return '<article class="product-card">' +
                '<a href="product.html?id=' + product.id + '" class="product-image-wrap">' +
                '<img class="product-image" src="' + product.image + '" alt="' + product.name + '">' +
                '<span class="label label--' + product.tier + '">' + tierLabel(product) + '</span></a>' +
                '<span class="category">' + product.category + '</span>' +
                '<h3><a href="product.html?id=' + product.id + '">' + product.name + '</a></h3>' +
                '<div class="product-bottom">' +
                '<span class="price">' + money(product.price) + ' <small>BYN</small></span>' +
                control +
                '</div></article>';
        }).join('') : '<div class="empty">По запросу ничего не найдено</div>';
    }

    /* --------------------------------------------------------------- корзина */

    function cartLineHTML(item, paid) {
        return '<div class="cart-line">' +
            '<img src="' + item.image + '" alt="">' +
            '<div>' +
            '<p class="cart-line__name">' + item.name + '</p>' +
            '<div class="cart-line__meta">' +
            (paid ? '<span class="chip">' + item.qty + ' шт.</span>' : qtyControl(item.productId, item.qty)) +
            (item.from ? '<span class="from-badge">от мастера ' + item.from.masterName + '</span>' : '') +
            '</div></div>' +
            '<div>' +
            '<div class="cart-line__sum">' + money(item.price * item.qty) + ' BYN</div>' +
            (paid ? '' : '<button class="cart-line__del" type="button" data-remove-line="' + item.productId + '">удалить</button>') +
            '</div></div>';
    }

    function slotButtons(kind, current) {
        return OMA.slotsFor(kind).map(function (slot) {
            var chosen = kind === 'delivery' ? current.delivery : current.visit;
            var active = chosen && chosen.id === slot.id;
            return '<button class="slot' + (active ? ' is-active' : '') + '" type="button" data-slot-kind="' + kind + '" data-slot-id="' + slot.id + '">' + slot.label + '</button>';
        }).join('');
    }

    function renderCart() {
        var current = state();
        var cart = current.clientCart;
        var paid = cart.status === 'paid';
        var body = $('#cart-body');

        $('#cart-chip').textContent = cart.items.length ? OMA.cartCount(cart) + ' шт.' : 'пусто';

        if (!cart.items.length) {
            body.innerHTML = '<p class="note">Корзина пуста. Добавьте материалы из каталога — или откройте в чате корзину, которую составил мастер.</p>';
            return;
        }

        var html = '';
        var fromMaster = cart.items.filter(function (item) { return item.from; })[0];
        if (fromMaster) {
            html += '<div class="chip chip--yellow" style="margin-bottom:12px">корзину составил мастер ' + fromMaster.from.masterName + '</div>';
        }

        html += '<div class="cart-lines">' + cart.items.map(function (item) {
            return cartLineHTML(item, paid);
        }).join('') + '</div>';

        html += '<div class="cart-total-row"><span>Итого · ' + OMA.cartCount(cart) + ' шт.</span><b>' + money(OMA.cartTotal(cart)) + ' BYN</b></div>';

        if (!paid) {
            html += '<div class="pay-box">' +
                '<button class="button button-dark button--wide" type="button" data-pay="1">Оплатить корзину</button>' +
                '<p class="cart-hint">Оплата картой онлайн (демо). Мастер увидит отметку об оплате сразу, а вы выберете время доставки.</p>' +
                '</div>';
        } else {
            html += '<div class="paid-banner"><span class="check">✓</span><span>Оплачено · ' + OMA.stampTime(cart.paidAt) + '</span></div>' +
                '<div class="slot-group"><div class="slot-group__title">Доставка материалов</div>' +
                '<div class="slots">' + slotButtons('delivery', cart) + '</div></div>' +
                '<div class="slot-group"><div class="slot-group__title">Приезд мастера</div>' +
                '<div class="slots">' + slotButtons('visit', cart) + '</div></div>' +
                '<div class="schedule">' +
                '<div class="schedule__row"><span>Доставка</span><b>' + (cart.delivery ? cart.delivery.label : 'не выбрана') + '</b></div>' +
                '<div class="schedule__row"><span>Приезд мастера</span><b>' + (cart.visit ? cart.visit.label : 'не выбран') + '</b></div>' +
                '<div class="schedule__row"><span>Адрес</span><b>' + current.client.address + '</b></div>' +
                '</div>' +
                (cart.delivery && cart.visit
                    ? '<p class="cart-hint">График сохранён — мастер видит его в своём кабинете.</p>'
                    : '<p class="cart-hint">Выберите время доставки материалов и приезда мастера.</p>');
        }

        body.innerHTML = html;
    }

    /* ------------------------------------------------------------------- чат */

    function cartCard(message, role) {
        var current = state();
        var proposal = OMA.proposalById(current, message.proposalId);
        if (!proposal) return '';
        var master = OMA.masterById(proposal.masterId);
        var actions = '';

        if (role === 'client') {
            if (proposal.status === 'shared') {
                actions = '<button class="button button-dark button--sm" type="button" data-open="' + proposal.id + '">Открыть корзину</button>';
            } else if (proposal.status === 'opened') {
                actions = '<span class="chip chip--green">добавлена к вам</span>' +
                    '<button class="link-button" type="button" data-scroll="cart">показать корзину</button>';
            } else if (proposal.status === 'paid') {
                actions = '<span class="chip chip--green">✓ оплачена</span>';
            }
        } else {
            if (proposal.status === 'shared') {
                actions = '<span class="chip chip--yellow">отправлена · ждёт открытия</span>';
            } else if (proposal.status === 'opened') {
                actions = '<span class="chip chip--opened">клиент открыл · редактирует</span>' +
                    '<button class="link-button" type="button" data-scroll="live-cart">живая корзина</button>';
            } else if (proposal.status === 'paid') {
                actions = '<span class="chip chip--green">✓ оплачено · ' + OMA.stampTime(proposal.paidAt) + '</span>';
            }
        }

        return '<div class="msg msg--cart"><div class="chat-cart">' +
            '<span class="chat-cart__kicker">' + (role === 'client' ? 'Корзина от мастера' : 'Вы отправили корзину') + '</span>' +
            '<span class="chat-cart__title">' + (master ? master.name : 'Мастер') + ' · ' +
            proposal.items.length + ' поз. · ' + OMA.proposalCount(proposal) + ' шт.</span>' +
            '<span class="chat-cart__meta">Итого ' + money(OMA.proposalTotal(proposal)) + ' BYN</span>' +
            '<div class="chat-cart__actions">' + actions + '</div>' +
            '</div></div>';
    }

    function messageHTML(message, role) {
        if (message.kind === 'system') {
            return '<div class="msg msg--system">' + message.text + '</div>';
        }
        if (message.kind === 'cart') {
            return cartCard(message, role);
        }
        return '<div class="msg' + (message.from === role ? ' msg--mine' : '') + '">' + message.text +
            '<span class="msg__meta">' + OMA.stampTime(message.ts) + '</span></div>';
    }

    function renderChat() {
        var current = state();
        var master = OMA.masterById(current.activeMasterId);
        var chat = master ? OMA.chatFor(current, master.id) : null;
        var log = $('#chat-log');
        var input = $('#chat-input');
        var submit = $('#chat-form button');

        if (!master) {
            $('#chat-head').innerHTML = '<div><b>Мастер не выбран</b><small>выберите мастера справа</small></div>';
            $('#chat-chip').textContent = 'мастер не выбран';
            log.innerHTML = '<div class="msg msg--system">Выберите мастера — и здесь появится чат. В нём мастер пришлёт корзину с материалами, а вы сможете её открыть.</div>';
            input.disabled = true;
            submit.disabled = true;
            return;
        }

        $('#chat-head').innerHTML =
            '<img src="' + master.image + '" alt="' + master.name + '">' +
            '<div><b>' + master.name + '</b><small>' + master.specialty + ' · обычно отвечает за 15 минут</small></div>';
        $('#chat-chip').textContent = 'на связи';
        input.disabled = false;
        submit.disabled = false;

        log.innerHTML = chat && chat.messages.length
            ? chat.messages.map(function (message) { return messageHTML(message, 'client'); }).join('')
            : '<div class="msg msg--system">Чат создан. Напишите мастеру первое сообщение — например, что нужно отремонтировать.</div>';

        var count = chat ? chat.messages.length : 0;
        if (count !== ui.lastMessageCount) {
            log.scrollTop = log.scrollHeight;
            ui.lastMessageCount = count;
        }

        if (chat && OMA.unreadFor(current, chat, 'client') > 0) {
            OMA.actions.markSeen('client');
        }
    }

    /* ----------------------------------------------------------------- заказ */

    function timelineRow(done, label, when) {
        return '<div class="timeline__row ' + (done ? 'is-done' : 'is-wait') + '">' +
            '<span class="timeline__mark">' + (done ? '✓' : '·') + '</span>' +
            '<span class="timeline__label">' + label + '</span>' +
            '<span class="timeline__when">' + (when || '') + '</span>' +
            '</div>';
    }

    function renderOrder() {
        var current = state();
        var cart = current.clientCart;
        var master = OMA.masterById(current.activeMasterId);
        var opened = current.proposals.filter(function (proposal) {
            return proposal.status === 'opened' || proposal.status === 'paid';
        }).slice(-1)[0];
        var paid = cart.status === 'paid';

        var html = '<div class="timeline">' +
            timelineRow(!!master, 'Мастер выбран', master ? master.name.split(' ')[0] : 'выберите мастера') +
            timelineRow(!!opened, 'Корзина от мастера', opened ? OMA.stampTime(opened.openedAt) : 'ждём смету') +
            timelineRow(paid, 'Оплата корзины', paid ? OMA.stampTime(cart.paidAt) + ' · ' + money(OMA.cartTotal(cart)) + ' BYN' : 'ожидает оплаты') +
            timelineRow(!!(cart.delivery && cart.visit), 'Доставка и приезд мастера',
                cart.delivery && cart.visit ? 'выбрано' : 'выберите время') +
            '</div>';

        if (paid) {
            html += '<div class="schedule" style="margin-top:16px">' +
                '<div class="schedule__row"><span>Доставка материалов</span><b>' + (cart.delivery ? cart.delivery.label : '—') + '</b></div>' +
                '<div class="schedule__row"><span>Приезд мастера</span><b>' + (cart.visit ? cart.visit.label : '—') + '</b></div>' +
                '<div class="schedule__row"><span>Адрес доставки</span><b>' + current.client.address + '</b></div>' +
                '<div class="schedule__row"><span>К оплате</span><b>' + money(OMA.cartTotal(cart)) + ' BYN</b></div>' +
                '</div>';
        } else {
            html += '<p class="note" style="margin-top:14px">После оплаты здесь появится выбор времени: доставка материалов и приезд мастера.</p>';
        }

        $('#order-body').innerHTML = html;
    }

    /* ------------------------------------------------------------------- рендер */

    function render() {
        renderStatus();
        renderPassport();
        renderMaster();
        renderCatalog();
        renderCart();
        renderChat();
        renderOrder();
    }

    /* ------------------------------------------------------------------ события */

    function scrollTo(id) {
        var node = document.getElementById(id);
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        node.classList.add('is-flashing');
        setTimeout(function () { node.classList.remove('is-flashing'); }, 1200);
    }

    function bindEvents() {
        $('#catalog-search').addEventListener('input', function (event) {
            ui.search = event.target.value;
            renderCatalog();
        });

        $('#chat-form').addEventListener('submit', function (event) {
            event.preventDefault();
            var input = $('#chat-input');
            var result = OMA.actions.sendMessage('client', input.value);
            if (result && result.ok) {
                input.value = '';
                ui.lastMessageCount = 0;
                render();
            }
        });

        document.addEventListener('submit', function (event) {
            var form = event.target;
            if (form.id !== 'passport-form') return;
            event.preventDefault();
            var data = new FormData(form);
            OMA.actions.saveObjectPassport({
                objectType: data.get('objectType'),
                rooms: data.get('rooms'),
                problem: data.get('problem'),
                budget: data.get('budget')
            });
            OMAUI.toast('Паспорт объекта сохранён');
        });

        document.addEventListener('click', function (event) {
            var target = event.target;
            var category = target.closest('[data-category]');
            if (category) {
                ui.category = category.dataset.category;
                renderCatalog();
                return;
            }

            var addPassport = target.closest('[data-add-passport-material]');
            if (addPassport) {
                OMA.actions.addPassportMaterial(Number($('#passport-product').value), Number($('#passport-qty').value));
                OMAUI.toast('Материал добавлен в паспорт');
                return;
            }

            var createPassport = target.closest('[data-create-passport]');
            if (createPassport) {
                var name = window.prompt('Название нового паспорта объекта', 'Новый объект');
                if (name !== null) {
                    OMA.actions.createPassport(name);
                    OMAUI.toast('Новый паспорт создан');
                }
                return;
            }

            var renamePassport = target.closest('[data-rename-passport]');
            if (renamePassport) {
                var currentPassport = OMA.getState().objectPassport;
                var renamed = window.prompt('Новое название паспорта', currentPassport.name);
                if (renamed !== null && renamed.trim()) {
                    OMA.actions.renamePassport(currentPassport.id, renamed);
                    OMAUI.toast('Название паспорта изменено');
                }
                return;
            }

            var removePassport = target.closest('[data-remove-passport-material]');
            if (removePassport) {
                OMA.actions.removePassportMaterial(Number(removePassport.dataset.removePassportMaterial));
                return;
            }

            var selectMaster = target.closest('[data-select-master]');
            if (selectMaster) {
                OMA.actions.selectMaster(Number(selectMaster.dataset.selectMaster));
                ui.showPicker = false;
                ui.lastMessageCount = 0;
                OMAUI.toast('Мастер выбран — можно писать в чат');
                scrollTo('chat');
                return;
            }

            if (target.closest('[data-toggle-picker]')) {
                ui.showPicker = !ui.showPicker;
                renderMaster();
                return;
            }

            var scrollTarget = target.closest('[data-scroll]');
            if (scrollTarget) {
                scrollTo(scrollTarget.dataset.scroll);
                return;
            }

            var add = target.closest('[data-add-product]');
            if (add) {
                var added = OMA.actions.clientAdd(Number(add.dataset.addProduct), 1);
                if (added && added.ok === false && added.message) OMAUI.toast(added.message, 'warn');
                else OMAUI.toast('Добавлено в корзину');
                return;
            }

            var step = target.closest('[data-step]');
            if (step) {
                var productId = Number(step.dataset.id);
                var currentLine = line(productId);
                OMA.actions.clientSetQty(productId, (currentLine ? currentLine.qty : 1) + Number(step.dataset.step));
                return;
            }

            var remove = target.closest('[data-remove-line]');
            if (remove) {
                OMA.actions.clientRemove(Number(remove.dataset.removeLine));
                OMAUI.toast('Товар убран из корзины');
                return;
            }

            var pay = target.closest('[data-pay]');
            if (pay) {
                var result = OMA.actions.clientPay();
                if (result && result.ok) {
                    OMAUI.toast('Оплата прошла — выберите время доставки');
                    scrollTo('cart');
                } else if (result && result.message) {
                    OMAUI.toast(result.message, 'warn');
                }
                return;
            }

            var slot = target.closest('[data-slot-kind]');
            if (slot) {
                OMA.actions.clientSetSlot(slot.dataset.slotKind, slot.dataset.slotId);
                return;
            }

            var open = target.closest('[data-open]');
            if (open) {
                var opened = OMA.actions.openProposal(open.dataset.open);
                if (opened && opened.ok) {
                    OMAUI.toast('Корзина мастера добавлена в вашу корзину');
                    scrollTo('cart');
                } else if (opened && opened.message) {
                    OMAUI.toast(opened.message, 'warn');
                }
                return;
            }
        });

        document.addEventListener('change', function (event) {
            if (event.target.id === 'passport-select') {
                OMA.actions.selectPassport(event.target.value);
                OMAUI.toast('Паспорт выбран');
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
