document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    let cihazVeritabani = []; let malzemeVeritabani = []; let secilenCihaz = null; let seciliKategori = "Tümü";

    // Arama ve Ekleme
    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const akrilikStandVarCheckbox = document.getElementById("akrilikStandVar"); 
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu");
    const filtreButonlari = document.querySelectorAll(".filtre-buton");

    // Hesaplama ve Sonuç
    const hesaplaButton = document.getElementById("hesaplaButton");
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

    // YENİ: Cihaz Ekleme Form Elemanları
    const yeniKategoriSelect = document.getElementById("yeniKategori");
    const yeniMarkaInput = document.getElementById("yeniMarka");
    const yeniModelInput = document.getElementById("yeniModel");
    const yeniPortSelect = document.getElementById("yeniPort");
    const yeniPortDigerInput = document.getElementById("yeniPortDiger");
    const yeniYilInput = document.getElementById("yeniYil");
    const yeniCihazKaydetButton = document.getElementById("yeniCihazKaydetButton");
    const cihazEklemeSonucDiv = document.getElementById("cihazEklemeSonuc");

    // --- 2. VERİLERİ YÜKLEME ---
    async function verileriYukle() {
        try {
            // Paralel yükleme
            const [cihazResponse, malzemeResponse] = await Promise.all([
                fetch('cihazlar.json'),
                fetch('malzemeler.json')
            ]);
            // Hata kontrolü
            if (!cihazResponse.ok) throw new Error(`'cihazlar.json' yüklenemedi (HTTP ${cihazResponse.status})`);
            if (!malzemeResponse.ok) throw new Error(`'malzemeler.json' yüklenemedi (HTTP ${malzemeResponse.status})`);
            
            const cihazData = await cihazResponse.json();
            // Veritabanını 'tamAd' ile zenginleştir (Hata kontrolü eklendi)
            if (!cihazData || !Array.isArray(cihazData.cihazlar)) throw new Error("'cihazlar.json' formatı hatalı.");
            cihazVeritabani = cihazData.cihazlar.map(cihaz => ({...cihaz, tamAd: `${cihaz.marka} ${cihaz.model}` }));
            
            malzemeVeritabani = await malzemeResponse.json();
            if (!Array.isArray(malzemeVeritabani)) throw new Error("'malzemeler.json' formatı hatalı.");


            console.log("Veri tabanları yüklendi.");
            aktiveEtArayuzu();
        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            yuklemeDurumu.textContent = `HATA: ${error.message}. Dosyalar yüklenemedi veya formatı bozuk.`;
            yuklemeDurumu.style.color = "red"; yuklemeDurumu.style.fontWeight = "bold";
            // Hata durumunda diğer formları da disable bırak
        }
    }
    
    function aktiveEtArayuzu() {
        // Arama/Ekleme formunu aktif et
        aramaCubugu.disabled = false; adetInput.disabled = false;
        akrilikStandVarCheckbox.disabled = true; // Ürün seçilene kadar disable
        ekleButton.disabled = false; hesaplaButton.disabled = false;
        
        // YENİ: Cihaz Ekleme formunu aktif et
        yeniKategoriSelect.disabled = false; yeniMarkaInput.disabled = false;
        yeniModelInput.disabled = false; yeniPortSelect.disabled = false;
        yeniYilInput.disabled = false; yeniCihazKaydetButton.disabled = false;
        // Diğer port input'u başlangıçta gizli ve disable kalmalı
        yeniPortDigerInput.disabled = true;

        yuklemeDurumu.style.display = "none";
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---
    // (AramaYap, handleAramaSonucClick, filtreButonlari olayları aynı)
    function aramaYap() { /* ... önceki kod ... */ }
    function handleAramaSonucClick(cihaz, kitTuru) { /* ... önceki kod ... */ }
    aramaCubugu.addEventListener("input", aramaYap);
    aramaCubugu.addEventListener("blur", () => { setTimeout(() => { aramaSonuclari.style.display = "none"; }, 200); });
    filtreButonlari.forEach(buton => { /* ... önceki kod ... */ });

    // "+" (Ekle) butonu 
    ekleButton.addEventListener("click", () => { /* ... önceki kod ... */ });

    // --- YENİ: CİHAZ EKLEME ÖZELLİĞİ ---

    // Port tipi "Diğer" seçildiğinde metin kutusunu göster/gizle
    yeniPortSelect.addEventListener("change", () => {
        if (yeniPortSelect.value === "Diger") {
            yeniPortDigerInput.style.display = "block";
            yeniPortDigerInput.disabled = false;
            yeniPortDigerInput.focus();
        } else {
            yeniPortDigerInput.style.display = "none";
            yeniPortDigerInput.disabled = true;
            yeniPortDigerInput.value = ""; // İçeriği temizle
        }
    });

    // "Kaydet ve İndir" butonuna tıklanınca
    yeniCihazKaydetButton.addEventListener("click", () => {
        // Form verilerini al
        const kategori = yeniKategoriSelect.value;
        const marka = yeniMarkaInput.value.trim();
        const model = yeniModelInput.value.trim();
        let port = yeniPortSelect.value;
        if (port === "Diger") {
            port = yeniPortDigerInput.value.trim();
        }
        const yil = parseInt(yeniYilInput.value, 10);

        // Doğrulama
        if (!kategori || !marka || !model || !port || !yil || isNaN(yil)) {
            alert("Lütfen tüm alanları doğru bir şekilde doldurun.");
            return;
        }

        const tamAdYeni = `${marka} ${model}`;

        // Cihaz zaten var mı kontrol et (hafızadaki kopyada)
        const mevcutCihaz = cihazVeritabani.find(c => c.tamAd.toLowerCase() === tamAdYeni.toLowerCase());
        if (mevcutCihaz) {
            alert(`"${tamAdYeni}" modeli zaten veritabanında mevcut.`);
            return;
        }

        // Kurallara göre stok kodlarını belirle
        let kablo_stok_kodu = null;
        let stand_stok_kodu = null;
        let panel_stok_kodu = null;

        if (kategori === "Telefon" || kategori === "Tablet") {
            stand_stok_kodu = "8906991600"; // Standart akrilik stand
            if (kategori === "Tablet") {
                panel_stok_kodu = "8906981600"; // Tablet paneli
            }
            // Kablo seçimi porta göre
            if (port === "USB-C") {
                 // Yeni nesil kuralı burada basitçe kontrol edilebilir veya genel kablo atanabilir.
                 // Şimdilik genel Type-C atayalım, gerekirse manuel düzenlenebilir.
                 kablo_stok_kodu = "8907011600"; 
                 // Not: Yeni eklenen cihazın S20+ veya iPhone 15+ olup olmadığını bilemeyiz,
                 // bu yüzden güvenli tarafta kalıp 8907011600 atıyoruz.
            } else if (port === "Lightning") {
                kablo_stok_kodu = "8907031600"; // Stand kablosu varsayalım
            } else if (port === "Micro USB") {
                kablo_stok_kodu = "8907021600"; // Stand kablosu varsayalım
            } 
            // Ters Micro USB veya özel portlar için manuel JSON düzenlemesi gerekebilir.
            // Şimdilik bilinenler bunlar.
            
        } else if (kategori === "Bilgisayar") {
            stand_stok_kodu = null;
            if (marka.toLowerCase() === "apple") {
                kablo_stok_kodu = "8907061600"; // Macbook kablosu
            } else if (port === "USB-A" || port === "USB-C") { 
                 // Diğer PC'ler için USB-A veya USB-C portu varsa genel USB kablosu
                 kablo_stok_kodu = "8907051600"; 
            }
        } else if (kategori === "Akıllı Saat") {
            // Akıllı saatler için stok kodu atanmaz, script karar verir.
            kablo_stok_kodu = null;
            stand_stok_kodu = null;
        }

        // Yeni cihaz nesnesini oluştur
        const yeniCihazNesnesi = {
            kategori: kategori,
            marka: marka,
            model: model,
            port: port,
            yil: yil,
            kablo_stok_kodu: kablo_stok_kodu,
            stand_stok_kodu: stand_stok_kodu,
            panel_stok_kodu: panel_stok_kodu
        };

        // Hafızadaki veritabanına ekle (şimdilik sadece indirme için)
        const guncelCihazVeritabani = [...cihazVeritabani, yeniCihazNesnesi];
        // İleride alfabetik sıralama eklenebilir:
        // guncelCihazVeritabani.sort((a, b) => a.tamAd.localeCompare(b.tamAd)); 

        // İndirme linki oluştur
        try {
            // JSON verisini string'e çevir (düzgün formatlı)
            const jsonData = JSON.stringify({ cihazlar: guncelCihazVeritabani, panel_kurallari: { tablet_panel: "8906981600" } }, null, 2); // null, 2 -> güzel formatlama
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cihazlar.json';
            a.textContent = 'Güncel cihazlar.json Dosyasını İndir';

            // Sonuç mesajını ve linki göster
            cihazEklemeSonucDiv.innerHTML = `"${tamAdYeni}" başarıyla listeye eklendi.<br>Değişikliğin kalıcı olması için lütfen aşağıdaki dosyayı indirin ve mevcut <code>cihazlar.json</code> dosyasının üzerine yazın.<br>`;
            cihazEklemeSonucDiv.appendChild(a);
            cihazEklemeSonucDiv.style.display = 'block';
            cihazEklemeSonucDiv.style.color = 'green';

            // Formu temizle
            yeniMarkaInput.value = ""; yeniModelInput.value = ""; yeniPortSelect.value = "USB-C"; 
            yeniPortDigerInput.style.display = "none"; yeniPortDigerInput.value = ""; yeniYilInput.value = "";

        } catch (err) {
            console.error("İndirme linki oluşturma hatası:", err);
            cihazEklemeSonucDiv.textContent = 'HATA: İndirme linki oluşturulamadı.';
            cihazEklemeSonucDiv.style.display = 'block';
            cihazEklemeSonucDiv.style.color = 'red';
        }
    });

    // --- 4. ANA HESAPLAMA FONKSİYONU ---
    function hesapla() { /* ... önceki kod ... */ }

    // --- 5. SONUÇLARI TABLOYA YAZDIRMA ---
    // (Bu fonksiyonda değişiklik yok)

    // --- 6. ÖZET BİLGİ ---
    // (Bu fonksiyonda değişiklik yok)

    // --- 7. OLAYLARI BAĞLAMA ---
    hesaplaButton.addEventListener("click", hesapla);
    verileriYukle(); // Sayfa yüklendiğinde verileri yükle
});