// script.js
import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, setDoc, getDoc, collection, getDocs, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// NOTE: XLSX is loaded in index.html as a global (UMD) script tag (window.XLSX)

// Utility: show/hide sections
function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.classList.add('hidden'));
  const el = document.getElementById('section-'+id);
  if(el) el.classList.remove('hidden');
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.remove('active'));
  const nav = document.getElementById('nav-'+id);
  if(nav) nav.classList.add('active');
}

// ---- AUTH UI helpers ----
function showDashboardUI(userData){
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('dashboard-container').classList.remove('hidden');
  document.getElementById('user-name').innerText = userData.name || userData.email || "User";
  window.currentUser = userData;

  // reset nav visibility
  document.getElementById('nav-admin').classList.add('hidden');
  document.getElementById('nav-teacher').classList.add('hidden');
  document.getElementById('nav-student').classList.add('hidden');

  if(userData.role==="Admin") document.getElementById('nav-admin').classList.remove('hidden');
  if(userData.role==="Teacher") document.getElementById('nav-teacher').classList.remove('hidden');
  if(userData.role==="Student") {
    document.getElementById('nav-student').classList.remove('hidden');
    showSection('student');
    renderStudentDashboard().catch(e=>console.error(e));
  } else {
    showSection('home');
  }
}

function showAuthUI(){
  document.getElementById('dashboard-container').classList.add('hidden');
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('user-name').innerText = "";
  window.currentUser = null;
}

// ---- LOGIN / LOGOUT ----
async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.innerText = "";
  if(!email || !password){ errEl.innerText = "Enter email and password"; return; }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will fetch DB user and show UI
  } catch(err){
    console.error("Login error:", err);
    errEl.innerText = err.message || "Login failed";
  }
}

async function logout(){
  try {
    await signOut(auth);
    showAuthUI();
    // reload to clear state if you prefer: location.reload();
  } catch(err){
    console.error("Logout failed", err);
  }
}

// ---- AUTH STATE LISTENER ----
// When auth state changes (sign in/out), fetch user doc from Firestore and update UI
onAuthStateChanged(auth, async (fbUser) => {
  if(fbUser){
    try {
      const userDocRef = doc(db, "users", fbUser.email);
      const snap = await getDoc(userDocRef);
      const userData = snap.exists() ? snap.data() : { email: fbUser.email, name: fbUser.email, role: "Student" };
      showDashboardUI(userData);
    } catch(err){
      console.error("Failed to load user data:", err);
      // still show a minimal dashboard if DB read fails
      showDashboardUI({ email: fbUser.email, name: fbUser.email, role: "Student" });
    }
  } else {
    showAuthUI();
  }
});

// ---- ADMIN: BULK UPLOAD ----
async function uploadBulk() {
  const fileInput = document.getElementById('bulk-upload');
  const file = fileInput.files[0];
  if(!file) return alert("Select a file (xlsx or csv)");

  try {
    const data = await file.arrayBuffer();
    // use global XLSX
    const workbook = window.XLSX.read(data, { type: 'array' });
    const sheet = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    
    for(let row of sheet){
      const email = (row.Email || row.email || "").toString().trim();
      if(!email) continue;
      const name = row.Name || row.name || email.split('@')[0];
      const role = (row.Role || row.role || "Student");
      const cls = row.Class || row.class || "";
      const sec = row.Section || row.section || "";
      const password = "123456"; // default password - change as needed

      try {
        // create auth user
        await createUserWithEmailAndPassword(auth, email, password);
      } catch(e){
        // user may already exist in auth; ignore error but continue to write db doc
        console.log("Auth create user error (maybe exists):", e.message);
      }

      try {
        await setDoc(doc(db, "users", email), {
          name,
          email,
          role,
          classGrade: cls,
          section: sec,
          marks: [],
          attendance: [],
          msgs: [],
          files: []
        });
      } catch(e){
        console.error("Error writing user doc for", email, e);
      }
    }
    alert("Bulk upload complete!");
    fileInput.value = "";
  } catch(e){
    console.error("Bulk upload failed", e);
    alert("Bulk upload failed: " + (e.message || e));
  }
}

// ---- TEACHER: LOAD CLASS ----
async function loadClass(){
  const cls = document.getElementById('select-class').value.trim();
  const sec = document.getElementById('select-section').value.trim();

  if(!cls || !sec) return alert("Enter class and section");

  const snapshot = await getDocs(collection(db, "users"));
  const students = [];
  snapshot.forEach(docSnap=>{
    const data = docSnap.data();
    if(data.role==="Student" && String(data.classGrade)===String(cls) && String(data.section)===String(sec)){
      students.push(data);
    }
  });

  const container = document.getElementById('teacher-students');
  container.innerHTML = "";
  if(students.length === 0) container.innerHTML = "<p>No students found for that class/section.</p>";

  students.forEach(s=>{
    // safe id for element: replace characters
    const safeId = s.email.replace(/[^a-zA-Z0-9]/g, "_");
    container.innerHTML += `<div style="margin-bottom:8px;padding:8px;border:1px solid #eee;border-radius:6px;">
      <strong>${s.name}</strong> (${s.email}) 
      <button onclick="markAttendance('${s.email}')">Mark Present</button>
      <input style="width:80px;margin-left:8px;" type="number" id="mark-${safeId}" placeholder="Marks">
      <button onclick="addMark('${s.email}','${safeId}')">Add Mark</button>
    </div>`;
  });
}

