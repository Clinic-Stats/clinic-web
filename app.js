import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc, setDoc, deleteDoc, enableIndexedDbPersistence, orderBy } 
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBY15gxSoGhtx1LTRzfC_P9Jz_a2avUaLg",
  authDomain: "clinic-stats.firebaseapp.com",
  projectId: "clinic-stats",
  storageBucket: "clinic-stats.firebasestorage.app",
  messagingSenderId: "122761541077",
  appId: "1:122761541077:web:967c2618895fe57d51b95c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(err => {
  console.log("Offline error:", err.code);
});

let currentUser = null;
let chartInstance = null;
let monthlyChartInstance = null;
let isCurrentUserAdmin = false;
let selectedWeekNumber = getWeekNumber(new Date());
let currentYear = new Date().getFullYear();
let todayAlreadySaved = false;
let currentTheme = localStorage.getItem('theme') || 'light';
let allStaffList = [];

// ============================================
// THEME MANAGEMENT
// ============================================
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('themeToggle').innerHTML = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    document.getElementById('themeToggle').innerHTML = '🌙';
  }
  localStorage.setItem('theme', theme);
  currentTheme = theme;
}

window.toggleTheme = function() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
};

// ============================================
// LOADING SPINNER
// ============================================
function showLoading() {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.style.display = 'flex';
}

function hideLoading() {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.style.display = 'none';
}

// ============================================
// AUTH STATE
// ============================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    
    let userEmail = user.email.toLowerCase();
    let displayName = userEmail.split('@')[0];
    document.getElementById("currentUserName").textContent = "👤 " + displayName;

    isCurrentUserAdmin = false;
    try {
      const userDoc = await getDoc(doc(db, "users", userEmail));
      if (userDoc.exists() && userDoc.data().role === "admin") {
        isCurrentUserAdmin = true;
      }
    } catch (e) {
      console.log("Error getting role:", e);
    }

    if (isCurrentUserAdmin) {
      document.getElementById("adminSection").style.display = "block";
      document.getElementById("searchSection").style.display = "block";
      document.getElementById("backupSection").style.display = "block";
      await loadStaffList();
    } else {
      document.getElementById("adminSection").style.display = "none";
      document.getElementById("searchSection").style.display = "none";
      document.getElementById("backupSection").style.display = "none";
    }

    setTodayDate();
    populateWeekDropdown();
    populateMonthDropdown();
    checkTodaySaved();
    applyTheme(currentTheme);
  } else {
    currentUser = null;
    isCurrentUserAdmin = false;
    todayAlreadySaved = false;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
  }
});

// ============================================
// LOAD STAFF LIST FOR ADMIN SEARCH (FIXED)
// ============================================
async function loadStaffList() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    allStaffList = [];
    usersSnap.forEach(doc => {
      const userData = doc.data();
      if (userData.role === "staff") {
        const staffName = doc.id.split('@')[0];
        allStaffList.push(staffName);
      }
    });
    
    const select = document.getElementById("staffSearchSelect");
    if (select) {
      select.innerHTML = '<option value="">-- هەموو کارمەندەکان --</option>';
      allStaffList.forEach(staff => {
        const option = document.createElement("option");
        option.value = staff;
        option.textContent = staff;
        select.appendChild(option);
      });
    }
    console.log("Staff list loaded:", allStaffList);
  } catch (e) {
    console.error("Error loading staff list:", e);
  }
}

// ============================================
// SEARCH BY STAFF (FIXED)
// ============================================
window.searchByStaff = async function() {
  const selectedStaff = document.getElementById("staffSearchSelect").value;
  const searchOutput = document.getElementById("searchOutput");
  
  if (!selectedStaff) {
    searchOutput.innerHTML = "<p style='text-align:center; color:#888;'>تکایە کارمەندێک هەڵبژێرە</p>";
    return;
  }

  showLoading();
  searchOutput.innerHTML = "<p style='text-align:center;'>⏳ چاوەڕێ بکە... داتا دەهێنرێت</p>";
  
  try {
    console.log("Searching for staff:", selectedStaff);
    
    // Create query for entries of selected staff
    const entriesQuery = query(
      collection(db, "entries"), 
      where("staff", "==", selectedStaff),
      orderBy("date", "desc")
    );
    
    const snap = await getDocs(entriesQuery);
    console.log("Found entries:", snap.size);
    
    if (snap.empty) {
      searchOutput.innerHTML = `<p style='text-align:center;'>📭 هیچ تۆمارێک نییە بۆ کارمەند "${selectedStaff}"</p>`;
      hideLoading();
      return;
    }
    
    let html = `<h3 style="margin-bottom: 15px;">📋 تۆمارەکانی ${selectedStaff}</h3>`;
    html += `<div style="overflow-x: auto;">`;
    html += `<table style="width:100%; border-collapse: collapse;">`;
    html += `<thead><tr style="background: #3498db; color: white;">
      <th style="padding: 10px;">#</th>
      <th style="padding: 10px;">🧑 گەورە</th>
      <th style="padding: 10px;">🧒 منال</th>
      <th style="padding: 10px;">کۆی گشتی</th>
      <th style="padding: 10px;">📅 ڕێکەوت</th>
     </tr></thead><tbody>`;
    
    let totalAdult = 0, totalChild = 0;
    let index = 1;
    
    snap.forEach(doc => {
      const data = doc.data();
      const adult = data.countAdult ?? data.count ?? 0;
      const child = data.countChild ?? 0;
      const total = adult + child;
      
      totalAdult += adult;
      totalChild += child;
      
      html += `<tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; text-align: center;">${index++}</td>
        <td style="padding: 8px; text-align: center;">${adult}</td>
        <td style="padding: 8px; text-align: center;">${child}</td>
        <td style="padding: 8px; text-align: center;"><strong>${total}</strong></td>
        <td style="padding: 8px; text-align: center; direction: ltr;">${data.date.toDate().toLocaleDateString("en-GB")}</td>
       </tr>`;
    });
    
    html += `<tr style="background: #eaf4fb; font-weight: bold;">
      <td style="padding: 8px;"><strong>کۆی گشتی</strong></td>
      <td style="padding: 8px; text-align: center;"><strong>${totalAdult}</strong></td>
      <td style="padding: 8px; text-align: center;"><strong>${totalChild}</strong></td>
      <td style="padding: 8px; text-align: center;"><strong>${totalAdult + totalChild}</strong></td>
      <td style="padding: 8px; text-align: center;">-</td>
     </tr>`;
    
    html += `</tbody></table></div>`;
    searchOutput.innerHTML = html;
    
  } catch (e) {
    console.error("Search error details:", e);
    searchOutput.innerHTML = `<p style='color:red; text-align:center;'>❌ هەڵە لە گەڕاندا: ${e.message}</p>`;
  } finally {
    hideLoading();
  }
};

