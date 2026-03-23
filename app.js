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

// app دووەم بۆ دروستکردنی کارمەند بەبێ لۆگئاوتکردنی ئەدمین
const secondaryApp  = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

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
    populateWeekDropdown();
    // پیشاندان تەنها کاتێک کلیک بکرێت، نەک خۆکار
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
    // secondaryAuth بەکاردەهێنین — ئەدمین لۆگئاوت نابێت
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    
    // زانیاری کارمەند لە Firestore پاشکەوت بکە
    await setDoc(doc(db, "users", email), {
      role: "staff",
      createdAt: Timestamp.now()
    });

    // ئەکاونتی secondary لۆگئاوت بکە (بەبێ کارت نییە)
    await signOut(secondaryAuth);

    msg.textContent = "✅ کارمەندی نوێ بە سەرکەوتوویی دروستکرا!";
    msg.style.color = "green";
    document.getElementById("newStaffEmail").value = "";
    document.getElementById("newStaffPassword").value = "";
    setTimeout(() => { msg.textContent = ""; }, 4000);

  } catch (e) {
    if (e.code === "auth/email-already-in-use") {
      msg.textContent = "❌ ئەم ناوە پێشتر تۆمارکراوە!";
    } else {
      msg.textContent = "❌ هەڵە: " + e.message;
    }
    msg.style.color = "red";
  }
};

