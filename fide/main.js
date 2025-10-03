// main.js dosyası güncelleniyor

// ... (Diğer tüm fonksiyonlar ve kodlar aynı kalacak) ...

function parseAndLoadFromEmail() {
    showFiDeForm(); 
    const emailText = document.getElementById('load-email-area').value.trim();
    if (!emailText) {
        alert("Lütfen e-posta içeriğini yapıştırın.");
        return;
    }

// ... (Bayi bulma kısmı aynı kalacak) ...

    if (!storeFoundAndSelected) {
        if(selectedStore) {
            resetForm();
            updateFormInteractivity(true);
        } else {
            alert("E-posta metninden bayi bulunamadı ve manuel olarak da bir bayi seçilmedi. Lütfen önce bir bayi seçin.");
            return;
        }
    }
    
    const questionHeaderRegex = /^[\s•o-]*FiDe\s+(\d+)\./i;
    const idsInEmail = new Set();
    let currentQuestionId = null;
    
    const ignorePhrases = [
        "sipariş verilmesi gerekenler",
        "pleksiyle sergilenmesi gerekenler",
        "yanlış pleksi malzeme ile kullanılanlar"
    ];

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const headerMatch = trimmedLine.match(questionHeaderRegex);

        if (headerMatch) {
            const originalId = headerMatch[1];
            const finalId = migrationMap[originalId] || originalId;
            currentQuestionId = finalId;
            idsInEmail.add(finalId);
        } else if (currentQuestionId && trimmedLine) {
            const cleanedLine = trimmedLine.replace(/^[\s•o-]+\s*/, '');
            if (!cleanedLine) return; 

            const question = fideQuestions.find(q => String(q.id) === currentQuestionId);
            if (!question || (question.answerType === 'fixed')) {
                return; 
            }

            if (question.type === 'product_list') {
                const productMatch = cleanedLine.match(/^(\d{8,})/); 
                if (productMatch) {
                    const productCode = productMatch[1];
                    let quantity = 1; 
                    const quantityMatch = cleanedLine.match(/:?\s*(\d+)\s*(paket|adet)/i);
                    if (quantityMatch && quantityMatch[1]) {
                        quantity = parseInt(quantityMatch[1], 10);
                    }
                    
                    const productExists = productList.some(p => p.code === productCode);
                    if (productExists) {
                        addProductToList(productCode, quantity);
                        return; 
                    }
                }
            }
            
            if (ignorePhrases.some(phrase => cleanedLine.toLowerCase().includes(phrase))) {
                return; 
            }
            
            const staticItems = question.staticItems || [];
            const isStatic = staticItems.some(staticItem => {
                const plainStaticItem = staticItem.replace(/<[^>]*>/g, '').trim();
                return plainStaticItem.includes(cleanedLine);
            });
            
            // BURASI GÜNCELLENDİ
            // Eğer statik bir madde değilse ve soru tipi 'standard' ise, dinamik girdi olarak eklenir.
            // product_list ve pop_system için sadece yukarıdaki özel eşleşmeleri dikkate alır.
            if (!isStatic && question.type === 'standard') {
                const containerId = `fide${currentQuestionId}`;
                addDynamicInput(containerId, cleanedLine, false);
            }
            // product_list için kalan satırları 'pleksi' dinamik girdisi olarak ekler.
            else if (!isStatic && question.type === 'product_list') {
                const containerId = `fide${currentQuestionId}_pleksi`;
                addDynamicInput(containerId, cleanedLine, false);
            }
        }
    });
    
// ... (Kalan kod aynı kalacak) ...
}