// ============================================
// GET LOCAL ISO DATE
// ============================================
function getLocalISODate(dateObj) {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return (new Date(dateObj.getTime() - offset)).toISOString().split('T')[0];
}

function setTodayDate() {
  const todayStr = getLocalISODate(new Date());
  document.getElementById("entryDate").value = todayStr;
  document.getElementById("dailyFilterDate").value = todayStr;
}

// ============================================
// LOGIN FUNCTIONS
// ============================================
window.login = async function () {
  let email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const passInput = document.getElementById("loginPassword");
  const pass = passInput.value;
  const errorMsg = document.getElementById("loginError");
  
  if (email && !email.includes('@')) {
    email = email + "@clinic.com";
  }

  showLoading();
  try {
    errorMsg.textContent = "⏳ چاوەڕێ بکە...";
    errorMsg.style.color = "orange";
    await signInWithEmailAndPassword(auth, email, pass);
    errorMsg.textContent = "";
  } catch {
    errorMsg.textContent = "❌ پاسوۆرد یان ناو هەڵەیە!";
    errorMsg.style.color = "red";
    passInput.value = "";
    passInput.focus();
  } finally {
    hideLoading();
  }
};

document.getElementById("loginEmail").addEventListener("blur", function() {
  if(this.value.trim() !== "") {
    document.getElementById("loginPassword").focus();
  }
});

window.logout = async function () {
  showLoading();
  await signOut(auth);
  hideLoading();
};

// ============================================
// ADMIN FUNCTIONS
// ============================================
window.toggleAdminForm = function() {
  const wrapper = document.getElementById("adminFormWrapper");
  const btn = document.getElementById("toggleAdminBtn");
  if (wrapper.style.display === "none" || wrapper.style.display === "") {
    wrapper.style.display = "block";
    btn.innerHTML = "➖ شاردنەوەی فۆرم";
  } else {
    wrapper.style.display = "none";
    btn.innerHTML = "➕ زیادکردنی کارمەندی نوێ";
  }
};

window.createStaff = async function () {
  let email = document.getElementById("newStaffEmail").value.trim().toLowerCase();
  const pass = document.getElementById("newStaffPassword").value;
  const msg = document.getElementById("createStaffMsg");

  if (!email || pass.length < 6) {
    msg.textContent = "⚠️ ناو بنووسە و پاسوۆرد نابێت لە ٦ پیت کەمتر بێت.";
    msg.style.color = "red"; 
    return;
  }

  if (!email.includes('@')) {
    email = email + "@clinic.com";
  }

  msg.textContent = "⏳ چاوەڕێ بکە...";
  msg.style.color = "orange";
  showLoading();

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", email), {
      role: "staff",
      createdAt: Timestamp.now()
    });

    alert("✅ ئەکاونتی کارمەندەکە بە سەرکەوتوویی دروستکرا!");
    await loadStaffList();
    msg.textContent = "✅ کارمەند زیاد کرا!";
    msg.style.color = "green";
    document.getElementById("newStaffEmail").value = "";
    document.getElementById("newStaffPassword").value = "";
    setTimeout(() => { msg.textContent = ""; }, 3000);

  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  } finally {
    hideLoading();
  }
};

// ============================================
// CHECK SAVED DATE
// ============================================
async function checkTodaySaved() {
  if (!currentUser) return;
  const todayStr = getLocalISODate(new Date());
  const parts = todayStr.split('-');
  const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const dayEnd   = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  const staffName = currentUser.email.toLowerCase().split('@')[0];
  try {
    const snap = await getDocs(query(
      collection(db, "entries"),
      where("staff", "==", staffName),
      where("date", ">=", Timestamp.fromDate(dayStart)),
      where("date", "<=", Timestamp.fromDate(dayEnd))
    ));
    todayAlreadySaved = !snap.empty;
  } catch(e) { todayAlreadySaved = false; }
}

