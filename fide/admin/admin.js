// --- YÖNETİCİ MODÜLÜ (admin.js) ---
// Bu dosya, tüm admin panelinin orkestrasyonunu yapar.
// Departmanlardan (modüllerden) fonksiyonları "ithal" eder ve olaylara (event) bağlar.

// --- 1. Adım: Departmanlardan Uzmanları (Fonksiyonları) İthal Et ---

import { updateConnectionIndicator } from './admin-ui.module.js';

import { 
    backupAllReports, 
    handleRestoreUpload, 
    handleMergeUpload, 
    analyzeOrphanReports,
    checkDataConsistency,
    openFieldCleaner,
    analyzeCorruptReports
} from './veritabani-bakim.module.js';

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

// YENİ: Bayi Yönetimi Departmanından fonksiyonları ithal ediyoruz
import {
    loadBayiManagerData,
    renderBayiManager,
    addNewEmailUI,
    handleBulkEmailUpload,
    handleBayiManagerClick
} from './bayi-yoneticisi.module.js';


// --- 2. Adım: Global Değişkenler ve Uygulama Başlatma ---

let isFirebaseConnected = false;
let isQuestionManagerRendered = false;
let isBayiManagerRendered = false; // YENİ: Bayi yöneticisinin yüklenip yüklenmediğini kontrol eder

window.onload = initializeApp;

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

function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';
    
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
        if (!event.target.closest('#auth-controls')) {
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
    // ... (Soru Yöneticisi ile ilgili diğer tüm event listener'lar aynı kalacak) ...

    // YENİ: Bayi Yöneticisi Paneli Olayları
    document.getElementById('add-new-email-btn').addEventListener('click', addNewEmailUI);
    document.getElementById('bulk-upload-emails-btn').addEventListener('click', () => document.getElementById('email-bulk-upload-input').click());
    document.getElementById('email-bulk-upload-input').addEventListener('change', (e) => handleBulkEmailUpload(e, auth, database));
    document.getElementById('email-search-input').addEventListener('keyup', renderBayiManager);

    // Olay Delegasyonu: Bayi listesi içindeki tıklamaları yönet
    const emailManagerList = document.getElementById('email-manager-list');
    if(emailManagerList) {
        emailManagerList.addEventListener('click', (e) => handleBayiManagerClick(e, auth, database));
    }
}

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
    // YENİ: Bayi Yöneticisi paneline tıklandığında ilgili fonksiyonları çağır
    else if (targetId === 'bayi-yoneticisi' && !isBayiManagerRendered) {
        if (!auth.currentUser) return alert("Bayi Yöneticisi'ni kullanmak için giriş yapın.");

        document.getElementById('loading-overlay').style.display = 'flex';
        await loadBayiManagerData(auth, database);
        renderBayiManager();
        isBayiManagerRendered = true;
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
            document.querySelectorAll('#soru-yoneticisi-panel .manager-id-input').forEach(input => input.disabled = false);
            const unlockBtn = document.getElementById('unlock-ids-btn');
            unlockBtn.disabled = true;
            unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID\'ler Açık';
            alert('Soru ID alanları artık düzenlenebilir.');
        } else {
            alert('Hatalı şifre!');
        }
    }
}