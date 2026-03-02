import { pb } from './core/db-config';
import { saveFormState } from './core/api';
import {
  getFideQuestions,
  getDideData,
  getFideData,
  getProductList,
  getPopCodes,
  getExpiredCodes,
  getStoreEmails,
  getAllStores,
  getSelectedStore,
  getIsPocketBaseConnected,
  setSelectedStore,
  setCurrentReportId,
  MONTH_NAMES,
  type FideQuestion,
} from './core/state';
import { debounce, parseScore } from './core/utils';

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

interface QuestionStatus {
  removed: boolean;
  completed: boolean;
  dynamicInputs: Array<{ text: string; completed: boolean }>;
  selectedProducts: Array<{ code: string; name: string; qty: string }>;
  selectedPops: string[];
  stylingCategorySelections?: {
    mainCategory: string;
    subCategory: string;
    subCategoryQty: string;
  };
}

interface ReportData {
  questions_status: Record<string, QuestionStatus>;
}

// ─── Otomatik Kaydetme (Debounce) ─────────────────────────────────────────────

const debouncedSave = debounce(() => {
  if (getIsPocketBaseConnected() && getSelectedStore()) {
    void saveFormState(getFormDataForSaving());
  }
}, 800);

// ─── Bağlantı Göstergesi ──────────────────────────────────────────────────────

export function updateConnectionIndicator(): void {
  const statusSwitch = document.getElementById('connection-status-switch');
  const statusText = document.getElementById('connection-status-text');
  if (!statusSwitch || !statusText) return;

  const isOnline = getIsPocketBaseConnected() && pb.authStore.isValid;

  statusSwitch.classList.toggle('connected', isOnline);
  statusSwitch.classList.toggle('disconnected', !isOnline);
  statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

// ─── Form Yönetimi ────────────────────────────────────────────────────────────

let formListenersAttached = false;

export function buildForm(): void {
  const formContainer = document.getElementById('form-content');
  if (!formContainer) return;

  const fragment = document.createDocumentFragment();
  getFideQuestions()
    .filter(q => !q.isArchived)
    .forEach(q => {
      const el = createQuestionElement(q);
      fragment.appendChild(el);
    });

  formContainer.innerHTML = '';
  formContainer.appendChild(fragment);

  const popContainer = document.getElementById('popCodesContainer');
  if (popContainer) initializePopSystem(popContainer);

  // Event delegation — sadece ilk buildForm'da bağla (memory leak önlemi)
  if (!formListenersAttached) {
    formContainer.addEventListener('change', handleFormChange);
    formContainer.addEventListener('click', handleFormClick);
    formContainer.addEventListener('input', handleFormInput);
    formListenersAttached = true;
  }
}

export function resetForm(): void {
  setCurrentReportId(null);
  buildForm();
}

export function startNewReport(): void {
  setSelectedStore(null);
  setCurrentReportId(null);
  const searchInput = document.getElementById('store-search-input') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  resetForm();
  updateFormInteractivity(false);
}

export function updateFormInteractivity(enable: boolean): void {
  const fc = document.getElementById('form-content');
  fc?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
    'button, input, select',
  ).forEach(el => { el.disabled = !enable; });
}

// ─── Event Delegation (onclick="" yerine) ─────────────────────────────────────

function handleFormClick(e: Event): void {
  const target = e.target as HTMLElement;
  const btn = target.closest<HTMLButtonElement>('button');
  if (!btn) return;

  if (btn.classList.contains('add-item-btn')) {
    const containerId = btn.dataset['containerId'] ?? '';
    addDynamicInput(containerId);
    return;
  }

  if (btn.classList.contains('status-btn') && btn.closest('.dynamic-input-item')) {
    toggleCompleted(btn);
    return;
  }

  if (btn.classList.contains('status-btn') && btn.dataset['questionId']) {
    toggleQuestionCompleted(btn, btn.dataset['questionId']!);
    return;
  }

  if (btn.classList.contains('remove-btn') && btn.dataset['questionId']) {
    toggleQuestionRemoved(btn, btn.dataset['questionId']!);
    return;
  }

  if (btn.classList.contains('delete-bar') || btn.classList.contains('delete-item-btn')) {
    initiateDeleteItem(btn);
    return;
  }

  if (btn.id === 'add-product-btn') {
    addProductToList();
    return;
  }

  if (btn.classList.contains('pop-copy-btn')) { copySelectedCodes(); return; }
  if (btn.classList.contains('pop-clear-btn')) { clearSelectedCodes(); return; }
  if (btn.classList.contains('pop-expired-btn')) { selectExpiredCodes(); return; }
  if (btn.classList.contains('pop-email-btn')) { openEmailDraft(); return; }

  if (btn.id === 'back-to-form-btn') {
    returnToMainPage();
    return;
  }

  if (btn.id === 'generate-email-btn') {
    void generateEmail();
    return;
  }
}

function handleFormChange(e: Event): void {
  const target = e.target as HTMLElement;

  if (target.classList.contains('styling-mode-toggle')) {
    const cb = target as HTMLInputElement;
    const qId = cb.dataset['questionId'] ?? '';
    toggleStylingView(cb, qId);
    return;
  }

  if (target.classList.contains('styling-main-category-select')) {
    handleStylingMainCatChange(e as Event & { target: HTMLSelectElement });
    return;
  }

  if (target.classList.contains('styling-sub-category-select')) {
    handleStylingSubCatChange(e as Event & { target: HTMLSelectElement });
    return;
  }

  if (target.classList.contains('pop-checkbox')) {
    checkExpiredPopCodes();
    debouncedSave();
    return;
  }

  if (target.classList.contains('qty-edit-input')) {
    debouncedSave();
    return;
  }
}

function handleFormInput(e: Event): void {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') {
    debouncedSave();
  }
}

// ─── Soru Elemanı Oluşturma (Inline onclick yok) ─────────────────────────────

