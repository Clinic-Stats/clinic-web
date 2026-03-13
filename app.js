import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc, setDoc, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// 🔴 ئەمانە بگۆڕە بە زانیارییەکانی Firebase ی خۆت کە کۆپیت کردبوون
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

// چالاککردنی دۆخی ئۆفلاین بۆ ئایفۆن
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
    document.getElementById("currentUserName").textContent = "👤 " + user.email;

    // پشکنین دەکات بزانێت ئایا ئەم کەسە بەڕێوەبەرە یان نا
    const userDoc = await getDoc(doc(db, "users", user.email));
    if (userDoc.exists() && userDoc.data().role === "admin") {
      document.getElementById("adminSection").style.display = "block";
    } else {
      document.getElementById("adminSection").style.display = "none";
    }
  } else {
    currentUser = null;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
  }
});

window.login = async function () {
  const email = document.getElementById("loginEmail").value;
  const pass  = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    document.getElementById("loginError").textContent = "❌ ئیمەیل یان پاسوۆرد هەڵەیە";
  }
};

window.logout = async function () {
  await signOut(auth);
};

// ════════════════════════════════
//  بەشی بەڕێوەبەر: دروستکردنی کارمەند
// ════════════════════════════════
window.createStaff = async function () {
  const email = document.getElementById("newStaffEmail").value;
  const pass = document.getElementById("newStaffPassword").value;
  const msg = document.getElementById("createStaffMsg");

  if (!email || pass.length < 6) {
    msg.textContent = "⚠️ ئیمەیل بنووسە و پاسوۆرد نابێت لە ٦ پیت کەمتر بێت.";
    msg.style.color = "red"; return;
  }

  msg.textContent = "⏳ چاوەڕێ بکە...";
  msg.style.color = "orange";

  try {
    // دروستکردنی ئەکاونتەکە لە Firebase
    await createUserWithEmailAndPassword(auth, email, pass);
    
    // تۆمارکردنی کارمەندەکە وەک "staff" لە داتابەیس
    await setDoc(doc(db, "users", email), {
      role: "staff",
      createdAt: Timestamp.now()
    });

    // کاتێک کارمەند دروست دەکرێت، Firebase بەخۆی دەچێتە ناو ئەکاونتە نوێیەکە.
    // بۆیە بەڕێوەبەرەکە فڕێ دەداتە دەرەوە و پێویستە سەرلەنوێ لۆگین بکاتەوە.
    alert("✅ ئەکاونتی کارمەندەکە بە سەرکەوتوویی دروستکرا!\n\nلەبەر هۆکاری ئاسایش، سیستەمەکە ئێستا لۆگئاوت دەبێت. تکایە دووبارە بە ئەکاونتی بەڕێوەبەر لۆگین بکەرەوە.");
    await signOut(auth);

  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  }
};

// ════════════════════════════════
//  بەشی پاشکەوتکردنی داتای نەخۆش
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
  try {
    await addDoc(collection(db, "entries"), {
      staff      : currentUser.email,
      count      : count,
      date       : Timestamp.fromDate(dateObj),
      weekNumber : getWeekNumber(dateObj),
    });
    msg.textContent = "✅ بە سەرکەوتوویی پاشکەوت کرا!";
    msg.style.color = "green";
    document.getElementById("patientCount").value = "";
  } catch (e) {
    msg.textContent = "❌ هەڵە: " + e.message;
    msg.style.color = "red";
  }
};

// ════════════════════════════════
//  فەنکشنەکانی ئامار و خشتەکان (وەک خۆیان ماونەتەوە)
// ════════════════════════════════
async function fetchToday() {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  return getDocs(query(collection(db,"entries"),
    where("date",">=",Timestamp.fromDate(today)), where("date","<", Timestamp.fromDate(tomorrow))));
}

window.loadDaily = async () => { const s=await fetchToday(); document.getElementById("dailyOutput").innerHTML = s.empty?"<p>هیچ تۆمارێک نییە</p>":buildTable(s); };
window.exportDailyExcel = async () => { const s=await fetchToday(); if(s.empty)return alert("هیچ داتایەک نییە!"); exportExcel(s,"daily_stats.xlsx","ئەمڕۆ"); };
window.exportDailyPDF = async () => { const s=await fetchToday(); if(s.empty)return alert("هیچ داتایەک نییە!"); exportPDF(s,"daily_stats.pdf","Daily Statistics"); };

async function fetchWeekly() {
  return getDocs(query(collection(db,"entries"), where("weekNumber","==",getWeekNumber(new Date()))));
}

window.loadWeekly = async function () {
  const snap = await fetchWeekly();
  if (snap.empty) { document.getElementById("weeklyOutput").innerHTML="<p>هیچ تۆمارێک نییە</p>"; return; }
  const totals = {};
  snap.forEach(d => { const x=d.data(); totals[x.staff]=(totals[x.staff]||0)+x.count; });
  let html = "<table><tr><th>کارمەند</th><th>کۆی هەفتەکە</th></tr>";
  for(const[s,t] of Object.entries(totals)) html+=`<tr><td>${s}</td><td>${t}</td></tr>`;
  html+="</table>";
  document.getElementById("weeklyOutput").innerHTML=html;
  drawChart(Object.keys(totals),Object.values(totals));
};
window.exportWeeklyExcel = async () => { const s=await fetchWeekly(); if(s.empty)return alert("هیچ داتایەک نییە!"); exportExcel(s,`weekly.xlsx`,"هەفتانە"); };
window.exportWeeklyPDF   = async () => { const s=await fetchWeekly(); if(s.empty)return alert("هیچ داتایەک نییە!"); exportPDF(s,`weekly.pdf`,"Weekly Statistics"); };

function buildTable(snap) {
  let html="<table><tr><th>کارمەند</th><th>نەخۆش</th><th>ڕێکەوت</th></tr>",total=0;
  snap.forEach(d=>{const x=d.data();html+=`<tr><td>${x.staff}</td><td>${x.count}</td><td>${x.date.toDate().toLocaleDateString("en-GB")}</td></tr>`;total+=x.count;});
  return html+`<tr class="total-row"><td>کۆی گشتی</td><td>${total}</td><td>-</td></tr></table>`;
}

function exportExcel(snap,filename,sheetName) {
  const data=[["کارمەند","ژمارەی نەخۆش","ڕێکەوت","هەفتە"]];
  snap.forEach(d=>{const x=d.data();data.push([x.staff,x.count,x.date.toDate().toLocaleDateString("en-GB"),x.weekNumber]);});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),sheetName);
  XLSX.writeFile(wb,filename);
}

function exportPDF(snap,filename,title) {
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(14); doc.text(title,14,15);
  const rows=[];
  snap.forEach(d=>{const x=d.data();rows.push([x.staff,x.count,x.date.toDate().toLocaleDateString("en-GB"),x.weekNumber]);});
  doc.autoTable({head:[["Staff","Patients","Date","Week"]],body:rows,startY:25,headStyles:{fillColor:[52,152,219]},styles:{fontSize:9}});
  doc.save(filename);
}

function drawChart(labels,data) {
  const ctx=document.getElementById("weeklyChart").getContext("2d");
  if(chartInstance)chartInstance.destroy();
  chartInstance=new Chart(ctx,{type:"bar",data:{labels,datasets:[{label:"نەخۆشان",data,backgroundColor:"rgba(52,152,219,0.7)"}]},options:{responsive:true,plugins:{legend:{display:false}}}});
}

function getWeekNumber(d) {
  const date=new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate()+3-(date.getDay()+6)%7);
  const w1=new Date(date.getFullYear(),0,4);
  return 1+Math.round(((date-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}
