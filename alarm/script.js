document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    let cihazVeritabani = [];
    let malzemeVeritabani = [];
    let secilenCihaz = null;
    let seciliKategori = "Tümü"; // YENİ: Aktif kategori filtresi

    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu");
    const filtreButonlari = document.querySelectorAll(".filtre-buton"); // YENİ: Filtre butonları

    const hesaplaButton = document.getElementById("hesaplaButton");
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

    // --- 2. VERİLERİ YÜKLEME ---
    async function verileriYukle() {
        try {
            const cihazResponse = await fetch('cihazlar.json');
            if (!cihazResponse.ok) throw new Error(`'cihazlar.json' yüklenemedi`);
            const cihazData = await cihazResponse.json();
            cihazVeritabani = cihazData.cihazlar.map(cihaz => ({
                ...cihaz,
                tamAd: `${cihaz.marka} ${cihaz.model}`
            }));

            const malzemeResponse = await fetch('malzemeler.json');
            if (!malzemeResponse.ok) throw new Error(`'malzemeler.json' yüklenemedi`);
            malzemeVeritabani = await malzemeResponse.json();

            console.log("Veri tabanları yüklendi.");
            aktiveEtArayuzu();
        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            yuklemeDurumu.textContent = `HATA: ${error.message}. Dosyalar yüklenemedi.`;
            yuklemeDurumu.style.color = "red";
            yuklemeDurumu.style.fontWeight = "bold";
        }
    }
    
    function aktiveEtArayuzu() {
        aramaCubugu.disabled = false;
        adetInput.disabled = false;
        ekleButton.disabled = false;
        hesaplaButton.disabled = false;
        yuklemeDurumu.style.display = "none";
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---

    // Arama fonksiyonu (filtrelemeyi de içerir)
    function aramaYap() {
        const arananMetin = aramaCubugu.value.toLowerCase().trim();
        aramaSonuclari.innerHTML = "";
        
        if (arananMetin.length < 2) {
            aramaSonuclari.style.display = "none";
            secilenCihaz = null;
            return;
        }

        // Filtreleme: Önce kategoriye göre, sonra metne göre
        const sonuclar = cihazVeritabani.filter(cihaz => {
            const kategoriUygun = (seciliKategori === "Tümü" || cihaz.kategori === seciliKategori);
            const metinUygun = cihaz.tamAd.toLowerCase().includes(arananMetin);
            return kategoriUygun && metinUygun;
        });

        if (sonuclar.length > 0) {
            sonuclar.slice(0, 10).forEach(cihaz => {
                const div = document.createElement("div");
                const regex = new RegExp(`(${arananMetin})`, 'gi');
                div.innerHTML = cihaz.tamAd.replace(regex, '<strong>$1</strong>');
                div.dataset.tamAd = cihaz.tamAd;
                
                div.addEventListener("click", () => {
                    aramaCubugu.value = cihaz.tamAd;
                    secilenCihaz = cihaz;
                    aramaSonuclari.style.display = "none";
                    aramaSonuclari.innerHTML = "";
                    adetInput.focus();
                });
                aramaSonuclari.appendChild(div);
            });
            aramaSonuclari.style.display = "block";
        } else {
            aramaSonuclari.style.display = "none";
            secilenCihaz = null;
        }
    }

    // Arama çubuğuna her harf girildiğinde aramaYap fonksiyonunu çağır
    aramaCubugu.addEventListener("input", aramaYap);

    aramaCubugu.addEventListener("blur", () => {
        setTimeout(() => { aramaSonuclari.style.display = "none"; }, 200);
    });

    // YENİ: Kategori filtre butonlarına tıklama olayı
    filtreButonlari.forEach(buton => {
        buton.addEventListener("click", () => {
            // Önce tüm butonlardan 'active' class'ını kaldır
            filtreButonlari.forEach(b => b.classList.remove("active"));
            // Tıklanan butona 'active' class'ını ekle
            buton.classList.add("active");
            // Seçili kategoriyi güncelle
            seciliKategori = buton.dataset.kategori;
            // Arama çubuğu boş değilse, filtrelemeyi yeniden tetikle
            if (aramaCubugu.value.trim().length >= 2) {
                aramaYap();
            }
        });
    });

    // "+" (Ekle) butonu (değişiklik yok)
    ekleButton.addEventListener("click", () => {
        const adet = parseInt(adetInput.value, 10);
        if (!secilenCihaz || !aramaCubugu.value || adet <= 0 || aramaCubugu.value !== secilenCihaz.tamAd) {
            alert("Lütfen listeden geçerli bir ürün seçin ve adet girin.");
            return;
        }
        const li = document.createElement("li");
        li.dataset.model = secilenCihaz.tamAd; 
        li.dataset.adet = adet;
        li.innerHTML = `<span><strong>${secilenCihaz.tamAd}</strong> - ${adet} Adet</span><button class="silButton">Sil</button>`;
        li.querySelector(".silButton").addEventListener("click", () => li.remove());
        secilenUrunListesi.appendChild(li);
        aramaCubugu.value = "";
        adetInput.value = "1";
        secilenCihaz = null;
        aramaCubugu.focus();
    });

    // --- 4. ANA HESAPLAMA FONKSİYONU ---
    // (Bu fonksiyonda değişiklik yapmaya gerek yok, çünkü seçilen listeyi okuyor)
    function hesapla() {
        console.log("Hesaplama başlatıldı...");
        
        sonucTablosuBody.innerHTML = "";
        genelMalzemeListesi.innerHTML = "";
        ozetBilgi.innerHTML = "";
        ozetBilgi.style.color = '#333';

        const listeElemanlari = secilenUrunListesi.querySelectorAll("li");
        if (listeElemanlari.length === 0) {
            ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün ekleyin.";
            return;
        }

        const siparisListesi = {};
        let toplamCihazSayisi = 0;
        let bulunamayanModelSayisi = 0;
        let bulunamayanModeller = [];
        let akilliSaatSipaisiVar = false;

        listeElemanlari.forEach(li => {
            const modelTamAdi = li.dataset.model; 
            const adet = parseInt(li.dataset.adet, 10);
            if (!modelTamAdi || isNaN(adet) || adet <= 0) return;
            toplamCihazSayisi += adet;
            const bulunanCihaz = cihazVeritabani.find(cihaz => cihaz.tamAd === modelTamAdi);
            if (!bulunanCihaz) {
                bulunamayanModelSayisi++;
                bulunamayanModeller.push(`"${modelTamAdi}"`);
                return;
            }
            if (bulunanCihaz.kablo_stok_kodu && bulunanCihaz.kablo_stok_kodu !== "SALUS_SET") stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
            if (bulunanCihaz.stand_stok_kodu && bulunanCihaz.stand_stok_kodu !== "SALUS_SET") stokKoduEkle(bulunanCihaz.stand_stok_kodu, adet);
            if (bulunanCihaz.panel_stok_kodu) stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
            if (bulunanCihaz.kategori === "Akıllı Saat") {
                akilliSaatSipaisiVar = true;
                const salusParcalari = malzemeVeritabani.filter(m => m.kategori === "Salus");
                salusParcalari.forEach(parca => stokKoduEkle(parca.stok_kodu, adet));
            }
        });

        if (toplamCihazSayisi > 0) stokKoduEkle("8907071600", 1); 
        let telefonAdedi = 0;
        let tabletAdedi = 0;
        if (siparisListesi["8906991600"]) {
            const toplamStandAdedi = siparisListesi["8906991600"];
            const tabletPaneliAdedi = siparisListesi["8906981600"] || 0;
            tabletAdedi = tabletPaneliAdedi;
            telefonAdedi = toplamStandAdedi - tabletAdedi;
        }
        // PC adedi hesaplaması: Hem Macbook (8907061600) hem diğer PC (8907051600) kablolarını say
        const pcAdediMac = siparisListesi["8907061600"] || 0; 
        const pcAdediDiger = siparisListesi["8907051600"] || 0;
        const pcAdedi = pcAdediMac + pcAdediDiger; 
        
        const panelGerekenCihazAdedi = telefonAdedi + pcAdedi;
        if (panelGerekenCihazAdedi > 0) {
            const gerekliPanelAdedi = Math.ceil(panelGerekenCihazAdedi / 5);
            stokKoduEkle("8906971600", gerekliPanelAdedi);
        }
        const genelCihazAdedi = telefonAdedi + tabletAdedi;
        if (genelCihazAdedi > 0) {
             stokKoduEkle("8907081600", genelCihazAdedi);
             stokKoduEkle("9220951600", genelCihazAdedi);
             stokKoduEkle("9224911600", genelCihazAdedi);
        }
        if (pcAdediMac > 0) stokKoduEkle("8907091600", pcAdediMac); // Damla yapışkan sadece Macbook için

        function stokKoduEkle(stokKodu, adet) {
            if (!siparisListesi[stokKodu]) siparisListesi[stokKodu] = 0;
            siparisListesi[stokKodu] += adet;
        }

        // --- 5. SONUÇLARI TABLOYA YAZDIRMA ---
        sonucTablosuBody.innerHTML = "";
        genelMalzemeListesi.innerHTML = "";
        if (Object.keys(siparisListesi).length === 0 && bulunamayanModelSayisi === 0) {
            ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün ekleyin.";
            return;
        }
        let toplamPaketSayisi = 0;
        let sabitMalzemelerHTML = "";
        for (const stokKodu in siparisListesi) {
            const toplamGerekliAdet = siparisListesi[stokKodu];
            const malzeme = malzemeVeritabani.find(m => m.stok_kodu === stokKodu);
            if (!malzeme) { console.error(`Stok Kodu "${stokKodu}" bulunamadı!`); continue; }
            const paketIciAdet = malzeme.paket_ici_adet || 1;
            const gerekliPaketAdedi = Math.ceil(toplamGerekliAdet / paketIciAdet);
            toplamPaketSayisi += gerekliPaketAdedi;
            const satirHTML = `<tr><td>${stokKodu}</td><td>${malzeme.urun_adi}</td><td><b>${gerekliPaketAdedi} Paket</b></td><td>${toplamGerekliAdet} Adet</td><td>${malzeme.kullanim_amaci}</td></tr>`;
            if (malzeme.kategori === "Genel" || malzeme.kategori === "Aksesuar") {
                 sabitMalzemelerHTML += `<li><b>${gerekliPaketAdedi} Paket</b> - ${malzeme.urun_adi}</li>`;
            } else {
                sonucTablosuBody.innerHTML += satirHTML;
            }
        }
        genelMalzemeListesi.innerHTML = sabitMalzemelerHTML || "<li>(Genel malzeme eklenmedi)</li>";

        // --- 6. ÖZET BİLGİ ---
        let ozetMesaji = `<b>Hesaplama Tamamlandı.</b> Toplam ${toplamCihazSayisi} cihaz için ${toplamPaketSayisi} kalem paket malzeme gerekiyor.`;
        if (bulunamayanModelSayisi > 0) {
            ozetMesaji += `<br><b style="color: red;">UYARI:</b> ${bulunamayanModelSayisi} model/satır tanınamadı: ${bulunamayanModeller.join(', ')}`;
        }
        ozetBilgi.innerHTML = ozetMesaji;
    }

    // --- 7. OLAYLARI BAĞLAMA ---
    hesaplaButton.addEventListener("click", hesapla);
    verileriYukle();
});