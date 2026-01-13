// fide/modules/calisma-takvimi/calisma-takvimi.js

let pbInstance = null;
let globalAylikHedef = 47; 
let leaveData = {};

export async function initializeCalismaTakvimiModule(pb) {
    pbInstance = pb;
    const year = new Date().getFullYear();
    
    await loadInitialSettings();
    setupEventListeners();
    renderCalendar();

    async function loadInitialSettings() {
        try {
            const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
            globalAylikHedef = record.deger || 47;
            document.getElementById('monthly-target-input').value = globalAylikHedef;
            document.getElementById('display-base-target').textContent = globalAylikHedef;
        } catch (error) {
            globalAylikHedef = 47;
            document.getElementById('display-base-target').textContent = globalAylikHedef;
        }

        if (pbInstance && pbInstance.authStore.isValid) {
            const settingsKey = `leaveData_${pbInstance.authStore.model.id}`;
            try {
                const leaveRecord = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                leaveData = leaveRecord.deger || {};
                localStorage.setItem('bayiPlanlayiciData', JSON.stringify(leaveData));
            } catch (error) {
                const stored = localStorage.getItem('bayiPlanlayiciData');
                leaveData = (stored && stored !== "undefined") ? JSON.parse(stored) : {};
            }
        }
    }

    function setupEventListeners() {
        const openBtn = document.getElementById('open-admin-panel-btn');
        const closeBtn = document.getElementById('close-admin-panel-btn');
        const saveBtn = document.getElementById('save-settings-btn');
        const overlay = document.getElementById('admin-panel-overlay');

        if (pbInstance.authStore.model.role === 'admin') {
            openBtn.style.display = 'inline-flex';
        }

        if (openBtn) openBtn.onclick = () => overlay.style.display = 'flex';
        if (closeBtn) closeBtn.onclick = () => overlay.style.display = 'none';
        
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const newVal = parseInt(document.getElementById('monthly-target-input').value);
                if (isNaN(newVal) || newVal < 1) return;
                try {
                    const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
                    await pbInstance.collection('ayarlar').update(record.id, { deger: newVal });
                    globalAylikHedef = newVal;
                    document.getElementById('display-base-target').textContent = newVal;
                    overlay.style.display = 'none';
                    renderCalendar();
                } catch (e) { alert("Hata oluştu."); }
            };
        }
    }

    async function toggleLeave(month, day) {
        const key = `${year}-${month}-${day}`;
        
        if (leaveData[key]) delete leaveData[key];
        else leaveData[key] = true;

        localStorage.setItem('bayiPlanlayiciData', JSON.stringify(leaveData));
        renderCalendar();

        if (pbInstance && pbInstance.authStore.isValid) {
            const settingsKey = `leaveData_${pbInstance.authStore.model.id}`;
            try {
                let record;
                try {
                    record = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                } catch (e) { record = null; }

                const dataToSend = JSON.parse(JSON.stringify(leaveData));

                if (record) {
                    await pbInstance.collection('ayarlar').update(record.id, { "deger": dataToSend });
                } else {
                    await pbInstance.collection('ayarlar').create({ anahtar: settingsKey, deger: dataToSend });
                }
            } catch (error) {
                console.error("Senkronizasyon Hatası:", error);
            }
        }
    }

    function seededShuffle(array, seed) {
        let currentSeed = seed;
        const random = () => {
            const x = Math.sin(currentSeed++) * 10000;
            return x - Math.floor(x);
        };
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function getWorkDays(month) {
        const days = [];
        const date = new Date(year, month, 1);
        while(date.getMonth() === month) {
            const dw = date.getDay();
            if(dw !== 0 && dw !== 6) days.push(date.getDate());
            date.setDate(date.getDate() + 1);
        }
        return days;
    }

    function renderCalendar() {
        const container = document.querySelector('.calendar-grid-main');
        if (!container) return;
        container.innerHTML = '';
        const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
        
        for (let m = 0; m < 12; m++) {
            const firstDay = new Date(year, m, 1).getDay();
            const totalDays = new Date(year, m + 1, 0).getDate();
            const allWorkDays = getWorkDays(m);
            const activeWorkDays = [];
            let relevantLeaveCount = 0;

            allWorkDays.forEach(day => {
                if (leaveData[`${year}-${m}-${day}`]) relevantLeaveCount++;
                else activeWorkDays.push(day);
            });

            const baseTarget = globalAylikHedef;
            const currentTarget = allWorkDays.length > 0 ? Math.max(0, baseTarget - Math.round((baseTarget / allWorkDays.length) * relevantLeaveCount)) : 0;
            const basePerDay = activeWorkDays.length > 0 ? Math.floor(currentTarget / activeWorkDays.length) : 0;
            const extras = activeWorkDays.length > 0 ? currentTarget % activeWorkDays.length : 0;
            const shuffled = seededShuffle([...activeWorkDays], year + m + (currentTarget * 100));
            const planMap = {};
            shuffled.forEach((d, i) => planMap[d] = basePerDay + (i < extras ? 1 : 0));

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${year}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${currentTarget}</span></div>
                    <div class="stat-item-cal">Mesai<span>${activeWorkDays.length} G</span></div>
                </div>
                <div class="weekdays-row-cal">${weekdaysTR.map(d => `<div class="weekday-cal">${d}</div>`).join('')}</div>
                <div class="days-grid-cal"></div>
            `;
            
            const grid = card.querySelector('.days-grid-cal');
            const skipDays = (firstDay === 0 ? 6 : firstDay - 1);
            for (let s = 0; s < skipDays; s++) grid.innerHTML += '<div class="day-cal empty-cal"></div>';

            for (let d = 1; d <= totalDays; d++) {
                const dayOfWeek = new Date(year, m, d).getDay();
                const key = `${year}-${m}-${d}`;
                const box = document.createElement('div');
                box.className = 'day-cal';
                box.textContent = d;

                if (dayOfWeek !== 0) {
                    box.classList.add('interactive-cal');
                    box.onclick = () => toggleLeave(m, d);
                    if (leaveData[key]) box.classList.add('leave-cal');
                    else if (dayOfWeek !== 6) {
                        box.classList.add('workday-cal');
                        const count = planMap[d] || 0;
                        if (count > 0) {
                            const b = document.createElement('span');
                            b.className = 'visit-badge-cal';
                            b.textContent = count;
                            box.appendChild(b);
                            if(count >= 3) box.classList.add('three-cal');
                            else if(count === 2) box.classList.add('two-cal');
                            else box.classList.add('one-cal');
                        }
                    }
                }
                grid.appendChild(box);
            }
            container.appendChild(card);
        }
    }
}