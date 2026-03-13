import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc, setDoc, deleteDoc, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// 🔴 ئەمانە بگۆڕە بە زانیارییەکانی Firebase ی خۆت
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

// ════════════════════════════════
//  بەشی لۆگین و چاودێریکردن
// ════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    
    let displayName = user.email.split('@')[0];
    document.getElementById("currentUserName").textContent = "👤 " + displayName;

    const userDoc = await getDoc(doc(db, "users", user.email));
    if (userDoc.exists() && userDoc.data().role === "admin") {
      document.getElementById("adminSection").style.display = "block";
    } else {
      document.getElementById("adminSection").style.display = "none";
    }

    // 1️⃣ خانەی ڕێکەوت بە ئۆتۆماتیکی دانەنرێت بە ئەمڕۆ
    setTodayDate();
  } else {
    currentUser = null;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
  }
});

// 1️⃣ فەنکشنی دانانی ڕێکەوتی ئەمڕۆ لە هەموو خانەکاندا
function setTodayDate() {
  const today = new Date().toISOString().split('T')[0]; // فۆرماتی YYYY-MM-DD
  document.getElementById("entryDate").value = today;
  document.getElementById("dailyFilterDate").value = today;
}

window.login = async function () {
  let email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("loginPassword").value;
  
  if (email && !email.includes('@')) {
    email = email + "@clinic.com";
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    document.getElementById("loginError").textContent = "❌ ناو یان پاسوۆرد هەڵەیە";
  }
};

window.logout = async function () {
  await signOut(auth);
};

// ════════════════════════════════
//  بەشی بەڕێوەبەر
// ════════════════════════════════
window.createStaff = async function () {
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
//  بەشی پاشکەوتکردنی داتا
// ════════════════════════════════
window.saveEntry = async function () {
  if (!currentUser) return;
  const count   = parseInt(document.getElementById("patientCount").value);
  const dateVal = document.getElementById("entryDate").value;
  const msg     = document.getElementById("statusMsg");

  if (isNaN(count) || !dateVal) {
    msg.textContent = "⚠️ تکایە هەموو خانەکان پڕبکەرەوە"; return;
  }
  const dateObj = new Date(dateVal);
  
  let staffSimpleName = currentUser.email.split('@')[0];

  try {
    await addDoc(collection(db, "entries"), {
      staff      : staffSimpleName,
      count      : count,
      date       : Timestamp.fromDate(dateObj),
      weekNumber : getWeekNumber(dateObj),
    });
    msg.textContent = "✅ بە سەرکەوتوویی پاشکەوت کرا!";
    msg.style.color = "green";
    document.getElementById("patientCount").value = "";
    // ڕێکەوتەکە بە ئەمڕۆ دەمێنێتەوە، ناسڕێتەوە
  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  }
};

// ════════════════════════════════
//  2️⃣ فەنکشنی ئاماری بەپێی ڕۆژ (تەنها بۆ کارمەندی لۆگین کراو)
// ════════════════════════════════
async function fetchDailyForCurrentUser() {
  const dateVal = document.getElementById("dailyFilterDate").value;
  if (!dateVal) {
    alert("تکایە ڕێکەوتێک هەڵبژێرە");
    return null;
  }

  const selectedDate = new Date(dateVal);
  selectedDate.setHours(0,0,0,0);
  const nextDay = new Date(selectedDate);
  nextDay.setDate(selectedDate.getDate() + 1);

  const staffName = currentUser.email.split('@')[0];

  return getDocs(query(
    collection(db, "entries"),
    where("staff", "==", staffName),
    where("date", ">=", Timestamp.fromDate(selectedDate)),
    where("date", "<", Timestamp.fromDate(nextDay))
  ));
}

window.loadDaily = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap) return;

  const output = document.getElementById("dailyOutput");
  if (snap.empty) {
    output.innerHTML = "<p>هیچ تۆمارێک نییە بۆ ئەم ڕۆژە</p>";
    return;
  }

  let html = "<table><tr><th>ژمارەی نەخۆش</th><th>ڕێکەوت</th><th>کردارەکان</th></tr>";
  let total = 0;

  snap.forEach(d => {
    const data = d.data();
    const docId = d.id;
    total += data.count;
    html += `<tr>
      <td>${data.count}</td>
      <td>${data.date.toDate().toLocaleDateString("en-GB")}</td>
      <td>
        <button onclick="editEntry('${docId}', ${data.count})" style="font-size:12px; padding:4px 8px;">✏️ گۆڕین</button>
        <button onclick="deleteEntry('${docId}')" style="font-size:12px; padding:4px 8px; background:#e74c3c;">🗑️ سڕینەوە</button>
      </td>
    </tr>`;
  });

  html += `<tr class="total-row"><td>کۆی گشتی</td><td>${total}</td><td>-</td></tr></table>`;
  output.innerHTML = html;
};

