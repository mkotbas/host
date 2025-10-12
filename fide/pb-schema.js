// PocketBase Veritabanı Şeması Kurulum Dosyası
// Bu dosya, uygulama ilk çalıştığında gerekli olan veritabanı tablolarının (Collection)
// otomatik olarak oluşturulmasını sağlar.

async function ensureSchemaExists(pb, adminEmail, adminPassword) {
    console.log("Veritabanı şeması kontrol ediliyor...");

    try {
        // Otomatik kurulumu yapabilmek için yönetici olarak giriş yapmamız gerekiyor.
        await pb.admins.authWithPassword(adminEmail, adminPassword);
        console.log("Yönetici olarak başarıyla giriş yapıldı.");

        const existingCollections = await pb.collections.getFullList();
        const existingCollectionNames = existingCollections.map(c => c.name);
        console.log("Mevcut Collection'lar:", existingCollectionNames.join(', ') || 'Hiç yok');

        const collectionsToCreate = [
            {
                name: "bayi_epostalari",
                type: "base",
                schema: [
                    { name: "bayi_kodu", type: "text", required: true, unique: true },
                    { name: "eposta", type: "email", required: true }
                ]
            },
            {
                name: "denetim_raporlari",
                type: "base",
                schema: [
                    { name: "bayi_kodu", type: "text", required: true },
                    { name: "rapor_verisi", type: "json", required: true },
                    // PocketBase her kayda otomatik olarak "created" ve "updated" alanı ekler,
                    // bu yüzden "son_guncelleme" alanına manuel olarak ihtiyacımız yok.
                ]
            },
            {
                name: "ayarlar",
                type: "base",
                schema: [
                    { name: "anahtar", type: "text", required: true, unique: true },
                    { name: "deger", type: "json", required: true }
                ]
            },
            {
                name: "excel_verileri",
                type: "base",
                schema: [
                    { name: "tip", type: "select", options: { values: ["dide", "fide"] }, required: true },
                    { name: "dosya_adi", type: "text" },
                    { name: "veri", type: "json", required: true },
                     // PocketBase her kayda otomatik olarak "created" ve "updated" alanı ekler,
                    // bu yüzden "yuklenme_tarihi" alanına manuel olarak ihtiyacımız yok.
                ]
            },
            {
                name: "geri_alinan_denetimler",
                type: "base",
                schema: [
                    { name: "yil_ay", type: "text", required: true },
                    { name: "bayi_kodu", type: "text", required: true }
                ]
            }
        ];

        for (const collection of collectionsToCreate) {
            if (!existingCollectionNames.includes(collection.name)) {
                console.log(`'${collection.name}' Collection'ı oluşturuluyor...`);
                await pb.collections.create({
                    name: collection.name,
                    type: collection.type,
                    schema: collection.schema,
                    // Herkesin (giriş yapmış kullanıcıların) veri okuyup yazabilmesi için kuralları belirliyoruz.
                    // PocketBase'de güvenlik kurallarını daha sonra detaylı ayarlayabilirsiniz.
                    // Şimdilik, giriş yapan kullanıcılar her şeyi yapabilir.
                    listRule: "@request.auth.id != ''",
                    viewRule: "@request.auth.id != ''",
                    createRule: "@request.auth.id != ''",
                    updateRule: "@request.auth.id != ''",
                    deleteRule: "@request.auth.id != ''",
                });
                console.log(`'${collection.name}' Collection'ı başarıyla oluşturuldu.`);
            } else {
                console.log(`'${collection.name}' Collection'ı zaten mevcut, oluşturma adımı atlandı.`);
            }
        }
        
        console.log("Veritabanı şema kontrolü tamamlandı.");
        
        // Güvenlik için kurulum sonrası admin oturumunu kapatıyoruz.
        pb.authStore.clear();

    } catch (error) {
        console.error("Otomatik şema kurulumu sırasında bir hata oluştu:", error);
        alert("Veritabanı şeması oluşturulamadı! Lütfen 'db-config.js' dosyasındaki yönetici bilgilerini ve PocketBase'in çalıştığından emin olun.");
        // Hata durumunda da admin oturumunu temizle
        pb.authStore.clear();
    }
}