document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    let cihazVeritabani = []; let malzemeVeritabani = []; let secilenCihaz = null; let seciliKategori = "Tümü";

    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const akrilikStandVarCheckbox = document.getElementById("akrilikStandVar");
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu");
    const filtreButonlari = document.querySelectorAll(".filtre-buton"); // Filtre butonları seçildi

    const hesaplaButton = document.getElementById("hesaplaButton");
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

            console.log("Veri tabanları yüklendi.");
            aktiveEtArayuzu();
        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            yuklemeDurumu.textContent = `HATA: ${error.message}. Dosyalar yüklenemedi veya formatı bozuk.`;
            yuklemeDurumu.style.color = "red"; yuklemeDurumu.style.fontWeight = "bold";
        }
    }

    function aktiveEtArayuzu() {
        aramaCubugu.disabled = false; adetInput.disabled = false;
        akrilikStandVarCheckbox.disabled = true; // Ürün seçilene kadar disable
        ekleButton.disabled = false; hesaplaButton.disabled = false;
        yeniKategoriSelect.disabled = false; yeniMarkaInput.disabled = false;
        yeniModelInput.disabled = false; yeniPortSelect.disabled = false;
        yeniYilInput.disabled = false; yeniCihazKaydetButton.disabled = false;
        yeniPortDigerInput.disabled = true;
        yuklemeDurumu.style.display = "none";
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---

    function aramaYap() {
        const arananMetin = aramaCubugu.value.toLowerCase().trim();
        aramaSonuclari.innerHTML = ""; // Önceki sonuçları temizle
        secilenCihaz = null; // Arama yaparken seçimi sıfırla

        if (arananMetin.length < 2) {
            aramaSonuclari.style.display = "none"; return;
        }

        // Filtrele: Önce kategori, sonra metin
        const sonuclar = cihazVeritabani.filter(cihaz =>
            (seciliKategori === "Tümü" || cihaz.kategori === seciliKategori) &&
            cihaz.tamAd.toLowerCase().includes(arananMetin)
        );

        if (sonuclar.length > 0) {
            sonuclar.slice(0, 10).forEach(cihaz => { // İlk 10 sonucu al
                const regex = new RegExp(`(${arananMetin})`, 'gi');
                const vurguluAd = cihaz.tamAd.replace(regex, '<strong>$1</strong>');
                const elementTag = 'div'; // Sonuçlar için div kullanalım

                if (cihaz.kategori === "Akıllı Saat") {
                    ["MGM", "SALUS"].forEach(kit => {
                        const div = document.createElement(elementTag);
                        div.innerHTML = `${vurguluAd} <span style="color: grey; font-size: 0.9em;">[${kit} Kiti]</span>`;
                        div.dataset.tamAd = cihaz.tamAd; div.dataset.kitTuru = kit;
                        div.addEventListener("mousedown", (e) => { // 'click' yerine 'mousedown' blur olayını engeller
                           e.preventDefault(); // Blur'u engelle
                           handleAramaSonucClick(cihaz, kit);
                        });
                        aramaSonuclari.appendChild(div);
                    });
                } else {
                    const div = document.createElement(elementTag);
                    div.innerHTML = vurguluAd; div.dataset.tamAd = cihaz.tamAd;
                    div.addEventListener("mousedown", (e) => { // 'click' yerine 'mousedown'
                        e.preventDefault(); // Blur'u engelle
                        handleAramaSonucClick(cihaz, null);
                    });
                    aramaSonuclari.appendChild(div);
                }
            });
            aramaSonuclari.style.display = "block"; // Sonuçları GÖSTER
        } else {
            aramaSonuclari.style.display = "none"; // Sonuç yoksa gizle
        }
    }


    function handleAramaSonucClick(cihaz, kitTuru) {
        secilenCihaz = { ...cihaz, kitTuru: kitTuru };
        aramaCubugu.value = cihaz.tamAd; // Arama çubuğunu doldur
        aramaSonuclari.style.display = "none"; // Sonuç listesini gizle
        aramaSonuclari.innerHTML = ""; // Sonuç listesini temizle

        if (cihaz.kategori === "Akıllı Saat" || cihaz.kategori === "Bilgisayar") {
             akrilikStandVarCheckbox.checked = false;
             akrilikStandVarCheckbox.disabled = true;
        } else {
            akrilikStandVarCheckbox.disabled = false;
            akrilikStandVarCheckbox.checked = true;
        }
        adetInput.focus(); // Adet kısmına odaklan
    }

    // Arama çubuğuna yazıldığında tetikle
    aramaCubugu.addEventListener("input", aramaYap);
    // Odak kaybedildiğinde sonuçları gizle (küçük gecikmeyle)
    aramaCubugu.addEventListener("blur", () => {
        // Doğrudan gizleme yerine, mousedown olayının çalışması için gecikme
        setTimeout(() => {
             if (document.activeElement !== aramaCubugu && !aramaSonuclari.contains(document.activeElement)) {
                 aramaSonuclari.style.display = "none";
             }
        }, 150); // 150ms yeterli olmalı
    });


    // Kategori filtre butonlarına tıklama olayı
    filtreButonlari.forEach(buton => {
        buton.addEventListener("click", () => {
            filtreButonlari.forEach(b => b.classList.remove("active"));
            buton.classList.add("active");
            seciliKategori = buton.dataset.kategori;
            aramaYap(); // Filtre değiştiğinde aramayı GÜNCELLE
        });
    });


    // "+" (Ekle) butonu
    ekleButton.addEventListener("click", () => {
        const adet = parseInt(adetInput.value, 10);
        const akrilikStandKullan = akrilikStandVarCheckbox.checked;

        if (!secilenCihaz || !aramaCubugu.value || adet <= 0 || aramaCubugu.value !== secilenCihaz.tamAd) {
            alert("Lütfen arama sonuçlarından geçerli bir ürün (ve akıllı saat ise kitini) seçin ve adet girin."); return;
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
        akrilikStandVarCheckbox.checked = true;
        akrilikStandVarCheckbox.disabled = true; // Yeni arama yapılana kadar disable
        aramaCubugu.focus();
        aramaYap(); // Arama sonuçlarını temizlemek için
    });

    // --- Yeni Cihaz Ekleme Özelliği ---
    yeniPortSelect.addEventListener("change", () => {
        const showDiger = yeniPortSelect.value === "Diger";
        yeniPortDigerInput.style.display = showDiger ? "block" : "none";
        yeniPortDigerInput.disabled = !showDiger;
        if(showDiger) yeniPortDigerInput.focus(); else yeniPortDigerInput.value = "";
    });

    yeniCihazKaydetButton.addEventListener("click", () => {
        const kategori = yeniKategoriSelect.value; const marka = yeniMarkaInput.value.trim();
        const model = yeniModelInput.value.trim(); let port = yeniPortSelect.value;
        if (port === "Diger") port = yeniPortDigerInput.value.trim();
        const yil = parseInt(yeniYilInput.value, 10);
        if (!kategori || !marka || !model || !port || !yil || isNaN(yil)) { alert("Lütfen tüm alanları doldurun."); return; }
        const tamAdYeni = `${marka} ${model}`;
        if (cihazVeritabani.find(c => c.tamAd.toLowerCase() === tamAdYeni.toLowerCase())) { alert(`"${tamAdYeni}" modeli zaten mevcut.`); return; }
        let kablo_stok_kodu = null; let stand_stok_kodu = null; let panel_stok_kodu = null;
        if (kategori === "Telefon" || kategori === "Tablet") {
            stand_stok_kodu = "8906991600"; if (kategori === "Tablet") panel_stok_kodu = "8906981600";
            if (port === "USB-C") kablo_stok_kodu = "8907011600";
            else if (port === "Lightning") kablo_stok_kodu = "8907031600";
            else if (port === "Micro USB") kablo_stok_kodu = "8907021600";
        } else if (kategori === "Bilgisayar") {
            stand_stok_kodu = null;
            if (marka.toLowerCase() === "apple") kablo_stok_kodu = "8907061600";
            else if (port === "USB-A" || port === "USB-C") kablo_stok_kodu = "8907051600";
        } // Akıllı saat için null kalır
        const yeniCihazNesnesi = { kategori, marka, model, port, yil, kablo_stok_kodu, stand_stok_kodu, panel_stok_kodu };
        const guncelCihazVeritabani = [...cihazVeritabani, yeniCihazNesnesi];
        try {
            const jsonData = JSON.stringify({ cihazlar: guncelCihazVeritabani, panel_kurallari: { tablet_panel: "8906981600" } }, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'cihazlar.json';
            a.textContent = 'Güncel cihazlar.json Dosyasını İndir';
            cihazEklemeSonucDiv.innerHTML = `"${tamAdYeni}" başarıyla listeye eklendi.<br>Değişikliğin kalıcı olması için lütfen aşağıdaki dosyayı indirin ve mevcut <code>cihazlar.json</code> dosyasının üzerine yazın.<br>`;
            cihazEklemeSonucDiv.appendChild(a); cihazEklemeSonucDiv.style.display = 'block'; cihazEklemeSonucDiv.style.color = 'green';
            yeniMarkaInput.value = ""; yeniModelInput.value = ""; yeniPortSelect.value = "USB-C";
            yeniPortDigerInput.style.display = "none"; yeniPortDigerInput.value = ""; yeniYilInput.value = "";
        } catch (err) {
            console.error("İndirme linki hatası:", err);
            cihazEklemeSonucDiv.textContent = 'HATA: İndirme linki oluşturulamadı.';
            cihazEklemeSonucDiv.style.display = 'block'; cihazEklemeSonucDiv.style.color = 'red';
        }
    });

    // --- 4. ANA HESAPLAMA FONKSİYONU ---
    function hesapla() {
        console.log("Hesaplama başlatıldı...");
        sonucTablosuBody.innerHTML = ""; genelMalzemeListesi.innerHTML = "";
        ozetBilgi.innerHTML = ""; ozetBilgi.style.color = '#333';

        const listeElemanlari = secilenUrunListesi.querySelectorAll("li");
        if (listeElemanlari.length === 0) { ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün ekleyin."; return; }

        const siparisListesi = {};
        let toplamCihazSayisi = 0; let bulunamayanModelSayisi = 0; let bulunamayanModeller = [];
        let akrilikStandKullananAdetHesapla = 0;
        let toplamStandKullanmayanAdet = 0; // Stand kullanmayan Tel+Tab adedi

        listeElemanlari.forEach(li => {
            const modelTamAdi = li.dataset.model;
            const adet = parseInt(li.dataset.adet, 10);
            const kitTuru = li.dataset.kit;
            const akrilikStandKullan = li.dataset.onstand === 'true';
            if (!modelTamAdi || isNaN(adet) || adet <= 0) return;
            toplamCihazSayisi += adet;
            const bulunanCihaz = cihazVeritabani.find(cihaz => cihaz.tamAd === modelTamAdi);
            if (!bulunanCihaz) { bulunamayanModelSayisi++; bulunamayanModeller.push(`"${modelTamAdi}"`); return; }

            if (bulunanCihaz.kategori === "Akıllı Saat") {
                if (kitTuru === "MGM") { stokKoduEkle("8909011600", adet); stokKoduEkle("8909021600", adet); }
                else if (kitTuru === "SALUS") {
                    const salusParcalari = malzemeVeritabani.filter(m => m.kategori === "Salus");
                    salusParcalari.forEach(parca => stokKoduEkle(parca.stok_kodu, adet));
                } else { console.warn(`Kit türü belirtilmemiş: ${modelTamAdi}`); }
            } else if (bulunanCihaz.kategori === "Bilgisayar") {
                 if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
            } else {
                if (akrilikStandKullan) {
                     akrilikStandKullananAdetHesapla += adet;
                     if (bulunanCihaz.stand_stok_kodu) stokKoduEkle(bulunanCihaz.stand_stok_kodu, adet);
                     if (bulunanCihaz.kablo_stok_kodu) stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
                     if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
                } else {
                    toplamStandKullanmayanAdet += adet; // Stand kullanmayan Tel+Tab sayacını artır
                    let nonStandCable = null;
                    if (bulunanCihaz.port === "Lightning") nonStandCable = "8907041600";
                    else if (bulunanCihaz.port === "USB-C") nonStandCable = "8907011600";
                    // *** DÜZELTME BAŞLANGICI ***
                    // HATA: Önceden burada '8907051600' (PC USB kablosu) yazıyordu.
                    // DOĞRUSU: Standart Micro USB kablosu ('8907021600') olmalı.
                    else if (bulunanCihaz.port === "Micro USB") nonStandCable = "8907021600";
                    // *** DÜZELTME SONU ***
                    if (nonStandCable) stokKoduEkle(nonStandCable, adet);
                    if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
                }
            }
        });

        // Genel Malzemeler
        if (toplamCihazSayisi > 0) stokKoduEkle("8907071600", 1);
        const telefonAdediStandli = akrilikStandKullananAdetHesapla - (siparisListesi["8906981600"] || 0);
        const pcAdediMac = siparisListesi["8907061600"] || 0;
        const pcAdediDiger = siparisListesi["8907051600"] || 0;
        const pcAdedi = pcAdediMac + pcAdediDiger;
        const panelGerekenCihazAdedi = telefonAdediStandli + pcAdedi;
        if (panelGerekenCihazAdedi > 0) {
            const gerekliPanelAdedi = Math.ceil(panelGerekenCihazAdedi / 5);
            stokKoduEkle("8906971600", gerekliPanelAdedi);
        }
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