async function checkDateSaved(dateVal) {
  if (!currentUser || !dateVal) return false;
  const parts = dateVal.split('-');
  const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const dayEnd   = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  const staffName = currentUser.email.toLowerCase().split('@')[0];
  try {
    const snap = await getDocs(query(
      collection(db, "entries"),
      where("staff", "==", staffName),
      where("date", ">=", Timestamp.fromDate(dayStart)),
      where("date", "<=", Timestamp.fromDate(dayEnd))
    ));
    return !snap.empty;
  } catch(e) { return false; }
}

// ============================================
// CHANGE COUNT
// ============================================
window.changeCount = async function(fieldId, amount) {
  if (amount > 0) {
    const dateVal = document.getElementById("entryDate").value;
    const alreadySaved = await checkDateSaved(dateVal);
    if (alreadySaved) {
      const msg = document.getElementById("statusMsg");
      msg.textContent = "⛔ ئەم ڕۆژە پێشتر تۆمار کراوە، ناتوانرێت زیادی بکرێت!";
      msg.style.color = "red";
      setTimeout(() => { msg.textContent = ""; }, 4000);
      return;
    }
  }
  const input = document.getElementById(fieldId);
  let val = parseInt(input.value);
  if(isNaN(val)) val = 0;
  let newVal = val + amount;
  if(newVal < 0) newVal = 0; 
  input.value = newVal;
};

// ============================================
// SAVE ENTRY
// ============================================
window.saveEntry = async function () {
  if (!currentUser) return;
  
  const countAdult = parseInt(document.getElementById("patientCountAdult").value) || 0;
  const countChild = parseInt(document.getElementById("patientCountChild").value) || 0;
  const dateVal = document.getElementById("entryDate").value;
  const msg = document.getElementById("statusMsg");

  if (!dateVal) {
    msg.textContent = "⚠️ تکایە ڕێکەوت دیاری بکە"; 
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(dateVal);
  if (selectedDate > today) {
    msg.textContent = "⚠️ ناتوانیت بۆ ڕێکەوتی داهاتوو تۆمار بکەیت!";
    msg.style.color = "red";
    setTimeout(() => { msg.textContent = ""; }, 3000);
    return;
  }

  if (countAdult === 0 && countChild === 0) {
    msg.textContent = "⚠️ تکایە داتا داخڵ بکە — ژمارەی نەخۆش سفرە!";
    msg.style.color = "orange";
    setTimeout(() => { msg.textContent = ""; }, 3000);
    return;
  }
  
  const parts = dateVal.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); 
  
  let staffSimpleName = currentUser.email.toLowerCase().split('@')[0];

  const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const dayEnd   = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  
  showLoading();
  
  try {
    const existing = await getDocs(query(
      collection(db, "entries"),
      where("staff", "==", staffSimpleName),
      where("date", ">=", Timestamp.fromDate(dayStart)),
      where("date", "<=", Timestamp.fromDate(dayEnd))
    ));
    if (!existing.empty) {
      const go = confirm(`⚠️ ئەم ڕۆژە (${dateVal}) پێشتر تۆمار کراوە!\nئایا دەتەوێت دووبارە تۆمار بکەی؟`);
      if (!go) {
        hideLoading();
        return;
      }
    }

    await addDoc(collection(db, "entries"), {
      staff      : staffSimpleName,
      countAdult : countAdult,
      countChild : countChild,
      count      : countAdult + countChild,
      date       : Timestamp.fromDate(dateObj),
      weekNumber : getWeekNumber(dateObj),
    });
    
    msg.textContent = "✅ بە سەرکەوتوویی پاشکەوت کرا!";
    msg.style.color = "green";
    document.getElementById("patientCountAdult").value = "0";
    document.getElementById("patientCountChild").value = "0";
    todayAlreadySaved = true;
    setTimeout(() => { msg.textContent = ""; }, 3000);
  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  } finally {
    hideLoading();
  }
};

// ============================================
// DAILY STATS
// ============================================
async function fetchDailyForCurrentUser() {
  const dateVal = document.getElementById("dailyFilterDate").value;
  if (!dateVal) return null;

  const parts = dateVal.split('-');
  const selectedDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const nextDay = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);

  return getDocs(query(
    collection(db, "entries"),
    where("date", ">=", Timestamp.fromDate(selectedDate)),
    where("date", "<=", Timestamp.fromDate(nextDay))
  ));
}

