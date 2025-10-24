// Bu kod, tüm sayfa yüklendiğinde çalışmaya başlar.
document.addEventListener("DOMContentLoaded", () => {

    // --- 1. HTML ELEMANLARINI SEÇME ---
    
    // Veri Yükleme
    let cihazVeritabani = [];
    let malzemeVeritabani = [];
    let secilenCihaz = null;

    // Arama ve Ekleme Formu
    const aramaCubugu = document.getElementById("aramaCubugu");
    const aramaSonuclari = document.getElementById("aramaSonuclari");
    const adetInput = document.getElementById("adetInput");
    const ekleButton = document.getElementById("ekleButton");
    const secilenUrunListesi = document.getElementById("secilenUrunListesi");
    const yuklemeDurumu = document.getElementById("yuklemeDurumu"); // Yükleme mesajı alanı

    // Hesaplama ve Sonuç Alanı
    const hesaplaButton = document.getElementById("hesaplaButton");
    const sonucTablosuBody = document.querySelector("#sonucTablosu tbody");
    const ozetBilgi = document.getElementById("ozetBilgi");
    const genelMalzemeListesi = document.getElementById("genelMalzemeListesi");

    // --- 2. VERİLERİ YÜKLEME (GÜNCELLENDİ) ---
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

            console.log("Veri tabanları başarıyla yüklendi.");
            
            // --- GÜNCELLEME BAŞLANGICI ---
            // Yükleme başarılıysa, arayüzü aktif et
            aktiveEtArayuzu();
            // --- GÜNCELLEME SONU ---

        } catch (error) {
            console.error("Veri yükleme hatası:", error);
            // Hata olursa, hata mesajını göster ve arayüzü kapalı tut
            yuklemeDurumu.textContent = `HATA: ${error.message}. Dosyalar yüklenemedi.`;
            yuklemeDurumu.style.color = "red";
            yuklemeDurumu.style.fontWeight = "bold";
        }
    }
    
    // --- YENİ FONKSİYON: Arayüzü Aktif Et ---
    function aktiveEtArayuzu() {
        // Devre dışı bırakılmış (disabled) tüm elemanları aktif et
        aramaCubugu.disabled = false;
        adetInput.disabled = false;
        ekleButton.disabled = false;
        hesaplaButton.disabled = false;
        
        // Yükleniyor mesajını gizle
        yuklemeDurumu.style.display = "none";
        
        // Arama çubuğu metnini güncelle
        aramaCubugu.placeholder = "Model ara (örn: iPhone 15, Galaxy S24...)";
    }

    // --- 3. ARAMA VE LİSTE YÖNETİMİ ---

    // Arama çubuğuna her harf girildiğinde...
    aramaCubugu.addEventListener("input", () => {
        const arananMetin = aramaCubugu.value.toLowerCase().trim();
        aramaSonuclari.innerHTML = "";
        
        if (arananMetin.length < 2) {
            aramaSonuclari.style.display = "none";
            secilenCihaz = null;
            return;
        }

        const sonuclar = cihazVeritabani.filter(cihaz => 
            cihaz.tamAd.toLowerCase().includes(arananMetin)
        );

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
    });

    aramaCubugu.addEventListener("blur", () => {
        setTimeout(() => {
            aramaSonuclari.style.display = "none";
        }, 200);
    });

    // "+" (Ekle) butonuna tıklandığında...
    ekleButton.addEventListener("click", () => {
        const adet = parseInt(adetInput.value, 10);

        if (!secilenCihaz || !aramaCubugu.value || adet <= 0) {
            alert("Lütfen listeden geçerli bir ürün seçin ve adet girin.");
            return;
        }
        
        if (aramaCubugu.value !== secilenCihaz.tamAd) {
             alert("Lütfen listeden bir ürün seçin (manuel girişi değiştirmeyin).");
             return;
        }

        const li = document.createElement("li");
        li.dataset.model = secilenCihaz.tamAd; 
        li.dataset.adet = adet;
        li.innerHTML = `
            <span><strong>${secilenCihaz.tamAd}</strong> - ${adet} Adet</span>
            <button class="silButton">Sil</button>
        `;
        
        li.querySelector(".silButton").addEventListener("click", () => {
            li.remove();
        });

        secilenUrunListesi.appendChild(li);

        aramaCubugu.value = "";
        adetInput.value = "1";
        secilenCihaz = null;
        aramaCubugu.focus();
    });


    // --- 4. ANA HESAPLAMA FONKSİYONU ---
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

        // --- 4a. GİRDİYİ AYRIŞTIRMA (LİSTEDEN) ---
        listeElemanlari.forEach(li => {
            const modelTamAdi = li.dataset.model; 
            const adet = parseInt(li.dataset.adet, 10);

            if (!modelTamAdi || isNaN(adet) || adet <= 0) return;

            toplamCihazSayisi += adet;

            const bulunanCihaz = cihazVeritabani.find(cihaz => cihaz.tamAd === modelTamAdi);

            if (!bulunanCihaz) {
                console.warn(`Model bulunamadı: "${modelTamAdi}"`);
                bulunamayanModelSayisi++;
                bulunamayanModeller.push(`"${modelTamAdi}" (Veri tabanında yok)`);
                return;
            }

            // --- 4b. MALZEMELERİ SİPARİŞ LİSTESİNE EKLEME ---
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
                const salusParcalari = malzemeVeritabani.filter(m => m.kategori === "Salus");
                salusParcalari.forEach(parca => {
                    stokKoduEkle(parca.stok_kodu, adet);
                });
            }
        });

        // --- 4c. GENEL MALZEMELERİ EKLEME ---
        if (toplamCihazSayisi > 0) {
            stokKoduEkle("8907071600", 1); // MGM KUMANDA
        }

        let telefonAdedi = 0;
        let tabletAdedi = 0;
        if (siparisListesi["8906991600"]) {
            const toplamStandAdedi = siparisListesi["8906991600"];
            const tabletPaneliAdedi = siparisListesi["8906981600"] || 0;
            tabletAdedi = tabletPaneliAdedi;
            telefonAdedi = toplamStandAdedi - tabletAdedi;
        }
        const pcAdedi = siparisListesi["8907061600"] || 0;
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
        
        if (pcAdedi > 0) {
            stokKoduEkle("8907091600", pcAdedi);
        }

        // --- 4d. YARDIMCI FONKSİYON ---
        function stokKoduEkle(stokKodu, adet) {
            if (!siparisListesi[stokKodu]) {
                siparisListesi[stokKodu] = 0;
            }
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
                    <td>${toplamGihazAdedi} Adet</td>
                    <td>${malzeme.kullanim_amaci}</td>
                </tr>
            `;

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
    
    // Sayfa açıldığında ilk olarak verileri yükle
    // (Arayüzü 'aktiveEtArayuzu' fonksiyonu ile o açacak)
    verileriYukle();
});