import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// 🔥 Your Firebase config from console
const firebaseConfig = {
  apiKey: "AIzaSyAuoLqZzvtK--UZZI0RWKjoI66YcC_ZKnc",
  authDomain: "trial-e4b81.firebaseapp.com",
  projectId: "trial-e4b81",
  storageBucket: "trial-e4b81.appspot.com",
  messagingSenderId: "535086813044",
  appId: "1:535086813044:web:f8a99f9fb047f96cf5e621"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.signup = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    alert("Signup successful: " + userCredential.user.email);
    // Save user to Firestore
    await addDoc(collection(db, "users"), { email });
  } catch (error) {
    alert("Signup Error: " + error.message);
  }
};

window.login = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    alert("Login successful: " + userCredential.user.email);
  } catch (error) {
    alert("Login Error: " + error.message);
  }
};