window.loadDaily = async function () {
  const output = document.getElementById("dailyOutput");

  if (output.innerHTML.trim() !== "") {
    output.innerHTML = "";
    return;
  }

  showLoading();
  const snap = await fetchDailyForCurrentUser();
  if (!snap) {
    hideLoading();
    return;
  }

  if (snap.empty) {
    output.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە بۆ ئەم ڕۆژە</p>";
    hideLoading();
    return;
  }

  const staffName = currentUser.email.toLowerCase().split('@')[0];

  let html = `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;">
    <thead><tr style="background: #3498db; color: white;">
      <th style="padding: 10px;">کارمەند</th>
      <th style="padding: 10px;">🧑 گەورە</th>
      <th style="padding: 10px;">🧒 منال</th>
      <th style="padding: 10px;">کۆی گشتی</th>
      <th style="padding: 10px;">ڕێکەوت</th>
      <th style="padding: 10px;">کردارەکان</th>
    </tr></thead><tbody>`;
  let totalAdult = 0, totalChild = 0, totalAll = 0;

  snap.forEach(d => {
    const data = d.data();
    const docId = d.id;

    if (!isCurrentUserAdmin && data.staff !== staffName) return;

    const adult = data.countAdult ?? data.count ?? 0;
    const child = data.countChild ?? 0;
    const total = adult + child;

    totalAdult += adult;
    totalChild += child;
    totalAll   += total;
    
    let actionButtons = "";
    if (isCurrentUserAdmin || data.staff === staffName) {
      actionButtons = `
        <button onclick="editEntry('${docId}', ${adult}, ${child})" style="font-size:12px; padding:4px 8px;">✏️</button>
        <button onclick="deleteEntry('${docId}')" style="font-size:12px; padding:4px 8px; background:#e74c3c;">🗑️</button>
      `;
    }

    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px; text-align: center;">${data.staff}</td>
      <td style="padding: 8px; text-align: center;">${adult}</td>
      <td style="padding: 8px; text-align: center;">${child}</td>
      <td style="padding: 8px; text-align: center;"><strong>${total}</strong></td>
      <td style="padding: 8px; text-align: center; direction: ltr;">${data.date.toDate().toLocaleDateString("en-GB")}</td>
      <td style="padding: 8px; text-align: center;">${actionButtons}</td>
    </tr>`;
  });

  if (totalAdult > 0 || totalChild > 0) {
    html += `<tr style="background: #eaf4fb; font-weight: bold;">
      <td style="padding: 8px;">کۆی گشتی</td>
      <td style="padding: 8px; text-align: center;">${totalAdult}</td>
      <td style="padding: 8px; text-align: center;">${totalChild}</td>
      <td style="padding: 8px; text-align: center;"><strong>${totalAll}</strong></td>
      <td style="padding: 8px; text-align: center;">-</td>
      <td style="padding: 8px; text-align: center;">-</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  output.innerHTML = html;
  hideLoading();
};

window.editEntry = async function(docId, currentAdult, currentChild) {
  const newAdult = prompt("🧑 ژمارەی نوێی نەخۆشی گەورە:", currentAdult);
  if (newAdult === null) return;
  const newChild = prompt("🧒 ژمارەی نوێی نەخۆشی منال:", currentChild);
  if (newChild === null) return;

  const adultVal = parseInt(newAdult);
  const childVal = parseInt(newChild);
  if (isNaN(adultVal) || isNaN(childVal) || adultVal < 0 || childVal < 0) {
    alert("تکایە ژمارەیەکی دروست بنووسە");
    return;
  }

  showLoading();
  try {
    await setDoc(doc(db, "entries", docId), { 
      countAdult: adultVal, 
      countChild: childVal,
      count: adultVal + childVal
    }, { merge: true });
    alert("✅ بە سەرکەوتوویی نوێکرایەوە!");
    loadDaily(); 
    loadWeekly();
    if (document.getElementById("monthlyOutput").innerHTML.trim() !== "") loadMonthly();
    if (isCurrentUserAdmin && document.getElementById("staffSearchSelect").value) searchByStaff();
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  } finally {
    hideLoading();
  }
};

window.deleteEntry = async function(docId) {
  if (!confirm("دڵنیایت لە سڕینەوەی ئەم تۆمارە؟")) return;

  showLoading();
  try {
    await deleteDoc(doc(db, "entries", docId));
    alert("✅ بە سەرکەوتوویی سڕایەوە!");
    loadDaily();
    loadWeekly();
    if (document.getElementById("monthlyOutput").innerHTML.trim() !== "") loadMonthly();
    if (isCurrentUserAdmin && document.getElementById("staffSearchSelect").value) searchByStaff();
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  } finally {
    hideLoading();
  }
};

window.exportDailyExcel = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const data = [["کارمەند", "🧑 گەورە", "🧒 منال", "کۆی گشتی", "ڕێکەوت"]];
  let totalAdult = 0, totalChild = 0;

  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    data.push([x.staff, adult, child, adult + child, x.date.toDate().toLocaleDateString("en-GB")]);
    totalAdult += adult;
    totalChild += child;
  });

  data.push(["کۆی گشتی", totalAdult, totalChild, totalAdult + totalChild, "-"]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "ئاماری ڕۆژانە");
  XLSX.writeFile(wb, `daily_${document.getElementById("dailyFilterDate").value}.xlsx`);
};

window.exportDailyPDF = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  pdfDoc.text("Daily Statistics", 14, 15);

  const rows = [];
  let totalAdult = 0, totalChild = 0;
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    rows.push([x.staff, adult, child, adult + child, x.date.toDate().toLocaleDateString("en-GB")]);
    totalAdult += adult;
    totalChild += child;
  });

  rows.push(["Total", totalAdult, totalChild, totalAdult + totalChild, "-"]);

  pdfDoc.autoTable({
    head: [["Staff", "Adult", "Child", "Total", "Date"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 9 }
  });

  pdfDoc.save(`daily_${document.getElementById("dailyFilterDate").value}.pdf`);
};

// ============================================
// WEEKLY STATS
// ============================================
function getDateRangeOfWeek(weekNo, year) {
    let d = new Date(year, 0, 1);
    let days = (weekNo - 1) * 7;
    let dayOfWeek = d.getDay(); 
    let offset = -dayOfWeek;
    
    let firstDay = new Date(year, 0, d.getDate() + days + offset);
    let lastDay = new Date(firstDay);
    lastDay.setDate(firstDay.getDate() + 6);
    
    const formatDate = (date) => {
        return date.getDate() + "/" + (date.getMonth() + 1) + "/" + date.getFullYear();
    };
    
    return `[ لە ${formatDate(firstDay)} بۆ ${formatDate(lastDay)} ]`;
}

