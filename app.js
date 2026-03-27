import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc, setDoc, deleteDoc, enableIndexedDbPersistence, orderBy } 
  from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail }
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

// ============================================
// PRIMARY APP (ئەدمین لێرە چوونەژوورەوە دەکات)
// ============================================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================================
// SECONDARY APP (بۆ دروستکردنی یوزەری نوێ بێ گۆڕینی session ی ئەدمین)
// ============================================
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

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
// MODAL FUNCTIONS
// ============================================
window.showModal = function(title, content) {
  const existingModal = document.getElementById('customModal');
  if (existingModal) existingModal.remove();
  
  const isDark = document.body.classList.contains('dark-mode');
  const modalHtml = `
    <div id="customModal" class="modal-overlay">
      <div class="modal-container" style="background: ${isDark ? '#16213e' : 'white'}; color: ${isDark ? '#eee' : '#2c3e50'};">
        <h3 style="margin-bottom: 15px;">${title}</h3>
        <div>${content}</div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  document.getElementById('customModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('customModal')) {
      window.closeModal();
    }
  });
};

window.closeModal = function() {
  const modal = document.getElementById('customModal');
  if (modal) modal.remove();
};

// ============================================
// THEME MANAGEMENT
// ============================================
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.innerHTML = '🌙';
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
// HELPER FUNCTIONS
// ============================================
function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function getLocalISODate(dateObj) {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return (new Date(dateObj.getTime() - offset)).toISOString().split('T')[0];
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
      document.getElementById("qrCodeSection").style.display = "block";
      await loadStaffList();
      addUserManagementButton();
    } else {
      document.getElementById("adminSection").style.display = "none";
      document.getElementById("searchSection").style.display = "none";
      document.getElementById("backupSection").style.display = "none";
      document.getElementById("qrCodeSection").style.display = "none";
    }

    setTodayDate();
    populateWeekDropdown();
    populateMonthDropdown();
    checkTodaySaved();
    applyTheme(currentTheme);
    
    const outputIds = ["dailyOutput", "weeklyOutput", "monthlyOutput", "searchOutput"];
    outputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });
    const weeklyChart = document.getElementById("weeklyChartContainer");
    if (weeklyChart) weeklyChart.style.display = "none";
    const monthlyChart = document.getElementById("monthlyChartContainer");
    if (monthlyChart) monthlyChart.style.display = "none";
  } else {
    currentUser = null;
    isCurrentUserAdmin = false;
    todayAlreadySaved = false;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
  }
});

// Add User Management Button
function addUserManagementButton() {
  const existingBtn = document.getElementById('userManagementBtn');
  if (existingBtn) {
    existingBtn.onclick = window.showUserManagement;
    return;
  }
  const adminSection = document.getElementById('adminSection');
  if (adminSection) {
    const userMgmtBtn = document.createElement('button');
    userMgmtBtn.id = 'userManagementBtn';
    userMgmtBtn.innerHTML = '👥 بەڕێوەبردنی بەکارهێنەران';
    userMgmtBtn.style.background = '#9b59b6';
    userMgmtBtn.style.marginBottom = '10px';
    userMgmtBtn.onclick = window.showUserManagement;
    adminSection.insertBefore(userMgmtBtn, adminSection.firstChild);
  }
}

// ============================================
// LOAD STAFF LIST
// ============================================
async function loadStaffList() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    allStaffList = [];
    usersSnap.forEach(d => {
      const staffName = d.id.split('@')[0];
      allStaffList.push(staffName);
    });
    allStaffList.sort();
    
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
  } catch (e) {
    console.error("Error loading staff list:", e);
  }
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
// SET DATE
// ============================================
function setTodayDate() {
  const todayStr = getLocalISODate(new Date());
  document.getElementById("entryDate").value = todayStr;
  document.getElementById("dailyFilterDate").value = todayStr;
}

// ============================================
// USER MANAGEMENT PANEL (FOR ADMIN ONLY)
// ============================================
async function loadAllUsers() {
  if (!isCurrentUserAdmin) return [];
  
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const usersList = [];
    
    usersSnap.forEach(d => {
      usersList.push({
        email: d.id,
        role: d.data().role || "staff",
        createdAt: d.data().createdAt
      });
    });
    
    return usersList;
  } catch (error) {
    console.error("Error loading users:", error);
    return [];
  }
}

window.showUserManagement = async function() {
  if (!isCurrentUserAdmin) {
    alert("تەنها بەڕێوەبەر دەتوانێت ئەم بەشە ببینێت!");
    return;
  }
  
  showLoading();
  const users = await loadAllUsers();
  hideLoading();
  
  let usersHtml = `
    <div style="direction: rtl; max-height: 70vh; overflow-y: auto;">
      <div style="margin-bottom: 20px;">
        <button onclick="showAddUserForm()" style="background: #27ae60; width: 100%; padding: 12px; font-size: 16px; margin:0;">
          ➕ زیادکردنی بەکارهێنەری نوێ
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
  `;
  
  for (const user of users) {
    const isCurrentUserAdminAccount = user.email === currentUser.email;
    const createdAtStr = user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString('ku') : '-';
    
    usersHtml += `
      <div class="user-card" style="border: 1px solid #ddd; border-radius: 12px; padding: 15px; background: ${isCurrentUserAdminAccount ? '#fef9e6' : '#fff'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="flex: 2;">
            <div style="font-weight: bold; font-size: 16px;">👤 ${user.email}</div>
            <div style="margin-top: 8px;">
              <span style="padding: 3px 8px; border-radius: 6px; background: ${user.role === 'admin' ? '#f39c12' : '#3498db'}; color: white; font-size: 12px;">
                ${user.role === 'admin' ? '👑 ئەدمین' : '👤 ستاف'}
              </span>
              <span style="color: #888; font-size: 12px; margin-right: 10px;">📅 ${createdAtStr}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="editUserRole('${user.email}', '${user.role}')" style="width: auto; padding: 6px 12px; margin: 0; background: #f39c12; font-size: 12px;">
              🔄 گۆڕینی ڕۆڵ
            </button>
            <button onclick="showChangePasswordForm('${user.email}')" style="width: auto; padding: 6px 12px; margin: 0; background: #3498db; font-size: 12px;">
              🔐 گۆڕینی پاسۆرد
            </button>
            <button onclick="showChangeEmailForm('${user.email}')" style="width: auto; padding: 6px 12px; margin: 0; background: #27ae60; font-size: 12px;">
              ✉️ گۆڕینی ئیمەیڵ
            </button>
            ${!isCurrentUserAdminAccount ? `
              <button onclick="deleteUserAccount('${user.email}')" style="width: auto; padding: 6px 12px; margin: 0; background: #e74c3c; font-size: 12px;">
                🗑️ سڕینەوە
              </button>
            ` : '<span style="font-size: 12px; color: #f39c12;">(ئەم ئەکاونتە)</span>'}
          </div>
        </div>
      </div>
    `;
  }
  
  usersHtml += `</div></div>`;
  window.showModal('👥 بەڕێوەبردنی بەکارهێنەران', usersHtml);
};

window.showAddUserForm = function() {
  window.closeModal();
  
  const formHtml = `
    <div style="direction: rtl;">
      <h3 style="margin-bottom: 15px;">➕ زیادکردنی بەکارهێنەری نوێ</h3>
      <label>ناوی بەکارهێنەر:</label>
      <input type="text" id="newUserEmail" placeholder="نموونە: naza" style="width: 100%; padding: 10px; margin-bottom: 5px; border-radius: 8px; border: 1px solid #ccc;">
      <p style="font-size: 12px; color: #666; margin-bottom: 10px;">🔹 @clinic.com بە شێوەی ئۆتۆماتیکی زیاد دەکرێت</p>
      <label>پاسۆرد:</label>
      <input type="password" id="newUserPassword" placeholder="لانی کەم ٦ پیت" style="width: 100%; padding: 10px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #ccc;">
      <label>ڕۆڵ:</label>
      <select id="newUserRole" style="width: 100%; padding: 10px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #ccc;">
        <option value="staff">👤 ستاف (ئاسایی)</option>
        <option value="admin">👑 ئەدمین (بەڕێوەبەر)</option>
      </select>
      <div style="display: flex; gap: 10px;">
        <button onclick="createNewUser()" style="background: #27ae60; flex: 1; margin:0;">✔️ دروستکردن</button>
        <button onclick="window.closeModal()" style="background: #95a5a6; flex: 1; margin:0;">❌ پاشگەزبوونەوە</button>
      </div>
      <p id="addUserMsg" style="margin-top: 10px; font-size: 13px;"></p>
    </div>
  `;
  
  window.showModal('➕ زیادکردنی بەکارهێنەر', formHtml);
};

// ============================================
// CREATE NEW USER — بە secondary app بۆ ئەوەی session ی ئەدمین نەگۆڕێت
// ============================================
window.createNewUser = async function() {
  let email = document.getElementById('newUserEmail')?.value.trim();
  const password = document.getElementById('newUserPassword')?.value;
  const role = document.getElementById('newUserRole')?.value;
  const msgEl = document.getElementById('addUserMsg');
  
  if (!email) {
    msgEl.textContent = '⚠️ تکایە ناوی بەکارهێنەر بنووسە';
    msgEl.style.color = 'red';
    return;
  }
  
  if (!password || password.length < 6) {
    msgEl.textContent = '⚠️ پاسۆرد دەبێت لانی کەم ٦ پیت بێت';
    msgEl.style.color = 'red';
    return;
  }
  
  if (!email.includes('@')) {
    email = email + '@clinic.com';
  }
  
  msgEl.textContent = '⏳ چاوەڕێ بکە...';
  msgEl.style.color = 'orange';
  showLoading();
  
  try {
    // بەکارهێنانی secondaryAuth بۆ دروستکردنی ئەکاونتی نوێ
    // ئەمە session ی ئەدمینەکە نادەگۆڕێت
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    
    // دوای دروستکردن، sign out بکە لە secondary app
    await secondaryAuth.signOut();
    
    // زانیاری یوزەر بنووسە لە Firestore
    await setDoc(doc(db, "users", email), {
      role: role,
      createdAt: Timestamp.now()
    });
    
    msgEl.textContent = '✅ بەکارهێنەر بە سەرکەوتوویی دروستکرا!';
    msgEl.style.color = 'green';
    
    setTimeout(() => {
      window.closeModal();
      window.showUserManagement();
    }, 1500);
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'auth/email-already-in-use') {
      msgEl.textContent = '❌ ئەم ئیمەیڵە پێشتر تۆمار کراوە';
    } else {
      msgEl.textContent = '❌ هەڵە: ' + error.message;
    }
    msgEl.style.color = 'red';
  } finally {
    hideLoading();
  }
};

// Edit User Role
window.editUserRole = async function(email, currentRole) {
  const newRole = currentRole === 'admin' ? 'staff' : 'admin';
  const roleName = newRole === 'admin' ? 'ئەدمین' : 'ستاف';
  
  if (!confirm(`دڵنیایت لە گۆڕینی ڕۆڵی ${email} بۆ "${roleName}"؟`)) return;
  
  showLoading();
  try {
    await setDoc(doc(db, "users", email), { role: newRole }, { merge: true });
    alert(`✅ ڕۆڵی ${email} گۆڕدرا بۆ ${roleName}`);
    window.showUserManagement();
  } catch (error) {
    alert('❌ هەڵە: ' + error.message);
  } finally {
    hideLoading();
  }
};

// Show Change Password Form
window.showChangePasswordForm = function(email) {
  window.closeModal();
  
  const formHtml = `
    <div style="direction: rtl;">
      <h3 style="margin-bottom: 15px;">🔐 گۆڕینی پاسۆرد</h3>
      <p style="margin-bottom: 10px; color: #3498db;">بەکارهێنەر: <strong>${email}</strong></p>
      <p style="margin-bottom: 15px; font-size: 13px; color: #e67e22;">📧 لینکی گۆڕینی پاسۆرد بۆ ئیمەیڵی بەکارهێنەر دەنێردرێت</p>
      <div style="display: flex; gap: 10px;">
        <button onclick="sendPasswordResetToUser('${email}')" style="background: #27ae60; flex: 1; margin:0;">📧 ناردنی لینک</button>
        <button onclick="window.closeModal()" style="background: #95a5a6; flex: 1; margin:0;">❌ داخستن</button>
      </div>
      <p id="changePwdMsg" style="margin-top: 10px; font-size: 13px;"></p>
    </div>
  `;
  
  window.showModal('🔐 گۆڕینی پاسۆرد', formHtml);
};

// Send Password Reset Email
window.sendPasswordResetToUser = async function(email) {
  const msgEl = document.getElementById('changePwdMsg');
  
  msgEl.textContent = '⏳ چاوەڕێ بکە...';
  msgEl.style.color = 'orange';
  showLoading();
  
  try {
    await sendPasswordResetEmail(auth, email);
    msgEl.textContent = '✅ لینکی گۆڕینی پاسۆرد نێردرا بۆ ئیمەیڵی بەکارهێنەر!';
    msgEl.style.color = 'green';
    setTimeout(() => window.closeModal(), 2000);
  } catch (error) {
    console.error('Error:', error);
    if (error.code === 'auth/user-not-found') {
      msgEl.textContent = '❌ بەکارهێنەر نەدۆزرایەوە';
    } else {
      msgEl.textContent = '❌ هەڵە: ' + error.message;
    }
    msgEl.style.color = 'red';
  } finally {
    hideLoading();
  }
};

// Show Change Email Form
window.showChangeEmailForm = function(oldEmail) {
  window.closeModal();
  
  const formHtml = `
    <div style="direction: rtl;">
      <h3 style="margin-bottom: 15px;">✉️ گۆڕینی ئیمەیڵ</h3>
      <p style="margin-bottom: 15px;">ئیمەیڵی ئێستا: <strong>${oldEmail}</strong></p>
      
      <label>ناوی نوێ (بێ @clinic.com):</label>
      <input type="text" id="newUserEmailAddress" placeholder="نموونە: naza2" style="width: 100%; padding: 10px; margin-bottom: 5px; border-radius: 8px; border: 1px solid #ccc;">
      <p style="font-size: 12px; color: #666; margin-bottom: 10px;">🔹 @clinic.com بە شێوەی ئۆتۆماتیکی زیاد دەکرێت</p>
      
      <label>پاسۆردی نوێ (بۆ ئەکاونتە نوێیەکە):</label>
      <input type="password" id="newUserEmailPassword" placeholder="لانی کەم ٦ پیت" style="width: 100%; padding: 10px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #ccc;">
      
      <div style="display: flex; gap: 10px;">
        <button onclick="updateUserEmail('${oldEmail}')" style="background: #27ae60; flex: 1; margin:0;">✔️ گۆڕین</button>
        <button onclick="window.closeModal()" style="background: #95a5a6; flex: 1; margin:0;">❌ داخستن</button>
      </div>
      <p id="changeEmailMsg" style="margin-top: 10px; font-size: 13px;"></p>
      <p style="margin-top: 8px; font-size: 11px; color: #e74c3c;">⚠️ تێبینی: ئەکاونتە کۆنەکە دەسڕێتەوە و ئەکاونتێکی نوێ دروست دەکرێت</p>
    </div>
  `;
  
  window.showModal('✉️ گۆڕینی ئیمەیڵ', formHtml);
};

// ============================================
// UPDATE USER EMAIL — چارەسەرکراو: secondary app بەکارهاتووە
// کێشەی کۆن: createUserWithEmailAndPassword لە primary auth دەکرا
//              و ئەدمینەکە sign out دەبوو
// چارەسەر: secondaryAuth بەکارهاتووە بۆ دروستکردنی ئەکاونتی نوێ
//           بێ گۆڕینی session ی ئەدمین
// ============================================
window.updateUserEmail = async function(oldEmail) {
  let newEmailInput = document.getElementById('newUserEmailAddress')?.value.trim();
  const newPassword = document.getElementById('newUserEmailPassword')?.value;
  const msgEl = document.getElementById('changeEmailMsg');
  
  if (!newEmailInput) {
    msgEl.textContent = '⚠️ تکایە ناوی نوێ بنووسە';
    msgEl.style.color = 'red';
    return;
  }
  
  // ئۆتۆماتیکی @clinic.com زیاد بکە ئەگەر نەبوو
  let newEmail = newEmailInput;
  if (!newEmail.includes('@')) {
    newEmail = newEmail + '@clinic.com';
  }
  
  if (newEmail === oldEmail) {
    msgEl.textContent = '⚠️ ئیمەیڵی نوێ وەک ئیمەیڵی کۆن نابێت';
    msgEl.style.color = 'red';
    return;
  }
  
  if (!newPassword || newPassword.length < 6) {
    msgEl.textContent = '⚠️ پاسۆرد دەبێت لانی کەم ٦ پیت بێت';
    msgEl.style.color = 'red';
    return;
  }
  
  msgEl.textContent = '⏳ چاوەڕێ بکە...';
  msgEl.style.color = 'orange';
  showLoading();
  
  try {
    // زانیاری ئەکاونتە کۆنەکە بخوێنەوە
    const userDoc = await getDoc(doc(db, "users", oldEmail));
    const userRole = userDoc.exists() ? userDoc.data().role : 'staff';
    
    // === چارەسەر: بەکارهێنانی secondaryAuth ===
    // ئەمە ئەکاونتی نوێ دروست دەکات بێ گۆڕینی session ی ئەدمین
    await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
    
    // دوای دروستکردن، sign out بکە لە secondary app
    await secondaryAuth.signOut();
    
    // زانیاری نوێ بنووسە لە Firestore
    await setDoc(doc(db, "users", newEmail), {
      role: userRole,
      createdAt: Timestamp.now()
    });
    
    // ئەکاونتە کۆنەکە لە Firestore بسڕەوە
    await deleteDoc(doc(db, "users", oldEmail));
    
    msgEl.textContent = '✅ ئیمەیڵ گۆڕدرا! بەکارهێنەر دەبێت بە ئیمەیڵی نوێ بچێتە ژوورەوە';
    msgEl.style.color = 'green';
    
    setTimeout(() => {
      window.closeModal();
      window.showUserManagement();
    }, 2000);
  } catch (error) {
    console.error('Error:', error);
    // sign out بکە لە secondary app ئەگەر هەڵە ڕووی دا
    try { await secondaryAuth.signOut(); } catch(e) {}
    
    if (error.code === 'auth/email-already-in-use') {
      msgEl.textContent = '❌ ئەم ئیمەیڵە پێشتر تۆمار کراوە';
    } else if (error.code === 'auth/invalid-email') {
      msgEl.textContent = '❌ ئیمەیڵەکە هەڵەیە';
    } else {
      msgEl.textContent = '❌ هەڵە: ' + error.message;
    }
    msgEl.style.color = 'red';
  } finally {
    hideLoading();
  }
};

// Delete User Account (Firestore only)
window.deleteUserAccount = async function(email) {
  if (!confirm(`⚠️ دڵنیایت لە سڕینەوەی بەکارهێنەر "${email}"؟\nئەم کردارە گەڕانەوەی نییە!`)) return;
  
  showLoading();
  try {
    await deleteDoc(doc(db, "users", email));
    alert(`✅ بەکارهێنەر ${email} لە سیستەم سڕایەوە!\n\n⚠️ تێبینی گرنگ: بۆ ئەوەی ئەم کەسە نەتوانێت دووبارە چوونەژوورەوە بکات، پێویستە لە Firebase Console Disable بکەیت.`);
    window.showUserManagement();
  } catch (error) {
    alert('❌ هەڵە: ' + error.message);
  } finally {
    hideLoading();
  }
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

// ============================================
// CREATE STAFF — بە secondary app بۆ ئەوەی session ی ئەدمین نەگۆڕێت
// ============================================
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
    // بەکارهێنانی secondaryAuth بۆ ئەوەی ئەدمین sign out نەبێت
    await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await secondaryAuth.signOut();
    
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
    try { await secondaryAuth.signOut(); } catch(ex) {}
    if (e.code === 'auth/email-already-in-use') {
      msg.textContent = "❌ ئەم ئیمەیڵە پێشتر تۆمار کراوە";
    } else {
      msg.textContent = "❌ هەڵە: " + e.message;
    }
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
    // پشکنین: ئایا ڕێکەوت داهاتووە؟
    const dateVal = document.getElementById("entryDate").value;
    if (dateVal) {
      const parts = dateVal.split('-');
      const chosen = new Date(parts[0], parts[1] - 1, parts[2]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (chosen > today) {
        // پەیامی ئاگادارکردنەوە پیشان بدە
        const msg = document.getElementById("statusMsg");
        msg.textContent = "⛔ ناتوانیت بۆ ڕێکەوتی داهاتوو تۆمار بکەیت!";
        msg.style.color = "red";
        setTimeout(() => { if(msg.textContent.includes('داهاتوو')) msg.textContent = ""; }, 3000);

        // دڵەڕاوکێ (shake) بکە دوگمەی +
        const btn = document.querySelector(`button[onclick*="${fieldId}"][onclick*="+1"], button[onclick*="${fieldId}"][onclick*="1)"]`);
        // بجوڵێنە بە ئینپوتەکە
        const input = document.getElementById(fieldId);
        if (input) {
          input.style.transition = "transform 0.1s";
          const shakes = [6, -6, 5, -5, 3, -3, 0];
          let i = 0;
          const shakeInterval = setInterval(() => {
            input.style.transform = `translateX(${shakes[i]}px)`;
            i++;
            if (i >= shakes.length) {
              clearInterval(shakeInterval);
              input.style.transform = "translateX(0)";
            }
          }, 60);
        }
        return;
      }
    }

    // پشکنین: ئایا پێشتر تۆمار کراوە؟
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
  const countAdult = parseInt(document.getElementById("patientCountAdult").value) || 0;
  const countChild = parseInt(document.getElementById("patientCountChild").value) || 0;
  const dateVal = document.getElementById("entryDate").value;
  const msg = document.getElementById("statusMsg");

  if (!dateVal) {
    msg.textContent = "⚠️ تکایە ڕێکەوت هەڵبژێرە!";
    msg.style.color = "red";
    setTimeout(() => { msg.textContent = ""; }, 3000);
    return;
  }

  const parts = dateVal.split('-');
  const chosen = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0,0,0,0);

  if (chosen > today) {
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
      msg.textContent = "⛔ ئەم ڕۆژە پێشتر تۆمار کراوە!";
      msg.style.color = "red";
      setTimeout(() => { msg.textContent = ""; }, 3000);
      hideLoading();
      return;
    }

    const weekNo = getWeekNumber(dateObj);
    await addDoc(collection(db, "entries"), {
      staff: staffSimpleName,
      countAdult: countAdult,
      countChild: countChild,
      date: Timestamp.fromDate(dateObj),
      weekNumber: weekNo,
      month: dateObj.getMonth(),
      year: dateObj.getFullYear()
    });

    msg.textContent = "✅ تۆمار کرا!";
    msg.style.color = "green";
    document.getElementById("patientCountAdult").value = 0;
    document.getElementById("patientCountChild").value = 0;
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
  showLoading();
  const snap = await fetchDailyForCurrentUser();
  const output = document.getElementById("dailyOutput");

  if (!snap || snap.empty) {
    output.innerHTML = "هیچ تۆمارێک نییە بۆ ئەم ڕۆژە";
    hideLoading();
    return;
  }

  const staffName = currentUser.email.toLowerCase().split('@')[0];

  let html = `<table><thead><tr>
    <th>کارمەند</th>
    <th>🧑 گەورە</th>
    <th>🧒 منال</th>
    <th>کۆی گشتی</th>
    <th>ڕێکەوت</th>
    <th>کردارەکان</th>
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
        <button onclick="editEntry('${docId}', ${adult}, ${child})" style="width:auto;padding:4px 8px;margin:2px;font-size:11px;">✏️</button>
        <button onclick="deleteEntry('${docId}')" style="width:auto;padding:4px 8px;margin:2px;font-size:11px;background:#e74c3c;">🗑️</button>
      `;
    }

    html += `<tr>
      <td>${data.staff}</td>
      <td>${adult}</td>
      <td>${child}</td>
      <td>${total}</td>
      <td>${data.date.toDate().toLocaleDateString("en-GB")}</td>
      <td>${actionButtons}</td>
    </tr>`;
  });

  if (totalAdult > 0 || totalChild > 0) {
    html += `<tr class="total-row">
      <td>کۆی گشتی</td>
      <td>${totalAdult}</td>
      <td>${totalChild}</td>
      <td>${totalAll}</td>
      <td>-</td>
      <td>-</td>
    </tr>`;
  }
  html += `</tbody></table>`;
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
    alert("⚠️ ژمارە هەڵەیە!");
    return;
  }

  showLoading();
  try {
    await setDoc(doc(db, "entries", docId), { 
      countAdult: adultVal, 
      countChild: childVal,
      lastEditedBy: currentUser.email,
      lastEditedAt: Timestamp.now()
    }, { merge: true });
    alert("✅ تۆمارەکە نوێ کرایەوە!");
    window.loadDaily();
  } catch(e) {
    alert("❌ هەڵە: " + e.message);
  } finally {
    hideLoading();
  }
};

window.deleteEntry = async function(docId) {
  if (!confirm("⚠️ دڵنیایت لە سڕینەوەی ئەم تۆمارە؟")) return;
  showLoading();
  try {
    await deleteDoc(doc(db, "entries", docId));
    alert("✅ تۆمارەکە سڕایەوە!");
    window.loadDaily();
  } catch(e) {
    alert("❌ هەڵە: " + e.message);
  } finally {
    hideLoading();
  }
};

// ============================================
// SEARCH BY STAFF
// ============================================
window.searchByStaff = async function() {
  const searchOutput = document.getElementById("searchOutput");
  const selectedStaff = document.getElementById("staffSearchSelect")?.value;
  
  if (!selectedStaff) {
    searchOutput.innerHTML = "⚠️ تکایە کارمەندێک هەڵبژێرە";
    return;
  }

  // یوزەری ئاسایی تەنها داتای خۆی دەبینێت
  const currentStaffName = currentUser.email.toLowerCase().split('@')[0];
  if (!isCurrentUserAdmin && selectedStaff !== currentStaffName) {
    searchOutput.innerHTML = "⛔ تەنها دەتوانیت داتای خۆت ببینیت";
    return;
  }

  showLoading();
  searchOutput.innerHTML = "⏳ چاوەڕێ بکە... داتا دەهێنرێت";
  
  try {
    const entriesQuery = query(
      collection(db, "entries"), 
      where("staff", "==", selectedStaff)
    );
    
    const snap = await getDocs(entriesQuery);
    
    if (snap.empty) {
      searchOutput.innerHTML = `📭 هیچ تۆمارێک نییە بۆ کارمەند "${selectedStaff}"`;
      hideLoading();
      return;
    }
    
    const entries = [];
    snap.forEach(d => {
      const data = d.data();
      const adult = data.countAdult ?? data.count ?? 0;
      const child = data.countChild ?? 0;
      const total = adult + child;
      
      if (total > 0) {
        entries.push({
          id: d.id,
          adult, child, total,
          date: data.date.toDate(),
          dateStr: data.date.toDate().toLocaleDateString("en-GB")
        });
      }
    });
    
    entries.sort((a, b) => b.date - a.date);
    
    if (entries.length === 0) {
      searchOutput.innerHTML = `📭 هیچ تۆمارێکی ناسفر نییە بۆ کارمەند "${selectedStaff}"`;
      hideLoading();
      return;
    }
    
    let html = `<h3 style="margin-bottom:10px;">📋 تۆمارەکانی ${selectedStaff}</h3>`;
    html += `<table><thead><tr>
      <th>#</th>
      <th>🧑 گەورە</th>
      <th>🧒 منال</th>
      <th>کۆی گشتی</th>
      <th>📅 ڕێکەوت</th>
    </tr></thead><tbody>`;
    
    let totalAdult = 0, totalChild = 0;
    let index = 1;
    
    for (const entry of entries) {
      totalAdult += entry.adult;
      totalChild += entry.child;
      html += `<tr>
        <td>${index++}</td>
        <td>${entry.adult}</td>
        <td>${entry.child}</td>
        <td>${entry.total}</td>
        <td>${entry.dateStr}</td>
      </tr>`;
    }
    
    html += `<tr class="total-row">
      <td>کۆی گشتی</td>
      <td>${totalAdult}</td>
      <td>${totalChild}</td>
      <td>${totalAdult + totalChild}</td>
      <td>-</td>
    </tr>`;
    html += `</tbody></table>`;
    searchOutput.innerHTML = html;
    
  } catch (e) {
    console.error("Search error:", e);
    searchOutput.innerHTML = "❌ هەڵە: مافی دەسترسیت نییە، تکایە دووبارە چوونەژوورەوە بکە";
  } finally {
    hideLoading();
  }
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
  const formatDate = (date) => date.getDate() + "/" + (date.getMonth() + 1) + "/" + date.getFullYear();
  return `[ لە ${formatDate(firstDay)} بۆ ${formatDate(lastDay)} ]`;
}

function populateWeekDropdown() {
  const select = document.getElementById("weekSelector");
  if (!select) return;
  select.innerHTML = "";
  const currentWk = getWeekNumber(new Date());
  for (let i = 1; i <= 53; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `هەفتەی ${i}`;
    if (i === currentWk) option.selected = true;
    select.appendChild(option);
  }
  selectedWeekNumber = currentWk;
  const rangeLabel = document.getElementById("weekDateRangeLabel");
  if (rangeLabel) rangeLabel.textContent = getDateRangeOfWeek(currentWk, currentYear);
}

window.selectWeekFromDropdown = function() {
  selectedWeekNumber = parseInt(document.getElementById("weekSelector").value);
  const rangeLabel = document.getElementById("weekDateRangeLabel");
  if (rangeLabel) rangeLabel.textContent = getDateRangeOfWeek(selectedWeekNumber, currentYear);
};

async function fetchWeekly() {
  return getDocs(query(
    collection(db, "entries"),
    where("weekNumber", "==", selectedWeekNumber)
  ));
}

window.loadWeekly = async function () {
  showLoading();
  let snap;
  try {
    snap = await fetchWeekly();
  } catch(e) {
    document.getElementById("weeklyOutput").innerHTML = 
      e.message.includes("permission") 
        ? "❌ مافی دەسترسیت نییە، تکایە دووبارە چوونەژوورەوە بکە" 
        : "❌ هەڵە: " + e.message;
    hideLoading();
    return;
  }
  const weeklyOutput = document.getElementById("weeklyOutput");
  const chartContainer = document.getElementById("weeklyChartContainer");

  if (snap.empty) {
    weeklyOutput.innerHTML = "هیچ تۆمارێک نییە لەم هەفتەیەدا";
    if (chartContainer) chartContainer.style.display = "none";
    hideLoading();
    return;
  }

  const staffName = currentUser ? currentUser.email.toLowerCase().split('@')[0] : "";
  const totals = {};
  
  snap.forEach(d => {
    const x = d.data();
    if (x.year && x.year !== currentYear) return; // filter year in JS
    if (!isCurrentUserAdmin && x.staff !== staffName) return;
    const adult = x.countAdult ?? x.count ?? 0;
    const child = x.countChild ?? 0;
    if (!totals[x.staff]) totals[x.staff] = { adult: 0, child: 0, dates: [] };
    totals[x.staff].adult += adult;
    totals[x.staff].child += child;
    totals[x.staff].dates.push(x.date.toDate().toLocaleDateString("en-GB"));
  });

  if (Object.keys(totals).length === 0) {
    weeklyOutput.innerHTML = "هیچ تۆمارێک نییە لەم هەفتەیەدا";
    if (chartContainer) chartContainer.style.display = "none";
    hideLoading();
    return;
  }

  let html = `<table><thead><tr>
    <th>کارمەند</th>
    <th>🧑 گەورە</th>
    <th>🧒 منال</th>
    <th>کۆی گشتی</th>
    <th>بەروارەکان</th>
  </tr></thead><tbody>`;
  const chartLabels = [], chartData = [];
  let grandAdult = 0, grandChild = 0;

  for (const [s, t] of Object.entries(totals)) {
    const total = t.adult + t.child;
    const datesStr = [...new Set(t.dates)].join(" | ");
    html += `<tr>
      <td>${s}</td>
      <td>${t.adult}</td>
      <td>${t.child}</td>
      <td>${total}</td>
      <td>${datesStr}</td>
    </tr>`;
    chartLabels.push(s);
    chartData.push(total);
    grandAdult += t.adult;
    grandChild += t.child;
  }

  if (isCurrentUserAdmin && Object.keys(totals).length > 1) {
    html += `<tr class="total-row">
      <td>کۆی گشتی</td>
      <td>${grandAdult}</td>
      <td>${grandChild}</td>
      <td>${grandAdult + grandChild}</td>
      <td>-</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  weeklyOutput.innerHTML = html;
  
  if (chartContainer) {
    chartContainer.style.display = "block";
    drawChart(chartLabels, chartData);
  }
  hideLoading();
};

