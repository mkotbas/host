/* fide/modules/calisma-takvimi/calisma-takvimi.js */

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];
    const today = new Date();
    const container = document.querySelector('.calendar-grid-main');
    const settingsKey = `leaveData_${pb.authStore.model.id}`;
    
    let leaveData = {}, globalAylikHedef = 0, globalMinDaily = 2, completedReportsThisMonth = [], rawReportsThisMonth = [];

    async function loadInitialData() {
        try {
            const leaveRec = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
            leaveData = leaveRec.deger || {};
        } catch (e) { leaveData = {}; }
        
        try {
            const targetRec = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
            globalAylikHedef = targetRec.deger || 0;
            const targetInput = document.getElementById('global-target-input');
            if (targetInput) targetInput.value = globalAylikHedef;
        } catch (e) { globalAylikHedef = 0; }
        
        try {
            const minRec = await pb.collection('ayarlar').getFirstListItem('anahtar="minZiyaret"');
            globalMinDaily = minRec.deger || 0;
            const minInput = document.getElementById('global-min-daily-input');
            if (minInput) minInput.value = globalMinDaily;
        } catch (e) { globalMinDaily = 2; }

        try {
            const reports = await pb.collection('denetim_raporlari').getFullList({
                filter: `user="${pb.authStore.model.id}" && denetimTamamlanmaTarihi >= "${new Date(today.getFullYear(), today.getMonth(), 1).toISOString()}"`,
                expand: 'bayi',
                sort: '-denetimTamamlanmaTarihi'
            });
            const reverted = await pb.collection('denetim_geri_alinanlar').getFullList({ filter: `yil_ay="${today.getFullYear()}-${today.getMonth()}"` });
            const revertedIds = reverted.map(r => r.bayi);
            const rawDates = [];
            const uniqueMap = new Map();
            reports.forEach(r => {
                const code = r.expand?.bayi?.bayiKodu;
                if (!r.denetimTamamlanmaTarihi) return;
                if (revertedIds.includes(r.bayi)) return;

                const day = new Date(r.denetimTamamlanmaTarihi).getDate();
                rawDates.push(day);

                // AYLIK HEDEF için: Aynı bayi (bayiKodu) ay içinde 1 kez sayılır
                if (code && !uniqueMap.has(code)) {
                    uniqueMap.set(code, day);
                }
            });

            // completedReportsThisMonth: hedefe sayılacak (tekil bayi) günler
            completedReportsThisMonth = Array.from(uniqueMap.values()).map(d => ({ date: d }));
            // rawReportsThisMonth: UI için (bugün rapor girildi mi?) ham rapor günleri
            rawReportsThisMonth = rawDates.map(d => ({ date: d }));
        } catch (e) { completedReportsThisMonth = []; rawReportsThisMonth = []; }
    }

    function setupAdminControls() {
        if (pb.authStore.model.role === 'admin' && document.getElementById('admin-goal-config')) {
            document.getElementById('admin-goal-config').classList.add('is-active');

            document.getElementById('btn-save-global-target').onclick = async () => {
                const targetVal = parseInt(document.getElementById('global-target-input').value);
                const minVal = parseInt(document.getElementById('global-min-daily-input').value);
                
                if (isNaN(targetVal) || targetVal < 1) return alert("Geçerli bir aylık hedef giriniz.");
                
                try {
                    // PocketBase Kayıt: Aylık Hedef
                    try { 
                        let r = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"'); 
                        await pb.collection('ayarlar').update(r.id, { deger: targetVal }); 
                    } catch { await pb.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: targetVal }); }
                    
                    // PocketBase Kayıt: Min Ziyaret
                    try { 
                        let r = await pb.collection('ayarlar').getFirstListItem('anahtar="minZiyaret"'); 
                        await pb.collection('ayarlar').update(r.id, { deger: minVal }); 
                    } catch { await pb.collection('ayarlar').create({ anahtar: 'minZiyaret', deger: minVal }); }
                    
                    globalAylikHedef = targetVal;
                    globalMinDaily = minVal;
                    
                    window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
                    renderCalendar();
                    alert("Ayarlar başarıyla güncellendi.");
                } catch (err) { alert("Güncelleme hatası: " + err.message); }
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
            const adjTarget = Math.round(globalAylikHedef * (active.length / (work.length || 1)));
            
            let planMap = {};
            if (m === today.getMonth()) {
                // Gün bazında hedefe sayılan (tekil bayi) denetim sayısı
                const doneByDayUnique = completedReportsThisMonth.reduce((acc, r) => {
                    acc[r.date] = (acc[r.date] || 0) + 1;
                    return acc;
                }, {});

                // Gün bazında ham denetim sayısı (aynı bayi tekrar raporlansa bile) - UI için
                const doneByDayRaw = rawReportsThisMonth.reduce((acc, r) => {
                    acc[r.date] = (acc[r.date] || 0) + 1;
                    return acc;
                }, {});

                const totalDoneUnique = completedReportsThisMonth.length; // hedef için
                const remainingTargetFromToday = Math.max(0, adjTarget - totalDoneUnique);

                const todayDate = today.getDate();
                const doneTodayRaw = doneByDayRaw[todayDate] || 0;

                // KURAL (anlık görünüm): Bugün için planı üret, sonra bugünkü yapılanı düşerek göster.
                // Örn: bugün plan 2, yapılan 1 -> bugün 1 görünür.
                // Gün sonunda tamamlanmayan kısım, yarından itibaren kalan hedef içinde dağıtılmaya devam eder (borç).
                const startDay = todayDate;

                let remainingWorkDays = active.filter(d => d >= startDay);

                if (remainingWorkDays.length > 0) {
                    const base = Math.floor(remainingTargetFromToday / remainingWorkDays.length);
                    const extras = remainingTargetFromToday % remainingWorkDays.length;
                    const seed = today.getFullYear() + m;
                    seededShuffle([...remainingWorkDays], seed).forEach((d, i) => {
                        const calculated = base + (i < extras ? 1 : 0);
                        // KURAL: Min Ziyaret Uygulama (yalnızca kalan hedef varsa)
                        planMap[d] = remainingTargetFromToday > 0 ? Math.max(globalMinDaily, calculated) : 0;
                    });
                }

                // Bu map'i aşağıdaki gün render kısmında "completed" class'ı için kullanacağız
                planMap.__doneByDayUnique = doneByDayUnique;
                planMap.__doneByDayRaw = doneByDayRaw;
            } else if (m > today.getMonth() && active.length > 0) {
                const base = Math.floor(adjTarget / active.length);
                const ext = adjTarget % active.length;
                seededShuffle([...active], today.getFullYear() + m).forEach((d, i) => {
                    planMap[d] = Math.max(globalMinDaily, base + (i < ext ? 1 : 0));
                });
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
                        const doneCount = completedReportsThisMonth.filter(r => r.date === d).length;
                        const todayDate = today.getDate();
                        const doneTodayRaw = (m === today.getMonth() && rawReportsThisMonth && rawReportsThisMonth.length)
                            ? rawReportsThisMonth.filter(r => r.date === todayDate).length
                            : 0;

                        // Bugün ham rapor varsa (hedefe sayılmasa bile) yeşil çerçeve göster
                        if (m === today.getMonth() && ((d === todayDate && doneTodayRaw > 0) || doneCount > 0)) {
                            dayDiv.classList.add('completed-audit-cal');
                        }

                        let displayCount = planMap[d] || 0;

                        // Anlık görünüm: Bugün için "plan - yapılan" göster
                        if (m === today.getMonth() && d === todayDate) {
                            displayCount = Math.max(0, displayCount - doneTodayRaw);
                        }

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
    
    window.addEventListener('reportFinalized', async () => { await loadInitialData(); renderCalendar(); });
    window.addEventListener('calendarDataChanged', async () => { await loadInitialData(); renderCalendar(); });
    await loadInitialData(); setupAdminControls(); renderCalendar();
}