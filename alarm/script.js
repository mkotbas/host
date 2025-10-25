document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    let cihazVeritabani = []; let malzemeVeritabani = []; let secilenCihaz = null; let seciliKategori = "Tümü";

    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const akrilikStandVarCheckbox = document.getElementById("akrilikStandVar"); // YENİ: Checkbox
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu");
    const filtreButonlari = document.querySelectorAll(".filtre-buton");

    const hesaplaButton = document.getElementById("hesaplaButton");
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

    // --- 2. VERİLERİ YÜKLEME ---
    async function verileriYukle() {
        try {
            const [cihazResponse, malzemeResponse] = await Promise.all([
                fetch('cihazlar.json'),
                fetch('malzemeler.json')
            ]);
            if (!cihazResponse.ok) throw new Error(`'cihazlar.json' yüklenemedi`);
            if (!malzemeResponse.ok) throw new Error(`'malzemeler.json' yüklenemedi`);
            
            const cihazData = await cihazResponse.json();
            cihazVeritabani = cihazData.cihazlar.map(cihaz => ({...cihaz, tamAd: `${cihaz.marka} ${cihaz.model}` }));
            malzemeVeritabani = await malzemeResponse.json();

            console.log("Veri tabanları yüklendi.");
            aktiveEtArayuzu();
        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            yuklemeDurumu.textContent = `HATA: ${error.message}. Dosyalar yüklenemedi.`;
            yuklemeDurumu.style.color = "red"; yuklemeDurumu.style.fontWeight = "bold";
        }
    }
    
    function aktiveEtArayuzu() {
        aramaCubugu.disabled = false; adetInput.disabled = false;
        akrilikStandVarCheckbox.disabled = false; // Checkbox'ı da aktif et
        ekleButton.disabled = false; hesaplaButton.disabled = false;
        yuklemeDurumu.style.display = "none";
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---
    function aramaYap() {
        const arananMetin = aramaCubugu.value.toLowerCase().trim();
        aramaSonuclari.innerHTML = "";
        if (arananMetin.length < 2) { aramaSonuclari.style.display = "none"; secilenCihaz = null; return; }
        const sonuclar = cihazVeritabani.filter(cihaz => 
            (seciliKategori === "Tümü" || cihaz.kategori === seciliKategori) && 
            cihaz.tamAd.toLowerCase().includes(arananMetin)
        );
        if (sonuclar.length > 0) {
            sonuclar.slice(0, 10).forEach(cihaz => {
                const regex = new RegExp(`(${arananMetin})`, 'gi');
                const vurguluAd = cihaz.tamAd.replace(regex, '<strong>$1</strong>');
                if (cihaz.kategori === "Akıllı Saat") {
                    ["MGM", "SALUS"].forEach(kit => {
                        const div = document.createElement("div");
                        div.innerHTML = `${vurguluAd} <span style="color: grey; font-size: 0.9em;">[${kit} Kiti]</span>`;
                        div.dataset.tamAd = cihaz.tamAd; div.dataset.kitTuru = kit;
                        div.addEventListener("click", () => handleAramaSonucClick(cihaz, kit));
                        aramaSonuclari.appendChild(div);
                    });
                } else {
                    const div = document.createElement("div");
                    div.innerHTML = vurguluAd; div.dataset.tamAd = cihaz.tamAd;
                    div.addEventListener("click", () => handleAramaSonucClick(cihaz, null));
                    aramaSonuclari.appendChild(div);
                }
            });
            aramaSonuclari.style.display = "block";
        } else { aramaSonuclari.style.display = "none"; secilenCihaz = null; }
    }

    function handleAramaSonucClick(cihaz, kitTuru) {
        secilenCihaz = { ...cihaz, kitTuru: kitTuru }; 
        aramaCubugu.value = cihaz.tamAd; 
        aramaSonuclari.style.display = "none"; aramaSonuclari.innerHTML = "";
        
        // Akıllı saat veya Bilgisayar seçildiyse stand checkbox'ını disable et ve işareti kaldır
        if (cihaz.kategori === "Akıllı Saat" || cihaz.kategori === "Bilgisayar") {
             akrilikStandVarCheckbox.checked = false;
             akrilikStandVarCheckbox.disabled = true;
        } else {
            akrilikStandVarCheckbox.disabled = false; // Telefon/Tablet için aktif et
            akrilikStandVarCheckbox.checked = true; // Varsayılan olarak işaretli olsun
        }
        adetInput.focus();
    }

    aramaCubugu.addEventListener("input", aramaYap);
    aramaCubugu.addEventListener("blur", () => { setTimeout(() => { aramaSonuclari.style.display = "none"; }, 200); });
    filtreButonlari.forEach(buton => {
        buton.addEventListener("click", () => {
            filtreButonlari.forEach(b => b.classList.remove("active"));
            buton.classList.add("active"); seciliKategori = buton.dataset.kategori;
            if (aramaCubugu.value.trim().length >= 2) aramaYap();
        });
    });

    // "+" (Ekle) butonu (data-onstand eklendi)
    ekleButton.addEventListener("click", () => {
        const adet = parseInt(adetInput.value, 10);
        const akrilikStandKullan = akrilikStandVarCheckbox.checked; // YENİ: Checkbox durumu
        
        if (!secilenCihaz || !aramaCubugu.value || adet <= 0 || aramaCubugu.value !== secilenCihaz.tamAd) {
            alert("Lütfen listeden geçerli bir ürün (ve akıllı saat ise kitini) seçin ve adet girin."); return;
        }
        
        const li = document.createElement("li");
        li.dataset.model = secilenCihaz.tamAd; 
        li.dataset.adet = adet;
        li.dataset.kit = secilenCihaz.kitTuru || ""; 
        li.dataset.onstand = akrilikStandKullan; // YENİ: Stand bilgisini sakla
        
        let gorunenAd = `<strong>${secilenCihaz.tamAd}</strong>`;
        if (secilenCihaz.kitTuru) gorunenAd += ` [${secilenCihaz.kitTuru} Kiti]`;
        if (!akrilikStandKullan && secilenCihaz.kategori !== "Akıllı Saat" && secilenCihaz.kategori !== "Bilgisayar") {
             gorunenAd += ` <span style="color: grey; font-size: 0.9em;">(Stand Yok)</span>`; // Görsel onay
        }
        
        li.innerHTML = `<span>${gorunenAd} - ${adet} Adet</span><button class="silButton">Sil</button>`;
        li.querySelector(".silButton").addEventListener("click", () => li.remove());
        secilenUrunListesi.appendChild(li);

        aramaCubugu.value = ""; adetInput.value = "1"; secilenCihaz = null; 
        akrilikStandVarCheckbox.checked = true; // Checkbox'ı sıfırla
        akrilikStandVarCheckbox.disabled = true; // Yeni arama yapılana kadar disable
        aramaCubugu.focus();
    });

    // --- 4. ANA HESAPLAMA FONKSİYONU (Stand Mantığı Eklendi) ---
    function hesapla() {
        console.log("Hesaplama başlatıldı...");
        sonucTablosuBody.innerHTML = ""; genelMalzemeListesi.innerHTML = "";
        ozetBilgi.innerHTML = ""; ozetBilgi.style.color = '#333';

        const listeElemanlari = secilenUrunListesi.querySelectorAll("li");
        if (listeElemanlari.length === 0) { ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün ekleyin."; return; }

        const siparisListesi = {};
        let toplamCihazSayisi = 0; let bulunamayanModelSayisi = 0; let bulunamayanModeller = [];
        let akrilikStandKullananAdetHesapla = 0; // YENİ: Sadece stand kullananların adedi
        
        listeElemanlari.forEach(li => {
            const modelTamAdi = li.dataset.model; 
            const adet = parseInt(li.dataset.adet, 10);
            const kitTuru = li.dataset.kit; 
            const akrilikStandKullan = li.dataset.onstand === 'true'; // YENİ: Stand bilgisini oku
            if (!modelTamAdi || isNaN(adet) || adet <= 0) return;
            toplamCihazSayisi += adet;
            const bulunanCihaz = cihazVeritabani.find(cihaz => cihaz.tamAd === modelTamAdi);
            if (!bulunanCihaz) { bulunamayanModelSayisi++; bulunamayanModeller.push(`"${modelTamAdi}"`); return; }

            // --- Malzeme Ekleme Mantığı Güncellendi ---
            if (bulunanCihaz.kategori === "Akıllı Saat") {
                if (kitTuru === "MGM") { stokKoduEkle("8909011600", adet); stokKoduEkle("8909021600", adet); } 
                else if (kitTuru === "SALUS") {
                    const salusParcalari = malzemeVeritabani.filter(m => m.kategori === "Salus");
                    salusParcalari.forEach(parca => stokKoduEkle(parca.stok_kodu, adet));
                } else { console.warn(`Kit türü belirtilmemiş: ${modelTamAdi}`); }
            } else if (bulunanCihaz.kategori === "Bilgisayar") {
                 // Bilgisayarlar stand kullanmaz, kabloyu doğrudan ekle
                 if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
            } else { // Telefon veya Tablet
                if (akrilikStandKullan) {
                     akrilikStandKullananAdetHesapla += adet; // Stand kullananları say
                     // Stand ve Stand Kablosunu ekle
                     if (bulunanCihaz.stand_stok_kodu) stokKoduEkle(bulunanCihaz.stand_stok_kodu, adet);
                     if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet); // Stand kablosu
                     if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet); // Tablet paneli
                } else {
                    // Stand KULLANILMIYORSA, uygun "stand üzerinde olmayan" kabloyu seç
                    let nonStandCable = null;
                    if (bulunanCihaz.port === "Lightning") nonStandCable = "8907041600";
                    else if (bulunanCihaz.port === "USB-C") nonStandCable = "8907011600";
                    else if (bulunanCihaz.port === "Micro USB") nonStandCable = "8907051600"; // Genel USB kablo
                    // Ters Micro USB için özel non-stand kablo yok, belki genel USB? Şimdilik eklemiyoruz.
                    
                    if (nonStandCable) stokKoduEkle(nonStandCable, adet);
                    if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet); // Tablet paneli yine eklenir
                }
            }
            // --- Malzeme Ekleme Mantığı Sonu ---
        });

        // Genel Malzemeler
        if (toplamCihazSayisi > 0) stokKoduEkle("8907071600", 1); 
        
        // Panel Hesabı (Değişmedi, stand kullanan Tel + tüm PC'ler)
        const telefonAdediStandli = akrilikStandKullananAdetHesapla - (siparisListesi["8906981600"] || 0); // Stand kullanan Tel
        const pcAdediMac = siparisListesi["8907061600"] || 0; 
        const pcAdediDiger = siparisListesi["8907051600"] || 0;
        const pcAdedi = pcAdediMac + pcAdediDiger; 
        const panelGerekenCihazAdedi = telefonAdediStandli + pcAdedi; 
        if (panelGerekenCihazAdedi > 0) {
            const gerekliPanelAdedi = Math.ceil(panelGerekenCihazAdedi / 5);
            stokKoduEkle("8906971600", gerekliPanelAdedi);
        }
        
        // Konnektör Hesabı (Standlı Tel+Tab + Stand Kullanmayan Tel+Tab + Tüm PC'ler)
        const telefonAdediStandsiz = (listeElemanlari.length - akrilikStandKullananAdetHesapla - (siparisListesi["8909011600"] || 0) - pcAdedi); // Saatleri ve PC'leri çıkar
        const tabletAdedi = siparisListesi["8906981600"] || 0;
        const konnektorGerekenAdet = akrilikStandKullananAdetHesapla + telefonAdediStandsiz + pcAdedi; // Stand kullananlar + kullanmayan Tel/Tab + PC'ler
        
        if (konnektorGerekenAdet > 0) {
             stokKoduEkle("8907081600", konnektorGerekenAdet);
        }
        
        // Akrilik Stand Yapışkanları (Sadece stand kullanan Tel + Tab)
        if (akrilikStandKullananAdetHesapla > 0) {
             stokKoduEkle("9220951600", akrilikStandKullananAdetHesapla); // Taban Yapışkanı
             stokKoduEkle("9224911600", akrilikStandKullananAdetHesapla); // Ek Yapışkan
        }
        
        // Damla Yapışkan (Sadece Macbook)
        if (pcAdediMac > 0) stokKoduEkle("8907091600", pcAdediMac); 

        function stokKoduEkle(stokKodu, adet) {
            if (!siparisListesi[stokKodu]) siparisListesi[stokKodu] = 0;
            siparisListesi[stokKodu] += adet;
        }

        // --- 5. SONUÇLARI TABLOYA YAZDIRMA ---
        sonucTablosuBody.innerHTML = ""; genelMalzemeListesi.innerHTML = "";
        if (Object.keys(siparisListesi).length === 0 && bulunamayanModelSayisi === 0) { ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün ekleyin."; return; }
        let toplamPaketSayisi = 0; let sabitMalzemelerHTML = "";
        for (const stokKodu in siparisListesi) {
            const toplamGerekliAdet = siparisListesi[stokKodu];
            const malzeme = malzemeVeritabani.find(m => m.stok_kodu === stokKodu);
            if (!malzeme) { console.error(`Stok Kodu "${stokKodu}" bulunamadı!`); continue; }
            const paketIciAdet = malzeme.paket_ici_adet || 1;
            const gerekliPaketAdedi = Math.ceil(toplamGerekliAdet / paketIciAdet);
            toplamPaketSayisi += gerekliPaketAdedi;
            const satirHTML = `<tr><td>${stokKodu}</td><td>${malzeme.urun_adi}</td><td><b>${gerekliPaketAdedi} Paket</b></td><td>${toplamGerekliAdet} Adet</td><td>${malzeme.kullanim_amaci}</td></tr>`;
            if (malzeme.kategori === "Genel" || malzeme.kategori === "Aksesuar") { sabitMalzemelerHTML += `<li><b>${gerekliPaketAdedi} Paket</b> - ${malzeme.urun_adi}</li>`; } 
            else { sonucTablosuBody.innerHTML += satirHTML; }
        }
        genelMalzemeListesi.innerHTML = sabitMalzemelerHTML || "<li>(Genel malzeme eklenmedi)</li>";

        // --- 6. ÖZET BİLGİ ---
        let ozetMesaji = `<b>Hesaplama Tamamlandı.</b> Toplam ${toplamCihazSayisi} cihaz için ${toplamPaketSayisi} kalem paket malzeme gerekiyor.`;
        if (bulunamayanModelSayisi > 0) ozetMesaji += `<br><b style="color: red;">UYARI:</b> ${bulunamayanModelSayisi} model/satır tanınamadı: ${bulunamayanModeller.join(', ')}`;
        ozetBilgi.innerHTML = ozetMesaji;
    }

    // --- 7. OLAYLARI BAĞLAMA ---
    hesaplaButton.addEventListener("click", hesapla);
    verileriYukle();
});