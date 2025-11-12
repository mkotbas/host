// --- Uygulamanın Genel Durumunu (State) Tutan Değişkenler ---

// Dışarıdan yüklenen veriler
export let dideData = [];
export let fideData = [];
export let allStores = [];
export let fideQuestions = [];
export let productList = [];
// --- YENİ EKLEME ---
// FiDe 16 (Styling) için tüm hiyerarşik (HUBLAR, VİTRİNLER vb.) veriyi tutar.
export let stylingData = {}; 
// --- YENİ EKLEME BİTTİ ---
export let popCodes = [];
export let expiredCodes = [];
export let storeEmails = {};
export let auditedThisMonth = []; // Bu ay denetlenenlerin kodlarını tutar

// Kullanıcı etkileşimi ile değişen durumlar
export let selectedStore = null;
export let currentReportId = null; // Seçili bayinin mevcut raporunun ID'si

// Bağlantı durumu
export let isPocketBaseConnected = false;

// Sabitler
export const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
export const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];


// --- State Güncelleme Fonksiyonları ---
// Bu fonksiyonlar, modüllerin state'i güvenli bir şekilde değiştirmesini sağlar.

export function setDideData(data) { dideData = data; }
export function setFideData(data) { fideData = data; }
export function setAllStores(data) { allStores = data; }
export function setFideQuestions(data) { fideQuestions = data; }
export function setProductList(data) { productList = data; }
// --- YENİ EKLEME ---
// api.js'nin buluttan okuduğu styling verisini state'e (hafızaya) kaydeder.
export function setStylingData(data) { stylingData = data; }
// --- YENİ EKLEME BİTTİ ---
export function setPopCodes(data) { popCodes = data; }
export function setExpiredCodes(data) { expiredCodes = data; }
export function setStoreEmails(data) { storeEmails = data; }
export function setAuditedThisMonth(data) { auditedThisMonth = data; }
export function setSelectedStore(data) { selectedStore = data; }
export function setCurrentReportId(data) { currentReportId = data; }
export function setIsPocketBaseConnected(data) { isPocketBaseConnected = data; }