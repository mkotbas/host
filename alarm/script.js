document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    let cihazVeritabani = []; let malzemeVeritabani = []; let secilenCihaz = null; let seciliKategori = "Tümü";
    let sonSiparisVerileri = []; // Excel için hesaplanan verileri burada tutacağız

    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const akrilikStandVarCheckbox = document.getElementById("akrilikStandVar");
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu");
    const filtreButonlari = document.querySelectorAll(".filtre-buton");

    const hesaplaButton = document.getElementById("hesaplaButton");
    const excelIndirButton = document.getElementById("excelIndirButton"); // Yeni buton
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

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
            const [cihazResponse, malzemeResponse] = await Promise.all([
                fetch('cihazlar.json'),
                fetch('malzemeler.json')
            ]);
            if (!cihazResponse.ok) throw new Error(`'cihazlar.json' yüklenemedi`);
            if (!malzemeResponse.ok) throw new Error(`'malzemeler.json' yüklenemedi`);

            const cihazData = await cihazResponse.json();
            if (!cihazData || !Array.isArray(cihazData.cihazlar)) throw new Error("'cihazlar.json' formatı hatalı.");
            cihazVeritabani = cihazData.cihazlar.map(cihaz => ({...cihaz, tamAd: `${cihaz.marka} ${cihaz.model}` }));

            malzemeVeritabani = await malzemeResponse.json();
            if (!Array.isArray(malzemeVeritabani)) throw new Error("'malzemeler.json' formatı hatalı.");

            aktiveEtArayuzu();
        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            yuklemeDurumu.textContent = `HATA: ${error.message}.`;
        }
    }

    function aktiveEtArayuzu() {
        aramaCubugu.disabled = false; adetInput.disabled = false;
        ekleButton.disabled = false; hesaplaButton.disabled = false;
        yeniKategoriSelect.disabled = false; yeniMarkaInput.disabled = false;
        yeniModelInput.disabled = false; yeniPortSelect.disabled = false;
        yeniYilInput.disabled = false; yeniCihazKaydetButton.disabled = false;
        yuklemeDurumu.style.display = "none";
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---
    function aramaYap() {
        const arananMetin = aramaCubugu.value.toLowerCase().trim();
        aramaSonuclari.innerHTML = "";
        if (arananMetin.length < 2) { aramaSonuclari.style.display = "none"; return; }

        const sonuclar = cihazVeritabani.filter(cihaz =>
            (seciliKategori === "Tümü" || cihaz.kategori === seciliKategori) &&
            cihaz.tamAd.toLowerCase().includes(arananMetin)
        );

        if (sonuclar.length > 0) {
            sonuclar.forEach(cihaz => {
                const regex = new RegExp(`(${arananMetin})`, 'gi');
                const vurguluAd = cihaz.tamAd.replace(regex, '<strong>$1</strong>');
                if (cihaz.kategori === "Akıllı Saat") {
                    ["MGM", "SALUS"].forEach(kit => {
                        const div = document.createElement('div');
                        div.innerHTML = `${vurguluAd} <span style="color: grey; font-size: 0.9em;">[${kit} Kiti]</span>`;
                        div.addEventListener("mousedown", (e) => { e.preventDefault(); handleAramaSonucClick(cihaz, kit); });
                        aramaSonuclari.appendChild(div);
                    });
                } else {
                    const div = document.createElement('div');
                    div.innerHTML = vurguluAd;
                    div.addEventListener("mousedown", (e) => { e.preventDefault(); handleAramaSonucClick(cihaz, null); });
                    aramaSonuclari.appendChild(div);
                }
            });
            aramaSonuclari.style.display = "block";
        } else { aramaSonuclari.style.display = "none"; }
    }

    function handleAramaSonucClick(cihaz, kitTuru) {
        secilenCihaz = { ...cihaz, kitTuru: kitTuru };
        aramaCubugu.value = cihaz.tamAd;
        aramaSonuclari.style.display = "none";
        if (cihaz.kategori === "Akıllı Saat" || cihaz.kategori === "Bilgisayar") {
             akrilikStandVarCheckbox.checked = false; akrilikStandVarCheckbox.disabled = true;
        } else { akrilikStandVarCheckbox.disabled = false; akrilikStandVarCheckbox.checked = true; }
    }

    aramaCubugu.addEventListener("input", aramaYap);
    aramaCubugu.addEventListener("blur", () => { setTimeout(() => { aramaSonuclari.style.display = "none"; }, 150); });

    filtreButonlari.forEach(buton => {
        buton.addEventListener("click", () => {
            filtreButonlari.forEach(b => b.classList.remove("active"));
            buton.classList.add("active");
            seciliKategori = buton.dataset.kategori;
            aramaYap();
        });
    });

    ekleButton.addEventListener("click", () => {
        const adet = parseInt(adetInput.value, 10);
        const akrilikStandKullan = akrilikStandVarCheckbox.checked;
        if (!secilenCihaz || !aramaCubugu.value || adet <= 0 || aramaCubugu.value !== secilenCihaz.tamAd) {
            alert("Lütfen geçerli bir ürün seçin."); return;
        }
        const li = document.createElement("li");
        li.dataset.model = secilenCihaz.tamAd; li.dataset.adet = adet;
        li.dataset.kit = secilenCihaz.kitTuru || ""; li.dataset.onstand = akrilikStandKullan;
        let gorunenAd = `<strong>${secilenCihaz.tamAd}</strong>`;
        if (secilenCihaz.kitTuru) gorunenAd += ` [${secilenCihaz.kitTuru} Kiti]`;
        if (!akrilikStandKullan && secilenCihaz.kategori !== "Akıllı Saat" && secilenCihaz.kategori !== "Bilgisayar") {
             gorunenAd += ` <span style="color: grey; font-size: 0.9em;">(Stand Yok)</span>`;
        }
        li.innerHTML = `<span>${gorunenAd} - ${adet} Adet</span><button class="silButton">Sil</button>`;
        li.querySelector(".silButton").addEventListener("click", () => li.remove());
        secilenUrunListesi.appendChild(li);
        aramaCubugu.value = ""; adetInput.value = "1"; secilenCihaz = null;
        akrilikStandVarCheckbox.disabled = true; aramaCubugu.focus();
    });

    // --- Excel İndirme Fonksiyonu ---
    function excelIndir() {
        if (sonSiparisVerileri.length === 0) return;
        
        // Başlıkları oluştur
        const basliklar = ["Stok Kodu", "Ürün Adı (ABS Kayıt İsmi)", "Gerekli Paket Adedi"];
        const excelVerisi = [basliklar, ...sonSiparisVerileri];
        
        // Excel dosyasını oluştur
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelVerisi);
        
        // Sütun genişliklerini ayarla
        ws['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 20 }];
        
        XLSX.utils.book_append_sheet(wb, ws, "Sipariş Listesi");
        
        // Dosyayı indir
        const tarih = new Date().toLocaleDateString('tr-TR');
        XLSX.writeFile(wb, `Alarm_Siparis_Listesi_${tarih}.xlsx`);
    }

    // --- 4. ANA HESAPLAMA FONKSİYONU ---
    function hesapla() {
        sonucTablosuBody.innerHTML = ""; genelMalzemeListesi.innerHTML = "";
        ozetBilgi.innerHTML = ""; sonSiparisVerileri = []; // Önceki verileri temizle
        excelIndirButton.style.display = "none";

        const listeElemanlari = secilenUrunListesi.querySelectorAll("li");
        if (listeElemanlari.length === 0) { ozetBilgi.textContent = "Lütfen ürün ekleyin."; return; }

        const siparisListesi = {};
        let toplamCihazSayisi = 0; let akrilikStandKullananAdetHesapla = 0;
        let toplamStandKullanmayanAdet = 0;

        listeElemanlari.forEach(li => {
            const modelTamAdi = li.dataset.model;
            const adet = parseInt(li.dataset.adet, 10);
            const kitTuru = li.dataset.kit;
            const akrilikStandKullan = li.dataset.onstand === 'true';
            toplamCihazSayisi += adet;
            const bulunanCihaz = cihazVeritabani.find(cihaz => cihaz.tamAd === modelTamAdi);
            if (!bulunanCihaz) return;

            if (bulunanCihaz.kategori === "Akıllı Saat") {
                if (kitTuru === "MGM") { stokKoduEkle("8909011600", adet); stokKoduEkle("8909021600", adet); }
                else if (kitTuru === "SALUS") {
                    malzemeVeritabani.filter(m => m.kategori === "Salus").forEach(parca => stokKoduEkle(parca.stok_kodu, adet));
                }
            } else if (bulunanCihaz.kategori === "Bilgisayar") {
                 if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
            } else {
                if (akrilikStandKullan) {
                     akrilikStandKullananAdetHesapla += adet;
                     if (bulunanCihaz.stand_stok_kodu) stokKoduEkle(bulunanCihaz.stand_stok_kodu, adet);
                     if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
                     if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
                } else {
                    toplamStandKullanmayanAdet += adet;
                    let nonStandCable = null;
                    if (bulunanCihaz.port === "Lightning") nonStandCable = "8907041600";
                    else if (bulunanCihaz.port === "USB-C") nonStandCable = "8907011600";
                    else if (bulunanCihaz.port === "Micro USB") nonStandCable = "8907021600";
                    if (nonStandCable) stokKoduEkle(nonStandCable, adet);
                    if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
                }
            }
        });

        if (toplamCihazSayisi > 0) stokKoduEkle("8907071600", 1);
        const telefonAdediStandli = akrilikStandKullananAdetHesapla - (siparisListesi["8906981600"] || 0);
        const pcAdediMac = siparisListesi["8907061600"] || 0;
        const pcAdediDiger = siparisListesi["8907051600"] || 0;
        const pcAdedi = pcAdediMac + pcAdediDiger;
        const panelGerekenCihazAdedi = telefonAdediStandli + pcAdedi;
        if (panelGerekenCihazAdedi > 0) stokKoduEkle("8906971600", Math.ceil(panelGerekenCihazAdedi / 5));
        const konnektorGerekenAdet = akrilikStandKullananAdetHesapla + toplamStandKullanmayanAdet + pcAdedi;
        if (konnektorGerekenAdet > 0) stokKoduEkle("8907081600", konnektorGerekenAdet);
        if (akrilikStandKullananAdetHesapla > 0) {
             stokKoduEkle("9220951600", akrilikStandKullananAdetHesapla);
             stokKoduEkle("9224911600", akrilikStandKullananAdetHesapla);
        }
        if (pcAdediMac > 0) stokKoduEkle("8907091600", pcAdediMac);

        function stokKoduEkle(stokKodu, adet) {
            if (!siparisListesi[stokKodu]) siparisListesi[stokKodu] = 0;
            siparisListesi[stokKodu] += adet;
        }

        let sabitMalzemelerHTML = "";
        for (const stokKodu in siparisListesi) {
            const malzeme = malzemeVeritabani.find(m => m.stok_kodu === stokKodu);
            if (!malzeme) continue;
            const gerekliPaketAdedi = Math.ceil(siparisListesi[stokKodu] / (malzeme.paket_ici_adet || 1));
            
            // Excel için veriyi hazırla (Sadece 3 sütun)
            sonSiparisVerileri.push([stokKodu, malzeme.urun_adi, `${gerekliPaketAdedi} Paket`]);

            if (malzeme.kategori === "Genel" || malzeme.kategori === "Aksesuar") {
                sabitMalzemelerHTML += `<li><b>${gerekliPaketAdedi} Paket</b> - ${malzeme.urun_adi}</li>`;
            } else {
                sonucTablosuBody.innerHTML += `<tr><td>${stokKodu}</td><td>${malzeme.urun_adi}</td><td><b>${gerekliPaketAdedi} Paket</b></td><td>${siparisListesi[stokKodu]} Adet</td><td>${malzeme.kullanim_amaci}</td></tr>`;
            }
        }
        genelMalzemeListesi.innerHTML = sabitMalzemelerHTML || "<li>(Genel malzeme eklenmedi)</li>";
        ozetBilgi.innerHTML = `<b>Hesaplama Tamamlandı.</b> Toplam ${toplamCihazSayisi} cihaz hesaplandı.`;
        if (sonSiparisVerileri.length > 0) excelIndirButton.style.display = "block"; // Butonu göster
    }

    hesaplaButton.addEventListener("click", hesapla);
    excelIndirButton.addEventListener("click", excelIndir); // Excel butonu olayı
    verileriYukle();
});