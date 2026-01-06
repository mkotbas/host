function buildRbacUIOnce() {
        if (rbacSectionEl) return;
        
        rbacSectionEl = document.createElement('div');
        rbacSectionEl.id = 'user-permissions-section';
        // 'form-section' sınıfını kaldırdık, CSS'de ID ile özelleştirdik
        
        rbacSectionEl.innerHTML = `
            <h4 class="section-divider"><span><i class="fas fa-key"></i> Modül & Yetkiler</span></h4>
            <p>
                Kullanıcının erişebileceği modülleri ve bu modüller içindeki kritik işlem yetkilerini (silme, dışa aktarma vb.) aşağıdan yönetebilirsiniz.
            </p>

            <div id="rbac-modules-box">
                <h5><i class="fas fa-cubes"></i> Modül Erişimi</h5>
                <div class="rbac-grid"></div>
            </div>

            <div id="rbac-features-box">
                <h5><i class="fas fa-tools"></i> Modül İçi Özellikler</h5>
                <div class="rbac-grid"></div>
            </div>
        `;

        if (formView) {
            // Form actions butonlarının hemen öncesine ekle
            const formActions = form.querySelector('.form-actions');
            if (formActions) {
                form.insertBefore(rbacSectionEl, formActions);
            } else {
                form.appendChild(rbacSectionEl);
            }
        }

        const modulesGrid = rbacSectionEl.querySelector('#rbac-modules-box .rbac-grid');
        const featuresGrid = rbacSectionEl.querySelector('#rbac-features-box .rbac-grid');

        RBAC_MODULE_DEFS.forEach(m => {
            const wrap = document.createElement('label');
            // Inline stilleri kaldırdık, her şey CSS'den gelecek
            wrap.innerHTML = `
                <input type="checkbox" class="rbac-module-checkbox" data-module-id="${m.id}">
                <span>${m.label}</span>
            `;
            modulesGrid.appendChild(wrap);
        });

        RBAC_FEATURE_DEFS.forEach(f => {
            const wrap = document.createElement('label');
            wrap.innerHTML = `
                <input type="checkbox" class="rbac-feature-checkbox" data-feature-key="${f.key}">
                <span>${f.label}</span>
            `;
            featuresGrid.appendChild(wrap);
        });

        // Event listener: Bayi yöneticisi kapalıysa alt özellikleri kapat
        rbacSectionEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;
            if (t.classList.contains('rbac-module-checkbox') && t.dataset.moduleId === 'bayi-yoneticisi') {
                const featureCbs = rbacSectionEl.querySelectorAll('.rbac-feature-checkbox');
                featureCbs.forEach(cb => {
                    cb.disabled = !t.checked;
                    if (!t.checked) cb.checked = false;
                });
            }
        });
    }