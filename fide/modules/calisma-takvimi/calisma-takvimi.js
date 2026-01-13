// fide/modules/calisma-takvimi/calisma-takvimi.js

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.calendar-grid-main');
    
    const currentUserId = pb.authStore.model.id;
    const settingsKey = `leaveData_${currentUserId}`;
    let leaveData = {};
    let globalTarget = 47;

    // Buluttan verileri yükle
    async function loadCloudData() {
        try {
            // 1. Kullanıcının izin günlerini çek
            try {
                const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                leaveData = record.deger || {};
            } catch (e) {
                if (e.status !== 404) console.error("İzin verileri çekilemedi:", e);
                leaveData = {};
            }

            // 2. Sistemdeki genel aylık hedefi çek
            try {
                const targetRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
                globalTarget = targetRecord.deger || 47;
            } catch (e) {
                globalTarget = 47;
            }
            
            renderCalendar();
        } catch (error) {
            console.error("Başlatma hatası:", error);
        }
    }

    // Buluta verileri kaydet
    async function saveCloudData() {
        try {
            const data = { anahtar: settingsKey, deger: leaveData };
            try {
                const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                await pb.collection('ayarlar').update(record.id, data);
            } catch (err) {
                if (err.status === 404) {
                    await pb.collection('ayarlar').create(data);
                }
            }
            console.log("Planlama buluta kaydedildi.");
        } catch (error) {
            console.error("Bulut kayıt hatası:", error);
            alert("Değişiklikler kaydedilemedi, internet bağlantınızı kontrol edin.");
        }
    }

    async function toggleLeave(month, day) {
        const dateKey = `${year}-${month}-${day}`;
        if (leaveData[dateKey]) {
            delete leaveData[dateKey];
        } else {
            leaveData[dateKey] = true;
        }
        renderCalendar(); // Hemen arayüzü güncelle
        await saveCloudData(); // Arka planda buluta yaz
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
        if (!container) return;
        container.innerHTML = '';
        
        for (let m = 0; m < 12; m++) {
            const firstDay = new Date(year, m, 1).getDay();
            const totalDays = new Date(year, m + 1, 0).getDate();
            const workDays = getWorkDays(m);
            
            const activeWD = workDays.filter(d => !leaveData[`${year}-${m}-${d}`]);
            const target = Math.max(0, globalTarget - Math.round((globalTarget / workDays.length) * (workDays.length - activeWD.length)));
            const baseCount = activeWD.length ? Math.floor(target / activeWD.length) : 0;
            const extrasCount = activeWD.length ? target % activeWD.length : 0;
            
            let currentSeed = year + m + (target * 100);
            const shuffled = [...activeWD];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor((Math.abs(Math.sin(currentSeed++)) * 10000 % 1) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            const planMap = {};
            shuffled.forEach((d, i) => planMap[d] = baseCount + (i < extrasCount ? 1 : 0));

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            
            let totalLeaveDisplay = 0;
            for(let d=1; d<=totalDays; d++) {
                if(leaveData[`${year}-${m}-${d}`]) totalLeaveDisplay++;
            }

            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${year}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${target}</span></div>
                    <div class="stat-item-cal">İzin<span>${totalLeaveDisplay} G</span></div>
                    <div class="stat-item-cal">Mesai<span>${workDays.length} G</span></div>
                </div>
                <div class="weekdays-row-cal">${weekdaysTR.map(d => `<div class="weekday-cal">${d}</div>`).join('')}</div>
                <div class="days-grid-cal"></div>
            `;
            
            const grid = card.querySelector('.days-grid-cal');
            const skipDays = (firstDay === 0 ? 6 : firstDay - 1);
            for (let s = 0; s < skipDays; s++) grid.innerHTML += '<div class="day-cal empty-cal"></div>';

            for (let d = 1; d <= totalDays; d++) {
                const dayOfWeek = new Date(year, m, d).getDay();
                const dateKey = `${year}-${m}-${d}`;
                const dayDiv = document.createElement('div');
                dayDiv.className = 'day-cal';
                dayDiv.textContent = d;

                if (dayOfWeek !== 0) { 
                    dayDiv.classList.add('interactive-cal');
                    if (leaveData[dateKey]) {
                        dayDiv.classList.add('leave-cal');
                    } else if (dayOfWeek !== 6) {
                        dayDiv.classList.add('workday-cal');
                        const count = planMap[d] || 0;
                        if(count >= 3) dayDiv.classList.add('three-cal');
                        else if(count === 2) dayDiv.classList.add('two-cal');
                        else if(count === 1) dayDiv.classList.add('one-cal');
                        if (count > 0) dayDiv.innerHTML += `<span class="visit-badge-cal">${count}</span>`;
                    }
                    dayDiv.onclick = () => toggleLeave(m, d);
                }
                grid.appendChild(dayDiv);
            }
            container.appendChild(card);
        }
    }

    // Başlat
    await loadCloudData();
}