// ════════════════════════════════
// بەشی دوگمەی + و -
// ════════════════════════════════
window.changeCount = function(fieldId, amount) {
    const input = document.getElementById(fieldId);
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
  const countAdult = parseInt(document.getElementById("patientCountAdult").value) || 0;
  const countChild = parseInt(document.getElementById("patientCountChild").value) || 0;
  const dateVal = document.getElementById("entryDate").value;
  const msg     = document.getElementById("statusMsg");

  if (!dateVal) {
    msg.textContent = "⚠️ تکایە ڕێکەوت دیاری بکە"; return;
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

  // ئاگاداری تۆمارکراوی ئەم ڕۆژە
  const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  const dayEnd   = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  try {
    const existing = await getDocs(query(
      collection(db, "entries"),
      where("staff", "==", staffSimpleName),
      where("date", ">=", Timestamp.fromDate(dayStart)),
      where("date", "<=", Timestamp.fromDate(dayEnd))
    ));
    if (!existing.empty) {
      const go = confirm(`⚠️ ئەم ڕۆژە (${dateVal}) پێشتر تۆمار کراوە!\nئایا دەتەوێت دووبارە تۆمار بکەی؟`);
      if (!go) return;
    }
  } catch(e) { /* بەردەوامبە */ }

  try {
    await addDoc(collection(db, "entries"), {
      staff      : staffSimpleName,
      countAdult : countAdult,
      countChild : countChild,
      count      : countAdult + countChild,  // کۆی گشتی بۆ گەڕانی کۆنەکان
      date       : Timestamp.fromDate(dateObj),
      weekNumber : getWeekNumber(dateObj),
    });
    msg.textContent = "✅ بە سەرکەوتوویی پاشکەوت کرا!";
    msg.style.color = "green";
    document.getElementById("patientCountAdult").value = "0";
    document.getElementById("patientCountChild").value = "0";
    // پەیام دوای ٣ چرکە نەمێنێت
    setTimeout(() => { msg.textContent = ""; }, 3000);
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

  // هەموو داتاکانی ئەو ڕۆژە دەهێنێت، فلتەری staff لە کۆددا دەکرێت
  return getDocs(query(
    collection(db, "entries"),
    where("date", ">=", Timestamp.fromDate(selectedDate)),
    where("date", "<=", Timestamp.fromDate(nextDay))
  ));
}

const loadDaily = async function () {
  const output = document.getElementById("dailyOutput");

  // ئەگەر ئێستا داتا نیشاندراوە، بیشارەوە (toggle)
  if (output.innerHTML.trim() !== "") {
    output.innerHTML = "";
    return;
  }

  const snap = await fetchDailyForCurrentUser();
  if (!snap) return;

  if (snap.empty) {
    output.innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە بۆ ئەم ڕۆژە</p>";
    return;
  }

  const staffName = currentUser.email.toLowerCase().split('@')[0];

  let html = "<table><tr><th>کارمەند</th><th>🧑 گەورە</th><th>🧒 منال</th><th>کۆی گشتی</th><th>ڕێکەوت</th><th>کردارەکان</th></tr>";
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

    html += `<tr>
      <td>${data.staff}</td>
      <td>${adult}</td>
      <td>${child}</td>
      <td><strong>${total}</strong></td>
      <td style="direction: ltr;">${data.date.toDate().toLocaleDateString("en-GB")}</td>
      <td>${actionButtons}</td>
    </tr>`;
  });

  html += `<tr class="total-row"><td>کۆی گشتی</td><td>${totalAdult}</td><td>${totalChild}</td><td><strong>${totalAll}</strong></td><td>-</td><td>-</td></tr></table>`;
  output.innerHTML = html;
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

  try {
    await setDoc(doc(db, "entries", docId), { 
      countAdult: adultVal, 
      countChild: childVal,
      count: adultVal + childVal
    }, { merge: true });
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

const exportDailyPDF = async function () {
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
    // پیشاندان تەنها کاتێک دوگمەی "پیشاندان" کلیک بکرێت
};

async function fetchWeekly() {
  // تەنها ئەو داتایانە دەهێنێت کە ژمارەی هەفتەکەیان یەکسانە بە هەفتەی هەڵبژێردراو
  return getDocs(query(collection(db, "entries"), where("weekNumber", "==", selectedWeekNumber)));
}

const loadWeekly = async function () {
  const weeklyOutput = document.getElementById("weeklyOutput");

  // toggle: ئەگەر نیشاندراوە بیشارەوە
  if (weeklyOutput.innerHTML.trim() !== "") {
    weeklyOutput.innerHTML = "";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const snap = await fetchWeekly();
  if (snap.empty) {
    document.getElementById("weeklyOutput").innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم هەفتەیەدا</p>";
    if (chartInstance) chartInstance.destroy();
    return;
  }

  const staffName = currentUser ? currentUser.email.toLowerCase().split('@')[0] : "";

  // totals: { staffName: { adult, child, dates:[] } }
  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    if (!totals[x.staff]) totals[x.staff] = { adult: 0, child: 0, dates: [] };
    totals[x.staff].adult += x.countAdult ?? x.count ?? 0;
    totals[x.staff].child += x.countChild ?? 0;
    totals[x.staff].dates.push(x.date.toDate().toLocaleDateString("en-GB"));
  });

  if (Object.keys(totals).length === 0) {
    document.getElementById("weeklyOutput").innerHTML = "<p style='text-align:center;'>هیچ تۆمارێک نییە لەم هەفتەیەدا</p>";
    if (chartInstance) chartInstance.destroy();
    return;
  }

  let html = "<table><tr><th>کارمەند</th><th>🧑 گەورە</th><th>🧒 منال</th><th>کۆی گشتی</th><th>بەروارەکان</th></tr>";
  const chartLabels = [], chartData = [];
  let grandAdult = 0, grandChild = 0;

  for (const [s, t] of Object.entries(totals)) {
    const total = t.adult + t.child;
    const datesStr = [...new Set(t.dates)].join(" | ");
    html += `<tr><td>${s}</td><td>${t.adult}</td><td>${t.child}</td><td><strong>${total}</strong></td><td style="direction:ltr; font-size:12px;">${datesStr}</td></tr>`;
    chartLabels.push(s);
    chartData.push(total);
    grandAdult += t.adult;
    grandChild += t.child;
  }

  if (isCurrentUserAdmin && Object.keys(totals).length > 1) {
    html += `<tr class="total-row"><td>کۆی گشتی</td><td>${grandAdult}</td><td>${grandChild}</td><td><strong>${grandAdult + grandChild}</strong></td><td>-</td></tr>`;
  }

  html += "</table>";
  document.getElementById("weeklyOutput").innerHTML = html;

  drawChart(chartLabels, chartData);
};

const exportWeeklyExcel = async function () {
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

const exportWeeklyPDF = async function () {
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