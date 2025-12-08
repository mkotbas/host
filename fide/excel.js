import { showLoadingOverlay, hideLoadingOverlay } from './utils.js';
import * as state from './state.js';

let pb; // PocketBase instance

/**
 * Excel modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initExcel(pbInstance) {
    pb = pbInstance;
}

/**
 * Ayarları buluta (PocketBase -> ayarlar koleksiyonuna) kaydeder.
 */
async function saveMappingToCloud(type, mapping) {
    if (!pb || !pb.authStore.isValid) return;
    
    const key = `excel_mapping_${type}`; // Anahtar örn: excel_mapping_dide
    const dataToSave = {
        anahtar: key,
        deger: mapping
    };

    try {
        // Önce var mı diye kontrol et
        try {
            const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${key}"`);
            // Varsa güncelle
            await pb.collection('ayarlar').update(record.id, { deger: mapping });
        } catch (err) {
            // Yoksa (404) yeni oluştur
            if (err.status === 404) {
                await pb.collection('ayarlar').create(dataToSave);
            } else {
                throw err;
            }
        }
        console.log(`${type.toUpperCase()} ayarları buluta kaydedildi.`);
    } catch (error) {
        console.error("Ayarlar buluta kaydedilemedi:", error);
    }
}

/**
 * Buluttaki kayıtlı ayarları kontrol eder.
 * Dosya yapısı (imzası) tutuyorsa kayıtlı ayarları döndürür.
 */
async function checkSavedMapping(dataAsArray, type) {
    if (!pb || !pb.authStore.isValid) return null;

    try {
        const key = `excel_mapping_${type}`;
        const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${key}"`);
        const savedConfig = record.deger;
        
        if (!savedConfig) return null;

        const rowIndex = savedConfig.headerRowIndex;

        // Dosya o satıra sahip mi?
        if (rowIndex >= dataAsArray.length) return null;

        const currentRow = dataAsArray[rowIndex];
        // Basit bir imza oluştur: Satırdaki dolu hücreleri birleştir
        const currentSignature = currentRow.map(c => String(c || "").trim()).join("|");

        // İmzalar eşleşiyor mu? (Yani dosya yapısı aynı mı?)
        if (currentSignature === savedConfig.signature) {
            console.log(`${type.toUpperCase()} için BULUTTAKİ ayarlar kullanılıyor.`);
            return savedConfig;
        } else {
            console.log(`${type.toUpperCase()} dosya yapısı değişmiş. Yeni ayar isteniyor.`);
        }
    } catch (e) {
        // Kayıt bulunamazsa (404) veya hata olursa null dön, sihirbazı aç
        if (e.status !== 404) console.error("Bulut ayar okuma hatası:", e);
    }
    return null;
}

/**
 * Kullanıcıdan Excel sütun eşleştirmesi yapmasını isteyen sihirbazı yönetir.
 * @param {Array} dataAsArray Tüm Excel verisi
 * @param {'dide'|'fide'} type İşlem tipi
 * @returns {Promise<object>} Kullanıcının seçtiği ayarlar (satır indeksi ve sütun indeksleri)
 */