function createQuestionElement(q: FideQuestion): HTMLElement {
  const item = document.createElement('div');
  item.className = `fide-item${q.isArchived ? ' archived-item' : ''}`;
  item.id = `fide-item-${q.id}`;

  // Başlık satırı
  const titleContainer = document.createElement('div');
  titleContainer.className = 'fide-title-container';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = `FiDe ${q.id}`;

  const titleText = document.createElement('p');
  titleText.className = 'fide-question-title';
  titleText.textContent = q.title;

  titleContainer.appendChild(badge);
  titleContainer.appendChild(titleText);

  // Aksiyon butonları — orijinal: .fide-actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'fide-actions';

  if (q.type !== 'pop_system') {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-item-btn btn btn-sm btn-light';
    addBtn.dataset['containerId'] = q.type === 'product_list'
      ? `fide${q.id}_pleksi`
      : q.type === 'styling_list'
        ? `fide${q.id}_notes`
        : `fide${q.id}`;
    addBtn.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i> Yeni Ekle';
    actionsDiv.appendChild(addBtn);
  }

  const statusBtn = document.createElement('button');
  statusBtn.className = 'status-btn btn btn-sm btn-success';
  statusBtn.dataset['questionId'] = String(q.id);
  statusBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Tamamlandı';
  actionsDiv.appendChild(statusBtn);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn btn btn-sm btn-danger';
  removeBtn.dataset['questionId'] = String(q.id);
  removeBtn.innerHTML = '<i class="fas fa-times-circle" aria-hidden="true"></i> Çıkar';
  actionsDiv.appendChild(removeBtn);

  titleContainer.appendChild(actionsDiv);
  item.appendChild(titleContainer);

  // İçerik
  const contentEl = createQuestionContent(q);
  item.appendChild(contentEl);

  return item;
}

function createQuestionContent(q: FideQuestion): HTMLElement {
  const wrapper = document.createElement('div');

  if (q.type === 'standard') {
    const inputArea = document.createElement('div');
    inputArea.className = 'input-area';
    const container = document.createElement('div');
    container.id = `sub-items-container-fide${q.id}`;
    (q.staticItems ?? []).forEach(item => {
      container.appendChild(createStaticItem(item));
    });
    inputArea.appendChild(container);
    wrapper.appendChild(inputArea);

  } else if (q.type === 'product_list') {
    wrapper.appendChild(createProductListContent(q));

  } else if (q.type === 'pop_system') {
    wrapper.appendChild(createPopContent(q));

  } else if (q.type === 'styling_list') {
    wrapper.appendChild(createStylingContent(q));
  }

  return wrapper;
}

function createStaticItem(text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'static-item';

  const content = document.createElement('div');
  content.className = 'content';
  content.innerHTML = text; // Static items are trusted content from PocketBase admin

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-bar btn btn-sm btn-danger';
  deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';

  div.appendChild(content);
  div.appendChild(deleteBtn);
  return div;
}

function createProductListContent(q: FideQuestion): HTMLElement {
  const inputArea = document.createElement('div');
  inputArea.className = 'input-area';

  const label = document.createElement('p');
  label.innerHTML = '<b><i>Sipariş verilmesi gerekenler:</i></b>';

  const adderRow = document.createElement('div');
  adderRow.className = 'product-selector-row';

  const select = document.createElement('select');
  select.id = 'product-selector';
  select.className = 'form-select';
  select.innerHTML = '<option value="">-- Malzeme Seçin --</option>';

  let currentOptgroup: HTMLOptGroupElement | null = null;
  getProductList().forEach(p => {
    if (p.type === 'header') {
      if (currentOptgroup) select.appendChild(currentOptgroup);
      currentOptgroup = document.createElement('optgroup');
      currentOptgroup.label = p.name;
    } else {
      const opt = document.createElement('option');
      opt.value = p.code;
      opt.textContent = `${p.code} - ${p.name}`;
      (currentOptgroup ?? select).appendChild(opt);
    }
  });
  if (currentOptgroup) select.appendChild(currentOptgroup);

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.id = 'product-qty';
  qtyInput.className = 'form-input qty-edit-input';
  qtyInput.placeholder = 'Adet';
  qtyInput.min = '1';
  qtyInput.value = '1';

  const addBtn = document.createElement('button');
  addBtn.id = 'add-product-btn';
  addBtn.className = 'btn btn-success btn-sm';
  addBtn.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i> Ekle';

  adderRow.appendChild(select);
  adderRow.appendChild(qtyInput);
  adderRow.appendChild(addBtn);

  const productsList = document.createElement('div');
  productsList.id = 'selected-products-list';

  const hr = document.createElement('hr');

  const pleksiHeader = document.createElement('p');
  pleksiHeader.innerHTML = '<b><i>Pleksiyle sergilenmesi gerekenler veya yanlış pleksi malzemeyle kullanılanlar</i></b>';

  const pleksiContainer = document.createElement('div');
  pleksiContainer.id = `sub-items-container-fide${q.id}_pleksi`;

  inputArea.append(label, adderRow, productsList, hr, pleksiHeader, pleksiContainer);
  return inputArea;
}

