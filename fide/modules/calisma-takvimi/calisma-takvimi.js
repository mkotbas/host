// fide/modules/calisma-takvimi/calisma-takvimi.js

export async function initializeCalismaTakvimiModule(pb) {
    
    const monthsTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const weekdaysTR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

    class VisitPlanner {
        constructor(year) {
            this.year = year;
            this.calendarContainer = document.querySelector('.calendar-container');
            this.seed = year;
            this.leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};
        }

        saveData() {
            localStorage.setItem('bayiPlanlayiciData', JSON.stringify(this.leaveData));
        }

        toggleLeave(month, day) {
            const key = `${this.year}-${month}-${day}`;
            if (this.leaveData[key]) {
                delete this.leaveData[key];
            } else {
                this.leaveData[key] = true;
            }
            this.saveData();
            this.render();
        }

        getWorkDays(month) {
            const days = [];
            const date = new Date(this.year, month, 1);
            while(date.getMonth() === month) {
                const dayOfWeek = date.getDay(); 
                if(dayOfWeek !== 0 && dayOfWeek !== 6) days.push(date.getDate());
                date.setDate(date.getDate() + 1);
            }
            return days;
        }

        calculateMonthTarget(workDays, leaveDaysCount) {
            const baseTarget = 47; 
            if (workDays.length === 0) return 0;
            const dailyAverage = baseTarget / workDays.length;
            const deduction = Math.round(dailyAverage * leaveDaysCount);
            return Math.max(0, baseTarget - deduction);
        }

        calculateDistribution(activeWorkDays, targetVisits) {
            const daysCount = activeWorkDays.length;
            if (daysCount === 0) return { base: 0, extras: 0 };
            let basePerDay = Math.floor(targetVisits / daysCount);
            let remainder = targetVisits % daysCount;
            return { base: basePerDay, extras: remainder };
        }

        seededShuffle(array, seed) {
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

        createMonthCalendar(month) {
            const allWorkDays = this.getWorkDays(month);
            const activeWorkDays = [];
            let relevantLeaveCount = 0;

            allWorkDays.forEach(day => {
                const key = `${this.year}-${month}-${day}`;
                if (this.leaveData[key]) relevantLeaveCount++;
                else activeWorkDays.push(day);
            });

            const currentTarget = this.calculateMonthTarget(allWorkDays, relevantLeaveCount);
            const distribution = this.calculateDistribution(activeWorkDays, currentTarget);
            const monthSeed = this.seed + month + (currentTarget * 100);
            const shuffledDays = this.seededShuffle([...activeWorkDays], monthSeed);
            
            const plan = {};
            shuffledDays.forEach((day, index) => {
                let visitCount = distribution.base + (index < distribution.extras ? 1 : 0);
                plan[day] = visitCount;
            });

            let totalLeaveDisplay = 0;
            const daysInMonth = new Date(this.year, month + 1, 0).getDate();
            for(let d=1; d<=daysInMonth; d++) {
                if(this.leaveData[`${this.year}-${month}-${d}`]) totalLeaveDisplay++;
            }

            return { plan, currentTarget, totalLeaveDisplay, totalWorkDays: allWorkDays.length };
        }

        render() {
            if (!this.calendarContainer) return;
            this.calendarContainer.innerHTML = '';
            
            for(let month = 0; month < 12; month++) {
                const { plan, currentTarget, totalLeaveDisplay, totalWorkDays } = this.createMonthCalendar(month);
                const firstDay = new Date(this.year, month, 1).getDay();
                const monthDiv = document.createElement('div');
                monthDiv.className = 'month-card';
                
                monthDiv.innerHTML = `
                    <div class="month-header">${monthsTR[month]} ${this.year}</div>
                    <div class="month-stats">
                        <div class="stat-item">Hedef<span>${currentTarget}</span></div>
                        <div class="stat-item">İzin<span>${totalLeaveDisplay} G</span></div>
                        <div class="stat-item">Mesai<span>${totalWorkDays} G</span></div>
                    </div>
                    <div class="weekdays-row">${weekdaysTR.map(d => `<div class="weekday">${d}</div>`).join('')}</div>
                    <div class="days-grid"></div>
                `;

                const daysGrid = monthDiv.querySelector('.days-grid');
                const emptyDays = (firstDay === 0 ? 6 : firstDay - 1);
                for(let i = 0; i < emptyDays; i++) daysGrid.innerHTML += '<div class="day empty"></div>';

                const totalDays = new Date(this.year, month + 1, 0).getDate();
                for(let day = 1; day <= totalDays; day++) {
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'day';
                    dayDiv.textContent = day;
                    
                    const dayOfWeek = new Date(this.year, month, day).getDay();
                    const isLeave = this.leaveData[`${this.year}-${month}-${day}`];

                    if(dayOfWeek !== 0) {
                        dayDiv.classList.add('interactive');
                        dayDiv.onclick = () => this.toggleLeave(month, day);
                        if (isLeave) dayDiv.classList.add('leave');
                        else if (dayOfWeek !== 6) {
                            dayDiv.classList.add('workday');
                            const count = plan[day] || 0;
                            if(count >= 3) dayDiv.classList.add('three');
                            else if(count === 2) dayDiv.classList.add('two');
                            else if(count === 1) dayDiv.classList.add('one');
                            if (count > 0) dayDiv.innerHTML += `<span class="visit-badge">${count}</span>`;
                        }
                    }
                    daysGrid.appendChild(dayDiv);
                }
                this.calendarContainer.appendChild(monthDiv);
            }
        }
    }

    const planner = new VisitPlanner(new Date().getFullYear());
    planner.render();
}