// fide/modules/calisma-takvimi/calisma-takvimi.js

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.calendar-grid-main');

    const pbInstance = pb;
    const currentUserId = pbInstance?.authStore?.model?.id || null;

    

    // leaveData PB'de boşken required alanı geçmek için {_empty:true} kaydedebiliriz.
    // Uygulama içinde bu işaretçiyi yok say.
    function normalizeLeaveData(obj) {
        if (!obj || typeof obj !== 'object') return {};
        const copy = { ...obj };
        if (Object.prototype.hasOwnProperty.call(copy, '_empty')) delete copy._empty;
        return copy;
    }

    async function loadLeaveFromCloud() {
        if (!pbInstance?.authStore?.isValid || !currentUserId) return null;
        const settingsKey = `leaveData_${currentUserId}`;
        try {
            const rec = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            return normalizeLeaveData(rec?.deger) || {};
        } catch (e) {
            return {};
        }
    }

    async function upsertLeaveToCloud(leaveObj) {
        if (!pbInstance?.authStore?.isValid || !currentUserId) return;
        const settingsKey = `leaveData_${currentUserId}`;

        // PocketBase'de JSON alanı "required" ise boş obje {} validation'a takılabilir.
        // Bu durumda {_empty:true} kaydediyoruz; okurken normalizeLeaveData() bunu temizler.
        const valueToSave =
            (leaveObj && typeof leaveObj === 'object' && Object.keys(leaveObj).length > 0)
                ? leaveObj
                : { _empty: true };

        try {
            const rec = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            await pbInstance.collection('ayarlar').update(rec.id, { deger: valueToSave });
        } catch (e) {
            // kayıt yoksa oluştur
            await pbInstance.collection('ayarlar').create({ anahtar: settingsKey, deger: valueToSave });
        }
    }

    }

    
    // Verileri önce buluttan (PocketBase/ayarlar) çek, yoksa tarayıcı hafızasına düş
    const localLeave = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};
    const cloudLeave = await loadLeaveFromCloud();
    // Bulut varsa onu öncelikli al, yoksa local
    let leaveData = (cloudLeave && Object.keys(cloudLeave).length ? cloudLeave : localLeave) || {};
    // İlk açılışta bulut boş ama local doluysa buluta da yaz (opsiyonel senkron)
    if ((cloudLeave && Object.keys(cloudLeave).length === 0) && Object.keys(localLeave).length) {
        upsertLeaveToCloud(leaveData).catch(() => {});
    }


    async function saveData() {
    localStorage.setItem('bayiPlanlayiciData', JSON.stringify(leaveData));

    // Önce buluta yazmayı dene (Denetim Takip modülü buradan okuyor)
    try {
        await upsertLeaveToCloud(leaveData);
    } catch (e) {
        // Sessizce yutmayalım: bu hata olursa refresh sonrası eski veri geri gelir.
        console.error('[calisma-takvimi] leaveData buluta yazılamadı:', e);
    }

    // Diğer modüller canlı dinlemek isterse
    window.dispatchEvent(new CustomEvent('leaveDataUpdated', { detail: { leaveData } }));
}

    function toggleLeave(month, day) {
        const key = `${year}-${month}-${day}`;
        if (leaveData[key]) {
            delete leaveData[key];
        } else {
            leaveData[key] = true;
        }
        saveData();
        renderCalendar();
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
            const dw = date.getDay(); // 0: Pazar, 6: Cts
            if(dw !== 0 && dw !== 6) days.push(date.getDate());
            date.setDate(date.getDate() + 1);
        }
        return days;
    }

    function renderCalendar() {
        if (!container) return;
        container.innerHTML = '';
        
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

            // Hedef 47 üzerinden hesaplama
            const baseTarget = 47;
            const currentTarget = allWorkDays.length > 0 
                ? Math.max(0, baseTarget - Math.round((baseTarget / allWorkDays.length) * relevantLeaveCount))
                : 0;

            const basePerDay = activeWorkDays.length > 0 ? Math.floor(currentTarget / activeWorkDays.length) : 0;
            const extras = activeWorkDays.length > 0 ? currentTarget % activeWorkDays.length : 0;
            
            const monthSeed = year + m + (currentTarget * 100);
            const shuffled = seededShuffle([...activeWorkDays], monthSeed);
            
            const planMap = {};
            shuffled.forEach((d, i) => planMap[d] = basePerDay + (i < extras ? 1 : 0));

            let totalLeaveDisplay = 0;
            for(let d=1; d<=totalDays; d++) {
                if(leaveData[`${year}-${m}-${d}`]) totalLeaveDisplay++;
            }

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${year}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${currentTarget}</span></div>
                    <div class="stat-item-cal">İzin<span>${totalLeaveDisplay} Gün</span></div>
                    <div class="stat-item-cal">Mesai<span>${allWorkDays.length} Gün</span></div>
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

                if (dayOfWeek !== 0) { // Pazar hariç etkileşimli
                    box.classList.add('interactive-cal');
                    box.onclick = async () => { await toggleLeave(m, d); };

                    if (leaveData[key]) {
                        box.classList.add('leave-cal');
                    } else if (dayOfWeek !== 6) { // Hafta içi
                        box.classList.add('workday-cal');
                        const count = planMap[d] || 0;
                        if(count >= 3) box.classList.add('three-cal');
                        else if(count === 2) box.classList.add('two-cal');
                        else if(count === 1) box.classList.add('one-cal');
                        
                        if (count > 0) {
                            const b = document.createElement('span');
                            b.className = 'visit-badge-cal';
                            b.textContent = count;
                            box.appendChild(b);
                        }
                    }
                }
                grid.appendChild(box);
            }
            container.appendChild(card);
        }
    }

    renderCalendar();
}