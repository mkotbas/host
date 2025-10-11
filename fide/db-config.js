// --- Firebase Başlatma ---
// Bu dosya, tüm HTML sayfaları (index.html, soru-yoneticisi.html, bayi-yoneticisi.html)
// tarafından ortak olarak kullanılacak veritabanı bağlantı ayarlarını içerir.
const firebaseConfig = {
    apiKey: "AIzaSyCCz33ukxoNAwsZ-xC4bLUpbeNRB9J3P4U",
    authDomain: "fide-7cd6e.firebaseapp.com",
    databaseURL: "https://fide-7cd6e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fide-7cd6e",
    storageBucket: "fide-7cd6e.firebasestorage.app",
    messagingSenderId: "876303922675",
    appId: "1:876303922675:web:7d68f6f058dc2c1b540e86"
};

let database, auth;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
} catch (e) { console.error("Firebase başlatılamadı.", e); }