// ============================================
// CHARTS
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
        tooltip: { enabled: true }
      },
      scales: {
        y: { beginAtZero: true },
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
        legend: { display: true, position: 'top' },
        tooltip: { enabled: true }
      }
    }
  };
  
  if (type === 'pie') {
    config.data.datasets[0].backgroundColor = [
      'rgba(52,152,219,0.7)', 'rgba(46,204,113,0.7)',
      'rgba(231,76,60,0.7)', 'rgba(241,196,15,0.7)', 'rgba(155,89,182,0.7)'
    ];
    config.options.plugins.legend.position = 'right';
  } else if (type === 'bar') {
    config.data.datasets[0].backgroundColor = "rgba(52,152,219,0.7)";
  } else if (type === 'line') {
    config.data.datasets[0].backgroundColor = "rgba(52,152,219,0.1)";
    config.data.datasets[0].fill = true;
    config.data.datasets[0].tension = 0.3;
  }
  
  chartInstance = new Chart(ctx, config);
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
    const option = document.createElement("option");
    option.value = i;
    option.textContent = months[i];
    if (i === currentMonth) option.selected = true;
    select.appendChild(option);
  }
}

async function fetchMonthly() {
  const monthVal = parseInt(document.getElementById("monthSelector").value);
  const startDate = new Date(currentYear, monthVal, 1, 0, 0, 0);
  const endDate = new Date(currentYear, monthVal + 1, 0, 23, 59, 59);
  
  return getDocs(query(
    collection(db, "entries"),
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate))
  ));
}

