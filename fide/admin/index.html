// --- YÖNETİCİ MODÜLÜ (admin.js) ---
// Bu dosya, tüm admin panelinin orkestrasyonunu yapar.
// Departmanlardan (modüllerden) fonksiyonları "ithal" eder ve olaylara (event) bağlar.

// --- 1. Adım: Departmanlardan Uzmanları (Fonksiyonları) İthal Et ---

// Arayüz Departmanından:
import { updateConnectionIndicator } from './admin-ui.module.js';

// Veritabanı Bakım Departmanından:
import { 
    backupAllReports, 
    handleRestoreUpload, 
    handleMergeUpload, 
    analyzeOrphanReports,
    checkDataConsistency,
    openFieldCleaner,
    analyzeCorruptReports
} from './veritabani-bakim.module.js';

// Soru Yönetimi Departmanından:
import {
    loadQuestionManagerData,
    renderQuestionManager,
    saveQuestions,
    addNewQuestionUI,
    deleteAllArchivedQuestions,
    restoreAllArchivedQuestions,
    openScenarioSystem,
    closeScenarioSystem,
    selectScenario,
    applyIdChangeScenario,
    previewQuestionForDelete,
    applyDeleteQuestionScenario,
    renderMigrationManagerUI,
    handleManagerListClick,
    handleEditorToolbarClick,
    handleProductManagerClick,
    filterManagerView
} from './soru-yoneticisi.module.js';


// --- 2. Adım: Global Değişkenler ve Uygulama Başlatma ---

let isFirebaseConnected = false;
let isQuestionManagerRendered = false; // Soru yöneticisinin daha önce yüklenip yüklenmediğini kontrol eder

// Sayfa yüklendiğinde uygulamayı başlat
window.onload = initializeApp;

/**
 * Uygulamayı başlatan ana fonksiyon.
 */
async function initializeApp() {
    if (typeof auth === 'undefined' || typeof database === 'undefined') {
        console.error("Firebase başlatılamadı. db-config.js yüklendiğinden emin olun.");
        return;
    }

    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

    auth.onAuthStateChanged(user => { 
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        
        if (user) {
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
            switchPanel('veritabani-ayarlari'); 
        } else {
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
        }
        updateConnectionIndicator(isFirebaseConnected, user);
    });

    const connectionRef = database.ref('.info/connected');
    connectionRef.on('value', (snapshot) => {
        isFirebaseConnected = snapshot.val();
        updateConnectionIndicator(isFirebaseConnected, auth.currentUser);
    });
    
    setupEventListeners();
}

/**
 * Tüm olay dinleyicilerini (event listeners) ayarlayan fonksiyon.
 */
