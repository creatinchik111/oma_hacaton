/* Логика для страницы паспортов */
(function() {
    var OMA = window.OMA;
    var list = document.getElementById('passports-list');
    var addBtn = document.getElementById('add-passport');

    function renderPassports() {
        var state = OMA.getState();
        list.innerHTML = state.objectPassports.map(function(p) {
            var active = p.id === state.activePassportId;
            return '<div class="passport-item ' + (active ? 'active' : '') + '">' +
                '<h3>' + p.name + '</h3>' +
                '<p>' + p.objectType + '</p>' +
                '<button class="button" onclick="selectPassport(\'' + p.id + '\')">Выбрать</button>' +
                '<button class="button" onclick="renamePassport(\'' + p.id + '\')">Переименовать</button>' +
                '</div>';
        }).join('');
    }

    window.selectPassport = function(id) {
        OMA.commit(function(current) {
            current.activePassportId = id;
            return { ok: true };
        });
        renderPassports();
    };

    window.renamePassport = function(id) {
        var newName = prompt('Введите новое название паспорта');
        if (newName) {
            OMA.commit(function(current) {
                var p = current.objectPassports.filter(function(p) { return p.id === id; })[0];
                if (p) p.name = newName;
                return { ok: true };
            });
            renderPassports();
        }
    };

    addBtn.addEventListener('click', function() {
        OMA.commit(function(current) {
            current.objectPassports.push({
                id: 'passport-' + Date.now(),
                name: 'Новый паспорт',
                objectType: 'Квартира',
                rooms: '',
                problem: '',
                budget: 0,
                materials: [],
                updatedAt: Date.now()
            });
            return { ok: true };
        });
        renderPassports();
    });

    renderPassports();
    OMA.subscribe(renderPassports);
})();
