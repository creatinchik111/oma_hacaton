/* ==========================================================================
   OMA · общее состояние версий «Клиент» и «Мастер»
   --------------------------------------------------------------------------
   Сервера нет: состояние лежит в localStorage (ключ oma:db:v3).
   Две вкладки — client.html и master.html — синхронизируются почти мгновенно:
     · BroadcastChannel  — немедленное сообщение между вкладками;
     · событие storage   — резервный канал;
     · polling раз в 700 мс — страховка для file:// и старых браузеров.
   Вся бизнес-логика (корзина, чат, сметы, оплата, время) живёт здесь,
   поэтому обе версии работают с одними и теми же правилами.
   ========================================================================== */
(function (global) {
    'use strict';

    var DB_KEY = 'oma:db:v3';
    var CHANNEL_NAME = 'oma-sync-v3';
    var STATE_VERSION = 3;
    var POLL_MS = 700;

    /* ---------------------------------------------------------------- утилиты */

    function money(value) {
        return new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function uid(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    }

    function nowTime() {
        return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function stampTime(ts) {
        return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function dayLabel(offset) {
        if (offset === 0) return 'Сегодня';
        if (offset === 1) return 'Завтра';
        var date = new Date();
        date.setDate(date.getDate() + offset);
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }

    var WINDOWS = ['09:00–12:00', '12:00–15:00', '15:00–18:00'];

    /* Слоты доставки материалов и приезда мастера: 2 дня × 3 окна. */
    function slotsFor(kind) {
        var slots = [];
        [1, 2].forEach(function (offset) {
            WINDOWS.forEach(function (windowLabel, index) {
                slots.push({
                    id: kind + '-' + offset + '-' + index,
                    label: dayLabel(offset) + ', ' + windowLabel,
                    day: dayLabel(offset),
                    window: windowLabel
                });
            });
        });
        return slots;
    }

    /* ------------------------------------------------------------ состояние */

    function emptyState() {
        return {
            version: STATE_VERSION,
            client: {
                id: 'client-1',
                name: 'Анна Смирнова',
                phone: '+375 29 555-12-34',
                address: 'Минск, ул. Немига 5, кв. 42'
            },
            objectPassport: {
                id: 'passport-1',
                name: 'Основной объект',
                objectType: 'Квартира',
                rooms: 'Ванная комната — 6 м²\nКухня — 10 м²',
                problem: 'Нужен ремонт ванной: старая плитка демонтирована, требуется новая облицовка и установка смесителя.',
                budget: 1200,
                materials: [],
                updatedAt: 0
            },
            passports: [{
                id: 'passport-1',
                name: 'Основной объект',
                objectType: 'Квартира',
                rooms: 'Ванная комната — 6 м²\nКухня — 10 м²',
                problem: 'Нужен ремонт ванной: старая плитка демонтирована, требуется новая облицовка и установка смесителя.',
                budget: 1200,
                materials: [],
                updatedAt: 0
            }],
            activePassportId: 'passport-1',
            /* мастер, которого выбрал клиент */
            activeMasterId: null,
            /* чаты: ключ chat-<clientId>-<masterId> */
            chats: {},
            /* корзина клиента — одна, общая для своих товаров и корзины мастера */
            clientCart: {
                id: 'cart-client-1',
                status: 'open',            /* open | paid */
                items: [],                 /* {productId, name, price, image, qty, from} */
                paidAt: null,
                delivery: null,            /* {id, label} */
                visit: null,
                updatedAt: 0
            },
            /* сметы, которые мастера собирают для клиента */
            proposals: [],
            updatedAt: 0
        };
    }

    var state = null;
    var lastRaw = null;
    var channel = null;
    var subscribers = [];
    var started = false;

    function parse(raw) {
        try {
            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }

    function mergeState(raw) {
        var parsed = parse(raw);
        if (!parsed || parsed.version !== STATE_VERSION) return emptyState();
        /* мягко достраиваем недостающие поля, если схема расширится */
        var base = emptyState();
        parsed.client = Object.assign({}, base.client, parsed.client || {});
        parsed.chats = parsed.chats || {};
        parsed.proposals = parsed.proposals || [];
        parsed.clientCart = Object.assign({}, base.clientCart, parsed.clientCart || {});
        if (!Array.isArray(parsed.clientCart.items)) parsed.clientCart.items = [];
        parsed.objectPassport = Object.assign({}, base.objectPassport, parsed.objectPassport || {});
        if (!Array.isArray(parsed.objectPassport.materials)) parsed.objectPassport.materials = [];
        parsed.objectPassport.id = parsed.objectPassport.id || 'passport-1';
        parsed.objectPassport.name = parsed.objectPassport.name || 'Основной объект';
        if (!Array.isArray(parsed.passports) || !parsed.passports.length) {
            parsed.passports = [parsed.objectPassport];
        }
        parsed.passports = parsed.passports.map(function (passport, index) {
            var fallback = index === 0 ? parsed.objectPassport : base.objectPassport;
            var normalized = Object.assign({}, fallback, passport || {});
            normalized.id = normalized.id || 'passport-' + (index + 1);
            normalized.name = normalized.name || 'Объект ' + (index + 1);
            normalized.materials = Array.isArray(normalized.materials) ? normalized.materials : [];
            return normalized;
        });
        parsed.activePassportId = parsed.activePassportId || parsed.objectPassport.id || parsed.passports[0].id;
        parsed.objectPassport = parsed.passports.filter(function (passport) {
            return passport.id === parsed.activePassportId;
        })[0] || parsed.passports[0];
        return parsed;
    }

    function writeRaw(value) {
        var raw = JSON.stringify(value);
        lastRaw = raw;
        try {
            localStorage.setItem(DB_KEY, raw);
        } catch (error) {
            console.warn('OMA: не удалось сохранить состояние', error);
        }
    }

    function persist() {
        writeRaw(state);
        if (channel) {
            try {
                channel.postMessage({ type: 'sync', at: Date.now() });
            } catch (error) { /* канал мог закрыться — не критично */ }
        }
    }

    function emit() {
        subscribers.slice().forEach(function (fn) {
            try {
                fn(state);
            } catch (error) {
                console.error('OMA: ошибка подписчика', error);
            }
        });
    }

    /* Перечитать состояние из localStorage (если другая вкладка его изменила). */
    function pull(silent) {
        var raw = null;
        try {
            raw = localStorage.getItem(DB_KEY);
        } catch (error) {
            raw = null;
        }
        if (raw === null) {
            writeRaw(emptyState());
            raw = lastRaw;
        }
        if (raw === lastRaw && state) return;
        lastRaw = raw;
        state = mergeState(raw);
        if (!silent) emit();
    }

    function getState() {
        if (!state) {
            pull(true);
        }
        return state;
    }

    /* Единственный способ изменить состояние: правка + сохранение + рассылка. */
    function commit(mutator) {
        pull(true);                              /* подтянуть чужие изменения */
        var result = mutator(state);
        state.updatedAt = Date.now();
        persist();
        emit();
        return result;
    }

    function subscribe(fn) {
        subscribers.push(fn);
        fn(getState());
        return function () {
            subscribers = subscribers.filter(function (other) { return other !== fn; });
        };
    }

    function startSync() {
        if (started) return;
        started = true;
        try {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = function () { pull(false); };
        } catch (error) {
            channel = null;
        }
        global.addEventListener('storage', function (event) {
            if (!event.key || event.key === DB_KEY) pull(false);
        });
        global.addEventListener('focus', function () { pull(false); });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) pull(false);
        });
        global.setInterval(function () { pull(false); }, POLL_MS);
    }

    /* ------------------------------------------------------- справочники */

    function products() { return global.PRODUCTS || []; }
    function masters() { return global.MASTERS || []; }
    function masterById(id) {
        return masters().filter(function (master) { return master.id === Number(id); })[0] || null;
    }
    function productById(id) {
        return products().filter(function (product) { return product.id === Number(id); })[0] || null;
    }

    function chatId(clientId, masterId) {
        return 'chat-' + clientId + '-' + masterId;
    }

    function chatFor(current, masterId) {
        if (!current) return null;
        return current.chats[chatId(current.client.id, masterId)] || null;
    }

    function ensureChat(current, masterId) {
        var id = chatId(current.client.id, masterId);
        if (!current.chats[id]) {
            current.chats[id] = {
                id: id,
                clientId: current.client.id,
                masterId: Number(masterId),
                createdAt: Date.now(),
                clientSeen: 0,
                masterSeen: 0,
                messages: []
            };
        }
        return current.chats[id];
    }

    function activeChat(current) {
        if (!current || current.activeMasterId === null) return null;
        return chatFor(current, current.activeMasterId);
    }

    function pushMessage(chat, message) {
        var entry = Object.assign({ id: uid('msg'), ts: Date.now(), kind: 'text', from: 'system', text: '' }, message);
        chat.messages.push(entry);
        return entry;
    }

    /* Системная заметка о правке корзины: не плодим сообщения, а обновляем одно. */
    function upsertEditNote(current, chat) {
        var note = chat.messages.filter(function (message) { return message.tag === 'cart-edit'; })[0];
        var text = 'Клиент редактирует корзину · ' + nowTime();
        if (note) {
            note.text = text;
            note.ts = Date.now();
        } else {
            pushMessage(chat, { kind: 'system', from: 'system', tag: 'cart-edit', text: text });
        }
    }

    /* ------------------------------------------------------- корзина клиента */

    function cartTotal(cart) {
        if (!cart || !cart.items) return 0;
        return cart.items.reduce(function (sum, item) {
            return sum + Number(item.price) * Number(item.qty || 0);
        }, 0);
    }

    function cartCount(cart) {
        if (!cart || !cart.items) return 0;
        return cart.items.reduce(function (sum, item) { return sum + Number(item.qty || 0); }, 0);
    }

    function itemFromProposal(item, proposal, master) {
        return {
            productId: item.productId,
            name: item.name,
            price: item.price,
            image: item.image,
            qty: Number(item.qty) || 1,
            from: {
                proposalId: proposal.id,
                masterId: proposal.masterId,
                masterName: master ? master.name : 'мастер'
            }
        };
    }

    function proposalTotal(proposal) {
        return (proposal.items || []).reduce(function (sum, item) {
            return sum + Number(item.price) * Number(item.qty || 0);
        }, 0);
    }

    function proposalCount(proposal) {
        return (proposal.items || []).reduce(function (sum, item) { return sum + Number(item.qty || 0); }, 0);
    }

    function proposalsFor(current, masterId) {
        return (current.proposals || []).filter(function (proposal) {
            return proposal.masterId === Number(masterId);
        });
    }

    function draftFor(current, masterId) {
        return proposalsFor(current, masterId).filter(function (proposal) {
            return proposal.status === 'draft';
        }).slice(-1)[0] || null;
    }

    function proposalById(current, id) {
        return (current.proposals || []).filter(function (proposal) { return proposal.id === id; })[0] || null;
    }

    function chatsForMaster(current, masterId) {
        return Object.keys(current.chats)
            .map(function (key) { return current.chats[key]; })
            .filter(function (chat) { return chat.masterId === Number(masterId); })
            .sort(function (a, b) {
                var lastA = a.messages.length ? a.messages[a.messages.length - 1].ts : a.createdAt;
                var lastB = b.messages.length ? b.messages[b.messages.length - 1].ts : b.createdAt;
                return lastB - lastA;
            });
    }

    function unreadFor(current, chat, role) {
        if (!chat) return 0;
        var seen = role === 'client' ? chat.clientSeen : chat.masterSeen;
        return chat.messages.filter(function (message) {
            return message.kind !== 'system' && message.from !== role && message.ts > seen;
        }).length;
    }

    function requireOpenCart(current) {
        if (current.clientCart.status === 'paid') {
            return { ok: false, reason: 'paid', message: 'Корзина уже оплачена — изменения недоступны' };
        }
        return null;
    }

    /* ------------------------------------------------------------- действия */

    var actions = {
        /* --- общее ------------------------------------------------------- */

        selectMaster: function (masterId) {
            return commit(function (current) {
                var master = masterById(masterId);
                if (!master) return { ok: false };
                var chat = ensureChat(current, masterId);
                if (current.activeMasterId !== Number(masterId)) {
                    current.activeMasterId = Number(masterId);
                    chat.passportId = current.activePassportId;
                    pushMessage(chat, {
                        kind: 'system',
                        from: 'system',
                        text: 'Вы выбрали мастера ' + master.name + '. Опишите задачу — он соберёт корзину с материалами.'
                    });
                }
                if (!chat.passportId) chat.passportId = current.activePassportId;
                return { ok: true, chatId: chat.id, master: master };
            });
        },

        sendMessage: function (from, text) {
            var body = String(text || '').trim();
            if (!body) return { ok: false, reason: 'empty' };
            return commit(function (current) {
                var masterId = current.activeMasterId;
                if (masterId === null) return { ok: false, reason: 'no-master' };
                var chat = ensureChat(current, masterId);
                pushMessage(chat, { kind: 'text', from: from, text: body });
                if (from === 'client') chat.clientSeen = Date.now();
                else chat.masterSeen = Date.now();
                return { ok: true };
            });
        },

        markSeen: function (role) {
            return commit(function (current) {
                var chat = activeChat(current);
                if (!chat) return;
                if (role === 'client') chat.clientSeen = Date.now();
                else chat.masterSeen = Date.now();
            });
        },

        saveObjectPassport: function (details) {
            return commit(function (current) {
                var passport = current.passports.filter(function (item) {
                    return item.id === current.activePassportId;
                })[0] || current.objectPassport;
                passport.objectType = String(details.objectType || '').trim() || 'Квартира';
                passport.rooms = String(details.rooms || '').trim();
                passport.problem = String(details.problem || '').trim();
                passport.budget = Math.max(0, Number(details.budget) || 0);
                passport.updatedAt = Date.now();
                current.objectPassport = passport;
                return { ok: true };
            });
        },

        createPassport: function (name) {
            return commit(function (current) {
                var passport = Object.assign({}, emptyState().objectPassport, {
                    id: uid('passport'),
                    name: String(name || '').trim() || 'Новый объект',
                    rooms: '',
                    problem: '',
                    budget: 0,
                    materials: [],
                    updatedAt: 0
                });
                current.passports.push(passport);
                current.activePassportId = passport.id;
                current.objectPassport = passport;
                return { ok: true, passport: passport };
            });
        },

        renamePassport: function (passportId, name) {
            return commit(function (current) {
                var passport = current.passports.filter(function (item) { return item.id === passportId; })[0];
                if (!passport) return { ok: false, reason: 'no-passport' };
                passport.name = String(name || '').trim() || passport.name;
                current.objectPassport = passport;
                return { ok: true };
            });
        },

        selectPassport: function (passportId) {
            return commit(function (current) {
                var passport = current.passports.filter(function (item) { return item.id === passportId; })[0];
                if (!passport) return { ok: false, reason: 'no-passport' };
                current.activePassportId = passport.id;
                current.objectPassport = passport;
                return { ok: true, passport: passport };
            });
        },

        addPassportMaterial: function (productId, qty) {
            return commit(function (current) {
                var passport = current.passports.filter(function (item) {
                    return item.id === current.activePassportId;
                })[0] || current.objectPassport;
                var product = productById(productId);
                if (!product) return { ok: false, reason: 'no-product' };
                var amount = Math.max(1, Number(qty) || 1);
                var existing = passport.materials.filter(function (item) {
                    return item.productId === product.id;
                })[0];
                if (existing) existing.qty += amount;
                else passport.materials.push({
                    productId: product.id,
                    name: product.name,
                    category: product.category,
                    price: product.price,
                    image: product.image,
                    qty: amount,
                    status: 'Нужно заказать'
                });
                passport.updatedAt = Date.now();
                current.objectPassport = passport;
                return { ok: true };
            });
        },

        removePassportMaterial: function (productId) {
            return commit(function (current) {
                var passport = current.passports.filter(function (item) {
                    return item.id === current.activePassportId;
                })[0] || current.objectPassport;
                passport.materials = passport.materials.filter(function (item) {
                    return item.productId !== Number(productId);
                });
                passport.updatedAt = Date.now();
                current.objectPassport = passport;
                return { ok: true };
            });
        },

        /* --- клиент ------------------------------------------------------ */

        clientAdd: function (productId, qty) {
            return commit(function (current) {
                var blocked = requireOpenCart(current);
                if (blocked) return blocked;
                var product = productById(productId);
                if (!product) return { ok: false, reason: 'no-product' };
                var amount = Math.max(1, Number(qty) || 1);
                var line = current.clientCart.items.filter(function (item) {
                    return item.productId === product.id;
                })[0];
                if (line) {
                    line.qty = Number(line.qty) + amount;
                } else {
                    current.clientCart.items.push({
                        productId: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        qty: amount,
                        from: null
                    });
                }
                current.clientCart.updatedAt = Date.now();
                var chat = activeChat(current);
                if (chat) upsertEditNote(current, chat);
                return { ok: true, product: product };
            });
        },

        clientSetQty: function (productId, qty) {
            return commit(function (current) {
                var blocked = requireOpenCart(current);
                if (blocked) return blocked;
                var amount = Number(qty);
                var item = current.clientCart.items.filter(function (line) {
                    return line.productId === Number(productId);
                })[0];
                if (!item) return { ok: false };
                if (!(amount > 0)) {
                    current.clientCart.items = current.clientCart.items.filter(function (line) {
                        return line.productId !== Number(productId);
                    });
                } else {
                    item.qty = Math.min(99, Math.max(1, Math.round(amount)));
                }
                current.clientCart.updatedAt = Date.now();
                var chat = activeChat(current);
                if (chat) upsertEditNote(current, chat);
                return { ok: true };
            });
        },

        clientRemove: function (productId) {
            return commit(function (current) {
                var blocked = requireOpenCart(current);
                if (blocked) return blocked;
                current.clientCart.items = current.clientCart.items.filter(function (line) {
                    return line.productId !== Number(productId);
                });
                current.clientCart.updatedAt = Date.now();
                var chat = activeChat(current);
                if (chat) upsertEditNote(current, chat);
                return { ok: true };
            });
        },

        clientPay: function () {
            return commit(function (current) {
                var cart = current.clientCart;
                if (!cart.items.length) return { ok: false, reason: 'empty', message: 'Корзина пуста' };
                if (cart.status === 'paid') return { ok: false, reason: 'paid' };
                var total = cartTotal(cart);
                cart.status = 'paid';
                cart.paidAt = Date.now();
                cart.updatedAt = cart.paidAt;
                cart.delivery = null;
                cart.visit = null;
                /* сметы, чьи позиции вошли в оплаченную корзину, тоже помечаем оплаченными */
                var ids = cart.items.map(function (item) { return item.from && item.from.proposalId; }).filter(Boolean);
                current.proposals.forEach(function (proposal) {
                    if (ids.indexOf(proposal.id) !== -1) {
                        proposal.status = 'paid';
                        proposal.paidAt = cart.paidAt;
                    }
                });
                var chat = activeChat(current);
                if (chat) {
                    pushMessage(chat, {
                        kind: 'system',
                        from: 'system',
                        tag: 'paid',
                        text: 'Клиент оплатил корзину на ' + money(total) + ' BYN. Мастер подтверждает заказ ✓'
                    });
                    chat.clientSeen = Date.now();
                }
                return { ok: true, total: total };
            });
        },

        clientSetSlot: function (kind, slotId) {
            return commit(function (current) {
                var cart = current.clientCart;
                if (cart.status !== 'paid') return { ok: false, reason: 'not-paid' };
                var slot = slotsFor(kind).filter(function (option) { return option.id === slotId; })[0];
                if (!slot) return { ok: false, reason: 'no-slot' };
                if (kind === 'delivery') cart.delivery = slot;
                else cart.visit = slot;
                cart.updatedAt = Date.now();
                var chat = activeChat(current);
                if (chat) {
                    pushMessage(chat, {
                        kind: 'system',
                        from: 'system',
                        tag: kind,
                        text: kind === 'delivery'
                            ? 'Клиент выбрал доставку материалов: ' + slot.label
                            : 'Клиент выбрал приезд мастера: ' + slot.label
                    });
                }
                return { ok: true, slot: slot };
            });
        },

        /* --- мастер ------------------------------------------------------ */

        masterEnsureDraft: function (masterId) {
            return commit(function (current) {
                if (masterId === null || masterId === undefined) return { ok: false, reason: 'no-master' };
                var existing = draftFor(current, masterId);
                if (existing) return { ok: true, proposal: existing };
                var proposal = {
                    id: uid('proposal'),
                    clientId: current.client.id,
                    masterId: Number(masterId),
                    status: 'draft',
                    items: [],
                    createdAt: Date.now(),
                    sharedAt: null,
                    openedAt: null,
                    paidAt: null
                };
                current.proposals.push(proposal);
                return { ok: true, proposal: proposal };
            });
        },

        masterAdd: function (masterId, productId, qty) {
            return commit(function (current) {
                var product = productById(productId);
                if (!product) return { ok: false, reason: 'no-product' };
                var draft = draftFor(current, masterId);
                if (!draft) {
                    draft = {
                        id: uid('proposal'),
                        clientId: current.client.id,
                        masterId: Number(masterId),
                        status: 'draft',
                        items: [],
                        createdAt: Date.now(),
                        sharedAt: null,
                        openedAt: null,
                        paidAt: null
                    };
                    current.proposals.push(draft);
                }
                var amount = Math.max(1, Number(qty) || 1);
                var line = draft.items.filter(function (item) { return item.productId === product.id; })[0];
                if (line) line.qty += amount;
                else draft.items.push({
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    qty: amount
                });
                return { ok: true };
            });
        },

        masterSetQty: function (proposalId, productId, qty) {
            return commit(function (current) {
                var proposal = proposalById(current, proposalId);
                if (!proposal || proposal.status !== 'draft') return { ok: false };
                var amount = Number(qty);
                var line = proposal.items.filter(function (item) { return item.productId === Number(productId); })[0];
                if (!line) return { ok: false };
                if (!(amount > 0)) {
                    proposal.items = proposal.items.filter(function (item) { return item.productId !== Number(productId); });
                } else {
                    line.qty = Math.min(99, Math.max(1, Math.round(amount)));
                }
                return { ok: true };
            });
        },

        masterRemove: function (proposalId, productId) {
            return commit(function (current) {
                var proposal = proposalById(current, proposalId);
                if (!proposal || proposal.status !== 'draft') return { ok: false };
                proposal.items = proposal.items.filter(function (item) { return item.productId !== Number(productId); });
                return { ok: true };
            });
        },

        masterShare: function (proposalId) {
            return commit(function (current) {
                var proposal = proposalById(current, proposalId);
                if (!proposal) return { ok: false, reason: 'no-proposal' };
                if (proposal.status !== 'draft') return { ok: false, reason: 'already' };
                if (!proposal.items.length) return { ok: false, reason: 'empty', message: 'Сначала добавьте товары в смету' };
                var chat = ensureChat(current, proposal.masterId);
                proposal.status = 'shared';
                proposal.sharedAt = Date.now();
                pushMessage(chat, {
                    kind: 'cart',
                    from: 'master',
                    proposalId: proposal.id,
                    total: proposalTotal(proposal),
                    count: proposalCount(proposal),
                    text: 'Корзина для вас готова'
                });
                return { ok: true, chatId: chat.id, total: proposalTotal(proposal), count: proposalCount(proposal) };
            });
        },

        /* --- клиент открывает корзину из чата ----------------------------- */

        openProposal: function (proposalId) {
            return commit(function (current) {
                var proposal = proposalById(current, proposalId);
                if (!proposal) return { ok: false, reason: 'no-proposal' };
                if (proposal.status === 'opened' || proposal.status === 'paid') {
                    return { ok: false, reason: 'already' };
                }
                if (proposal.status !== 'shared') return { ok: false, reason: 'not-shared' };
                var blocked = requireOpenCart(current);
                if (blocked) return blocked;

                var master = masterById(proposal.masterId);
                proposal.status = 'opened';
                proposal.openedAt = Date.now();
                proposal.items.forEach(function (item) {
                    var line = current.clientCart.items.filter(function (entry) {
                        return entry.productId === item.productId;
                    })[0];
                    if (line) {
                        line.qty = Number(line.qty) + Number(item.qty || 1);
                        if (!line.from) line.from = itemFromProposal(item, proposal, master).from;
                    } else {
                        current.clientCart.items.push(itemFromProposal(item, proposal, master));
                    }
                });
                current.clientCart.updatedAt = Date.now();
                if (current.activeMasterId === null) current.activeMasterId = proposal.masterId;

                var chat = chatFor(current, proposal.masterId);
                if (chat) {
                    pushMessage(chat, {
                        kind: 'system',
                        from: 'system',
                        tag: 'opened',
                        text: 'Клиент открыл корзину — позиции добавлены в его корзину и доступны для правок.'
                    });
                }
                return { ok: true };
            });
        },

        /* --- демо -------------------------------------------------------- */

        reset: function () {
            return commit(function () {
                state = emptyState();
                return { ok: true };
            });
        }
    };

    /* ----------------------------------------------------------------- запуск */

    startSync();
    getState();

    global.OMA = {
        DB_KEY: DB_KEY,
        getState: getState,
        subscribe: subscribe,
        actions: actions,
        /* утилиты для страниц */
        money: money,
        nowTime: nowTime,
        stampTime: stampTime,
        uid: uid,
        slotsFor: slotsFor,
        cartTotal: cartTotal,
        cartCount: cartCount,
        proposalTotal: proposalTotal,
        proposalCount: proposalCount,
        chatId: chatId,
        chatFor: chatFor,
        activeChat: activeChat,
        chatsForMaster: chatsForMaster,
        proposalsFor: proposalsFor,
        draftFor: draftFor,
        proposalById: proposalById,
        unreadFor: unreadFor,
        masterById: masterById,
        productById: productById,
        products: products,
        masters: masters,
        dayLabel: dayLabel
    };
})(window);
