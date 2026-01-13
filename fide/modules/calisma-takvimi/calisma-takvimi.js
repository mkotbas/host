// fide/modules/calisma-takvimi/calisma-takvimi.js

export async function initializeCalismaTakvimiModule(pb) {
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.calendar-grid-main');
    
    // Tarayıcı hafızasından kayıtlı izinleri getir
    let leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    function renderCalendar() {
        if (!container) return;
        container.innerHTML = '';
        
        for (let m = 0; m < 12; m++) {
            const firstDay = new Date(year, m, 1).getDay();
            const totalDays = new Date(year, m + 1, 0).getDate();
            const workDays = [];
            
            // Hafta içlerini belirle
            for (let d = 1; d <= totalDays; d++) {
                const dw = new Date(year, m, d).getDay();
                if (dw !== 0 && dw !== 6) workDays.push(d);
            }

            const activeWD = workDays.filter(d => !leaveData[`${year}-${m}-${d}`]);
            const target = Math.max(0, 47 - Math.round((47 / workDays.length) * (workDays.length - activeWD.length)));
            const baseCount = activeWD.length ? Math.floor(target / activeWD.length) : 0;
            const extrasCount = activeWD.length ? target % activeWD.length : 0;
            
            // Rastgele dağılım için karma işlemi
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
            card.innerHTML = `
                <div class="month-header-cal">${monthsTR[m]} ${year}</div>
                <div class="month-stats-cal">
                    <div class="stat-item-cal">Hedef<span>${target}</span></div>
                    <div class="stat-item-cal">İzin<span>${workDays.length - activeWD.length} G</span></div>
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

                if (dayOfWeek !== 0) { // Pazar hariç etkileşimli
                    dayDiv.classList.add('interactive-cal');
                    if (leaveData[dateKey]) {
                        dayDiv.classList.add('leave-cal');
                    } else if (dayOfWeek !== 6) { // Hafta içi görev dağılımı
                        dayDiv.classList.add('workday-cal');
                        const count = planMap[d] || 0;
                        if (count >= 3) dayDiv.classList.add('three-cal');
                        else if (count === 2) dayDiv.classList.add('two-cal');
                        else if (count === 1) dayDiv.classList.add('one-cal');
                        if (count > 0) dayDiv.innerHTML += `<span class="visit-badge-cal">${count}</span>`;
                    }

                    dayDiv.onclick = () => {
                        if (leaveData[dateKey]) delete leaveData[dateKey];
                        else leaveData[dateKey] = true;
                        localStorage.setItem('bayiPlanlayiciData', JSON.stringify(leaveData));
                        renderCalendar();
                    };
                }
                grid.appendChild(dayDiv);
            }
            container.appendChild(card);
        }
    }
    renderCalendar();
}