// fide/modules/calisma-takvimi/calisma-takvimi.js

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.calendar-grid-main');
    
    // Kullanıcıya özel anahtar oluştur (Örn: leaveData_a1b2c3d4)
    const userId = pb.authStore.model.id;
    const settingsKey = `leaveData_${userId}`;
    let leaveData = {};
    let globalTarget = 47;

    // 1. ADIM: Buluttan Verileri Çek
    async function loadCloudData() {
        try {
            // Kullanıcının kişisel izin günlerini al
            try {
                const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                leaveData = record.deger || {};
            } catch (e) { leaveData = {}; }

            // Sistemin genel hedefini al
            try {
                const targetRec = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
                globalTarget = targetRec.deger || 47;
            } catch (e) { globalTarget = 47; }
            
            renderCalendar();
        } catch (error) { console.error("Bulut veri yükleme hatası:", error); }
    }

    // 2. ADIM: Buluta Veri Kaydet
    async function saveCloudData() {
        const payload = { anahtar: settingsKey, deger: leaveData };
        try {
            const existing = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            await pb.collection('ayarlar').update(existing.id, { deger: leaveData });
        } catch (err) {
            if (err.status === 404) {
                await pb.collection('ayarlar').create(payload);
            }
        }
    }

    async function toggleLeave(month, day) {
        const dateKey = `${year}-${month}-${day}`;
        if (leaveData[dateKey]) delete leaveData[dateKey];
        else leaveData[dateKey] = true;
        
        renderCalendar(); // Anında güncelle
        await saveCloudData(); // Buluta gönder
    }

    // Karıştırma Algoritması (Denetim Takip ile birebir aynı olmalı)
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

    function renderCalendar() {
        if (!container) return;
        container.innerHTML = '';
        
        for (let m = 0; m < 12; m++) {
            const firstDay = new Date(year, m, 1).getDay();
            const totalDays = new Date(year, m + 1, 0).getDate();
            const workDays = [];
            
            for (let d = 1; d <= totalDays; d++) {
                const dw = new Date(year, m, d).getDay();
                if (dw !== 0 && dw !== 6) workDays.push(d);
            }

            const activeWD = workDays.filter(d => !leaveData[`${year}-${m}-${d}`]);
            const target = Math.max(0, globalTarget - Math.round((globalTarget / workDays.length) * (workDays.length - activeWD.length)));
            
            const baseCount = activeWD.length ? Math.floor(target / activeWD.length) : 0;
            const extrasCount = activeWD.length ? target % activeWD.length : 0;
            
            let seed = year + m + (target * 100);
            const shuffled = seededShuffle([...activeWD], seed);
            const planMap = {};
            shuffled.forEach((d, i) => planMap[d] = baseCount + (i < extrasCount ? 1 : 0));

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            
            let leaveCount = 0;
            for(let d=1; d<=totalDays; d++) { if(leaveData[`${year}-${m}-${d}`]) leaveCount++; }

            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${year}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${target}</span></div>
                    <div class="stat-item-cal">İzin<span>${leaveCount} G</span></div>
                    <div class="stat-item-cal">Mesai<span>${workDays.length} G</span></div>
                </div>
                <div class="weekdays-row-cal">${weekdaysTR.map(d => `<div class="weekday-cal">${d}</div>`).join('')}</div>
                <div class="days-grid-cal"></div>
            `;
            
            const grid = card.querySelector('.days-grid-cal');
            const skip = (firstDay === 0 ? 6 : firstDay - 1);
            for (let s = 0; s < skip; s++) grid.innerHTML += '<div class="day-cal" style="visibility:hidden"></div>';

            for (let d = 1; d <= totalDays; d++) {
                const dayOfWeek = new Date(year, m, d).getDay();
                const key = `${year}-${m}-${d}`;
                const div = document.createElement('div');
                div.className = 'day-cal';
                div.textContent = d;

                if (dayOfWeek !== 0) { 
                    div.classList.add('interactive-cal');
                    if (leaveData[key]) div.classList.add('leave-cal');
                    else if (dayOfWeek !== 6) {
                        div.classList.add('workday-cal');
                        const count = planMap[d] || 0;
                        if(count >= 3) div.classList.add('three-cal');
                        else if(count === 2) div.classList.add('two-cal');
                        else if(count === 1) div.classList.add('one-cal');
                        if (count > 0) div.innerHTML += `<span class="visit-badge-cal">${count}</span>`;
                    }
                    div.onclick = () => toggleLeave(m, d);
                }
                grid.appendChild(div);
            }
            container.appendChild(card);
        }
    }

    await loadCloudData();
}