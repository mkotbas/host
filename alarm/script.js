// Bu kod, tüm sayfa yüklendiğinde çalışmaya başlar.
document.addEventListener("DOMContentLoaded", () => {

    // HTML'deki ana elemanları seçiyoruz
    const hesaplaButton = document.getElementById("hesaplaButton");
    const urunListesiInput = document.getElementById("urunListesiInput");
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

    // Veri tabanlarını (JSON) saklamak için değişkenler
    let cihazVeritabani = [];
    let malzemeVeritabani = [];

    // --- 1. VERİLERİ YÜKLEME ---
    async function verileriYukle() {
        try {
            const cihazResponse = await fetch('cihazlar.json');
            if (!cihazResponse.ok) {
                throw new Error(`'cihazlar.json' dosyası yüklenemedi (Hata Kodu: ${cihazResponse.status})`);
            }
            const cihazData = await cihazResponse.json();
            cihazVeritabani = cihazData.cihazlar;

            const malzemeResponse = await fetch('malzemeler.json');
            if (!malzemeResponse.ok) {
                throw new Error(`'malzemeler.json' dosyası yüklenemedi (Hata Kodu: ${malzemeResponse.status})`);
            }
            malzemeVeritabani = await malzemeResponse.json();

            console.log("Veri tabanları başarıyla yüklendi.");

        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            let hataMesaji = `HATA: ${error.message}.`;
            
            if (error.message.includes("Failed to fetch")) {
                hataMesaji += "<br><b>Muhtemel Neden:</b> Dosyalar bir web sunucusu (hosting) üzerinden çalıştırılmıyor. Güvenlik nedeniyle tarayıcılar yerel dosyaların okunmasına izin vermez.";
            } else {
                 hataMesaji += "<br>Lütfen JSON dosyalarının adının doğru yazıldığından ve 'index.html' ile aynı klasörde olduğundan emin olun.";
            }
            
            ozetBilgi.innerHTML = hataMesaji;
            ozetBilgi.style.color = 'red';
        }
    }

    // --- 2. HESAPLAMA FONKSİYONU ---
    function hesapla() {
        console.log("Hesaplama başlatıldı...");
        
        ozetBilgi.innerHTML = "";
        ozetBilgi.style.color = '#333';

        const inputText = urunListesiInput.value.trim();
        const satirlar = inputText.split('\n').filter(satir => satir.trim() !== "");

        const siparisListesi = {};
        let toplamCihazSayisi = 0;
        let bulunamayanModelSayisi = 0;
        let bulunamayanModeller = [];
        let akilliSaatSipaisiVar = false;
        let toplamAkilliSaatAdedi = 0;

        // --- 2a. GİRDİYİ AYRIŞTIRMA ve EŞLEŞTİRME ---
        for (const satir of satirlar) {
            const eslesme = satir.match(/^(.*?)(?:-|–|\s+)(\d+)$/);
            
            if (!eslesme) {
                console.warn(`Format anlaşılamadı: "${satir}"`);
                bulunamayanModelSayisi++;
                bulunamayanModeller.push(`"${satir}" (Format hatası)`);
                continue;
            }

            const modelAdi = eslesme[1].trim().toLowerCase();
            const adet = parseInt(eslesme[2].trim(), 10);

            if (isNaN(adet) || adet <= 0) continue;

            toplamCihazSayisi += adet;

            const bulunanCihaz = cihazVeritabani.find(cihaz => 
                modelAdi.includes(cihaz.model.toLowerCase()) || 
                cihaz.model.toLowerCase().includes(modelAdi)
            );

            if (!bulunanCihaz) {
                console.warn(`Model bulunamadı: "${modelAdi}"`);
                bulunamayanModelSayisi++;
                bulunamayanModeller.push(`"${modelAdi}" (Veri tabanında yok)`);
                continue;
            }

            // --- 2b. MALZEMELERİ SİPARİŞ LİSTESİNE EKLEME ---
            if (bulunanCihaz.kablo_stok_kodu && bulunanCihaz.kablo_stok_kodu !== "SALUS_SET") {
                stokKoduEkle(bulunanCihaz.kablo_stok_kodu, adet);
            }
            if (bulunanCihaz.stand_stok_kodu && bulunanCihaz.stand_stok_kodu !== "SALUS_SET") {
                stokKoduEkle(bulunanCihaz.stand_stok_kodu, adet);
            }
            if (bulunanCihaz.panel_stok_kodu) {
                stokKoduEkle(bulunanCihaz.panel_stok_kodu, adet);
            }
            if (bulunanCihaz.kategori === "Akıllı Saat") {
                akilliSaatSipaisiVar = true;
                toplamAkilliSaatAdedi += adet;
                const salusParcalari = malzemeVeritabani.filter(m => m.kategori === "Salus");
                salusParcalari.forEach(parca => {
                    stokKoduEkle(parca.stok_kodu, adet);
                });
            }
        }

        // --- 2c. GENEL MALZEMELERİ EKLEME ---
        if (toplamCihazSayisi > 0) {
            stokKoduEkle("8907071600", 1); // MGM KUMANDA
        }

        let telefonVePcAdedi = 0;
        let tabletAdedi = 0;

        for (const stokKodu in siparisListesi) {
            const malzeme = malzemeVeritabani.find(m => m.stok_kodu === stokKodu);
            if (!malzeme) continue;

            const toplamAdet = siparisListesi[stokKodu];

            if (malzeme.kategori === "Stand" && malzeme.stok_kodu === "8906991600") {
                if (siparisListesi["8906981600"]) {
                     const tabletStandAdedi = siparisListesi["8906981600"];
                     tabletAdedi = tabletStandAdedi;
                     telefonVePcAdedi += (toplamAdet - tabletStandAdedi);
                } else {
                    telefonVePcAdedi += toplamAdet;
                }
            }
            if (malzeme.stok_kodu === "8907061600") {
                telefonVePcAdedi += toplamAdet;
            }
        }
        
        if (telefonVePcAdedi > 0) {
            const gerekliPanelAdedi = Math.ceil(telefonVePcAdedi / 5);
            stokKoduEkle("8906971600", gerekliPanelAdedi);
        }
        
        const genelCihazAdedi = telefonVePcAdedi + tabletAdedi;
        if (genelCihazAdedi > 0) {
             stokKoduEkle("8907081600", genelCihazAdedi); // MGM KONNEKTÖR 10 LÜ
             stokKoduEkle("9220951600", genelCihazAdedi); // MGM AKRİLİK TBNT YPŞKAN
        }

        // --- 2d. YARDIMCI STOK KODU EKLEME FONKSİYONU ---
        function stokKoduEkle(stokKodu, adet) {
            if (!siparisListesi[stokKodu]) {
                siparisListesi[stokKodu] = 0;
            }
            siparisListesi[stokKodu] += adet;
        }

        // --- 3. SONUÇLARI TABLOYA YAZDIRMA ---
        sonucTablosuBody.innerHTML = "";
        genelMalzemeListesi.innerHTML = "";
        
        if (Object.keys(siparisListesi).length === 0 && bulunamayanModelSayisi === 0) {
            ozetBilgi.textContent = "Hesaplama yapmak için lütfen en az bir ürün girin.";
            return;
        }

        let toplamPaketSayisi = 0;
        let sabitMalzemelerHTML = "";

        for (const stokKodu in siparisListesi) {
            const toplamGerekliAdet = siparisListesi[stokKodu];
            const malzeme = malzemeVeritabani.find(m => m.stok_kodu === stokKodu);
            
            if (!malzeme) {
                console.error(`Stok Kodu "${stokKodu}" malzeme veritabanında bulunamadı!`);
                continue;
            }

            const paketIciAdet = malzeme.paket_ici_adet || 1;
            const gerekliPaketAdedi = Math.ceil(toplamGerekliAdet / paketIciAdet);
            toplamPaketSayisi += gerekliPaketAdedi;

            const satirHTML = `
                <tr>
                    <td>${stokKodu}</td>
                    <td>${malzeme.urun_adi}</td>
                    <td><b>${gerekliPaketAdedi} Paket</b></td>
                    <td>${toplamGerekliAdet} Adet</td>
                    <td>${malzeme.kullanim_amaci}</td>
                </tr>
            `;

            if (malzeme.kategori === "Genel" || malzeme.kategori === "Aksesuar") {
                 // --- DÜZELTME BURADA YAPILDI ---
                 // Ürün adı (malzeme.urun_adi) zaten stok kodunu içerdiği için
                 // sona ekstra '(${stokKodu})' eklemesi kaldırıldı.
                 sabitMalzemelerHTML += `<li><b>${gerekliPaketAdedi} Paket</b> - ${malzeme.urun_adi}</li>`;
            } else {
                sonucTablosuBody.innerHTML += satirHTML;
            }
        }
        
        genelMalzemeListesi.innerHTML = sabitMalzemelerHTML || "<li>(Genel malzeme eklenmedi)</li>";

        // --- 4. ÖZET BİLGİYİ YAZDIRMA ---
        let ozetMesaji = `<b>Hesaplama Tamamlandı.</b> Toplam ${toplamCihazSayisi} cihaz için ${toplamPaketSayisi} kalem paket malzeme gerekiyor.`;
        
        if (bulunamayanModelSayisi > 0) {
            ozetMesaji += `<br><b style="color: red;">UYARI:</b> ${bulunamayanModelSayisi} model/satır tanınamadı veya veri tabanında bulunamadı: ${bulunamayanModeller.join(', ')}`;
        }
        ozetBilgi.innerHTML = ozetMesaji;
    }

    // --- 5. OLAYLARI BAĞLAMA ---
    hesaplaButton.addEventListener("click", hesapla);
    verileriYukle();
});