function createPopContent(q: FideQuestion): HTMLElement {
  const inputArea = document.createElement('div');
  inputArea.className = 'input-area';

  const popContainer = document.createElement('div');
  popContainer.className = 'pop-grid';
  popContainer.id = 'popCodesContainer';

  const warning = document.createElement('div');
  warning.id = 'expiredWarning';
  warning.className = 'warning-message';
  warning.textContent = 'Seçiminizde süresi dolmuş kodlar bulunmaktadır.';
  warning.setAttribute('hidden', '');

  const btnRow = document.createElement('div');
  btnRow.className = 'pop-button-container';

  const btns = [
    { cls: 'pop-copy-btn btn-success', label: 'Kopyala' },
    { cls: 'pop-clear-btn btn-danger', label: 'Temizle' },
    { cls: 'pop-expired-btn btn-secondary', label: 'Bitenler' },
    { cls: 'pop-email-btn btn-primary', label: 'E-Posta' },
  ];
  btns.forEach(({ cls, label }) => {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${cls}`;
    b.textContent = label;
    btnRow.appendChild(b);
  });

  // popEmailTo bilgisini data attribute olarak sakla
  if (q.popEmailTo?.length) {
    btnRow.querySelector('.pop-email-btn')?.setAttribute(
      'data-email-to', q.popEmailTo.join(','),
    );
  }

  inputArea.append(popContainer, warning, btnRow);
  return inputArea;
}

function createStylingContent(q: FideQuestion): HTMLElement {
  const wrapper = document.createElement('div');

  const notesContainer = document.createElement('div');
  notesContainer.id = `sub-items-container-fide${q.id}_notes`;
  notesContainer.className = 'notes-container';

  const toggleRow = document.createElement('div');
  toggleRow.className = 'mode-toggle-container';

  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'mode-toggle-label';
  toggleLabel.textContent = 'Detaylı Giriş / Malzeme Ekle';

  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.className = 'styling-mode-toggle';
  toggleInput.dataset['questionId'] = String(q.id);

  const slider = document.createElement('span');
  slider.className = 'slider round';

  switchLabel.appendChild(toggleInput);
  switchLabel.appendChild(slider);
  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(switchLabel);

  // Standart görünüm
  const standardView = document.createElement('div');
  standardView.id = `standard-view-container-${q.id}`;
  (q.staticItems ?? []).forEach(item => standardView.appendChild(createStaticItem(item)));

  // Styling liste konteyneri
  const stylingContainer = document.createElement('div');
  stylingContainer.className = 'input-area styling-list-container';
  stylingContainer.id = `styling-container-${q.id}`;
  stylingContainer.dataset['questionId'] = String(q.id);
  stylingContainer.setAttribute('hidden', '');

  const mainCatRow = document.createElement('div');
  mainCatRow.className = 'styling-row';

  const mainLabel = document.createElement('div');
  mainLabel.className = 'styling-label';
  mainLabel.textContent = 'Ana Kategori';

  const mainContent = document.createElement('div');
  mainContent.className = 'styling-content';

  const mainSelect = document.createElement('select');
  mainSelect.className = 'styling-main-category-select form-select';
  mainSelect.innerHTML = '<option value="">-- Ana Kategori Seçin --</option>';
  (q.stylingData ?? []).forEach(mc => {
    const opt = document.createElement('option');
    opt.value = mc.name;
    opt.textContent = mc.name;
    mainSelect.appendChild(opt);
  });

  mainContent.appendChild(mainSelect);
  mainCatRow.appendChild(mainLabel);
  mainCatRow.appendChild(mainContent);

  const subCatRow = document.createElement('div');
  subCatRow.className = 'styling-row';
  subCatRow.id = `styling-sub-container-${q.id}`;
  subCatRow.setAttribute('hidden', '');

  const subLabel = document.createElement('div');
  subLabel.className = 'styling-label';
  subLabel.textContent = 'Alt Kategori';

  const subContent = document.createElement('div');
  subContent.className = 'styling-content styling-sub-row';

  const subSelect = document.createElement('select');
  subSelect.className = 'styling-sub-category-select form-select';
  subSelect.innerHTML = '<option value="">-- Alt Kategori Seçin --</option>';

  const subQty = document.createElement('input');
  subQty.type = 'number';
  subQty.className = 'sub-category-qty-input form-input';
  subQty.min = '1';
  subQty.value = '1';

  subContent.appendChild(subSelect);
  subContent.appendChild(subQty);
  subCatRow.appendChild(subLabel);
  subCatRow.appendChild(subContent);

  const productRow = document.createElement('div');
  productRow.className = 'styling-row';

  const productLabel = document.createElement('div');
  productLabel.className = 'styling-label';
  productLabel.textContent = 'Sipariş Listesi';

  const productContent = document.createElement('div');
  productContent.className = 'styling-content';

  const productList = document.createElement('div');
  productList.className = 'styling-selected-products-list';

  productContent.appendChild(productList);
  productRow.appendChild(productLabel);
  productRow.appendChild(productContent);

  stylingContainer.append(mainCatRow, subCatRow, productRow);
  wrapper.append(notesContainer, toggleRow, standardView, stylingContainer);
  return wrapper;
}

// ─── Form Veri Toplama ────────────────────────────────────────────────────────

function getFormDataForSaving(): ReportData {
  const reportData: ReportData = { questions_status: {} };

  getFideQuestions().forEach(q => {
    const itemDiv = document.getElementById(`fide-item-${q.id}`);
    if (!itemDiv) return;

    const isRemoved = itemDiv.classList.contains('question-removed');
    const isCompleted = itemDiv.querySelector('.fide-title-container')
      ?.classList.contains('question-completed') ?? false;

    const questionData: QuestionStatus = {
      removed: isRemoved,
      completed: isCompleted,
      dynamicInputs: [],
      selectedProducts: [],
      selectedPops: [],
    };

    if (q.type === 'standard') {
      const container = document.getElementById(`sub-items-container-fide${q.id}`);
      if (container) {
        Array.from(container.children).reverse().forEach(node => {
          if (node.classList.contains('dynamic-input-item')) {
            const input = node.querySelector<HTMLInputElement>('input[type="text"]');
            if (input?.value.trim()) {
              questionData.dynamicInputs.push({
                text: input.value.trim(),
                completed: input.classList.contains('completed'),
              });
            }
          }
        });
      }
    } else if (q.type === 'product_list') {
      itemDiv.querySelectorAll<HTMLElement>('#selected-products-list .selected-product-item')
        .forEach(item => {
          questionData.selectedProducts.push({
            code: item.dataset['code'] ?? '',
            name: item.dataset['name'] ?? '',
            qty: item.dataset['qty'] ?? '1',
          });
        });
      collectDynamicInputs(`sub-items-container-fide${q.id}_pleksi`, questionData.dynamicInputs);

    } else if (q.type === 'pop_system') {
      questionData.selectedPops = Array.from(
        itemDiv.querySelectorAll<HTMLInputElement>('.pop-checkbox:checked'),
      ).map(cb => cb.value);

    } else if (q.type === 'styling_list') {
      const container = itemDiv.querySelector<HTMLElement>('.styling-list-container');
      if (container) {
        const mainSelect = container.querySelector<HTMLSelectElement>('.styling-main-category-select');
        const subSelect = container.querySelector<HTMLSelectElement>('.styling-sub-category-select');
        const subQty = container.querySelector<HTMLInputElement>('.sub-category-qty-input');

        itemDiv.querySelectorAll<HTMLElement>('.styling-selected-products-list .selected-product-item')
          .forEach(item => {
            const qtyInput = item.querySelector<HTMLInputElement>('.qty-edit-input');
            questionData.selectedProducts.push({
              code: item.dataset['code'] ?? '',
              name: item.dataset['name'] ?? '',
              qty: qtyInput?.value ?? item.dataset['qty'] ?? '1',
            });
          });

        if (mainSelect?.value || subSelect?.value) {
          questionData.stylingCategorySelections = {
            mainCategory: mainSelect?.value ?? '',
            subCategory: subSelect?.value ?? '',
            subCategoryQty: subQty?.value ?? '1',
          };
        }
      }
      collectDynamicInputs(`sub-items-container-fide${q.id}_notes`, questionData.dynamicInputs);
    }

    reportData.questions_status[q.id] = questionData;
  });

  return reportData;
}

function collectDynamicInputs(
  containerId: string,
  target: Array<{ text: string; completed: boolean }>,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  Array.from(container.children).reverse().forEach(node => {
    if (node.classList.contains('dynamic-input-item')) {
      const input = node.querySelector<HTMLInputElement>('input[type="text"]');
      if (input?.value.trim()) {
        target.push({ text: input.value.trim(), completed: input.classList.contains('completed') });
      }
    }
  });
}

// ─── Rapor Yükleme ────────────────────────────────────────────────────────────

export function loadReportUI(reportData: Record<string, QuestionStatus> | null): void {
  if (!reportData) {
    resetForm();
    updateFormInteractivity(true);
    return;
  }

  try {
    resetForm();

    for (const qId of Object.keys(reportData)) {
      const item = document.getElementById(`fide-item-${qId}`);
      if (!item) continue;
      const data = reportData[qId]!;
      const qInfo = getFideQuestions().find(q => String(q.id) === qId);
      if (!qInfo) continue;

      if (data.removed) {
        toggleQuestionRemoved(item.querySelector<HTMLButtonElement>('.remove-btn')!, qId, false);
      } else if (data.completed) {
        toggleQuestionCompleted(item.querySelector<HTMLButtonElement>('.status-btn')!, qId, false);
      }

      data.dynamicInputs?.forEach(inp => {
        let cid = `fide${qId}`;
        if (qInfo.type === 'product_list') cid = `fide${qId}_pleksi`;
        else if (qInfo.type === 'styling_list') cid = `fide${qId}_notes`;
        addDynamicInput(cid, inp.text, inp.completed, false);
      });

      data.selectedProducts?.forEach(p => {
        if (qInfo.type === 'product_list') addProductToList(p.code, p.qty, false, p.name);
        else if (qInfo.type === 'styling_list') {
          // Orijinal: styling-mode-toggle'ı checked yap ve container'ları göster
          if (data.selectedProducts && data.selectedProducts.length > 0) {
            const toggle = item.querySelector<HTMLInputElement>('.styling-mode-toggle');
            if (toggle && !toggle.checked) {
              toggle.checked = true;
              toggleStylingView(toggle, qId);
            }
          }
          addStylingProductToList(qId, p.code, Number(p.qty), p.name, false);
        }
      });

      data.selectedPops?.forEach(pc => {
        const cb = document.querySelector<HTMLInputElement>(`.pop-checkbox[value="${pc}"]`);
        if (cb) cb.checked = true;
      });
      checkExpiredPopCodes();

      if (data.stylingCategorySelections) {
        const sel = data.stylingCategorySelections;
        const mSel = item.querySelector<HTMLSelectElement>('.styling-main-category-select');
        if (mSel && sel.mainCategory) {
          mSel.value = sel.mainCategory;
          mSel.dispatchEvent(new Event('change'));
          const sSel = item.querySelector<HTMLSelectElement>('.styling-sub-category-select');
          const sQty = item.querySelector<HTMLInputElement>('.sub-category-qty-input');
          if (sQty && sel.subCategoryQty) sQty.value = sel.subCategoryQty;
          if (sSel && sel.subCategory) {
            sSel.value = sel.subCategory;
            sSel.dispatchEvent(new Event('change'));
          }
        }
      }
    }

    updateFormInteractivity(true);
  } catch {
    // Rapor yükleme hatası — form sıfırlansın
    resetForm();
    updateFormInteractivity(true);
  }
}

// ─── POP Sistemi ──────────────────────────────────────────────────────────────

function initializePopSystem(container: HTMLElement): void {
  container.innerHTML = '';
  getPopCodes().forEach(code => {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = code;
    cb.className = 'pop-checkbox';

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(` ${code}`));
    container.appendChild(lbl);
  });
}

function checkExpiredPopCodes(): void {
  const warn = document.getElementById('expiredWarning');
  if (!warn) return;
  const hasExpired = Array.from(
    document.querySelectorAll<HTMLInputElement>('.pop-checkbox:checked'),
  ).some(cb => getExpiredCodes().includes(cb.value));
  hasExpired ? warn.removeAttribute('hidden') : warn.setAttribute('hidden', '');
}

function copySelectedCodes(): void {
  const codes = Array.from(
    document.querySelectorAll<HTMLInputElement>('.pop-checkbox:checked'),
  ).map(cb => cb.value).filter(c => !getExpiredCodes().includes(c));
  if (codes.length) {
    void navigator.clipboard.writeText(codes.join(', ')).then(() => alert('Kodlar kopyalandı!'));
  }
}

function clearSelectedCodes(): void {
  document.querySelectorAll<HTMLInputElement>('.pop-checkbox').forEach(cb => { cb.checked = false; });
  checkExpiredPopCodes();
  debouncedSave();
}

function selectExpiredCodes(): void {
  const expired = getExpiredCodes();
  document.querySelectorAll<HTMLInputElement>('.pop-checkbox').forEach(cb => {
    cb.checked = expired.includes(cb.value);
  });
  checkExpiredPopCodes();
  debouncedSave();
}

function openEmailDraft(): void {
  const codes = Array.from(
    document.querySelectorAll<HTMLInputElement>('.pop-checkbox:checked'),
  ).map(cb => cb.value).filter(c => !getExpiredCodes().includes(c));
  if (!codes.length) return;

  const q = getFideQuestions().find(f => f.type === 'pop_system');
  const toEmails = q?.popEmailTo?.join(', ') ?? '';
  const ccEmails = q?.popEmailCc?.join(', ') ?? '';

  const w = window.open('', '_blank');
  if (!w) return;
  let content = `<b>Kime:</b> ${toEmails}<br>`;
  if (ccEmails) content += `<b>Bilgi (CC):</b> ${ccEmails}<br>`;
  content += `<br><b>İçerik:</b><br>${codes.join(', ')}`;
  w.document.write(content);
}

// ─── Soru Tamamlandı / Çıkarıldı Toggler'ları ────────────────────────────────

function toggleCompleted(btn: HTMLButtonElement): void {
  const inp = btn.parentElement?.querySelector<HTMLInputElement>('input[type="text"]');
  if (!inp) return;
  const comp = inp.classList.toggle('completed');
  inp.readOnly = comp;
  btn.innerHTML = comp
    ? '<i class="fas fa-undo" aria-hidden="true"></i> Geri Al'
    : '<i class="fas fa-check" aria-hidden="true"></i> Tamamlandı';
  btn.classList.toggle('undo', comp);
  debouncedSave();
}

function toggleQuestionCompleted(btn: HTMLButtonElement, id: string, save = true): void {
  const div = document.getElementById(`fide-item-${id}`);
  if (!div) return;

  const comp = div.querySelector('.fide-title-container')?.classList.toggle('question-completed') ?? false;
  btn.innerHTML = comp
    ? '<i class="fas fa-undo" aria-hidden="true"></i> Geri Al'
    : '<i class="fas fa-check" aria-hidden="true"></i> Tamamlandı';
  btn.classList.toggle('undo', comp);

  const styl = div.querySelector<HTMLInputElement>('.styling-mode-toggle');
  const area = div.querySelector<HTMLElement>('.input-area');

  if (!styl && area) {
    comp ? area.setAttribute('hidden', '') : area.removeAttribute('hidden');
  }

  if (styl) {
    const sCont = div.querySelector<HTMLElement>('.styling-list-container');
    const vCont = document.getElementById(`standard-view-container-${id}`);
    const tCont = div.querySelector<HTMLElement>('.mode-toggle-container');
    const nCont = document.getElementById(`sub-items-container-fide${id}_notes`);

    if (comp) {
      [sCont, vCont, tCont, nCont].forEach(el => el?.setAttribute('hidden', ''));
    } else {
      tCont?.removeAttribute('hidden');
      nCont?.removeAttribute('hidden');
      vCont?.removeAttribute('hidden');
      if (!styl.checked) sCont?.setAttribute('hidden', '');
    }
  }

  if (save) debouncedSave();
}

function toggleQuestionRemoved(btn: HTMLButtonElement, id: string, save = true): void {
  const div = document.getElementById(`fide-item-${id}`);
  if (!div) return;

  const rem = div.classList.toggle('question-removed');
  const area = div.querySelector<HTMLElement>('.input-area');
  const tCont = div.querySelector<HTMLElement>('.mode-toggle-container');
  const nCont = document.getElementById(`sub-items-container-fide${id}_notes`);

  if (tCont) rem ? tCont.setAttribute('hidden', '') : tCont.removeAttribute('hidden');
  if (area) rem ? area.setAttribute('hidden', '') : area.removeAttribute('hidden');
  if (nCont) rem ? nCont.setAttribute('hidden', '') : nCont.removeAttribute('hidden');

  btn.innerHTML = rem
    ? '<i class="fas fa-undo" aria-hidden="true"></i> Geri Al'
    : '<i class="fas fa-times-circle" aria-hidden="true"></i> Çıkar';
  btn.classList.toggle('btn-danger', !rem);
  btn.classList.toggle('btn-primary', rem);

  div.querySelectorAll<HTMLButtonElement>('.add-item-btn, .status-btn')
    .forEach(b => { b.disabled = rem; });

  if (save) debouncedSave();
}

// ─── Dinamik Input ────────────────────────────────────────────────────────────

function addDynamicInput(id: string, val = '', comp = false, save = true): void {
  const cont = document.getElementById(`sub-items-container-${id}`);
  if (!cont) return;

  const div = document.createElement('div');
  div.className = 'dynamic-input-item';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = val;
  inp.className = 'form-input';

  const statusBtn = document.createElement('button');
  statusBtn.className = 'status-btn btn btn-sm btn-success';
  statusBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Tamamlandı';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-bar btn btn-sm btn-danger';
  deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addDynamicInput(id); }
  });

  div.appendChild(inp);
  div.appendChild(statusBtn);
  div.appendChild(deleteBtn);

  if (comp) toggleCompleted(statusBtn);

  cont.prepend(div);
  if (!val) inp.focus();
  if (save) debouncedSave();
}

function initiateDeleteItem(btn: HTMLButtonElement): void {
  const item = btn.parentElement;
  if (!btn.parentElement) return;

  const timerId = 'deleteTimer';
  if (item!.classList.contains('is-deleting')) {
    clearTimeout(Number(item!.dataset[timerId]));
    item!.classList.remove('is-deleting');
    const icon = btn.querySelector('i');
    if (icon) icon.className = 'fas fa-trash';
    btn.classList.replace('btn-warning', 'btn-danger');
  } else {
    item!.classList.add('is-deleting');
    const icon = btn.querySelector('i');
    if (icon) icon.className = 'fas fa-undo';
    btn.classList.replace('btn-danger', 'btn-warning');
    item!.dataset[timerId] = String(setTimeout(() => {
      item!.remove();
      debouncedSave();
    }, 4000));
  }
  debouncedSave();
}

// ─── Ürün Ekleme ──────────────────────────────────────────────────────────────

function addProductToList(code?: string, qty?: string, save = true, name?: string): void {
  const sel = document.getElementById('product-selector') as HTMLSelectElement | null;
  const qInp = document.getElementById('product-qty') as HTMLInputElement | null;

  const pCode = code ?? sel?.value ?? '';
  const pQty = qty ?? qInp?.value ?? '1';
  if (!pCode || Number(pQty) < 1) return;

  const prod = name
    ? { code: pCode, name }
    : getProductList().find(p => p.code === pCode);
  if (!prod) return;

  const existingList = document.getElementById('selected-products-list');
  if (!existingList) return;
  if (existingList.querySelector(`.selected-product-item[data-code="${prod.code}"]`)) return;

  const div = document.createElement('div');
  div.className = 'selected-product-item';
  div.dataset['code'] = prod.code;
  div.dataset['qty'] = pQty;
  div.dataset['name'] = prod.name;

  const span = document.createElement('span');
  span.textContent = `${prod.code} ${prod.name} - `;
  const bold = document.createElement('b');
  bold.textContent = `${pQty} Adet`;
  span.appendChild(bold);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-item-btn btn btn-sm btn-danger';
  deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
  deleteBtn.addEventListener('click', () => { div.remove(); debouncedSave(); });

  div.appendChild(span);
  div.appendChild(deleteBtn);
  existingList.appendChild(div);

  if (!code && sel && qInp) { sel.value = ''; qInp.value = '1'; }
  if (save) debouncedSave();
}

function addStylingProductToList(
  qId: string,
  code: string,
  qty: number,
  name: string,
  save = true,
): void {
  const list = document.getElementById(`fide-item-${qId}`)
    ?.querySelector<HTMLElement>('.styling-selected-products-list');
  if (!list) return;
  if (list.querySelector(`[data-code="${code}"]`)) return;

  const div = document.createElement('div');
  div.className = 'selected-product-item';
  div.dataset['code'] = code;
  div.dataset['qty'] = String(qty);
  div.dataset['name'] = name;

  const span = document.createElement('span');
  span.className = 'product-name';
  span.textContent = `${code} ${name}`;

  const qtyRow = document.createElement('div');
  qtyRow.className = 'product-qty-row';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'qty-edit-input form-input';
  qtyInput.value = String(qty);
  qtyInput.addEventListener('change', () => debouncedSave());

  const unit = document.createElement('span');
  unit.className = 'product-unit';
  unit.textContent = 'Adet';

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-item-btn btn btn-sm btn-danger';
  delBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
  delBtn.addEventListener('click', () => { div.remove(); debouncedSave(); });

  qtyRow.appendChild(qtyInput);
  qtyRow.appendChild(unit);
  div.append(span, qtyRow, delBtn);
  list.appendChild(div);

  if (save) debouncedSave();
}

// ─── Styling Görünüm Switcher ─────────────────────────────────────────────────

function toggleStylingView(cb: HTMLInputElement, id: string): void {
  const s = document.getElementById(`styling-container-${id}`);
  const v = document.getElementById(`standard-view-container-${id}`);
  if (cb.checked) {
    s?.removeAttribute('hidden');
    v?.setAttribute('hidden', '');
  } else {
    s?.setAttribute('hidden', '');
    v?.removeAttribute('hidden');
  }
}

function handleStylingMainCatChange(e: Event & { target: EventTarget | null }): void {
  const sel = e.target as HTMLSelectElement;
  const cont = sel.closest<HTMLElement>('.styling-list-container');
  if (!cont) return;

  const qId = cont.dataset['questionId'] ?? '';
  const q = getFideQuestions().find(f => String(f.id) === qId);

  const sub = document.getElementById(`styling-sub-container-${qId}`);
  const list = cont.querySelector<HTMLElement>('.styling-selected-products-list');
  const sSel = sub?.querySelector<HTMLSelectElement>('.styling-sub-category-select');

  if (sSel) sSel.innerHTML = '<option value="">-- Alt Kategori Seçin --</option>';
  if (list) list.innerHTML = '';

  if (sel.value && q?.stylingData && sub && sSel) {
    q.stylingData.find(mc => mc.name === sel.value)
      ?.subCategories.forEach(sc => sSel.add(new Option(sc.name, sc.name)));
    sub.removeAttribute('hidden');
  } else {
    sub?.setAttribute('hidden', '');
  }

  debouncedSave();
}

function handleStylingSubCatChange(e: Event & { target: EventTarget | null }): void {
  const sel = e.target as HTMLSelectElement;
  const cont = sel.closest<HTMLElement>('.styling-list-container');
  if (!cont) return;

  const qId = cont.dataset['questionId'] ?? '';
  const q = getFideQuestions().find(f => String(f.id) === qId);
  const main = cont.querySelector<HTMLSelectElement>('.styling-main-category-select');
  const mult = parseInt(cont.querySelector<HTMLInputElement>('.sub-category-qty-input')?.value ?? '1') || 1;
  const list = cont.querySelector<HTMLElement>('.styling-selected-products-list');

  if (list) list.innerHTML = '';

  if (sel.value && q?.stylingData && list) {
    q.stylingData
      .find(m => m.name === main?.value)
      ?.subCategories.find(s => s.name === sel.value)
      ?.products.forEach(p => {
        addStylingProductToList(qId, p.code, (parseInt(p.qty) || 1) * mult, p.name, false);
      });
  }

  debouncedSave();
}

// ─── Performans Tablosu ───────────────────────────────────────────────────────

function calculateAverage(
  scores: Record<number, number | string> | undefined,
  currentMonthIdx: number,
  manualScore: number | null = null,
): string {
  let sum = 0;
  let count = 0;
  for (let i = 1; i <= 12; i++) {
    let val: number | string | null | undefined = scores?.[i] ?? null;
    if (i === currentMonthIdx && manualScore !== null && !isNaN(manualScore)) val = manualScore;
    const num = typeof val === 'number' ? val : parseScore(val);
    if (!isNaN(num)) { sum += num; count++; }
  }
  return count > 0 ? (sum / count).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '';
}

function renderPerformanceTable(
  storeInfo: { scores?: Record<number, number | string> } | null,
  fideStoreInfo: { scores?: Record<number, number | string> } | null,
  manualFideScore: string | null,
): string {
  const cYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth() + 1;
  const manualNum = manualFideScore ? parseScore(manualFideScore) : null;

  const monthHeaders = Array.from({ length: 12 }, (_, i) =>
    `<th class="pt-header">${MONTH_NAMES[i + 1]!.toUpperCase()}</th>`,
  ).join('') + '<th class="pt-header"><div>YIL</div><div>ORTALAMASI</div></th>';

  const dScores = Array.from({ length: 12 }, (_, i) => {
    const v = storeInfo?.scores?.[i + 1];
    return `<td class="pt-score">${(v !== undefined && v !== null && v !== '') ? v : '-'}</td>`;
  }).join('') + `<td class="pt-avg">${calculateAverage(storeInfo?.scores, currentMonthIdx)}</td>`;

  const fScores = Array.from({ length: 12 }, (_, i) => {
    let v = fideStoreInfo?.scores?.[i + 1];
    if (i + 1 === currentMonthIdx && manualNum !== null && !isNaN(manualNum) && (!v || v === '')) {
      v = manualFideScore ?? '';
    }
    return `<td class="pt-score">${(v !== undefined && v !== null && v !== '') ? v : '-'}</td>`;
  }).join('') + `<td class="pt-avg">${calculateAverage(fideStoreInfo?.scores, currentMonthIdx, manualNum)}</td>`;

  return `
    <div class="performance-table-wrapper">
      <table class="performance-table">
        <thead>
          <tr>
            <th class="pt-header">${cYear}</th>
            ${monthHeaders}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="pt-label">DİDE</td>
            ${dScores}
          </tr>
          <tr>
            <td class="pt-label">FİDE</td>
            ${fScores}
          </tr>
        </tbody>
      </table>
    </div>`;
}

// ─── E-posta Taslağı ──────────────────────────────────────────────────────────

export async function generateEmail(): Promise<void> {
  const selectedStore = getSelectedStore();
  if (!selectedStore) {
    alert('Lütfen denetime başlamadan önce bir bayi seçin!');
    return;
  }

  const currentMonthIdx = new Date().getMonth() + 1;
  const fideStoreInfo = getFideData().find(
    row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu),
  ) ?? null;

  let manualFideScore: string | null = null;
  const existingScore = fideStoreInfo?.scores?.[currentMonthIdx];

  if (existingScore !== undefined && existingScore !== null && existingScore !== '') {
    manualFideScore = String(existingScore).replace('.', ',');
  } else {
    manualFideScore = prompt(
      `${MONTH_NAMES[currentMonthIdx]} ayı FiDe puanını giriniz (Zorunludur):`,
    );
    if (!manualFideScore?.trim()) {
      alert('Puan girilmediği için işlem durduruldu.');
      return;
    }
    if (manualFideScore.includes('.')) {
      alert('Hata: Nokta (.) kullanılamaz. Ondalık için virgül (,) kullanın. (Örn: 56,6)');
      return;
    }
    if (isNaN(parseScore(manualFideScore))) {
      alert(`Hata: "${manualFideScore}" geçerli bir sayı değildir.`);
      return;
    }
  }

  // E-posta şablonunu yükle
  let emailTemplate = `<p>{YONETMEN_ADI} Bey Merhaba,</p><p>Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi aşağıdadır.</p><p><br></p>{DENETIM_ICERIGI}<p><br></p>{PUAN_TABLOSU}`;
  if (pb.authStore.isValid) {
    try {
      const rec = await pb.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
      if (rec['deger']) emailTemplate = rec['deger'] as string;
    } catch { /* Şablon yoksa varsayılanı kullan */ }
  }

  const reportData = getFormDataForSaving();
  await saveFormState(reportData, true);
  window.dispatchEvent(new CustomEvent('reportFinalized'));

  // Bayi bilgileri
  const storeInfo = getDideData().find(
    row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu),
  ) ?? null;

  const storeEmail = getStoreEmails()[selectedStore.bayiKodu] ?? null;
  const storeEmailTag = storeEmail
    ? ` <a href="mailto:${storeEmail}" class="email-tag">@${storeEmail}</a>`
    : '';

  const pbStore = getAllStores().find(s => String(s.bayiKodu) === String(selectedStore.bayiKodu)) ?? null;
  const managerFullName =
    (pbStore?.yonetmen?.trim()) ||
    (selectedStore.yonetmen?.trim()) ||
    (storeInfo?.['Bayi Yönetmeni']?.trim()) ||
    '';

  const yonetmenFirstName = managerFullName ? managerFullName.split(/\s+/)[0] : 'Yetkili';
  const shortBayiAdi = selectedStore.bayiAdi.length > 20
    ? `${selectedStore.bayiAdi.substring(0, 20)}...`
    : selectedStore.bayiAdi;

  // Denetim içeriği HTML
  let fideReportHtml = '';
  getFideQuestions().forEach(q => {
    const itemDiv = document.getElementById(`fide-item-${q.id}`);
    if (!itemDiv || itemDiv.classList.contains('question-removed')) return;

    const qStatus = reportData.questions_status[q.id];
    if (!qStatus) return;

    let contentHtml = '';

    if (q.type === 'standard') {
      const container = document.getElementById(`sub-items-container-fide${q.id}`);
      if (container) {
        const items = Array.from(container.children)
          .reverse()
          .filter(n => !n.classList.contains('is-deleting'))
          .map(node => {
            if (node.classList.contains('static-item')) {
              return { text: node.querySelector('.content')?.innerHTML ?? '', type: 'static', comp: false };
            }
            const input = node.querySelector<HTMLInputElement>('input[type="text"]');
            return { text: input?.value.trim() ?? '', type: 'dynamic', comp: input?.classList.contains('completed') ?? false };
          })
          .filter(i => i.text);

        const hasDyn = items.some(i => i.type === 'dynamic');
        const emailItems = hasDyn ? items : items.filter(i => i.type === 'static');
        if (emailItems.length > 0) {
          emailItems.sort((a, b) => (a.text.includes('<a href') ? 1 : -1) - (b.text.includes('<a href') ? 1 : -1));
          contentHtml = `<ul>${emailItems.map(i =>
            i.comp
              ? `<li>${i.text} <span class="status-tag status-tag--done">Tamamlandı</span></li>`
              : `<li>${i.text}</li>`,
          ).join('')}</ul>`;
        }
      }
    } else if (q.type === 'product_list' || q.type === 'styling_list') {
      const prods = (qStatus.selectedProducts ?? [])
        .map(p => `<li>${p.code} ${p.name}: <b>${p.qty} Adet</b></li>`).join('');

      if (q.type === 'product_list') {
        const pleksi = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `#sub-items-container-fide${q.id}_pleksi input[type="text"]`,
          ),
        ).filter(i => !i.classList.contains('completed') && i.value.trim())
          .map(i => `<li>${i.value}</li>`).join('');
        if (prods) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${prods}</ul>`;
        if (pleksi) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler:</i></b><ul>${pleksi}</ul>`;
      } else {
        const staticBox = document.getElementById(`standard-view-container-${q.id}`);
        if (staticBox) {
          contentHtml += `<ul>${Array.from(staticBox.querySelectorAll('.static-item .content')).map(d => `<li>${d.innerHTML}</li>`).join('')}</ul>`;
        }
        const notes = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `#sub-items-container-fide${q.id}_notes input[type="text"]`,
          ),
        ).filter(i => !i.classList.contains('completed') && i.value.trim())
          .map(i => `<li>${i.value}</li>`).join('');
        if (notes) contentHtml += `<ul>${notes}</ul>`;
        if (prods) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${prods}</ul>`;
      }
    } else if (q.type === 'pop_system') {
      const pops = Array.from(
        document.querySelectorAll<HTMLInputElement>('.pop-checkbox:checked'),
      ).map(cb => cb.value).filter(c => !getExpiredCodes().includes(c));
      if (pops.length) contentHtml = `<ul><li>${pops.join(', ')}</li></ul>`;
    }

    if (contentHtml || qStatus.completed) {
      const compSpan = qStatus.completed
        ? ' <span class="status-tag status-tag--done">Tamamlandı</span>'
        : '';
      const tag = (q.wantsStoreEmail && q.type !== 'pop_system')
        ? storeEmailTag
        : (q.type === 'pop_system' && q.popEmailTo?.length
          ? ` <a href="mailto:${q.popEmailTo.join(',')}" class="email-tag">@${q.popEmailTo.join(', ')}</a>`
          : '');
      fideReportHtml += `<p><b>FiDe ${q.id}. ${q.title}</b>${compSpan}${tag}</p>${contentHtml}`;
    }
  });

  const tableHtml = renderPerformanceTable(storeInfo, fideStoreInfo, manualFideScore);

  const finalBody = emailTemplate
    .replace(/{YONETMEN_ADI}/g, yonetmenFirstName ?? '')
    .replace(/{BAYI_BILGISI}/g, `${selectedStore.bayiKodu} ${shortBayiAdi}`)
    .replace(/{DENETIM_ICERIGI}/g, fideReportHtml)
    .replace(/{PUAN_TABLOSU}/g, tableHtml);

  // Formu gizle, taslağı göster
  document.getElementById('dide-upload-card')?.setAttribute('hidden', '');
  document.getElementById('form-content')?.setAttribute('hidden', '');
  document.getElementById('generate-email-btn')?.setAttribute('hidden', '');

  const existing = document.getElementById('email-draft-container');
  if (existing) existing.remove();

  const draft = document.createElement('div');
  draft.id = 'email-draft-container';
  draft.className = 'card';

  const heading = document.createElement('h2');

  const backBtn = document.createElement('button');
  backBtn.id = 'back-to-form-btn';
  backBtn.className = 'btn btn-light btn-sm';
  backBtn.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i>';
  backBtn.addEventListener('click', returnToMainPage);

  heading.appendChild(backBtn);
  heading.appendChild(document.createTextNode(' Kopyalanacak E-posta Taslağı'));

  const editArea = document.createElement('div');
  editArea.id = 'email-draft-area';
  editArea.contentEditable = 'true';
  editArea.innerHTML = finalBody;

  draft.appendChild(heading);
  draft.appendChild(editArea);
  document.querySelector('.container')?.appendChild(draft);
}

export function returnToMainPage(): void {
  document.getElementById('email-draft-container')?.remove();
  document.getElementById('dide-upload-card')?.removeAttribute('hidden');
  document.getElementById('form-content')?.removeAttribute('hidden');
  document.getElementById('generate-email-btn')?.removeAttribute('hidden');
}
