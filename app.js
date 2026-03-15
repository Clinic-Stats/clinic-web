import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc, setDoc, deleteDoc, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// 🔴 زانیارییەکانی خۆت لێرە دابنێ
const firebaseConfig = {
  apiKey: "AIzaSyBY15gxSoGhtx1LTRzfC_P9Jz_a2avUaLg",
  authDomain: "clinic-stats.firebaseapp.com",
  projectId: "clinic-stats",
  storageBucket: "clinic-stats.firebasestorage.app",
  messagingSenderId: "122761541077",
  appId: "1:122761541077:web:967c2618895fe57d51b95c"
};
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

enableIndexedDbPersistence(db).catch(err => console.log("Offline error:", err.code));

let currentUser  = null;
let chartInstance = null;
let isCurrentUserAdmin = false;
let selectedWeekNumber = getWeekNumber(new Date()); // لەسەرەتادا هەفتەی ئەمڕۆ دەبێت
let currentYear = new Date().getFullYear();

// ════════════════════════════════
//  بەشی لۆگین و چاودێریکردن
// ════════════════════════════════
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
      console.log("هەڵە لە وەرگرتنی ڕۆڵ:", e);
    }

    if (isCurrentUserAdmin) {
      document.getElementById("adminSection").style.display = "block";
    } else {
      document.getElementById("adminSection").style.display = "none";
    }

    setTodayDate();
    populateWeekDropdown(); // پڕکردنەوەی لیستەکە بە هەفتەکان
    loadWeekly(); 
  } else {
    currentUser = null;
    isCurrentUserAdmin = false;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
  }
});

function getLocalISODate(dateObj) {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return (new Date(dateObj.getTime() - offset)).toISOString().split('T')[0];
}

function setTodayDate() {
  const todayStr = getLocalISODate(new Date());
  document.getElementById("entryDate").value = todayStr;
  document.getElementById("dailyFilterDate").value = todayStr;
}

window.login = async function () {
  let email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const passInput  = document.getElementById("loginPassword");
  const pass = passInput.value;
  const errorMsg = document.getElementById("loginError");
  
  if (email && !email.includes('@')) {
    email = email + "@clinic.com";
  }

  try {
    errorMsg.textContent = "⏳ چاوەڕێ بکە...";
    errorMsg.style.color = "orange";
    await signInWithEmailAndPassword(auth, email, pass);
    errorMsg.textContent = "";
  } catch {
    errorMsg.textContent = "❌ پاسوۆرد یان ناو هەڵەیە!";
    errorMsg.style.color = "red";
    passInput.value = ""; // بەتاڵکردنەوەی پاسوۆردەکە
    passInput.focus(); // خستنە سەر پاسوۆردەکە
  }
};

// کاتێک ناو دەنووسرێت و دەچێتە دەرەوە یان کلیک لە دەرەوە دەکات با بچێتە سەر پاسوۆرد
document.getElementById("loginEmail").addEventListener("blur", function() {
    if(this.value.trim() !== "") {
        document.getElementById("loginPassword").focus();
    }
});

const logout = async function () {
  await signOut(auth);
};

// ════════════════════════════════
//  بەشی بەڕێوەبەر
// ════════════════════════════════
const toggleAdminForm = function() {
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

const createStaff = async function () {
  let email = document.getElementById("newStaffEmail").value.trim().toLowerCase();
  const pass = document.getElementById("newStaffPassword").value;
  const msg = document.getElementById("createStaffMsg");

  if (!email || pass.length < 6) {
    msg.textContent = "⚠️ ناو بنووسە و پاسوۆرد نابێت لە ٦ پیت کەمتر بێت.";
    msg.style.color = "red"; return;
  }

  if (!email.includes('@')) {
    email = email + "@clinic.com";
  }

  msg.textContent = "⏳ چاوەڕێ بکە...";
  msg.style.color = "orange";

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", email), {
      role: "staff",
      createdAt: Timestamp.now()
    });

    alert("✅ ئەکاونتی کارمەندەکە بە سەرکەوتوویی دروستکرا!\n\nسیستەمەکە ئێستا لۆگئاوت دەبێت. تکایە دووبارە بە ئەکاونتی بەڕێوەبەر لۆگین بکەرەوە.");
    await signOut(auth);

  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  }
};

// ════════════════════════════════
// بەشی دوگمەی + و -
// ════════════════════════════════
window.changeCount = function(amount) {
    const input = document.getElementById("patientCount");
    let val = parseInt(input.value);
    if(isNaN(val)) val = 0;
    
    let newVal = val + amount;
    if(newVal < 0) newVal = 0; 
    
    input.value = newVal;
};