function populateWeekDropdown() {
    const select = document.getElementById("weekSelector");
    if (!select) return;
    select.innerHTML = "";
    
    const currentWk = getWeekNumber(new Date());
    
    for (let i = 1; i <= 52; i++) {
        let option = document.createElement("option");
        option.value = i;
        
        let labelText = `هەفتەی ${i}`;
        if (i === currentWk) labelText = `ئەم هەفتەیە (هەفتەی ${i})`;
        else if (i === currentWk - 1) labelText = `هەفتەی پێشوو (هەفتەی ${i})`;
        
        option.textContent = labelText;
        if (i === currentWk) option.selected = true;
        
        select.appendChild(option);
    }
    
    updateDateRangeLabel();
}

function updateDateRangeLabel() {
    const label = document.getElementById("weekDateRangeLabel");
    if(!label) return;
    let dateRange = getDateRangeOfWeek(selectedWeekNumber, currentYear);
    label.textContent = dateRange;
}

window.selectWeekFromDropdown = function() {
    const select = document.getElementById("weekSelector");
    selectedWeekNumber = parseInt(select.value);
    updateDateRangeLabel();
};

async function fetchWeekly() {
  return getDocs(query(collection(db, "entries"), where("weekNumber", "==", selectedWeekNumber)));
}

