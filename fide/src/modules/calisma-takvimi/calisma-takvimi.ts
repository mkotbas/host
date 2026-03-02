/* fide/src/modules/calisma-takvimi/calisma-takvimi.ts */
import type PocketBase from 'pocketbase';
import { getWorkDaysOfMonth, seededShuffle } from '../../core/utils';

// ─── Modül Init (Export) ──────────────────────────────────────────────────────

export async function initializeCalismaTakvimiModule(pb: PocketBase): Promise<void> {
  const MONTH_NAMES = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const WEEKDAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

  const today = new Date();
  const container = document.querySelector<HTMLElement>('.calendar-grid-main');
  const userId = pb.authStore.model?.['id'] as string;
  const settingsKey = `leaveData_${userId}`;

  type DayReport = { date: number };

  let leaveData: Record<string, boolean> = {};
  let globalAylikHedef = 0;
  let globalMinDaily = 2;
  let completedReportsThisMonth: DayReport[] = [];
  let rawReportsThisMonth: DayReport[] = [];

  // ─── Veri Yükleme ───────────────────────────────────────────────────────────

  async function loadInitialData(): Promise<void> {
    try {
      const rec = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
      leaveData = (rec['deger'] as Record<string, boolean>) || {};
    } catch { leaveData = {}; }

    try {
      const rec = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
      globalAylikHedef = (rec['deger'] as number) || 0;
      const inp = document.getElementById('global-target-input') as HTMLInputElement | null;
      if (inp) inp.value = String(globalAylikHedef);
    } catch { globalAylikHedef = 0; }

    try {
      const rec = await pb.collection('ayarlar').getFirstListItem('anahtar="minZiyaret"');
      globalMinDaily = (rec['deger'] as number) || 0;
      const inp = document.getElementById('global-min-daily-input') as HTMLInputElement | null;
      if (inp) inp.value = String(globalMinDaily);
    } catch { globalMinDaily = 2; }

    try {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const reports = await pb.collection('denetim_raporlari').getFullList({
        filter: `user="${userId}" && denetimTamamlanmaTarihi >= "${firstOfMonth}"`,
        expand: 'bayi',
        sort: '-denetimTamamlanmaTarihi',
      });

      const reverted = await pb.collection('denetim_geri_alinanlar').getFullList({
        filter: `yil_ay="${today.getFullYear()}-${today.getMonth()}"`,
      });
      const revertedBayiIds = new Set(reverted.map(r => r['bayi'] as string));

      const rawDates: number[] = [];
      const uniqueMap = new Map<string, number>();

      reports.forEach(r => {
        const code = (r['expand'] as Record<string, { bayiKodu?: string }>)?.['bayi']?.['bayiKodu'];
        if (!r['denetimTamamlanmaTarihi']) return;
        if (revertedBayiIds.has(r['bayi'] as string)) return;

        const day = new Date(r['denetimTamamlanmaTarihi'] as string).getDate();
        rawDates.push(day);

        if (code && !uniqueMap.has(code)) {
          uniqueMap.set(code, day);
        }
      });

      completedReportsThisMonth = Array.from(uniqueMap.values()).map(d => ({ date: d }));
      rawReportsThisMonth = rawDates.map(d => ({ date: d }));
    } catch {
      completedReportsThisMonth = [];
      rawReportsThisMonth = [];
    }
  }

  // ─── Admin Kontrolleri ──────────────────────────────────────────────────────

  function setupAdminControls(): void {
    const isAdmin = pb.authStore.model?.['role'] === 'admin';
    const adminConfig = document.getElementById('admin-goal-config');
    if (!isAdmin || !adminConfig) return;

    adminConfig.classList.add('is-active');

    document.getElementById('btn-save-global-target')?.addEventListener('click', async () => {
      const targetInput = document.getElementById('global-target-input') as HTMLInputElement | null;
      const minInput = document.getElementById('global-min-daily-input') as HTMLInputElement | null;

      const targetVal = parseInt(targetInput?.value ?? '');
      const minVal = parseInt(minInput?.value ?? '0');

      if (isNaN(targetVal) || targetVal < 1) {
        alert('Geçerli bir aylık hedef giriniz.');
        return;
      }

      try {
        // Aylık hedef kaydet
        try {
          const r = await pb.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
          await pb.collection('ayarlar').update(r['id'] as string, { deger: targetVal });
        } catch {
          await pb.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: targetVal });
        }

        // Min ziyaret kaydet
        try {
          const r = await pb.collection('ayarlar').getFirstListItem('anahtar="minZiyaret"');
          await pb.collection('ayarlar').update(r['id'] as string, { deger: minVal });
        } catch {
          await pb.collection('ayarlar').create({ anahtar: 'minZiyaret', deger: minVal });
        }

        globalAylikHedef = targetVal;
        globalMinDaily = minVal;

        window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
        renderCalendar();
        alert('Ayarlar başarıyla güncellendi.');
      } catch (err) {
        alert(`Güncelleme hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
      }
    });
  }

  // ─── İzin Toggler ──────────────────────────────────────────────────────────

  async function toggleLeave(m: number, d: number): Promise<void> {
    const key = `${today.getFullYear()}-${m}-${d}`;
    if (leaveData[key]) {
      delete leaveData[key];
    } else {
      leaveData[key] = true;
    }

    try {
      try {
        const rec = await pb.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
        await pb.collection('ayarlar').update(rec['id'] as string, { deger: leaveData });
      } catch {
        await pb.collection('ayarlar').create({ anahtar: settingsKey, deger: leaveData });
      }
      window.dispatchEvent(new CustomEvent('calendarDataChanged', { detail: leaveData }));
    } catch { /* hata sessiz */ }

    renderCalendar();
  }

  // ─── Takvim Render ──────────────────────────────────────────────────────────

  function renderCalendar(): void {
    if (!container) return;
    container.innerHTML = '';

    for (let m = 0; m < 12; m++) {
      const firstDayOfWeek = new Date(today.getFullYear(), m, 1).getDay();
      const totalDays = new Date(today.getFullYear(), m + 1, 0).getDate();
      const workDays = getWorkDaysOfMonth(today.getFullYear(), m);
      const activeDays = workDays.filter(d => !leaveData[`${today.getFullYear()}-${m}-${d}`]);
      const adjTarget = Math.round(globalAylikHedef * (activeDays.length / (workDays.length || 1)));
      const leaveCount = Object.keys(leaveData).filter(k => k.startsWith(`${today.getFullYear()}-${m}-`)).length;

      const planMap: Record<number, number> & {
        __doneByDayUnique?: Record<number, number>;
        __doneByDayRaw?: Record<number, number>;
      } = {};

      if (m === today.getMonth()) {
        const doneByDayUnique = completedReportsThisMonth.reduce<Record<number, number>>((acc, r) => {
          acc[r.date] = (acc[r.date] ?? 0) + 1;
          return acc;
        }, {});

        const doneByDayRaw = rawReportsThisMonth.reduce<Record<number, number>>((acc, r) => {
          acc[r.date] = (acc[r.date] ?? 0) + 1;
          return acc;
        }, {});

        const totalDoneUnique = completedReportsThisMonth.length;
        const remainingTarget = Math.max(0, adjTarget - totalDoneUnique);
        const startDay = today.getDate();
        const remainingWorkDays = activeDays.filter(d => d >= startDay);

        if (remainingWorkDays.length > 0) {
          const base = Math.floor(remainingTarget / remainingWorkDays.length);
          const extras = remainingTarget % remainingWorkDays.length;
          const seed = today.getFullYear() + m;
          seededShuffle([...remainingWorkDays], seed).forEach((d, i) => {
            const calculated = base + (i < extras ? 1 : 0);
            planMap[d] = remainingTarget > 0 ? Math.max(globalMinDaily, calculated) : 0;
          });
        }

        planMap['__doneByDayUnique'] = doneByDayUnique;
        planMap['__doneByDayRaw'] = doneByDayRaw;

      } else if (m > today.getMonth() && activeDays.length > 0) {
        const base = Math.floor(adjTarget / activeDays.length);
        const ext = adjTarget % activeDays.length;
        seededShuffle([...activeDays], today.getFullYear() + m).forEach((d, i) => {
          planMap[d] = Math.max(globalMinDaily, base + (i < ext ? 1 : 0));
        });
      }

      // Ay kartı oluştur
      const card = document.createElement('div');
      card.className = 'month-card-cal';

      const header = document.createElement('div');
      header.className = 'month-header-cal';
      header.textContent = `${MONTH_NAMES[m]} ${today.getFullYear()}`;

      const stats = document.createElement('div');
      stats.className = 'month-stats-cal';

      const statItems = [
        { label: 'Hedef', value: String(adjTarget) },
        { label: 'İzin', value: `${leaveCount} Gün` },
        { label: 'Mesai', value: `${activeDays.length} Gün` },
      ];
      statItems.forEach(({ label, value }) => {
        const statEl = document.createElement('div');
        statEl.className = 'stat-item-cal';
        statEl.textContent = label;
        const span = document.createElement('span');
        span.textContent = value;
        statEl.appendChild(span);
        stats.appendChild(statEl);
      });

      const weekdaysRow = document.createElement('div');
      weekdaysRow.className = 'weekdays-row-cal';
      WEEKDAY_NAMES.forEach(name => {
        const cell = document.createElement('div');
        cell.className = 'weekday-cal';
        cell.textContent = name;
        weekdaysRow.appendChild(cell);
      });

      const daysGrid = document.createElement('div');
      daysGrid.className = 'days-grid-cal';

      // Boş hücreler (haftanın başına kadar)
      const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
      for (let s = 0; s < offset; s++) {
        const empty = document.createElement('div');
        empty.className = 'day-cal empty-cal';
        daysGrid.appendChild(empty);
      }

      // Gün hücreleri
      for (let d = 1; d <= totalDays; d++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'day-cal';
        dayEl.textContent = String(d);

        const dayOfWeek = new Date(today.getFullYear(), m, d).getDay();

        if (dayOfWeek !== 0) { // Pazar değilse interaktif
          dayEl.classList.add('interactive-cal');
          const capturedM = m;
          const capturedD = d;
          dayEl.addEventListener('click', () => { void toggleLeave(capturedM, capturedD); });

          if (leaveData[`${today.getFullYear()}-${m}-${d}`]) {
            dayEl.classList.add('leave-cal');
          } else if (dayOfWeek !== 6) { // Cumartesi değilse iş günü
            dayEl.classList.add('workday-cal');

            const doneCount = completedReportsThisMonth.filter(r => r.date === d).length;
            const todayDate = today.getDate();
            const doneTodayRaw = (m === today.getMonth() && rawReportsThisMonth.length > 0)
              ? rawReportsThisMonth.filter(r => r.date === todayDate).length
              : 0;

            if (
              m === today.getMonth() &&
              ((d === todayDate && doneTodayRaw > 0) || doneCount > 0)
            ) {
              dayEl.classList.add('completed-audit-cal');
            }

            let displayCount = planMap[d] ?? 0;
            if (m === today.getMonth() && d === todayDate) {
              displayCount = Math.max(0, displayCount - doneTodayRaw);
            }

            if (displayCount >= 4) dayEl.classList.add('four-plus-cal');
            else if (displayCount === 3) dayEl.classList.add('three-cal');
            else if (displayCount === 2) dayEl.classList.add('two-cal');
            else if (displayCount === 1) dayEl.classList.add('one-cal');

            if (displayCount > 0) {
              const badge = document.createElement('span');
              badge.className = 'visit-badge-cal';
              badge.textContent = String(displayCount);
              dayEl.appendChild(badge);
            }
          }
        }

        daysGrid.appendChild(dayEl);
      }

      card.appendChild(header);
      card.appendChild(stats);
      card.appendChild(weekdaysRow);
      card.appendChild(daysGrid);
      container.appendChild(card);
    }
  }

  // ─── Başlat ─────────────────────────────────────────────────────────────────

  window.addEventListener('reportFinalized', async () => {
    await loadInitialData();
    renderCalendar();
  });

  window.addEventListener('calendarDataChanged', async () => {
    await loadInitialData();
    renderCalendar();
  });

  await loadInitialData();
  setupAdminControls();
  renderCalendar();
}