// ---- ATTENDANCE ----
async function markAttendance(email){
  try {
    await updateDoc(doc(db, "users", email), { attendance: arrayUnion(new Date().toLocaleString()) });
    alert("Attendance marked for "+email);
  } catch(e){
    console.error("Attendance mark error:", e);
    alert("Failed to mark attendance: " + (e.message || e));
  }
}

// ---- ADD MARKS ----
async function addMark(email, safeId){
  let inputEl;
  if(safeId) inputEl = document.getElementById(`mark-${safeId}`);
  else inputEl = document.getElementById(`mark-${email.replace(/[^a-zA-Z0-9]/g, "_")}`);
  const score = inputEl ? inputEl.value : null;
  if(!score) return alert("Enter a mark");
  try {
    await updateDoc(doc(db, "users", email), { marks: arrayUnion({ subject:"General", score: Number(score) }) });
    alert("Mark added for "+email);
    if(inputEl) inputEl.value = "";
  } catch(e){
    console.error("Add mark error:", e);
    alert("Failed to add mark: " + (e.message || e));
  }
}

// ---- UPLOAD ASSIGNMENT (PDF) ----
async function uploadPDF(){
  const file = document.getElementById('upload-pdf').files[0];
  if(!file) return alert("Select file");
  const cls = document.getElementById('select-class').value.trim();
  const sec = document.getElementById('select-section').value.trim();
  if(!cls || !sec) return alert("Select class & section for upload");

  try {
    const storageRef = ref(storage, `assignments/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    const snapshot = await getDocs(collection(db, "users"));
    const updates = [];
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      if(data.role==="Student" && String(data.classGrade)===String(cls) && String(data.section)===String(sec)){
        updates.push(updateDoc(doc(db, "users", data.email), { files: arrayUnion({ name:file.name, url }) }));
      }
    });
    await Promise.all(updates);
    alert("Assignment uploaded!");
  } catch(e){
    console.error("Upload PDF error:", e);
    alert("Failed to upload: "+(e.message||e));
  }
}

// ---- SEND MESSAGE ----
async function sendMessage(){
  const msg = document.getElementById('message-box').value.trim();
  if(!msg) return alert("Enter message");
  const cls = document.getElementById('select-class').value.trim();
  const sec = document.getElementById('select-section').value.trim();
  if(!cls || !sec) return alert("Select class & section");

  try {
    const snapshot = await getDocs(collection(db, "users"));
    const updates = [];
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      if(data.role==="Student" && String(data.classGrade)===String(cls) && String(data.section)===String(sec)){
        updates.push(updateDoc(doc(db, "users", data.email), { msgs: arrayUnion(msg) }));
      }
    });
    await Promise.all(updates);
    alert("Message sent!");
    document.getElementById('message-box').value = "";
  } catch(e){
    console.error("Send message failed:", e);
    alert("Failed to send message: " + (e.message || e));
  }
}

// ---- STUDENT DASHBOARD RENDER ----
async function renderStudentDashboard(){
  const studentEmail = window.currentUser && window.currentUser.email;
  if(!studentEmail) return;
  try {
    const docSnap = await getDoc(doc(db, "users", studentEmail));
    const data = docSnap.exists() ? docSnap.data() : null;

    // Assignments
    const assignContainer = document.getElementById('student-assignments');
    assignContainer.innerHTML = data && data.files && data.files.length > 0
        ? data.files.map(f => `<li><a href="${f.url}" target="_blank">📎 ${f.name}</a></li>`).join('')
        : "<li>No assignments yet.</li>";

    // Messages
    const msgContainer = document.getElementById('student-messages');
    msgContainer.innerHTML = data && data.msgs && data.msgs.length > 0
        ? data.msgs.slice().reverse().map(m => `<li>${m}</li>`).join('')
        : "<li>No messages yet.</li>";

    // Marks
    const marksBody = document.getElementById('student-marks').querySelector('tbody');
    marksBody.innerHTML = data && data.marks && data.marks.length > 0
        ? data.marks.map(m => `<tr><td>${m.subject}</td><td>${m.score}</td><td style='color:${m.score>=35?'green':'red'}'>${m.score>=35?'Pass':'Fail'}</td></tr>`).join('')
        : "<tr><td colspan='3'>No marks yet.</td></tr>";

  } catch(e){
    console.error("Render student dashboard failed:", e);
  }
}

// ---- Wire up UI elements to functions ----
window.login = login;
window.logout = logout;
window.showSection = showSection;
window.uploadBulk = uploadBulk;
window.loadClass = loadClass;
window.markAttendance = markAttendance;
window.addMark = addMark;
window.uploadPDF = uploadPDF;
window.sendMessage = sendMessage;
window.renderStudentDashboard = renderStudentDashboard;

// DOM bindings (add event listeners)
window.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  if(loginBtn) loginBtn.addEventListener('click', login);

  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);

  const uploadBulkBtn = document.getElementById('upload-bulk-btn');
  if(uploadBulkBtn) uploadBulkBtn.addEventListener('click', uploadBulk);

  const loadClassBtn = document.getElementById('load-class-btn');
  if(loadClassBtn) loadClassBtn.addEventListener('click', loadClass);

  const uploadPdfBtn = document.getElementById('upload-pdf-btn');
  if(uploadPdfBtn) uploadPdfBtn.addEventListener('click', uploadPDF);

  const sendMsgBtn = document.getElementById('send-message-btn');
  if(sendMsgBtn) sendMsgBtn.addEventListener('click', sendMessage);
});
