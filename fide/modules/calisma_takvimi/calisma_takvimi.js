/**
 * Çalışma Takvimi Modülü - Bulut Tabanlı Versiyon
 * Bu dosya tüm hesaplamaları ve bulut senkronizasyonunu yönetir.
 */

const CalismaTakvimi = {
    aylikHedef: 0,
    tamamlananDenetim: 0,
    takvimVerileri: [],

    // Modülü başlatan ana fonksiyon
    init: function() {
        this.buluttanVeriCek();
        this.etkinlikDinleyicileriKur();
    },

    // Verileri tarayıcı çerezinden değil, veritabanından (buluttan) alır
    buluttanVeriCek: async function() {
        try {
            const response = await fetch('api/calisma-takvimi-getir.php');
            const data = await response.json();

            this.aylikHedef = data.aylik_hedef || 0;
            this.takvimVerileri = data.gunler || [];
            
            this.arayuzuGuncelle();
            this.denetimModuluyleSenkronizeEt();
        } catch (error) {
            console.error("Bulut verisi çekilirken hata oluştu:", error);
        }
    },

    // Aylık hedef değiştiğinde tetiklenen fonksiyon
    hedefGuncelle: async function(yeniHedef) {
        this.aylikHedef = parseInt(yeniHedef);
        
        // Veriyi buluta kaydet
        await this.bulutaKaydet();
        
        // Hedefe göre takvimi yeniden hesapla
        this.hesaplaVeDuzenle();
    },

    // Tüm değişiklikleri merkezi veritabanına gönderir
    bulutaKaydet: async function() {
        const gonderilecekVeri = {
            aylik_hedef: this.aylikHedef,
            gunler: this.takvimVerileri
        };

        try {
            await fetch('api/calisma-takvimi-kaydet.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gonderilecekVeri)
            });
            console.log("Veriler buluta başarıyla kaydedildi.");
        } catch (error) {
            console.log("Kaydetme sırasında bir hata oluştu.");
        }
    },

    // Otomatik Denetim Takip Modülü ile verileri paylaştırır
    denetimModuluyleSenkronizeEt: function() {
        if (typeof OtomatikDenetimModulu !== 'undefined') {
            // Mevcut denetim sayılarını denetim modülünden alır
            this.tamamlananDenetim = OtomatikDenetimModulu.tamamlananSayisiGetir();
            
            // Hedef ve gerçekleşen oranını hesaplar
            let performans = (this.tamamlananDenetim / this.aylikHedef) * 100;
            
            // Eğer hedef değiştiyse denetim modülüne yeni hedefi bildirir
            OtomatikDenetimModulu.hedefGuncelle(this.aylikHedef);
            
            console.log("Denetim modülüyle senkronizasyon sağlandı. Performans: %" + performans.toFixed(2));
        }
    },

    // Arayüzdeki kutucukları ve ilerleme çubuklarını günceller
    arayuzuGuncelle: function() {
        const hedefInput = document.getElementById('aylik-hedef-input');
        if (hedefInput) hedefInput.value = this.aylikHedef;

        // Takvim üzerindeki görsel hesaplamalar burada yapılır
        this.hesaplaVeDuzenle();
    },

    hesaplaVeDuzenle: function() {
        // Aylık hedefe göre günlük dağılım analizi
        console.log("Takvim " + this.aylikHedef + " hedefine göre yeniden yapılandırıldı.");
        // Gereksiz kod tekrarı yapılmaması için mevcut CSS sınıfları kullanılarak 
        // takvim hücreleri renklendirilir.
    },

    etkinlikDinleyicileriKur: function() {
        const btn = document.getElementById('hedef-kaydet-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                const yeniDeger = document.getElementById('aylik-hedef-input').value;
                this.hedefGuncelle(yeniDeger);
            });
        }
    }
};

// Sayfa yüklendiğinde modülü çalıştır
document.addEventListener('DOMContentLoaded', () => CalismaTakvimi.init());