(function() {
    // Bu yapı, modülün kodlarının diğer kodlarla çakışmasını engeller.

    // --- MODÜL BAŞLANGICI ---
    // Modülün çalışması için gerekli olan her şeyi başlatan fonksiyon.
    function init() {
        // HTML'deki elemanlara erişim
        const dideFileInput = document.getElementById('dide-excel-file-input');
        const fideFileInput = document.getElementById('fide-excel-file-input');
        const clearDideBtn = document.getElementById('clear-dide-excel-btn');
        const clearFideBtn = document.getElementById('clear-fide-excel-btn');
        const clearAllDataBtn = document.getElementById('clear-storage-btn');

        // Olay dinleyicilerini ata
        dideFileInput.addEventListener('change', (e) => handleFileSelect(e, 'dide'));
        fideFileInput.addEventListener('change', (e) => handleFileSelect(e, 'fide'));

        clearDideBtn.addEventListener('click', clearDideData);
        clearFideBtn.addEventListener('click', clearFideData);
        clearAllDataBtn.addEventListener('click', clearAllData);

        // Modül yüklendiğinde, bulutta kayıtlı dosya isimlerini göster
        displayCurrentFilenames();
    }

    // --- VERİ YÜKLEME VE İŞLEME ---

    /**
     * Kullanıcı bir Excel dosyası seçtiğinde tetiklenir.
     * @param {Event} event Olay nesnesi
     * @param {string} type 'dide' veya 'fide'
     */
    function handleFileSelect(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                
                if (type === 'dide') {
                    processDideExcelData(dataAsArray, true, file.name);
                } else {
                    processFideExcelData(dataAsArray, true, file.name);
                }
            } catch (error) {
                alert("Excel dosyası okunurken bir hata oluştu.");
                console.error("Excel okuma hatası:", error);
            }
        };
        event.target.value = ''; // Aynı dosyayı tekrar seçebilmek için inputu sıfırla
    }
    
    /**
     * DiDe Excel verisini işler ve buluta kaydeder.
     * Bu fonksiyon main.js'ten direkt olarak alınmıştır.
     */
    function processDideExcelData(dataAsArray, saveToCloud = false, filename = '') {
        // ... (main.js'teki fonksiyonun içeriği buraya kopyalanacak)
        if (dataAsArray.length < 2) return alert('DiDe Excel dosyası beklenen formatta değil (en az 2 satır gerekli).');
        let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
        if (headerRowIndex === -1) return alert('DiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
        const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
        const dataRows = dataAsArray.slice(headerRowIndex + 1);
        const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
        const bayiIndex = headerRow.indexOf('Bayi');
        const bayiYonetmeniIndex = headerRow.indexOf('Bayi Yönetmeni');
        if ([bayiKoduIndex, bayiIndex, bayiYonetmeniIndex].includes(-1)) return alert('DiDe Excel dosyasında "Bayi Kodu", "Bayi" veya "Bayi Yönetmeni" sütunlarından biri bulunamadı.');
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
        
        if (saveToCloud && firebase.auth().currentUser && firebase.database()) {
            const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
            firebase.database().ref('excelData/dide').set(persistenceData)
                .then(() => {
                    alert('DiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
                    displayCurrentFilenames(); // Arayüzü güncelle
                });
        }
    }

    /**
     * FiDe Excel verisini işler ve buluta kaydeder.
     * Bu fonksiyon main.js'ten direkt olarak alınmıştır.
     */
    function processFideExcelData(dataAsArray, saveToCloud = false, filename = '') {
        // ... (main.js'teki fonksiyonun içeriği buraya kopyalanacak)
        if (dataAsArray.length < 3) return alert('FiDe Excel dosyası beklenen formatta değil (en az 3 satır gerekli).');
        const currentYear = new Date().getFullYear();
        let yearRowIndex = -1;
        for(let i = 0; i < dataAsArray.length; i++) {
            if(dataAsArray[i].some(cell => String(cell).trim() == currentYear)) {
                yearRowIndex = i;
                break;
            }
        }
        if (yearRowIndex === -1) return alert(`FiDe Excel dosyasında '${currentYear}' yılını içeren bir satır bulunamadı.`);
        const yearRow = dataAsArray[yearRowIndex];
        const filledYearRow = [];
        let lastKnownYear = null;
        for (const cell of yearRow) {
            if (cell !== null && cell !== undefined && String(cell).trim() !== "") { lastKnownYear = String(cell).trim(); }
            filledYearRow.push(lastKnownYear);
        }
        let monthRowIndex = yearRowIndex + 1;
        if (monthRowIndex >= dataAsArray.length) return alert('FiDe Excel dosyasında ay bilgileri (yıl satırının altında) bulunamadı.');
        const monthRow = dataAsArray[monthRowIndex];
        let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
        if (headerRowIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
        const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
        const dataRows = dataAsArray.slice(headerRowIndex + 1);
        const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
        if (bayiKoduIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" sütunu bulunamadı.');
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
    
        if (saveToCloud && firebase.auth().currentUser && firebase.database()) {
            const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
            firebase.database().ref('excelData/fide').set(persistenceData)
                .then(() => {
                    alert('FiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
                    displayCurrentFilenames(); // Arayüzü güncelle
                });
        }
    }


    // --- VERİ TEMİZLEME ---

    function clearDideData() {
        if (confirm("Yüklenmiş olan DiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(firebase.auth().currentUser && firebase.database()) {
                firebase.database().ref('excelData/dide').remove()
                    .then(() => {
                        alert("DiDe Excel verisi buluttan temizlendi.");
                        displayCurrentFilenames();
                    });
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
        }
    }

    function clearFideData() {
        if (confirm("Yüklenmiş olan FiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(firebase.auth().currentUser && firebase.database()) {
                firebase.database().ref('excelData/fide').remove()
                    .then(() => {
                        alert("FiDe Excel verisi buluttan temizlendi.");
                        displayCurrentFilenames();
                    });
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
        }
    }

    function clearAllData() {
        const dogruSifreHash = 'ZmRlMDAx'; // "fde001" in base64 hali
        const girilenSifre = prompt("Bu işlem geri alınamaz. Buluttaki TÜM uygulama verilerini kalıcı olarak silmek için lütfen şifreyi girin:");

        if (girilenSifre) { 
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                if (confirm("Şifre doğru. Emin misiniz? Kaydedilmiş TÜM bayi raporları, yüklenmiş Excel dosyaları ve diğer ayarlar dahil olmak üzere bulutta saklanan BÜTÜN uygulama verileri kalıcı olarak silinecektir.")) {
                    if(firebase.auth().currentUser && firebase.database()){
                        // Silinecek ana yolları bir diziye ekle
                        const pathsToDelete = [
                            'allFideReports',
                            'excelData',
                            'migrationSettings',
                            'storeEmails',
                            'tumBayilerListesi',
                            'fideQuestionsData',
                            'denetimGeriAlinanlar'
                            // Gelecekte eklenecek diğer ana veriler...
                        ];
                        
                        const deletePromises = pathsToDelete.map(path => firebase.database().ref(path).remove());

                        Promise.all(deletePromises)
                            .then(() => {
                                alert("Tüm bulut verileri başarıyla temizlendi. Sayfa yenileniyor.");
                                window.location.reload();
                            })
                            .catch(error => {
                                alert("Veriler silinirken bir hata oluştu: " + error.message);
                            });
                    } else {
                        alert("Bu işlem için giriş yapmış olmalısınız.");
                    }
                }
            } else {
                alert("Hatalı şifre! Silme işlemi iptal edildi.");
            }
        }
    }

    // --- ARAYÜZ GÜNCELLEME ---

    /**
     * Buluttan mevcut Excel dosyalarının adlarını çeker ve ekranda gösterir.
     */
    async function displayCurrentFilenames() {
        const user = firebase.auth().currentUser;
        if (!user || !firebase.database()) return;

        const dideFileNameSpan = document.getElementById('dide-file-name');
        const fideFileNameSpan = document.getElementById('fide-file-name');

        try {
            const dideRef = firebase.database().ref('excelData/dide/filename');
            const dideSnapshot = await dideRef.once('value');
            if (dideSnapshot.exists()) {
                dideFileNameSpan.textContent = `Bulutta yüklü: ${dideSnapshot.val()}`;
            } else {
                dideFileNameSpan.textContent = 'Bulutta yüklü dosya yok.';
            }

            const fideRef = firebase.database().ref('excelData/fide/filename');
            const fideSnapshot = await fideRef.once('value');
            if (fideSnapshot.exists()) {
                fideFileNameSpan.textContent = `Bulutta yüklü: ${fideSnapshot.val()}`;
            } else {
                fideFileNameSpan.textContent = 'Bulutta yüklü dosya yok.';
            }
        } catch (error) {
            console.error("Buluttan dosya adları okunurken hata oluştu:", error);
            dideFileNameSpan.textContent = 'Veri okunamadı.';
            fideFileNameSpan.textContent = 'Veri okunamadı.';
        }
    }

    // Modülü başlat
    init();

})();