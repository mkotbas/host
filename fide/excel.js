import { showLoadingOverlay, hideLoadingOverlay } from './utils.js';
import * as state from './state.js';
import * as api from './api.js'; // Yeni ekledik: Mapping'leri kaydetmek için

let pb; // PocketBase instance
let currentWorkbook = null; // Sihirbaz açıkken Excel dosyasını geçici hafızada tutmak için
let currentFileType = null; // 'dide' veya 'fide'
let currentFileName = null; // Dosya adı

/**
 * Excel modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initExcel(pbInstance) {
    pb = pbInstance;
    
    // Modal Kapatma Event Listener'ı
    document.getElementById('close-mapping-modal').addEventListener('click', () => {
        document.getElementById('excel-mapping-modal').style.display = 'none';
        currentWorkbook = null; // Temizle
    });

    // Modal Kaydet Event Listener'ı
    document.getElementById('save-mapping-btn').addEventListener('click', handleSaveMapping);
}

/**
 * Kullanıcı "Kaydet ve İşle" dediğinde çalışır.
 * Seçilen sütunları API'ye gönderir ve işlemeyi başlatır.
 */
async function handleSaveMapping() {
    if (!currentFileType || !currentWorkbook) return;

    const bayiColIndex = parseInt(document.getElementById('map-bayi-code-col').value);
    const janColIndex = parseInt(document.getElementById('map-jan-col').value);
    const headerRow = parseInt(document.getElementById('map-header-row').value) - 1; // 0-based index

    if (isNaN(bayiColIndex) || isNaN(janColIndex)) {
        alert("Lütfen sütun seçimlerini yapınız.");
        return;
    }

    if (bayiColIndex === janColIndex) {
        alert("Bayi Kodu ve Puan sütunu aynı olamaz.");
        return;
    }

    const mappingConfig = {
        bayiColIndex: bayiColIndex,
        firstMonthColIndex: janColIndex,
        headerRowIndex: headerRow
    };

    // 1. Ayarları Buluta Kaydet
    showLoadingOverlay("Ayarlar kaydediliyor...");
    const success = await api.saveExcelMapping(currentFileType, mappingConfig);
    hideLoadingOverlay();

    if (success) {
        // 2. State'i Güncelle (Anlık kullanım için)
        if (!state.appState.excelMappings) state.appState.excelMappings = {};
        state.appState.excelMappings[currentFileType] = mappingConfig;

        // 3. Modalı Kapat ve İşlemeyi Başlat
        document.getElementById('excel-mapping-modal').style.display = 'none';
        processExcelWithMapping(currentWorkbook, mappingConfig, currentFileType, currentFileName);
    }
}

/**
 * Sihirbaz Modalını Açar.
 * @param {Object} worksheet Excel sayfası
 * @param {string} type 'dide' veya 'fide'
 */
