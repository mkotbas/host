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
    
    const key = `excel_mapping_${type}`; 
    const dataToSave = {
        anahtar: key,
        deger: mapping
    };

    try {
        try {
            const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${key}"`);
            await pb.collection('ayarlar').update(record.id, { deger: mapping });
        } catch (err) {
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
 */
async function checkSavedMapping(dataAsArray, type) {
    if (!pb || !pb.authStore.isValid) return null;

    try {
        const key = `excel_mapping_${type}`;
        const record = await pb.collection('ayarlar').getFirstListItem(`anahtar="${key}"`);
        const savedConfig = record.deger;
        
        if (!savedConfig) return null;

        const rowIndex = savedConfig.headerRowIndex;

        if (rowIndex >= dataAsArray.length) return null;

        const currentRow = dataAsArray[rowIndex];
        const currentSignature = currentRow.map(c => String(c || "").trim()).join("|");

        if (currentSignature === savedConfig.signature) {
            console.log(`${type.toUpperCase()} için BULUTTAKİ ayarlar kullanılıyor.`);
            return savedConfig;
        }
    } catch (e) {
        if (e.status !== 404) console.error("Bulut ayar okuma hatası:", e);
    }
    return null;
}

/**
 * Kullanıcıdan Excel sütun eşleştirmesi yapmasını isteyen sihirbazı yönetir.
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

        modal.style.display = 'flex';
        stepColumn.style.display = 'none';
        saveBtn.disabled = true;

        if (type === 'fide') {
            dideExtraFields.style.display = 'none';
            document.querySelector('#step-row-selection p').textContent = "1. Yıl Bilgisi (Örn: 2025) Hangi Satırda?";
        } else {
            dideExtraFields.style.display = 'block';
            document.querySelector('#step-row-selection p').textContent = "1. Başlıklar (Bayi Kodu vb.) Hangi Satırda?";
        }

        rowSelect.innerHTML = '<option value="">-- Satır Seçin --</option>';
        const limit = Math.min(dataAsArray.length, 20);
        for (let i = 0; i < limit; i++) {
            const preview = dataAsArray[i].filter(c => c !== null && c !== undefined && String(c).trim() !== "").slice(0, 3).join(" | ");
            const label = `Satır ${i + 1}: ${preview ? preview : '(Boş)'}`;
            rowSelect.innerHTML += `<option value="${i}">${label}</option>`;
        }

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

            let labelRowData = rowData; 
            if (type === 'fide') {
                if (rowIndex + 1 < dataAsArray.length) {
                    labelRowData = dataAsArray[rowIndex + 1];
                }
            }

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

        saveBtn.onclick = async () => {
            const rowIndex = parseInt(rowSelect.value);
            const selectedMapping = {
                headerRowIndex: rowIndex,
                bayiKoduIndex: parseInt(mapBayiKodu.value),
                bayiAdiIndex: type === 'dide' ? parseInt(mapBayiAdi.value) : -1,
                yonetmenIndex: type === 'dide' ? parseInt(mapYonetmen.value) : -1,
                signature: dataAsArray[rowIndex].map(c => String(c || "").trim()).join("|")
            };

            if (isNaN(selectedMapping.bayiKoduIndex)) {
                alert("Lütfen en azından 'Bayi Kodu' sütununu seçin.");
                return;
            }

            saveMappingToCloud(type, selectedMapping);
            modal.style.display = 'none';
            resolve(selectedMapping);
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            reject("Kullanıcı iptal etti.");
        };
    });
}

/**
 * DiDe Excel verisini işler.
 */
export async function processDideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 2) return null;

    try {
        let mapping = await checkSavedMapping(dataAsArray, 'dide');
        if (!mapping) mapping = await openMappingModal(dataAsArray, 'dide');
        
        showLoadingOverlay("Veriler işleniyor...");

        const headerRow = dataAsArray[mapping.headerRowIndex];
        const dataRows = dataAsArray.slice(mapping.headerRowIndex + 1);
        
        const processedData = dataRows.map(row => {
            if (!row[mapping.bayiKoduIndex]) return null;
            
            const scores = {};
            headerRow.forEach((header, index) => {
                const monthNumber = parseInt(header);
                if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                    if(row[index] !== null && row[index] !== undefined && row[index] !== "") scores[monthNumber] = row[index];
                }
            });

            return { 
                'Bayi Kodu': String(row[mapping.bayiKoduIndex]), 
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
                if (error.status === 404) await pb.collection('excel_verileri').create(dataToSave);
            }
            alert('DiDe puan dosyası başarıyla işlendi.');
        }
        return processedData;
    } catch (e) {
        console.error(e);
        return null;
    }
}

/**
 * FiDe Excel verisini işler.
 */
export async function processFideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 3) return null;

    try {
        let mapping = await checkSavedMapping(dataAsArray, 'fide');
        if (!mapping) mapping = await openMappingModal(dataAsArray, 'fide');

        showLoadingOverlay("Veriler işleniyor...");

        const yearRowIndex = mapping.headerRowIndex;
        const yearRow = dataAsArray[yearRowIndex];
        const monthRow = dataAsArray[yearRowIndex + 1]; 
        
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
            return { 'Bayi Kodu': String(row[mapping.bayiKoduIndex]), 'scores': scores };
        }).filter(d => d);

        if (pb && pb.authStore.isValid) {
            const dataToSave = { "tip": "fide", "dosyaAdi": filename, "veri": processedData };
            try {
                const record = await pb.collection('excel_verileri').getFirstListItem('tip="fide"');
                await pb.collection('excel_verileri').update(record.id, dataToSave);
            } catch (error) {
                if (error.status === 404) await pb.collection('excel_verileri').create(dataToSave);
            }
            alert('FiDe puan dosyası başarıyla işlendi.');
        }
        return processedData;
    } catch (e) {
        console.error(e);
        return null;
    }
}

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
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
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
                alert("Excel okuma hatası."); 
                resolve(false);
            } finally {
                hideLoadingOverlay();
            }
        };
        reader.onerror = () => resolve(false);
    });
}