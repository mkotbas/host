/* fide/modules/calisma-takvimi/calisma-takvimi.js */

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
    const today = new Date();
    const container = document.querySelector('.calendar-grid-main');
    const settingsKey = `leaveData_${pb.authStore.model.id}`;
    
    let leaveData = {}, globalAylikHedef = 0, completedReportsThisMonth = [];

    async function loadInitialData() {
        try {
            const leaveRec = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            leaveData = leaveRec.deger || {};
        } catch (e) { leaveData = {}; }
        try {
            const targetRec = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
            globalAylikHedef = targetRec.deger || 0;
            if (document.getElementById('global-target-input')) document.getElementById('global-target-input').value = globalAylikHedef;
        } catch (e) { globalAylikHedef = 0; }
        try {
            // --- GÜNCELLEME: Raporlar en yeni tarih en başta olacak şekilde çekiliyor ---
            const reports = await pb.collection('denetim_raporlari').getFullList({
                filter: `user="${pb.authStore.model.id}" && denetimTamamlanmaTarihi >= "${new Date(today.getFullYear(), today.getMonth(), 1).toISOString()}"`,
                expand: 'bayi',
                sort: '-denetimTamamlanmaTarihi'
            });
            const reverted = await pb.collection('denetim_geri_alinanlar').getFullList({ filter: `yil_ay="${today.getFullYear()}-${today.getMonth()}"` });
            const revertedIds = reverted.map(r => r.bayi);
            const uniqueMap = new Map();
            reports.forEach(r => {
                const code = r.expand?.bayi?.bayiKodu;
                if (r.denetimTamamlanmaTarihi && !revertedIds.includes(r.bayi) && code && !uniqueMap.has(code)) {
                    // Artık en güncel ziyaret tarihi uniqueMap'e eklenir
                    uniqueMap.set(code, new Date(r.denetimTamamlanmaTarihi).getDate());
                }
            });
            completedReportsThisMonth = Array.from(uniqueMap.values()).map(d => ({ date: d }));
        } catch (e) { completedReportsThisMonth = []; }
    }

    function setupAdminControls() {
        if (pb.authStore.model.role === 'admin' && document.getElementById('admin-goal-config')) {
            document.getElementById('admin-goal-config').classList.add('is-active');
            document.getElementById('btn-save-global-target').onclick = async () => {
                const val = parseInt(document.getElementById('global-target-input').value);
                if (isNaN(val) || val < 1) return alert("Geçerli bir hedef giriniz.");
                try {
                    let rec;
                    try { rec = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"'); await pb.collection('ayarlar').update(rec.id, { deger: val }); }
                    catch { await pb.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: val }); }
                    globalAylikHedef = val;
                    window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
                    renderCalendar();
                    alert("Hedef güncellendi.");
                } catch (err) { alert("Hata: " + err.message); }
            };
        }
    }

    async function toggleLeave(m, d) {
        const key = `${today.getFullYear()}-${m}-${d}`;
        if (leaveData[key]) delete leaveData[key]; else leaveData[key] = true;
        try {
            let rec;
            try { rec = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`); await pb.collection('ayarlar').update(rec.id, { deger: leaveData }); }
            catch { await pb.collection('ayarlar').create({ anahtar: settingsKey, deger: leaveData }); }
            window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
        } catch (e) {}
        renderCalendar();
    }

    function seededShuffle(array, seed) {
        let s = seed;
        const rnd = () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
        for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
        return array;
    }

    function getWorkDays(y, m) {
        const days = []; const d = new Date(y, m, 1);
        while(d.getMonth() === m) { if(d.getDay() !== 0 && d.getDay() !== 6) days.push(d.getDate()); d.setDate(d.getDate() + 1); }
        return days;
    }

    function renderCalendar() {
        if (!container) return;
        container.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const first = new Date(today.getFullYear(), m, 1).getDay();
            const total = new Date(today.getFullYear(), m + 1, 0).getDate();
            const work = getWorkDays(today.getFullYear(), m);
            const active = work.filter(d => !leaveData[`${today.getFullYear()}-${m}-${d}`]);
            const weight = globalAylikHedef / (work.length || 1);
            const adjTarget = Math.max(0, globalAylikHedef - Math.round(weight * (work.length - active.length)));
            
            let planMap = {};
            if (m === today.getMonth()) {
                const totalDone = completedReportsThisMonth.length;
                const remainingTargetFromToday = Math.max(0, adjTarget - totalDone);
                
                let remainingWorkDays = active.filter(d => d >= today.getDate());
                const doneToday = completedReportsThisMonth.filter(r => r.date === today.getDate()).length;

                if (doneToday > 0 && remainingWorkDays.some(d => d > today.getDate())) {
                    remainingWorkDays = remainingWorkDays.filter(d => d > today.getDate());
                }

                if (remainingWorkDays.length > 0) {
                    const base = Math.floor(remainingTargetFromToday / remainingWorkDays.length);
                    const extras = remainingTargetFromToday % remainingWorkDays.length;
                    
                    const seed = today.getFullYear() + m + remainingTargetFromToday;
                    seededShuffle([...remainingWorkDays], seed).forEach((d, i) => {
                        planMap[d] = base + (i < extras ? 1 : 0);
                    });
                }
            } else if (m > today.getMonth() && active.length > 0) {
                const base = Math.floor(adjTarget / active.length);
                const ext = adjTarget % active.length;
                seededShuffle([...active], today.getFullYear() + m + adjTarget).forEach((d, i) => planMap[d] = base + (i < ext ? 1 : 0));
            }

            const card = document.createElement('div');
            card.className = 'month-card-cal';
            card.innerHTML = `<div class="month-header-cal">${monthsTR[m]} ${today.getFullYear()}</div><div class="month-stats-cal"><div class="stat-item-cal">Hedef<span>${adjTarget}</span></div><div class="stat-item-cal">İzin<span>${Object.keys(leaveData).filter(k=>k.startsWith(`${today.getFullYear()}-${m}-`)).length} Gün</span></div><div class="stat-item-cal">Mesai<span>${active.length} Gün</span></div></div><div class="weekdays-row-cal">${weekdaysTR.map(d=>`<div class="weekday-cal">${d}</div>`).join('')}</div><div class="days-grid-cal"></div>`;
            const grid = card.querySelector('.days-grid-cal');
            for (let s = 0; s < (first === 0 ? 6 : first - 1); s++) grid.innerHTML += '<div class="day-cal empty-cal"></div>';
            
            for (let d = 1; d <= total; d++) {
                const dayDiv = document.createElement('div');
                dayDiv.className = 'day-cal'; dayDiv.textContent = d;
                
                if (new Date(today.getFullYear(), m, d).getDay() !== 0) {
                    dayDiv.classList.add('interactive-cal');
                    dayDiv.onclick = () => toggleLeave(m, d);
                    
                    if (leaveData[`${today.getFullYear()}-${m}-${d}`]) {
                        dayDiv.classList.add('leave-cal');
                    } else if (new Date(today.getFullYear(), m, d).getDay() !== 6) {
                        dayDiv.classList.add('workday-cal');
                        
                        const doneToday = completedReportsThisMonth.filter(r => r.date === d).length;
                        if (m === today.getMonth() && doneToday > 0) dayDiv.classList.add('completed-audit-cal');

                        let displayCount = planMap[d] || 0;

                        if(displayCount >= 4) dayDiv.classList.add('four-plus-cal');
                        else if(displayCount === 3) dayDiv.classList.add('three-cal'); 
                        else if(displayCount === 2) dayDiv.classList.add('two-cal'); 
                        else if(displayCount === 1) dayDiv.classList.add('one-cal');
                        
                        if (displayCount > 0) { 
                            const b = document.createElement('span'); 
                            b.className = 'visit-badge-cal'; 
                            b.textContent = displayCount; 
                            dayDiv.appendChild(b); 
                        }
                    }
                }
                grid.appendChild(dayDiv);
            }
            container.appendChild(card);
        }
    }
    
    window.addEventListener('reportFinalized', async () => {
        await loadInitialData();
        renderCalendar();
    });

    window.addEventListener('calendarDataChanged', async () => { await loadInitialData(); renderCalendar(); });
    await loadInitialData(); setupAdminControls(); renderCalendar();
}