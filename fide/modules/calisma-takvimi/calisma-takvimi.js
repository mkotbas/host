/* fide/modules/calisma-takvimi/calisma-takvimi.js */

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.calendar-grid-main');
    const currentUserId = pb.authStore.model.id;
    const currentUserRole = pb.authStore.model.role;
    const settingsKey = `leaveData_${currentUserId}`;
    
    let leaveData = {};
    let globalAylikHedef = 47;

    /**
     * Verileri ve hedefi PocketBase'den yükler
     */
    async function loadInitialData() {
        // İzin verilerini yükle
        try {
            const leaveRecord = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            leaveData = leaveRecord.deger || {};
        } catch (error) { leaveData = {}; }

        // Global aylık hedefi yükle
        try {
            const targetRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
            globalAylikHedef = targetRecord.deger || 47;
            
            // Admin panelindeki inputu güncelle
            const targetInput = document.getElementById('global-target-input');
            if (targetInput) targetInput.value = globalAylikHedef;
        } catch (error) { globalAylikHedef = 47; }
    }

    /**
     * Admin paneli kontrollerini ayarlar
     */
    function setupAdminControls() {
        const adminPanel = document.getElementById('admin-goal-config');
        if (currentUserRole === 'admin' && adminPanel) {
            adminPanel.style.display = 'block';
            
            const saveBtn = document.getElementById('btn-save-global-target');
            const targetInput = document.getElementById('global-target-input');
            
            saveBtn.onclick = async () => {
                const newValue = parseInt(targetInput.value);
                if (isNaN(newValue) || newValue < 1) return alert("Geçerli bir hedef sayısı giriniz.");
                
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                try {
                    let record;
                    try {
                        record = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
                        await pb.collection('ayarlar').update(record.id, { deger: newValue });
                    } catch {
                        await pb.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: newValue });
                    }
                    
                    globalAylikHedef = newValue;
                    // Diğer modülleri ve takvimi bilgilendir
                    window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
                    renderCalendar();
                    alert("Aylık hedef başarıyla güncellendi.");
                } catch (err) {
                    alert("Hata oluştu: " + err.message);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Güncelle';
                }
            };
        }
    }

    async function saveData() {
        try {
            let record;
            try {
                record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
                await pb.collection('ayarlar').update(record.id, { deger: leaveData });
            } catch (err) {
                await pb.collection('ayarlar').create({ anahtar: settingsKey, deger: leaveData });
            }
            window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
        } catch (error) {
            console.error("Takvim verisi kaydedilemedi:", error);
        }
    }

    async function toggleLeave(month, day) {
        const key = `${year}-${month}-${day}`;
        if (leaveData[key]) delete leaveData[key];
        else leaveData[key] = true;
        await saveData();
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
            const allWorkDays = getWorkDays(m);
            
            const activeWorkDays = [];
            let relevantLeaveCount = 0;

            allWorkDays.forEach(day => {
                if (leaveData[`${year}-${m}-${day}`]) relevantLeaveCount++;
                else activeWorkDays.push(day);
            });

            const currentTarget = allWorkDays.length > 0 
                ? Math.max(0, globalAylikHedef - Math.round((globalAylikHedef / allWorkDays.length) * relevantLeaveCount))
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
                    <div class="stat-item-cal">Mesai<span>${activeWorkDays.length} Gün</span></div>
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

                    if (leaveData[key]) {
                        box.classList.add('leave-cal');
                    } else if (dayOfWeek !== 6) {
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

    await loadInitialData();
    setupAdminControls();
    renderCalendar();
}