function openMappingModal(dataAsArray, type) {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('excel-mapping-modal');
        const rowSelect = document.getElementById('mapping-row-select');
        const rowPreview = document.getElementById('row-preview-text');
        const stepColumn = document.getElementById('step-column-mapping');
        
        const mapBayiKodu = document.getElementById('map-bayi-kodu');
        const mapBayiAdi = document.getElementById('map-bayi-adi');
        const mapYonetmen = document.getElementById('map-yonetmen');
        const dideExtraFields = document.getElementById('dide-extra-fields');
        const saveBtn = document.getElementById('mapping-save-btn');
        const cancelBtn = document.getElementById('mapping-cancel-btn');

        // Modalı göster
        modal.style.display = 'flex';
        stepColumn.style.display = 'none';
        saveBtn.disabled = true;

        // Tipe göre arayüzü ayarla
        if (type === 'fide') {
            dideExtraFields.style.display = 'none';
            document.querySelector('#step-row-selection p').textContent = "1. Yıl Bilgisi (Örn: 2025) Hangi Satırda?";
        } else {
            dideExtraFields.style.display = 'block';
            document.querySelector('#step-row-selection p').textContent = "1. Başlıklar (Bayi Kodu vb.) Hangi Satırda?";
        }

        // İlk 20 satırı (veya daha azsa hepsini) satır seçim kutusuna doldur
        rowSelect.innerHTML = '<option value="">-- Satır Seçin --</option>';
        const limit = Math.min(dataAsArray.length, 20);
        for (let i = 0; i < limit; i++) {
            // Satırın ilk 3 dolu hücresini önizleme olarak göster
            const preview = dataAsArray[i].filter(c => c !== null && c !== undefined && String(c).trim() !== "").slice(0, 3).join(" | ");
            const label = `Satır ${i + 1}: ${preview ? preview : '(Boş)'}`;
            rowSelect.innerHTML += `<option value="${i}">${label}</option>`;
        }

        // Satır değiştiğinde sütunları doldur
        rowSelect.onchange = () => {
            const rowIndex = parseInt(rowSelect.value);
            if (isNaN(rowIndex)) {
                stepColumn.style.display = 'none';
                rowPreview.textContent = "";
                return;
            }

            const rowData = dataAsArray[rowIndex];
            rowPreview.textContent = `Seçilen Satır İçeriği: ${rowData.join(" | ")}`;
            stepColumn.style.display = 'block';
            saveBtn.disabled = false;

            // --- FİDE İÇİN ALT SATIR OKUMA ---
            let labelRowData = rowData; 
            if (type === 'fide') {
                if (rowIndex + 1 < dataAsArray.length) {
                    labelRowData = dataAsArray[rowIndex + 1];
                }
            }

            // Sütun seçim kutularını doldur
            const fillSelect = (selectEl) => {
                selectEl.innerHTML = '<option value="">-- Sütun Seçin --</option>';
                const columnCount = Math.max(rowData.length, labelRowData.length);

                for (let i = 0; i < columnCount; i++) {
                    const cell = labelRowData[i];
                    const cellText = (cell !== null && cell !== undefined && String(cell).trim() !== "") 
                                     ? String(cell).substring(0, 40) 
                                     : "(Boş)";
                    selectEl.innerHTML += `<option value="${i}">Sütun ${i + 1}: ${cellText}</option>`;
                }
            };

            fillSelect(mapBayiKodu);
            if (type === 'dide') {
                fillSelect(mapBayiAdi);
                fillSelect(mapYonetmen);
            }
        };

        // Kaydet butonu
        saveBtn.onclick = async () => {
            const rowIndex = parseInt(rowSelect.value);
            const selectedMapping = {
                headerRowIndex: rowIndex,
                bayiKoduIndex: parseInt(mapBayiKodu.value),
                bayiAdiIndex: type === 'dide' ? parseInt(mapBayiAdi.value) : -1,
                yonetmenIndex: type === 'dide' ? parseInt(mapYonetmen.value) : -1,
                // İMZA OLUŞTURMA: Bu dosyanın yapısını hatırlamak için
                signature: dataAsArray[rowIndex].map(c => String(c || "").trim()).join("|")
            };

            if (isNaN(selectedMapping.bayiKoduIndex)) {
                alert("Lütfen en azından 'Bayi Kodu' sütununu seçin.");
                return;
            }

            // --- AYARLARI BULUTA KAYDET ---
            // Bu işlem asenkron olduğu için kullanıcıyı bekletmemek adına arka planda başlatıyoruz
            // ancak hata alırsak kullanıcıyı uyarmayacağız, sessizce devam edecek.
            saveMappingToCloud(type, selectedMapping);

            modal.style.display = 'none';
            resolve(selectedMapping);
        };

        // İptal butonu
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            reject("Kullanıcı iptal etti.");
        };
    });
}


/**
 * DiDe Excel verisini işler ve buluta kaydeder.
 */
async function processDideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 2) {
        alert('Dosya çok boş görünüyor.');
        return null;
    }

    try {
        // Önce BULUTU kontrol et, yoksa kullanıcıya sor
        let mapping = await checkSavedMapping(dataAsArray, 'dide');
        if (!mapping) {
            mapping = await openMappingModal(dataAsArray, 'dide');
        }
        
        showLoadingOverlay("Veriler işleniyor...");

        const headerRow = dataAsArray[mapping.headerRowIndex];
        const dataRows = dataAsArray.slice(mapping.headerRowIndex + 1);
        
        const processedData = dataRows.map(row => {
            if (!row[mapping.bayiKoduIndex]) return null;
            
            const scores = {};
            headerRow.forEach((header, index) => {
                const monthNumber = parseInt(header);
                if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                    if(row[index] !== null && row[index] !== undefined) scores[monthNumber] = row[index];
                }
            });

            return { 
                'Bayi Kodu': row[mapping.bayiKoduIndex], 
                'Bayi': mapping.bayiAdiIndex > -1 ? row[mapping.bayiAdiIndex] : '', 
                'Bayi Yönetmeni': mapping.yonetmenIndex > -1 ? row[mapping.yonetmenIndex] : '', 
                'scores': scores 
            };
        }).filter(d => d);
        
        if (pb && pb.authStore.isValid) {
            const dataToSave = { "tip": "dide", "dosyaAdi": filename, "veri": processedData };
            try {
                const record = await pb.collection('excel_verileri').getFirstListItem('tip="dide"');
                await pb.collection('excel_verileri').update(record.id, dataToSave);
            } catch (error) {
                if (error.status === 404) {
                    await pb.collection('excel_verileri').create(dataToSave);
                } else {
                    console.error("Hata:", error);
                    alert("Buluta kaydetme hatası.");
                    return null;
                }
            }
            alert('DiDe puan dosyası başarıyla işlendi ve kaydedildi.');
        }
        return processedData;

    } catch (e) {
        console.log(e);
        return null;
    }
}