function showMappingModal(worksheet, type) {
    const modal = document.getElementById('excel-mapping-modal');
    const previewTable = document.getElementById('excel-preview-table');
    const bayiSelect = document.getElementById('map-bayi-code-col');
    const janSelect = document.getElementById('map-jan-col');
    const headerInput = document.getElementById('map-header-row');

    // 1. Excel Verisini JSON'a Çevir (Header yok, ham veri)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    
    // 2. Maksimum Sütun Sayısını Bul
    let maxCols = 0;
    jsonData.slice(0, 10).forEach(row => { // İlk 10 satıra bakmak yeterli
        if (row.length > maxCols) maxCols = row.length;
    });

    // 3. Select Kutularını Doldur (A, B, C...)
    const generateOptions = () => {
        let options = '<option value="-1">Seçiniz...</option>';
        for (let i = 0; i < maxCols; i++) {
            const colLetter = XLSX.utils.encode_col(i); // 0 -> A, 1 -> B
            options += `<option value="${i}">Sütun ${colLetter}</option>`;
        }
        return options;
    };
    
    bayiSelect.innerHTML = generateOptions();
    janSelect.innerHTML = generateOptions();
    headerInput.value = 1; // Reset

    // 4. Önizleme Tablosunu Çiz (İlk 5 Satır)
    let tableHtml = '<thead><tr><th>#</th>';
    for(let i=0; i<maxCols; i++) tableHtml += `<th>${XLSX.utils.encode_col(i)}</th>`;
    tableHtml += '</tr></thead><tbody>';

    jsonData.slice(0, 5).forEach((row, rowIndex) => {
        tableHtml += `<tr><td><strong>${rowIndex + 1}</strong></td>`;
        for (let i = 0; i < maxCols; i++) {
            let val = row[i] !== undefined ? row[i] : "";
            // Çok uzun metinleri kısalt
            if (String(val).length > 20) val = String(val).substring(0, 20) + "...";
            tableHtml += `<td>${val}</td>`;
        }
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody>';
    previewTable.innerHTML = tableHtml;

    // 5. Modalı Göster
    modal.style.display = 'flex';
}

/**
 * Excel verisini, kaydedilmiş ayarlara göre işler.
 * ARTIK TAHMİN YOK, KESİN KOORDİNAT VAR.
 */
async function processExcelWithMapping(workbook, mapping, type, filename) {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    // mapping: { bayiColIndex, firstMonthColIndex, headerRowIndex }
    const dataRows = jsonData.slice(mapping.headerRowIndex + 1); // Başlıktan sonrasını al
    
    const processedData = dataRows.map(row => {
        const bayiKodu = row[mapping.bayiColIndex];
        
        // Bayi kodu yoksa veya boşsa atla
        if (!bayiKodu || String(bayiKodu).trim() === "") return null;

        const scores = {};
        // 12 Ayı Döngüye Al
        for (let i = 0; i < 12; i++) {
            const colIndex = mapping.firstMonthColIndex + i; // Ocak, Şubat, Mart... yan yana gider
            const val = row[colIndex];
            
            // Değer varsa (0 bile olsa) kaydet
            if (val !== undefined && val !== null && String(val).trim() !== "") {
                scores[i + 1] = val; // 1: Ocak, 2: Şubat...
            }
        }

        return {
            'Bayi Kodu': String(bayiKodu).trim(),
            'scores': scores
        };
    }).filter(d => d); // null satırları temizle

    // --- BULUTA KAYDETME (ESKİ MANTIK AYNEN DEVAM) ---
    if (pb && pb.authStore.isValid) {
        const dataToSave = { "tip": type, "dosyaAdi": filename, "veri": processedData };
        try {
            // Önce var mı diye bak, varsa güncelle, yoksa oluştur
            // (Hata yönetimi basitleştirildi)
            let recordId;
            try {
                const record = await pb.collection('excel_verileri').getFirstListItem(`tip="${type}"`);
                recordId = record.id;
            } catch(e) {}

            if (recordId) {
                await pb.collection('excel_verileri').update(recordId, dataToSave);
            } else {
                await pb.collection('excel_verileri').create(dataToSave);
            }

            // State'i güncelle
            if (type === 'dide') state.setDideData(processedData);
            else state.setFideData(processedData);

            alert(`${type.toUpperCase()} puan dosyası başarıyla işlendi ve buluta kaydedildi.`);

        } catch (error) {
            console.error("Bulut kayıt hatası:", error);
            alert("Veri işlendi ama buluta kaydedilemedi.");
        }
    }

    // Temizlik
    currentWorkbook = null;
}

/**
 * Dosya seçme olayını yönetir.
 * ÖNCE AYAR VAR MI DİYE BAKAR.
 */
export async function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return false;

    const filename = file.name;
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Seçildi: ${filename}`;
    
    showLoadingOverlay("Excel okunuyor...");

    // Global değişkenlere ata (Modal için lazım olabilir)
    currentFileType = type;
    currentFileName = filename;

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                currentWorkbook = workbook; // Hafızaya al
                
                hideLoadingOverlay();

                // 1. Ayar Var mı Kontrol Et
                let mapping = null;
                if (state.appState.excelMappings && state.appState.excelMappings[type]) {
                    mapping = state.appState.excelMappings[type];
                } else {
                    // State'de yoksa API'den çekmeyi dene (Garanti olsun)
                    const cloudMappings = await api.getExcelMappings();
                    if (cloudMappings && cloudMappings[type]) {
                        mapping = cloudMappings[type];
                        // State'e de yazalım
                        if (!state.appState.excelMappings) state.appState.excelMappings = {};
                        state.appState.excelMappings = cloudMappings;
                    }
                }

                if (mapping) {
                    // AYAR VAR -> DİREKT İŞLE
                    console.log("Kayıtlı ayar bulundu, otomatik işleniyor...");
                    await processExcelWithMapping(workbook, mapping, type, filename);
                    resolve(true);
                } else {
                    // AYAR YOK -> SİHİRBAZI AÇ
                    console.log("Ayar bulunamadı, sihirbaz açılıyor...");
                    // İlk sayfayı al
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    showMappingModal(worksheet, type);
                    resolve(false); // Modal açıldığı için süreç "pending" gibi, ama burada false dönüyoruz.
                }

            } catch (error) { 
                alert("Excel dosyası okunurken bir hata oluştu."); 
                console.error("Excel okuma hatası:", error); 
                hideLoadingOverlay();
                resolve(false);
            }
        };
        reader.onerror = () => {
             alert("Dosya okunamadı.");
             hideLoadingOverlay();
             resolve(false);
        }
    });
}