// ════════════════════════════════
//  بەشی پاشکەوتکردنی داتا
// ════════════════════════════════
const saveEntry = async function () {
  if (!currentUser) return;
  const count   = parseInt(document.getElementById("patientCount").value);
  const dateVal = document.getElementById("entryDate").value;
  const msg     = document.getElementById("statusMsg");

  if (isNaN(count) || !dateVal) {
    msg.textContent = "⚠️ تکایە هەموو خانەکان پڕبکەرەوە"; return;
  }
  
  const parts = dateVal.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); 
  
  let staffSimpleName = currentUser.email.toLowerCase().split('@')[0];

  try {
    await addDoc(collection(db, "entries"), {
      staff      : staffSimpleName,
      count      : count,
      date       : Timestamp.fromDate(dateObj),
      weekNumber : getWeekNumber(dateObj),
    });
    msg.textContent = "✅ بە سەرکەوتوویی پاشکەوت کرا!";
    msg.style.color = "green";
    document.getElementById("patientCount").value = "0";
    
    loadWeekly();
  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  }
};

// ════════════════════════════════
//  بەشی ئاماری ڕۆژانە
// ════════════════════════════════
async function fetchDailyForCurrentUser() {
  const dateVal = document.getElementById("dailyFilterDate").value;
  if (!dateVal) {
    alert("تکایە ڕێکەوتێک هەڵبژێرە");
    return null;
  }

  const parts = dateVal.split('-');
  const selectedDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const nextDay = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);

  const staffName = currentUser.email.toLowerCase().split('@')[0];

  if (isCurrentUserAdmin) {
    return getDocs(query(
      collection(db, "entries"),
      where("date", ">=", Timestamp.fromDate(selectedDate)),
      where("date", "<=", Timestamp.fromDate(nextDay))
    ));
  } else {
    return getDocs(query(
      collection(db, "entries"),
      where("staff", "==", staffName),
      where("date", ">=", Timestamp.fromDate(selectedDate)),
      where("date", "<=", Timestamp.fromDate(nextDay))
    ));
  }
}

const loadDaily = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap) return;

  const output = document.getElementById("dailyOutput");
  if (snap.empty) {
    output.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە بۆ ئەم ڕۆژە</p>";
    return;
  }

  let html = "<table><tr><th>کارمەند</th><th>ژمارەی نەخۆش</th><th>ڕێکەوت</th><th>کردارەکان</th></tr>";
  let total = 0;

  snap.forEach(d => {
    const data = d.data();
    const docId = d.id;
    total += data.count;
    
    let actionButtons = "";
    if (isCurrentUserAdmin || data.staff === currentUser.email.toLowerCase().split('@')[0]) {
      actionButtons = `
        <button onclick="editEntry('${docId}', ${data.count})" style="font-size:12px; padding:4px 8px;">✏️</button>
        <button onclick="deleteEntry('${docId}')" style="font-size:12px; padding:4px 8px; background:#e74c3c;">🗑️</button>
      `;
    }

    html += `<tr>
      <td>${data.staff}</td>
      <td>${data.count}</td>
      <td style="direction: ltr;">${data.date.toDate().toLocaleDateString("en-GB")}</td>
      <td>${actionButtons}</td>
    </tr>`;
  });

  html += `<tr class="total-row"><td>کۆی گشتی</td><td>${total}</td><td>-</td><td>-</td></tr></table>`;
  output.innerHTML = html;
};

window.editEntry = async function(docId, currentCount) {
  const newCount = prompt("ژمارەی نوێی نەخۆشان بنووسە:", currentCount);
  if (newCount === null || newCount.trim() === "") return;

  const numVal = parseInt(newCount);
  if (isNaN(numVal) || numVal < 0) {
    alert("تکایە ژمارەیەکی دروست بنووسە");
    return;
  }

  try {
    await setDoc(doc(db, "entries", docId), { count: numVal }, { merge: true });
    alert("✅ بە سەرکەوتوویی نوێکرایەوە!");
    loadDaily(); 
    loadWeekly();
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  }
};

window.deleteEntry = async function(docId) {
  if (!confirm("دڵنیایت لە سڕینەوەی ئەم تۆمارە؟")) return;

  try {
    await deleteDoc(doc(db, "entries", docId));
    alert("✅ بە سەرکەوتوویی سڕایەوە!");
    loadDaily();
    loadWeekly();
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  }
};

const exportDailyExcel = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const data = [["کارمەند", "ژمارەی نەخۆش", "ڕێکەوت"]];
  let total = 0;

  snap.forEach(d => {
    const x = d.data();
    data.push([x.staff, x.count, x.date.toDate().toLocaleDateString("en-GB")]);
    total += x.count;
  });

  data.push(["کۆی گشتی", total, "-"]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "ئاماری ڕۆژانە");
  XLSX.writeFile(wb, `daily_${document.getElementById("dailyFilterDate").value}.xlsx`);
};

const exportDailyPDF = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Daily Statistics", 14, 15);

  const rows = [];
  snap.forEach(d => {
    const x = d.data();
    rows.push([x.staff, x.count, x.date.toDate().toLocaleDateString("en-GB")]);
  });

  doc.autoTable({
    head: [["Staff", "Patients", "Date"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 9 }
  });

  doc.save(`daily_${document.getElementById("dailyFilterDate").value}.pdf`);
};

// ════════════════════════════════
//  بەشی ئاماری هەفتانە (کۆمبۆبۆکس)
// ════════════════════════════════

