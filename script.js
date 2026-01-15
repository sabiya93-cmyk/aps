import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, setDoc, getDoc, collection, getDocs, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import * as XLSX from "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

// ------------------ LOGIN ------------------
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, "users", email));
        const user = userDoc.data();
        if(!user) throw new Error("User not found in DB");

        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        document.getElementById('user-name').innerText = user.name;

        window.currentUser = user;

        if(user.role==="Admin") document.getElementById('nav-admin').classList.remove('hidden');
        if(user.role==="Teacher") document.getElementById('nav-teacher').classList.remove('hidden');
        if(user.role==="Student") {
            document.getElementById('nav-student').classList.remove('hidden');
            showSection('student');
            await renderStudentDashboard();
        } else {
            showSection('home');
        }
    } catch(err) {
        document.getElementById('login-error').innerText = err.message;
    }
}

function logout(){ signOut(auth); location.reload(); }

function showSection(id){
    document.querySelectorAll('.section').forEach(s=>s.classList.add('hidden'));
    document.getElementById('section-'+id).classList.remove('hidden');
    document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.remove('active'));
    document.getElementById('nav-'+id).classList.add('active');
}

// ------------------ ADMIN: BULK UPLOAD ------------------
async function uploadBulk() {
    const file = document.getElementById('bulk-upload').files[0];
    if(!file) return alert("Select a file");

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    
    for(let row of sheet){
        const email = row.Email;
        const name = row.Name;
        const role = row.Role;
        const cls = row.Class || "";
        const sec = row.Section || "";
        const password = "123456";

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", email), { name, email, role, classGrade: cls, section: sec, marks: [], attendance: [], msgs: [], files: [] });
        } catch(e){ console.log(e.message); }
    }
    alert("Bulk upload complete!");
}

// ------------------ TEACHER: LOAD CLASS ------------------
async function loadClass(){
    const cls = document.getElementById('select-class').value;
    const sec = document.getElementById('select-section').value;

    const snapshot = await getDocs(collection(db, "users"));
    const students = [];
    snapshot.forEach(docSnap=>{
        const data = docSnap.data();
        if(data.role==="Student" && data.classGrade===cls && data.section===sec){
            students.push(data);
        }
    });

    const container = document.getElementById('teacher-students');
    container.innerHTML = "";
    students.forEach(s=>{
        container.innerHTML += `<div>${s.name} (${s.email}) 
            <button onclick="markAttendance('${s.email}')">Mark Present</button>
            <input type="number" id="mark-${s.email}" placeholder="Marks">
            <button onclick="addMark('${s.email}')">Add Mark</button>
        </div>`;
    });
}

// ------------------ ATTENDANCE ------------------
async function markAttendance(email){
    await updateDoc(doc(db, "users", email), { attendance: arrayUnion(new Date().toLocaleString()) });
    alert("Attendance marked for "+email);
}

// ------------------ ADD MARKS ------------------
async function addMark(email){
    const score = document.getElementById(`mark-${email}`).value;
    if(!score) return;
    await updateDoc(doc(db, "users", email), { marks: arrayUnion({ subject:"General", score: score }) });
    alert("Mark added for "+email);
}

// ------------------ UPLOAD ASSIGNMENT ------------------
async function uploadPDF(){
    const file = document.getElementById('upload-pdf').files[0];
    if(!file) return alert("Select file");

    const cls = document.getElementById('select-class').value;
    const sec = document.getElementById('select-section').value;

    const storageRef = ref(storage, `assignments/${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    const snapshot = await getDocs(collection(db, "users"));
    snapshot.forEach(async docSnap=>{
        const data = docSnap.data();
        if(data.role==="Student" && data.classGrade===cls && data.section===sec){
            await updateDoc(doc(db, "users", data.email), { files: arrayUnion({ name:file.name, url }) });
        }
    });
    alert("Assignment uploaded!");
}

// ------------------ SEND MESSAGE ------------------
async function sendMessage(){
    const msg = document.getElementById('message-box').value;
    if(!msg) return alert("Enter message");

    const cls = document.getElementById('select-class').value;
    const sec = document.getElementById('select-section').value;

    const snapshot = await getDocs(collection(db, "users"));
    snapshot.forEach(async docSnap=>{
        const data = docSnap.data();
        if(data.role==="Student" && data.classGrade===cls && data.section===sec){
            await updateDoc(doc(db, "users", data.email), { msgs: arrayUnion(msg) });
        }
    });
    alert("Message sent!");
}

// ------------------ STUDENT DASHBOARD ------------------
async function renderStudentDashboard(){
    const studentEmail = window.currentUser.email;
    const docSnap = await getDoc(doc(db, "users", studentEmail));
    const data = docSnap.data();

    // Assignments
    const assignContainer = document.getElementById('student-assignments');
    assignContainer.innerHTML = data.files && data.files.length > 0
        ? data.files.map(f => `<li><a href="${f.url}" target="_blank">📎 ${f.name}</a></li>`).join('')
        : "<li>No assignments yet.</li>";

    // Messages
    const msgContainer = document.getElementById('student-messages');
    msgContainer.innerHTML = data.msgs && data.msgs.length > 0
        ? data.msgs.slice().reverse().map(m => `<li>${m}</li>`).join('')
        : "<li>No messages yet.</li>";

    // Marks
    const marksBody = document.getElementById('student-marks').querySelector('tbody');
    marksBody.innerHTML = data.marks && data.marks.length > 0
        ? data.marks.map(m => `<tr><td>${m.subject}</td><td>${m.score}</td><td style='color:${m.score>=35?'green':'red'}'>${m.score>=35?'Pass':'Fail'}</td></tr>`).join('')
        : "<tr><td colspan='3'>No marks yet.</td></tr>";
}

window.login = login;
window.logout = logout;
window.showSection = showSection;
window.uploadBulk = uploadBulk;
window.loadClass = loadClass;
window.markAttendance = markAttendance;
window.addMark = addMark;
window.uploadPDF = uploadPDF;
window.sendMessage = sendMessage;