// گۆڕینی تۆمار
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
    loadDaily(); // ڕیفرێشی خشتەکە
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  }
};

// سڕینەوەی تۆمار
window.deleteEntry = async function(docId) {
  if (!confirm("دڵنیایت لە سڕینەوەی ئەم تۆمارە؟")) return;

  try {
    await deleteDoc(doc(db, "entries", docId));
    alert("✅ بە سەرکەوتوویی سڕایەوە!");
    loadDaily();
  } catch (e) {
    alert("❌ هەڵە: " + e.message);
  }
};

window.exportDailyExcel = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const data = [["ژمارەی نەخۆش", "ڕێکەوت"]];
  let total = 0;

  snap.forEach(d => {
    const x = d.data();
    data.push([x.count, x.date.toDate().toLocaleDateString("en-GB")]);
    total += x.count;
  });

  data.push(["کۆی گشتی", total]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "ئاماری ڕۆژانە");
  XLSX.writeFile(wb, `daily_${document.getElementById("dailyFilterDate").value}.xlsx`);
};

window.exportDailyPDF = async function () {
  const snap = await fetchDailyForCurrentUser();
  if (!snap || snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Daily Statistics", 14, 15);

  const rows = [];
  snap.forEach(d => {
    const x = d.data();
    rows.push([x.count, x.date.toDate().toLocaleDateString("en-GB")]);
  });

  doc.autoTable({
    head: [["Patients", "Date"]],
    body: rows,
    startY: 25,
    headStyles: { fillColor: [52, 152, 219] },
    styles: { fontSize: 9 }
  });

  doc.save(`daily_${document.getElementById("dailyFilterDate").value}.pdf`);
};

// ════════════════════════════════
//  3️⃣ ئاماری هەفتانە + کۆی گشتی لە Excel
// ════════════════════════════════
async function fetchWeekly() {
  return getDocs(query(collection(db, "entries"), where("weekNumber", "==", getWeekNumber(new Date()))));
}

window.loadWeekly = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) {
    document.getElementById("weeklyOutput").innerHTML = "<p>هیچ تۆمارێک نییە</p>";
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

window.exportWeeklyExcel = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { alert("هیچ داتایەک نییە!"); return; }

  const totals = {};
  snap.forEach(d => {
    const x = d.data();
    totals[x.staff] = (totals[x.staff] || 0) + x.count;
  });

  const data = [["کارمەند", "کۆی نەخۆشان"]];
  let grandTotal = 0;

  for (const [staff, count] of Object.entries(totals)) {
    data.push([staff, count]);
    grandTotal += count;
  }

  // 3️⃣ زیادکردنی ڕیزی کۆی گشتی
  data.push(["کۆی گشتی", grandTotal]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "هەفتانە");
  XLSX.writeFile(wb, "weekly_stats.xlsx");
};

window.exportWeeklyPDF = async function () {
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
  pdfDoc.text("Weekly Statistics", 14, 15);

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