/**
 * FiDe Excel verisini işler ve buluta kaydeder.
 */
async function processFideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 3) {
        alert('Dosya çok boş görünüyor.');
        return null;
    }

    try {
        // Önce BULUTU kontrol et, yoksa kullanıcıya sor
        let mapping = await checkSavedMapping(dataAsArray, 'fide');
        if (!mapping) {
            mapping = await openMappingModal(dataAsArray, 'fide');
        }

        showLoadingOverlay("Veriler işleniyor...");

        const yearRowIndex = mapping.headerRowIndex;
        const yearRow = dataAsArray[yearRowIndex];
        const monthRow = dataAsArray[yearRowIndex + 1]; 
        
        if (!monthRow) {
            alert("Seçilen yıl satırının altında ay bilgileri bulunamadı.");
            return null;
        }

        const filledYearRow = yearRow.reduce((acc, cell) => {
            acc.lastKnown = (cell !== null && cell !== undefined && String(cell).trim() !== "") ? String(cell).trim() : acc.lastKnown;
            acc.result.push(acc.lastKnown);
            return acc;
        }, { result: [], lastKnown: null }).result;

        const currentYear = new Date().getFullYear();
        const dataRows = dataAsArray.slice(yearRowIndex + 2); 

        const processedData = dataRows.map(row => {
            if (!row[mapping.bayiKoduIndex]) return null;
            const scores = {};
            
            for (let i = 0; i < filledYearRow.length; i++) {
                if (filledYearRow[i] == currentYear) {
                    const monthNumber = parseInt(monthRow[i]);
                    if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                        if(row[i] !== null && row[i] !== undefined && row[i] !== "") scores[monthNumber] = row[i];
                    }
                }
            }
            return { 'Bayi Kodu': row[mapping.bayiKoduIndex], 'scores': scores };
        }).filter(d => d);

        if (pb && pb.authStore.isValid) {
            const dataToSave = { "tip": "fide", "dosyaAdi": filename, "veri": processedData };
            try {
                const record = await pb.collection('excel_verileri').getFirstListItem('tip="fide"');
                await pb.collection('excel_verileri').update(record.id, dataToSave);
            } catch (error) {
                if (error.status === 404) {
                    await pb.collection('excel_verileri').create(dataToSave);
                } else {
                    console.error("Hata:", error);
                    alert("Buluta kaydetme hatası.");
                    return null;
                }
            }
            alert('FiDe puan dosyası başarıyla işlendi ve kaydedildi.');
        }
        return processedData;

    } catch (e) {
        console.log(e);
        return null;
    }
}

/**
 * Dosya seçme olayını yönetir ve ilgili işlemciyi çağırır.
 * @param {Event} event Dosya input'undan gelen olay.
 * @param {'dide' | 'fide'} type Dosya tipi.
 * @returns {Promise<boolean>} İşlem başarılıysa true döner.
 */
export async function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return false;

    const filename = file.name;
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Yüklü dosya: ${filename}`;
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                
                let processedData;
                if (type === 'dide') {
                    processedData = await processDideExcelData(dataAsArray, filename);
                    if (processedData) state.setDideData(processedData);
                } else {
                    processedData = await processFideExcelData(dataAsArray, filename);
                    if (processedData) state.setFideData(processedData);
                }
                
                resolve(!!processedData); 

            } catch (error) { 
                alert("Excel dosyası okunurken bir hata oluştu."); 
                console.error("Excel okuma hatası:", error); 
                resolve(false);
            } finally {
                hideLoadingOverlay();
            }
        };
        reader.onerror = () => {
             alert("Dosya okunamadı.");
             resolve(false);
        }
    });
}