window.loadMonthly = async function () {
  showLoading();
  const snap = await fetchMonthly();
  const monthlyOutput = document.getElementById("monthlyOutput");
  const monthlyChartContainer = document.getElementById("monthlyChartContainer");
  
  if (snap.empty) {
    monthlyOutput.innerHTML = "هیچ تۆمارێک نییە لەم مانگەدا";
    if (monthlyChartContainer) monthlyChartContainer.style.display = "none";
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
    
    if (!dailyTotals[dateStr]) dailyTotals[dateStr] = { adult: 0, child: 0 };
    dailyTotals[dateStr].adult += adult;
    dailyTotals[dateStr].child += child;
    
    if (!staffTotals[x.staff]) staffTotals[x.staff] = { adult: 0, child: 0 };
    staffTotals[x.staff].adult += adult;
    staffTotals[x.staff].child += child;
  });
  
  let html = `<h3 style="margin-bottom:10px;">📊 پوختەی کارمەندان</h3>`;
  html += `<table><thead><tr>
    <th>کارمەند</th>
    <th>🧑 گەورە</th>
    <th>🧒 منال</th>
    <th>کۆی گشتی</th>
  </tr></thead><tbody>`;
  
  let grandAdult = 0, grandChild = 0;
  for (const [staff, totals] of Object.entries(staffTotals)) {
    const total = totals.adult + totals.child;
    html += `<tr>
      <td>${staff}</td>
      <td>${totals.adult}</td>
      <td>${totals.child}</td>
      <td>${total}</td>
    </tr>`;
    grandAdult += totals.adult;
    grandChild += totals.child;
  }
  html += `<tr class="total-row">
    <td>کۆی گشتی</td>
    <td>${grandAdult}</td>
    <td>${grandChild}</td>
    <td>${grandAdult + grandChild}</td>
  </tr></tbody></table>`;
  
  html += `<h3 style="margin: 15px 0 10px;">📅 ڕۆژانە</h3>`;
  html += `<table><thead><tr>
    <th>ڕێکەوت</th>
    <th>🧑 گەورە</th>
    <th>🧒 منال</th>
    <th>کۆی گشتی</th>
  </tr></thead><tbody>`;
  
  const sortedDates = Object.keys(dailyTotals).sort((a, b) => {
    const [da, ma, ya] = a.split('/');
    const [db2, mb, yb] = b.split('/');
    return new Date(ya, ma-1, da) - new Date(yb, mb-1, db2);
  });
  
  for (const date of sortedDates) {
    const t = dailyTotals[date];
    html += `<tr>
      <td>${date}</td>
      <td>${t.adult}</td>
      <td>${t.child}</td>
      <td>${t.adult + t.child}</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  
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
      labels,
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
        legend: { position: 'top' },
        title: { display: true, text: 'ڕەوتی ڕۆژانەی نەخۆشەکان', font: { size: 12 } }
      }
    }
  });
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
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
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
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
  
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
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
// BACKUP FUNCTIONS
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
    
    entriesSnap.forEach(d => {
      backupData.entries.push({ id: d.id, ...d.data() });
    });
    
    usersSnap.forEach(d => {
      backupData.users.push({ id: d.id, ...d.data() });
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
    for (const d of entriesSnap.docs) {
      await deleteDoc(d.ref);
    }
    
    const usersSnap = await getDocs(collection(db, "users"));
    for (const d of usersSnap.docs) {
      if (d.id !== currentUser.email.toLowerCase()) {
        await deleteDoc(d.ref);
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
  
  if(document.getElementById("dailyFilterDate")) document.getElementById("dailyFilterDate").addEventListener("change", window.loadDaily);
  
  if(document.getElementById("btnLoadWeekly")) document.getElementById("btnLoadWeekly").addEventListener("click", window.loadWeekly);
  if(document.getElementById("btnExportWeeklyExcel")) document.getElementById("btnExportWeeklyExcel").addEventListener("click", window.exportWeeklyExcel);
  if(document.getElementById("btnExportWeeklyPDF")) document.getElementById("btnExportWeeklyPDF").addEventListener("click", window.exportWeeklyPDF);
  
  if(document.getElementById("btnLoadMonthly")) document.getElementById("btnLoadMonthly").addEventListener("click", window.loadMonthly);
  if(document.getElementById("btnExportMonthlyExcel")) document.getElementById("btnExportMonthlyExcel").addEventListener("click", window.exportMonthlyExcel);
  if(document.getElementById("btnExportMonthlyPDF")) document.getElementById("btnExportMonthlyPDF").addEventListener("click", window.exportMonthlyPDF);
  
  if(document.getElementById("chartTypeBar")) document.getElementById("chartTypeBar").addEventListener("click", () => window.switchChartType('bar'));
  if(document.getElementById("chartTypeLine")) document.getElementById("chartTypeLine").addEventListener("click", () => window.switchChartType('line'));
  if(document.getElementById("chartTypePie")) document.getElementById("chartTypePie").addEventListener("click", () => window.switchChartType('pie'));
  
  if(document.getElementById("btnSearchStaff")) document.getElementById("btnSearchStaff").addEventListener("click", window.searchByStaff);
  if(document.getElementById("btnBackup")) document.getElementById("btnBackup").addEventListener("click", window.backupData);
  if(document.getElementById("btnRestore")) document.getElementById("btnRestore").addEventListener("click", window.restoreBackup);
  if(document.getElementById("restoreFile")) document.getElementById("restoreFile").addEventListener("change", window.handleRestore);
});