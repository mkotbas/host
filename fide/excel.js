import * as XLSX from 'xlsx';
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
 * DiDe Excel verisini işler ve buluta kaydeder.
 * @param {Array} dataAsArray Excel'den okunmuş ham veri.
 * @returns {Promise<Array|null>} İşlenmiş veri veya hata durumunda null.
 */
async function processDideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 2) {
        alert('DiDe Excel dosyası beklenen formatta değil (en az 2 satır gerekli).');
        return null;
    }
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) {
        alert('DiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
        return null;
    }

    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    const bayiIndex = headerRow.indexOf('Bayi');
    const bayiYonetmeniIndex = headerRow.indexOf('Bayi Yönetmeni');
    if ([bayiKoduIndex, bayiIndex, bayiYonetmeniIndex].includes(-1)) {
        alert('DiDe Excel dosyasında "Bayi Kodu", "Bayi" veya "Bayi Yönetmeni" sütunlarından biri bulunamadı.');
        return null;
    }
    
    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        headerRow.forEach((header, index) => {
            const monthNumber = parseInt(header);
            if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                if(row[index] !== null && row[index] !== undefined) scores[monthNumber] = row[index];
            }
        });
        return { 'Bayi Kodu': row[bayiKoduIndex], 'Bayi': row[bayiIndex], 'Bayi Yönetmeni': row[bayiYonetmeniIndex], 'scores': scores };
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
                console.error("DiDe verisi kaydedilirken hata:", error);
                alert("DiDe verisi buluta kaydedilirken bir hata oluştu.");
                return null;
            }
        }
        alert('DiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
    }
    return processedData;
}

/**
 * FiDe Excel verisini işler ve buluta kaydeder.
 * @param {Array} dataAsArray Excel'den okunmuş ham veri.
 * @returns {Promise<Array|null>} İşlenmiş veri veya hata durumunda null.
 */
async function processFideExcelData(dataAsArray, filename) {
    if (dataAsArray.length < 3) {
        alert('FiDe Excel dosyası beklenen formatta değil (en az 3 satır gerekli).');
        return null;
    }
    const currentYear = new Date().getFullYear();
    let yearRowIndex = -1;
    for(let i = 0; i < dataAsArray.length; i++) {
        if(dataAsArray[i].some(cell => String(cell).trim() == currentYear)) {
            yearRowIndex = i;
            break;
        }
    }
    if (yearRowIndex === -1) {
        alert(`FiDe Excel dosyasında '${currentYear}' yılını içeren bir satır bulunamadı.`);
        return null;
    }

    const yearRow = dataAsArray[yearRowIndex];
    const filledYearRow = yearRow.reduce((acc, cell) => {
        acc.lastKnown = (cell !== null && cell !== undefined && String(cell).trim() !== "") ? String(cell).trim() : acc.lastKnown;
        acc.result.push(acc.lastKnown);
        return acc;
    }, { result: [], lastKnown: null }).result;

    let monthRowIndex = yearRowIndex + 1;
    if (monthRowIndex >= dataAsArray.length) {
        alert('FiDe Excel dosyasında ay bilgileri (yıl satırının altında) bulunamadı.');
        return null;
    }
    const monthRow = dataAsArray[monthRowIndex];
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) {
        alert('FiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
        return null;
    }

    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    if (bayiKoduIndex === -1) {
        alert('FiDe Excel dosyasında "Bayi Kodu" sütunu bulunamadı.');
        return null;
    }

    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        for (let i = 0; i < filledYearRow.length; i++) {
            if (filledYearRow[i] == currentYear) {
                const monthNumber = parseInt(monthRow[i]);
                if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                    if(row[i] !== null && row[i] !== undefined && row[i] !== "") scores[monthNumber] = row[i];
                }
            }
        }
        return { 'Bayi Kodu': row[bayiKoduIndex], 'scores': scores };
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
                console.error("FiDe verisi kaydedilirken hata:", error);
                alert("FiDe verisi buluta kaydedilirken bir hata oluştu.");
                return null;
            }
        }
        alert('FiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
    }
    return processedData;
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
    showLoadingOverlay("Excel dosyası işleniyor...");

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
                
                resolve(!!processedData); // processedData null değilse true döner

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