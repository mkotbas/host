// --- Firebase Başlatma ---
// Bu dosya, tüm HTML sayfaları (index.html, soru-yoneticisi.html, bayi-yoneticisi.html)
// tarafından ortak olarak kullanılacak veritabanı bağlantı ayarlarını içerir.
const firebaseConfig = {
    apiKey: "AIzaSyBzTb9cop8B4k8D8VGRBnojlxvIKoaGcbQ",
    authDomain: "fideraporuygulamasi.firebaseapp.com",
    databaseURL: "https://fideraporuygulamasi-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fideraporuygulamasi",
    storageBucket: "fideraporuygulamasi.appspot.com",
    messagingSenderId: "351112274026",
    appId: "1:351112274026:web:2e7433982f3b4bc747ea13"
};

let database, auth;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
} catch (e) { console.error("Firebase başlatılamadı.", e); }