function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';
    
    // Sol Menü Navigasyon
    document.querySelectorAll('.sidebar-nav .nav-link:not(.nav-link-back)').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchPanel(e.currentTarget.dataset.target);
        });
    });

    // Giriş/Çıkış
    document.getElementById('login-toggle-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        document.getElementById('login-popup').style.display = 'block';
    });
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().then(() => window.location.reload()));
    document.getElementById('login-submit-btn').addEventListener('click', handleLogin);
    window.addEventListener('click', (event) => {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            document.getElementById('login-popup').style.display = 'none';
        }
    });

    // Veritabanı Paneli
    document.getElementById('backup-btn').addEventListener('click', () => backupAllReports(auth, database));
    document.getElementById('restore-file-input').addEventListener('change', (event) => handleRestoreUpload(event, auth, database));
    document.getElementById('merge-file-input').addEventListener('change', handleMergeUpload);
    document.getElementById('restore-from-backup-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('merge-backups-btn').addEventListener('click', () => document.getElementById('merge-file-input').click());
    document.getElementById('analyze-orphan-reports-btn').addEventListener('click', () => analyzeOrphanReports(database));
    document.getElementById('check-consistency-btn').addEventListener('click', () => checkDataConsistency(database));
    document.getElementById('clean-field-btn').addEventListener('click', () => openFieldCleaner(database));
    document.getElementById('analyze-corrupt-reports-btn').addEventListener('click', () => analyzeCorruptReports(database));

    // Soru Yöneticisi Paneli
    document.getElementById('save-questions-btn').addEventListener('click', () => saveQuestions(auth, database));
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestionUI);
    document.getElementById('delete-all-archived-btn').addEventListener('click', deleteAllArchivedQuestions);
    document.getElementById('restore-all-archived-btn').addEventListener('click', restoreAllArchivedQuestions);
    document.getElementById('view-active-btn').addEventListener('click', (e) => {
        e.currentTarget.classList.add('active');
        document.getElementById('view-archived-btn').classList.remove('active');
        filterManagerView();
    });
    document.getElementById('view-archived-btn').addEventListener('click', (e) => {
        e.currentTarget.classList.add('active');
        document.getElementById('view-active-btn').classList.remove('active');
        filterManagerView();
    });
    document.getElementById('unlock-ids-btn').addEventListener('click', handleUnlockIds);
    
    // Senaryo Sistemi
    document.getElementById('open-scenario-system-btn').addEventListener('click', openScenarioSystem);
    document.getElementById('close-scenario-system-btn').addEventListener('click', closeScenarioSystem);
    document.querySelectorAll('.scenario-btn').forEach(btn => btn.addEventListener('click', (e) => selectScenario(e.currentTarget.dataset.scenario)));
    document.getElementById('apply-id-change-btn').addEventListener('click', () => applyIdChangeScenario(auth, database));
    document.getElementById('scenario-delete-id').addEventListener('input', previewQuestionForDelete);
    document.getElementById('apply-delete-question-btn').addEventListener('click', () => applyDeleteQuestionScenario(auth, database));

    // Yönlendirme Yöneticisi
    document.getElementById('open-migration-manager-from-scenario-btn').addEventListener('click', () => {
        closeScenarioSystem();
        renderMigrationManagerUI(auth, database);
        document.getElementById('migration-manager-overlay').style.display = 'flex';
    });
    document.getElementById('close-migration-manager-btn').addEventListener('click', () => document.getElementById('migration-manager-overlay').style.display = 'none');
    
    // Olay Delegasyonu: Soru listesi içindeki tıklamaları yönet
    const managerList = document.getElementById('manager-list');
    if(managerList) {
        managerList.addEventListener('click', (e) => {
            handleManagerListClick(e, auth, database);
            handleEditorToolbarClick(e);
            handleProductManagerClick(e);
        });
    }
}

// --- 3. Adım: Yönetici'nin Yardımcı Fonksiyonları ---

async function switchPanel(targetId) {
    document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(l => l.classList.remove('active'));

    document.getElementById(`${targetId}-panel`).classList.add('active');
    document.querySelector(`.nav-link[data-target="${targetId}"]`).classList.add('active');

    if (targetId === 'soru-yoneticisi' && !isQuestionManagerRendered) {
        if (!auth.currentUser) return alert("Soru Yöneticisi'ni kullanmak için giriş yapın.");
        
        document.getElementById('loading-overlay').style.display = 'flex';
        await loadQuestionManagerData(auth, database);
        renderQuestionManager();
        isQuestionManagerRendered = true;
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

function handleLogin() {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = '';
    if (!email || !password) return errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
    
    auth.signInWithEmailAndPassword(email, password)
        .catch(() => errorDiv.textContent = 'E-posta veya şifre hatalı.');
}

function handleUnlockIds() {
    const dogruSifreHash = 'ZmRlMDAx'; // "fde001" in base64
    const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için yönetici şifresini girin:");
    if (girilenSifre) {
        if (btoa(girilenSifre) === dogruSifreHash) {
            document.querySelectorAll('.manager-id-input').forEach(input => input.disabled = false);
            const unlockBtn = document.getElementById('unlock-ids-btn');
            unlockBtn.disabled = true;
            unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID\'ler Açık';
            alert('Soru ID alanları artık düzenlenebilir.');
        } else {
            alert('Hatalı şifre!');
        }
    }
}