// دۆزینەوەی بەرواری سەرەتا و کۆتایی هەفتەیەک بەپێی ژمارەی هەفتە لە ساڵێکدا
function getDateRangeOfWeek(weekNo, year) {
    let d = new Date(year, 0, 1);
    let isLeap = new Date(year, 1, 29).getMonth() === 1;
    let days = (weekNo - 1) * 7;
    // گەر ڕۆژی یەکشەممە سەرەتای هەفتە بێت
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

// پڕکردنەوەی لیستەکە (Select) بە ٥٢ هەفتەی ساڵ
function populateWeekDropdown() {
    const select = document.getElementById("weekSelector");
    select.innerHTML = "";
    
    const currentWk = getWeekNumber(new Date());
    
    for (let i = 1; i <= 52; i++) {
        let option = document.createElement("option");
        option.value = i;
        
        let labelText = `هەفتەی ${i}`;
        if (i === currentWk) labelText = `ئەم هەفتەیە (هەفتەی ${i})`;
        else if (i === currentWk - 1) labelText = `هەفتەی پێشوو (هەفتەی ${i})`;
        
        option.textContent = labelText;
        if (i === currentWk) option.selected = true; // خۆکارانە هەفتەی ئێستا هەڵبژێرە
        
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
    loadWeekly();
};

async function fetchWeekly() {
  // تەنها ئەو داتایانە دەهێنێت کە ژمارەی هەفتەکەیان یەکسانە بە هەفتەی هەڵبژێردراو
  return getDocs(query(collection(db, "entries"), where("weekNumber", "==", selectedWeekNumber)));
}

const loadWeekly = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) {
    document.getElementById("weeklyOutput").innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم هەفتەیەدا</p>";
    if (chartInstance) chartInstance.destroy();
    return;
  }

  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    totals[x.staff] = (totals[x.staff] || 0) + x.count;
  });

  let html = "<table><tr><th>کارمەند</th><th>کۆی هەفتەکە</th></tr>";
  for (const [s, t] of Object.entries(totals)) {
    html += `<tr><td>${s}</td><td>${t}</td></tr>`;
  }
  html += "</table>";
  document.getElementById("weeklyOutput").innerHTML = html;

  drawChart(Object.keys(totals), Object.values(totals));
};

const exportWeeklyExcel = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const data = [["کارمەند", "ڕێکەوت", "ژمارەی نەخۆش", "ژمارەی هەفتە"]];
  let grandTotal = 0;

  snap.forEach(d => {
    const x = d.data();
    data.push([
      x.staff, 
      x.date.toDate().toLocaleDateString("en-GB"), 
      x.count, 
      x.weekNumber
    ]);
    grandTotal += x.count;
  });

  data.push(["کۆی گشتی", "-", grandTotal, "-"]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "هەفتانە");
  XLSX.writeFile(wb, "weekly_stats_detailed.xlsx");
};

const exportWeeklyPDF = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    totals[x.staff] = (totals[x.staff] || 0) + x.count;
  });

  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  
  let titleText = "Weekly Statistics (Week " + selectedWeekNumber + ")";
  pdfDoc.text(titleText, 14, 15);

  const rows = [];
  for (const [staff, count] of Object.entries(totals)) {
    rows.push([staff, count]);
  }

  pdfDoc.autoTable({
    head: [["Staff", "Total Patients"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 9 }
  });

  pdfDoc.save("weekly_stats.pdf");
};

// ════════════════════════════════
//  بەشی وێنەکێشانی هێڵکاری
// ════════════════════════════════
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
        backgroundColor: "rgba(52,152,219,0.7)"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

// ════════════════════════════════
// بەستنەوەی دوگمەکان (Event Listeners)
// ════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    if(document.getElementById("btnLogin")) document.getElementById("btnLogin").addEventListener("click", window.login);
    if(document.getElementById("btnLogout")) document.getElementById("btnLogout").addEventListener("click", logout);
    
    if(document.getElementById("toggleAdminBtn")) document.getElementById("toggleAdminBtn").addEventListener("click", toggleAdminForm);
    if(document.getElementById("btnCreateStaff")) document.getElementById("btnCreateStaff").addEventListener("click", createStaff);
    
    if(document.getElementById("btnSaveEntry")) document.getElementById("btnSaveEntry").addEventListener("click", saveEntry);
    
    if(document.getElementById("btnLoadDaily")) document.getElementById("btnLoadDaily").addEventListener("click", loadDaily);
    if(document.getElementById("btnExportDailyExcel")) document.getElementById("btnExportDailyExcel").addEventListener("click", exportDailyExcel);
    if(document.getElementById("btnExportDailyPDF")) document.getElementById("btnExportDailyPDF").addEventListener("click", exportDailyPDF);
    
    if(document.getElementById("btnLoadWeekly")) document.getElementById("btnLoadWeekly").addEventListener("click", loadWeekly);
    if(document.getElementById("btnExportWeeklyExcel")) document.getElementById("btnExportWeeklyExcel").addEventListener("click", exportWeeklyExcel);
    if(document.getElementById("btnExportWeeklyPDF")) document.getElementById("btnExportWeeklyPDF").addEventListener("click", exportWeeklyPDF);
});