window.loadWeekly = async function () {
  const weeklyOutput = document.getElementById("weeklyOutput");
  const chartContainer = document.getElementById("weeklyChartContainer");

  if (weeklyOutput.innerHTML.trim() !== "") {
    weeklyOutput.innerHTML = "";
    if (chartContainer) chartContainer.style.display = "none";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  showLoading();
  const snap = await fetchWeekly();
  
  if (snap.empty) {
    weeklyOutput.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم هەفتەیەدا</p>";
    if (chartContainer) chartContainer.style.display = "none";
    if (chartInstance) chartInstance.destroy();
    hideLoading();
    return;
  }

  const staffName = currentUser ? currentUser.email.toLowerCase().split('@')[0] : "";

  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    if (!totals[x.staff]) totals[x.staff] = { adult: 0, child: 0, dates: [] };
    totals[x.staff].adult += adult;
    totals[x.staff].child += child;
    totals[x.staff].dates.push(x.date.toDate().toLocaleDateString("en-GB"));
  });

  if (Object.keys(totals).length === 0) {
    weeklyOutput.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم هەفتەیەدا</p>";
    if (chartContainer) chartContainer.style.display = "none";
    if (chartInstance) chartInstance.destroy();
    hideLoading();
    return;
  }

  let html = `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;">
    <thead><tr style="background: #3498db; color: white;">
      <th style="padding: 10px;">کارمەند</th>
      <th style="padding: 10px;">🧑 گەورە</th>
      <th style="padding: 10px;">🧒 منال</th>
      <th style="padding: 10px;">کۆی گشتی</th>
      <th style="padding: 10px;">بەروارەکان</th>
    </tr></thead><tbody>`;
  const chartLabels = [], chartData = [];
  let grandAdult = 0, grandChild = 0;

  for (const [s, t] of Object.entries(totals)) {
    const total = t.adult + t.child;
    const datesStr = [...new Set(t.dates)].join(" | ");
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px; text-align: center;">${s}</td>
      <td style="padding: 8px; text-align: center;">${t.adult}</td>
      <td style="padding: 8px; text-align: center;">${t.child}</td>
      <td style="padding: 8px; text-align: center;"><strong>${total}</strong></td>
      <td style="padding: 8px; text-align: center; direction: ltr; font-size:12px;">${datesStr}</td>
    </tr>`;
    chartLabels.push(s);
    chartData.push(total);
    grandAdult += t.adult;
    grandChild += t.child;
  }

  if (isCurrentUserAdmin && Object.keys(totals).length > 1) {
    html += `<tr style="background: #eaf4fb; font-weight: bold;">
      <td style="padding: 8px;">کۆی گشتی</td>
      <td style="padding: 8px; text-align: center;">${grandAdult}</td>
      <td style="padding: 8px; text-align: center;">${grandChild}</td>
      <td style="padding: 8px; text-align: center;"><strong>${grandAdult + grandChild}</strong></td>
      <td style="padding: 8px; text-align: center;">-</td>
     </tr>`;
  }

  html += `</tbody></table></div>`;
  weeklyOutput.innerHTML = html;
  
  if (chartContainer) {
    chartContainer.style.display = "block";
    drawChart(chartLabels, chartData);
  }
  hideLoading();
};

window.exportWeeklyExcel = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const data = [["کارمەند", "🧑 گەورە", "🧒 منال", "کۆی گشتی", "ڕێکەوت", "ژمارەی هەفتە"]];
  let grandAdult = 0, grandChild = 0;

  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    data.push([x.staff, adult, child, adult + child, x.date.toDate().toLocaleDateString("en-GB"), x.weekNumber]);
    grandAdult += adult;
    grandChild += child;
  });

  data.push(["کۆی گشتی", grandAdult, grandChild, grandAdult + grandChild, "-", "-"]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "هەفتانە");
  XLSX.writeFile(wb, "weekly_stats_detailed.xlsx");
};

window.exportWeeklyPDF = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    if (!totals[x.staff]) totals[x.staff] = { adult: 0, child: 0 };
    totals[x.staff].adult += x.countAdult ?? x.count ?? 0;
    totals[x.staff].child += x.countChild ?? 0;
  });

  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  pdfDoc.text("Weekly Statistics (Week " + selectedWeekNumber + ")", 14, 15);

  const rows = [];
  for (const [s, t] of Object.entries(totals)) {
    rows.push([s, t.adult, t.child, t.adult + t.child]);
  }

  pdfDoc.autoTable({
    head: [["Staff", "Adult", "Child", "Total"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 9 }
  });

  pdfDoc.save("weekly_stats.pdf");
};

// ============================================
// MONTHLY STATS
// ============================================
function populateMonthDropdown() {
  const select = document.getElementById("monthSelector");
  if (!select) return;
  select.innerHTML = "";
  
  const months = [
    "کانوونی دووەم", "شوبات", "ئازار", "نیسان", "ئایار", "حوزەیران",
    "تەمموز", "ئاب", "ئەیلول", "تشرینی یەکەم", "تشرینی دووەم", "کانوونی یەکەم"
  ];
  
  const currentMonth = new Date().getMonth();
  
  for (let i = 0; i < 12; i++) {
    let option = document.createElement("option");
    option.value = i;
    option.textContent = months[i];
    if (i === currentMonth) option.selected = true;
    select.appendChild(option);
  }
}

window.selectMonth = function() {
  loadMonthly();
};

async function fetchMonthly() {
  const year = new Date().getFullYear();
  const month = parseInt(document.getElementById("monthSelector").value);
  
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  endDate.setHours(23, 59, 59);
  
  return getDocs(query(
    collection(db, "entries"),
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate))
  ));
}

window.loadMonthly = async function () {
  const monthlyOutput = document.getElementById("monthlyOutput");
  const monthlyChartContainer = document.getElementById("monthlyChartContainer");
  
  if (monthlyOutput.innerHTML.trim() !== "") {
    monthlyOutput.innerHTML = "";
    if (monthlyChartContainer) monthlyChartContainer.style.display = "none";
    if (monthlyChartInstance) { monthlyChartInstance.destroy(); monthlyChartInstance = null; }
    return;
  }
  
  showLoading();
  const snap = await fetchMonthly();
  
  if (snap.empty) {
    monthlyOutput.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم مانگەدا</p>";
    if (monthlyChartContainer) monthlyChartContainer.style.display = "none";
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    hideLoading();
    return;
  }
  
  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const dailyTotals = {};
  const staffTotals = {};
  
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    
    const dateStr = x.date.toDate().toLocaleDateString("en-GB");
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    
    if (!dailyTotals[dateStr]) {
      dailyTotals[dateStr] = { adult: 0, child: 0 };
    }
    dailyTotals[dateStr].adult += adult;
    dailyTotals[dateStr].child += child;
    
    if (!staffTotals[x.staff]) {
      staffTotals[x.staff] = { adult: 0, child: 0 };
    }
    staffTotals[x.staff].adult += adult;
    staffTotals[x.staff].child += child;
  });
  
  let html = "<h3>📊 پوختەی کارمەندان</h3>";
  html += `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;">
    <thead><tr style="background: #3498db; color: white;">
      <th style="padding: 10px;">کارمەند</th>
      <th style="padding: 10px;">🧑 گەورە</th>
      <th style="padding: 10px;">🧒 منال</th>
      <th style="padding: 10px;">کۆی گشتی</th>
     </tr></thead><tbody>`;
  
  let grandAdult = 0, grandChild = 0;
  for (const [staff, totals] of Object.entries(staffTotals)) {
    const total = totals.adult + totals.child;
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px; text-align: center;">${staff}${staff}
      <td style="padding: 8px; text-align: center;">${totals.adult}${staff}
      <td style="padding: 8px; text-align: center;">${totals.child}${staff}
      <td style="padding: 8px; text-align: center;"><strong>${total}</strong>${staff}
     </tr>`;
    grandAdult += totals.adult;
    grandChild += totals.child;
  }
  html += `<tr style="background: #eaf4fb; font-weight: bold;">
    <td style="padding: 8px;">کۆی گشتی</td>
    <td style="padding: 8px; text-align: center;">${grandAdult}</td>
    <td style="padding: 8px; text-align: center;">${grandChild}</td>
    <td style="padding: 8px; text-align: center;"><strong>${grandAdult + grandChild}</strong></td>
   </tr></tbody></table></div>`;
  
  html += "<h3 style='margin-top:20px;'>📅 ڕۆژانە</h3>";
  html += `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;">
    <thead><tr style="background: #3498db; color: white;">
      <th style="padding: 10px;">ڕێکەوت</th>
      <th style="padding: 10px;">🧑 گەورە</th>
      <th style="padding: 10px;">🧒 منال</th>
      <th style="padding: 10px;">کۆی گشتی</th>
     </tr></thead><tbody>`;
  
  const sortedDates = Object.keys(dailyTotals).sort((a, b) => {
    const [da, ma, ya] = a.split('/');
    const [db, mb, yb] = b.split('/');
    return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
  });
  
  for (const date of sortedDates) {
    const t = dailyTotals[date];
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px; text-align: center;">${date}${date}
      <td style="padding: 8px; text-align: center;">${t.adult}${date}
      <td style="padding: 8px; text-align: center;">${t.child}${date}
      <td style="padding: 8px; text-align: center;"><strong>${t.adult + t.child}</strong>${date}
     </tr>`;
  }
  html += `</tbody></table></div>`;
  
  monthlyOutput.innerHTML = html;
  
  if (monthlyChartContainer) {
    monthlyChartContainer.style.display = "block";
    const chartLabels = sortedDates;
    const chartDataAdult = sortedDates.map(d => dailyTotals[d].adult);
    const chartDataChild = sortedDates.map(d => dailyTotals[d].child);
    drawMonthlyChart(chartLabels, chartDataAdult, chartDataChild);
  }
  hideLoading();
};

function drawMonthlyChart(labels, adultData, childData) {
  const ctx = document.getElementById("monthlyChart").getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();
  
  monthlyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "🧑 گەورە",
          data: adultData,
          borderColor: "rgba(52,152,219,1)",
          backgroundColor: "rgba(52,152,219,0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: "🧒 منال",
          data: childData,
          borderColor: "rgba(46,204,113,1)",
          backgroundColor: "rgba(46,204,113,0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 } } },
        title: { display: true, text: 'ڕەوتی ڕۆژانەی نەخۆشەکان', font: { size: 12 } }
      }
    }
  });
}

window.exportMonthlyExcel = async function () {
  const snap = await fetchMonthly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }
  
  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const data = [["کارمەند", "🧑 گەورە", "🧒 منال", "کۆی گشتی", "ڕێکەوت"]];
  let grandAdult = 0, grandChild = 0;
  
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    data.push([x.staff, adult, child, adult + child, x.date.toDate().toLocaleDateString("en-GB")]);
    grandAdult += adult;
    grandChild += child;
  });
  
  data.push(["کۆی گشتی", grandAdult, grandChild, grandAdult + grandChild, "-"]);
  
  const wb = XLSX.utils.book_new();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = months[parseInt(document.getElementById("monthSelector").value)];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), `monthly_${monthName}`);
  XLSX.writeFile(wb, `monthly_${monthName}.xlsx`);
};

window.exportMonthlyPDF = async function () {
  const snap = await fetchMonthly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }
  
  const staffName = currentUser.email.toLowerCase().split('@')[0];
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = months[parseInt(document.getElementById("monthSelector").value)];
  pdfDoc.text(`Monthly Statistics - ${monthName}`, 14, 15);
  
  const rows = [];
  let grandAdult = 0, grandChild = 0;
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    rows.push([x.staff, adult, child, adult + child, x.date.toDate().toLocaleDateString("en-GB")]);
    grandAdult += adult;
    grandChild += child;
  });
  
  rows.push(["Total", grandAdult, grandChild, grandAdult + grandChild, "-"]);
  
  pdfDoc.autoTable({
    head: [["Staff", "Adult", "Child", "Total", "Date"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 8 }
  });
  
  pdfDoc.save(`monthly_${monthName}.pdf`);
};

// ============================================
// BACKUP FUNCTION
// ============================================
window.backupData = async function () {
  if (!isCurrentUserAdmin) {
    alert("تەنها بەڕێوەبەر دەتوانێت بەک‌ئەپ بکات!");
    return;
  }
  
  showLoading();
  try {
    const entriesSnap = await getDocs(collection(db, "entries"));
    const usersSnap = await getDocs(collection(db, "users"));
    
    const backupData = {
      backupDate: new Date().toISOString(),
      entries: [],
      users: []
    };
    
    entriesSnap.forEach(doc => {
      backupData.entries.push({ id: doc.id, ...doc.data() });
    });
    
    usersSnap.forEach(doc => {
      backupData.users.push({ id: doc.id, ...doc.data() });
    });
    
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clinic_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert("✅ بەک‌ئەپ بە سەرکەوتوویی دروستکرا!");
  } catch (e) {
    alert("❌ هەڵە لە دروستکردنی بەک‌ئەپ: " + e.message);
  } finally {
    hideLoading();
  }
};

window.restoreBackup = function() {
  if (!isCurrentUserAdmin) {
    alert("تەنها بەڕێوەبەر دەتوانێت بەک‌ئەپ بەرجەستە بکاتەوە!");
    return;
  }
  const input = document.getElementById("restoreFile");
  input.click();
};

window.handleRestore = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const confirmed = confirm("ئاگاداری! ئەمە داتاکانی ئێستا دەسڕێتەوە و داتاکانی بەک‌ئەپەکە دەهێنێتەوە. دڵنیایت؟");
  if (!confirmed) return;
  
  showLoading();
  try {
    const text = await file.text();
    const backupData = JSON.parse(text);
    
    const entriesSnap = await getDocs(collection(db, "entries"));
    for (const doc of entriesSnap.docs) {
      await deleteDoc(doc.ref);
    }
    
    const usersSnap = await getDocs(collection(db, "users"));
    for (const doc of usersSnap.docs) {
      if (doc.id !== currentUser.email.toLowerCase()) {
        await deleteDoc(doc.ref);
      }
    }
    
    for (const entry of backupData.entries) {
      const { id, ...data } = entry;
      await setDoc(doc(db, "entries", id), data);
    }
    
    for (const user of backupData.users) {
      if (user.id !== currentUser.email.toLowerCase()) {
        await setDoc(doc(db, "users", user.id), user);
      }
    }
    
    alert("✅ بەک‌ئەپ بە سەرکەوتوویی بەرجەستە کرایەوە!");
    location.reload();
  } catch (e) {
    alert("❌ هەڵە لە بەرجەستەکردنەوە: " + e.message);
  } finally {
    hideLoading();
  }
};

// ============================================
// CHARTS (SMALLER SIZE)
// ============================================
function drawChart(labels, data) {
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "نەخۆشان",
        data,
        backgroundColor: "rgba(52,152,219,0.7)",
        borderColor: "rgba(52,152,219,1)",
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { 
        legend: { display: true, position: 'top', labels: { font: { size: 11 } } },
        tooltip: { enabled: true, bodyFont: { size: 11 } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } }
      }
    }
  });
}

window.switchChartType = function(type) {
  if (!chartInstance) return;
  
  const currentLabels = chartInstance.data.labels;
  const currentData = chartInstance.data.datasets[0].data;
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  
  if (chartInstance) chartInstance.destroy();
  
  const config = {
    type: type,
    data: {
      labels: currentLabels,
      datasets: [{
        label: "نەخۆشان",
        data: currentData,
        borderColor: "rgba(52,152,219,1)",
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { 
        legend: { display: true, position: 'top', labels: { font: { size: 11 } } },
        tooltip: { enabled: true, bodyFont: { size: 11 } }
      }
    }
  };
  
  if (type === 'pie') {
    config.data.datasets[0].backgroundColor = [
      'rgba(52,152,219,0.7)',
      'rgba(46,204,113,0.7)',
      'rgba(231,76,60,0.7)',
      'rgba(241,196,15,0.7)',
      'rgba(155,89,182,0.7)'
    ];
    config.options.plugins.legend.position = 'right';
  } else if (type === 'bar') {
    config.data.datasets[0].backgroundColor = "rgba(52,152,219,0.7)";
    config.options.plugins.legend.position = 'top';
  } else if (type === 'line') {
    config.data.datasets[0].backgroundColor = "rgba(52,152,219,0.1)";
    config.data.datasets[0].fill = true;
    config.data.datasets[0].tension = 0.3;
    config.options.plugins.legend.position = 'top';
  }
  
  chartInstance = new Chart(ctx, config);
};

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    if(document.getElementById("btnLogin")) document.getElementById("btnLogin").addEventListener("click", window.login);
    if(document.getElementById("btnLogout")) document.getElementById("btnLogout").addEventListener("click", window.logout);
    if(document.getElementById("themeToggle")) document.getElementById("themeToggle").addEventListener("click", window.toggleTheme);
    
    if(document.getElementById("toggleAdminBtn")) document.getElementById("toggleAdminBtn").addEventListener("click", window.toggleAdminForm);
    if(document.getElementById("btnCreateStaff")) document.getElementById("btnCreateStaff").addEventListener("click", window.createStaff);
    
    if(document.getElementById("btnSaveEntry")) document.getElementById("btnSaveEntry").addEventListener("click", window.saveEntry);
    
    if(document.getElementById("btnLoadDaily")) document.getElementById("btnLoadDaily").addEventListener("click", window.loadDaily);
    if(document.getElementById("btnExportDailyExcel")) document.getElementById("btnExportDailyExcel").addEventListener("click", window.exportDailyExcel);
    if(document.getElementById("btnExportDailyPDF")) document.getElementById("btnExportDailyPDF").addEventListener("click", window.exportDailyPDF);
    
    if(document.getElementById("btnLoadWeekly")) document.getElementById("btnLoadWeekly").addEventListener("click", window.loadWeekly);
    if(document.getElementById("btnExportWeeklyExcel")) document.getElementById("btnExportWeeklyExcel").addEventListener("click", window.exportWeeklyExcel);
    if(document.getElementById("btnExportWeeklyPDF")) document.getElementById("btnExportWeeklyPDF").addEventListener("click", window.exportWeeklyPDF);
    
    if(document.getElementById("btnLoadMonthly")) document.getElementById("btnLoadMonthly").addEventListener("click", window.loadMonthly);
    if(document.getElementById("btnExportMonthlyExcel")) document.getElementById("btnExportMonthlyExcel").addEventListener("click", window.exportMonthlyExcel);
    if(document.getElementById("btnExportMonthlyPDF")) document.getElementById("btnExportMonthlyPDF").addEventListener("click", window.exportMonthlyPDF);
    if(document.getElementById("monthSelector")) document.getElementById("monthSelector").addEventListener("change", window.selectMonth);
    
    if(document.getElementById("staffSearchSelect")) document.getElementById("staffSearchSelect").addEventListener("change", window.searchByStaff);
    
    if(document.getElementById("backupBtn")) document.getElementById("backupBtn").addEventListener("click", window.backupData);
    if(document.getElementById("restoreBtn")) document.getElementById("restoreBtn").addEventListener("click", window.restoreBackup);
    if(document.getElementById("restoreFile")) document.getElementById("restoreFile").addEventListener("change", window.handleRestore);
    
    if(document.getElementById("chartTypeBar")) document.getElementById("chartTypeBar").addEventListener("click", () => window.switchChartType('bar'));
    if(document.getElementById("chartTypeLine")) document.getElementById("chartTypeLine").addEventListener("click", () => window.switchChartType('line'));
    if(document.getElementById("chartTypePie")) document.getElementById("chartTypePie").addEventListener("click", () => window.switchChartType('pie'));
    
    document.querySelectorAll("button[onclick*='changeCount']").forEach(b => b.disabled = true);
    setTimeout(() => {
      document.querySelectorAll("button[onclick*='changeCount']").forEach(b => b.disabled = false);
    }, 800);
});