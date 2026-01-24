/* fide/modules/calisma-takvimi/calisma-takvimi.js */

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const container = document.querySelector('.calendar-grid-main');
    const currentUserId = pb.authStore.model.id;
    const currentUserRole = pb.authStore.model.role;
    const settingsKey = `leaveData_${currentUserId}`;
    
    let leaveData = {};
    let globalAylikHedef = 0; 
    let completedReportsThisMonth = [];

    async function loadInitialData() {
        try {
            const leaveRecord = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            leaveData = leaveRecord.deger || {};
        } catch (error) { leaveData = {}; }

        try {
            const targetRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
            globalAylikHedef = targetRecord.deger || 0;
            const targetInput = document.getElementById('global-target-input');
            if (targetInput) targetInput.value = globalAylikHedef;
        } catch (error) { globalAylikHedef = 0; }

        try {
            const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
            const reports = await pb.collection('denetim_raporlari').getFullList({
                filter: `user="${currentUserId}" && denetimTamamlanmaTarihi >= "${firstDayOfMonth}"`,
                expand: 'bayi'
            });

            const currentMonthKey = `${currentYear}-${currentMonth}`;
            let revertedStoreCodes = [];
            try {
                const reverted = await pb.collection('denetim_geri_alinanlar').getFullList({
                    filter: `yil_ay="${currentMonthKey}"`
                });
                revertedStoreCodes = reverted.map(r => r.bayi);
            } catch (e) { revertedStoreCodes = []; }

            // GÜNCELLEME: Mükerrer bayileri tek sayarak panel ile senkronize et
            const uniqueMonthlyAudits = new Map();
            reports.forEach(r => {
                if (r.denetimTamamlanmaTarihi && !revertedStoreCodes.includes(r.bayi)) {
                    const code = r.expand?.bayi?.bayiKodu;
                    if (code && !uniqueMonthlyAudits.has(code)) {
                        uniqueMonthlyAudits.set(code, new Date(r.denetimTamamlanmaTarihi).getDate());
                    }
                }
            });
            completedReportsThisMonth = Array.from(uniqueMonthlyAudits.values()).map(d => ({ date: d }));
        } catch (error) { completedReportsThisMonth = []; }
    }

    function setupAdminControls() {
        const adminPanel = document.getElementById('admin-goal-config');
        if (currentUserRole === 'admin' && adminPanel) {
            adminPanel.classList.add('is-active');
            const saveBtn = document.getElementById('btn-save-global-target');
            const targetInput = document.getElementById('global-target-input');
            saveBtn.onclick = async () => {
                const newValue = parseInt(targetInput.value);
                if (isNaN(newValue) || newValue < 1) return alert("Geçerli bir hedef giriniz.");
                saveBtn.disabled = true;
                try {
                    let record;
                    try {
                        record = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
                        await pb.collection('ayarlar').update(record.id, { deger: newValue });
                    } catch {
                        await pb.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: newValue });
                    }
                    globalAylikHedef = newValue;
                    window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
                    renderCalendar();
                    alert("Aylık hedef güncellendi.");
                } catch (err) { alert("Hata: " + err.message); }
                finally { saveBtn.disabled = false; }
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
        } catch (error) { console.error("Hata:", error); }
    }

    async function toggleLeave(month, day) {
        const key = `${currentYear}-${month}-${day}`;
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

    function getWorkDays(year, month) {
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
        const todayNum = today.getDate();
        const todayStart = new Date(today.setHours(0,0,0,0)).getTime();

        for (let m = 0; m < 12; m++) {
            const firstDay = new Date(currentYear, m, 1).getDay();
            const totalDays = new Date(currentYear, m + 1, 0).getDate();
            const allWorkDays = getWorkDays(currentYear, m);
            const activeWorkDays = allWorkDays.filter(d => !leaveData[`${currentYear}-${m}-${d}`]);
            
            const dailyWeight = globalAylikHedef / (allWorkDays.length || 1);
            const monthlyAdjustedTarget = Math.max(0, globalAylikHedef - Math.round(dailyWeight * (allWorkDays.length - activeWorkDays.length)));
            
            let planMap = {};

            if (m === currentMonth) {
                // BUGÜNÜN BAŞINDAN ÖNCE YAPILANLAR (Borç hesabı için dünden öncesini al)
                const completedTotal = completedReportsThisMonth.length;
                const completedBeforeToday = completedReportsThisMonth.filter(r => r.date < todayNum).length;
                const remainingTarget = Math.max(0, monthlyAdjustedTarget - completedBeforeToday);
                const remainingActiveDays = activeWorkDays.filter(d => d >= todayNum);

                if (remainingActiveDays.length > 0) {
                    const basePerDay = Math.floor(remainingTarget / remainingActiveDays.length);
                    const extras = remainingTarget % remainingActiveDays.length;
                    const seed = currentYear + m + remainingTarget;
                    const shuffled = seededShuffle([...remainingActiveDays], seed);
                    shuffled.forEach((d, i) => planMap[d] = basePerDay + (i < extras ? 1 : 0));
                }
            } else if (m > currentMonth) {
                if (activeWorkDays.length > 0) {
                    const basePerDay = Math.floor(monthlyAdjustedTarget / activeWorkDays.length);
                    const extras = monthlyAdjustedTarget % activeWorkDays.length;
                    const seed = currentYear + m + monthlyAdjustedTarget;
                    const shuffled = seededShuffle([...activeWorkDays], seed);
                    shuffled.forEach((d, i) => planMap[d] = basePerDay + (i < extras ? 1 : 0));
                }
            }

            let totalLeaveDisplay = 0;
            for(let d=1; d<=totalDays; d++) { if(leaveData[`${currentYear}-${m}-${d}`]) totalLeaveDisplay++; }

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${currentYear}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${monthlyAdjustedTarget}</span></div>
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
                const dayOfWeek = new Date(currentYear, m, d).getDay();
                const key = `${currentYear}-${m}-${d}`;
                const box = document.createElement('div');
                box.className = 'day-cal';
                box.textContent = d;

                if (dayOfWeek === 0) box.title = "Pazar: Haftalık tatil.";
                else {
                    box.classList.add('interactive-cal');
                    box.onclick = () => toggleLeave(m, d);
                    if (leaveData[key]) box.classList.add('leave-cal');
                    else if (dayOfWeek === 6) box.title = "Cumartesi: Görev atanmaz.";
                    else {
                        box.classList.add('workday-cal');
                        const isCompleted = m === currentMonth && completedReportsThisMonth.some(r => r.date === d);
                        if (isCompleted) box.classList.add('completed-audit-cal');

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

    window.addEventListener('calendarDataChanged', async () => {
        await loadInitialData();
        renderCalendar();
    });

    await loadInitialData();
    setupAdminControls();
    renderCalendar();
}