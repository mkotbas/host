export async function initializeCalismaTakvimiModule(pb) {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const days = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
    const year = new Date().getFullYear();
    const container = document.querySelector('.cal-main-container');
    let leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    function render() {
        if (!container) return;
        container.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const first = new Date(year, m, 1).getDay();
            const total = new Date(year, m + 1, 0).getDate();
            const workDays = [];
            for (let d = 1; d <= total; d++) {
                const dw = new Date(year, m, d).getDay();
                if (dw !== 0 && dw !== 6) workDays.push(d);
            }

            const activeWD = workDays.filter(d => !leaveData[`${year}-${m}-${d}`]);
            const target = Math.max(0, 47 - Math.round((47 / workDays.length) * (workDays.length - activeWD.length)));
            const base = activeWD.length ? Math.floor(target / activeWD.length) : 0;
            const extras = activeWD.length ? target % activeWD.length : 0;
            
            // Dağıtımı karıştır (Takvimle aynı mantık)
            let currentSeed = year + m + (target * 100);
            const shuffled = [...activeWD];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor((Math.sin(currentSeed++) * 10000 - Math.floor(Math.sin(currentSeed++) * 10000)) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            const plan = {};
            shuffled.forEach((d, i) => plan[d] = base + (i < extras ? 1 : 0));

            const card = document.createElement('div');
            card.className = 'm-card';
            card.innerHTML = `<div class="m-header">${months[m]} ${year}</div>
                <div class="m-stats"><span>Hedef: ${target}</span><span>İzin: ${workDays.length - activeWD.length} G</span></div>
                <div class="w-row">${days.map(d => `<div>${d}</div>`).join('')}</div>
                <div class="d-grid"></div>`;
            
            const grid = card.querySelector('.d-grid');
            const skip = first === 0 ? 6 : first - 1;
            for (let s = 0; s < skip; s++) grid.innerHTML += '<div></div>';

            for (let d = 1; d <= total; d++) {
                const dw = new Date(year, m, d).getDay();
                const key = `${year}-${m}-${d}`;
                const box = document.createElement('div');
                box.className = 'd-box';
                box.textContent = d;
                if (dw !== 0) {
                    box.classList.add('active-day');
                    if (leaveData[key]) box.classList.add('leave');
                    else if (dw !== 6) {
                        const count = plan[d] || 0;
                        if (count >= 3) box.classList.add('three');
                        else if (count === 2) box.classList.add('two');
                        else if (count === 1) box.classList.add('one');
                        if (count > 0) box.innerHTML += `<span class="v-badge">${count}</span>`;
                    }
                    box.onclick = () => {
                        if (leaveData[key]) delete leaveData[key]; else leaveData[key] = true;
                        localStorage.setItem('bayiPlanlayiciData', JSON.stringify(leaveData));
                        render();
                    };
                }
                grid.appendChild(box);
            }
            container.appendChild(card);
        }
    }
    render();
}