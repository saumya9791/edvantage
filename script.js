/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  EdVantage — frontend/script.js  (v3.1 — Navbar Fix)
 *  Company  : RR Finco
 * ──────────────────────────────────────────────────────────────
 *  ROOT-CAUSE FIX (v3.1):
 *   • updateNavbarForLoggedInUser() now sets display:"flex" / "block"
 *     explicitly instead of "" — overrides the inline style:display:none
 *     on #userMenu that was silently blocking the dropdown from showing.
 *   • Login success block now also handles the case where the backend
 *     wraps the user in data.data (standardised envelope) OR data.user
 *     (older shape) — works with both server versions.
 *   • All existing functions (togglePassword, toggleAuth, filterCourses,
 *     renderCourses, etc.) are 100% preserved.
 *
 *  SECTIONS:
 *   1.  Configuration & state
 *   2.  Course API layer
 *   3.  Course render layer
 *   4.  UI state helpers (skeleton, error, count)
 *   5.  Client-side course search
 *   6.  Utility functions (stars, escapeHtml, togglePassword)
 *   7.  Auth system (showLogin, closeModal, toggleAuth, submit, logout)
 *   8.  Navbar updater  ← THE FIXED FUNCTION
 *   9.  User dropdown menu
 *   10. Profile modal
 *   11. Account Settings modal
 *   12. Delete Account (double-confirmation)
 *   13. Admin Dashboard modal
 *   14. Toast notification
 *   15. Close-all-modals + backdrop click
 *   16. Scroll-reveal (IntersectionObserver)
 *   17. UI behaviours (header scroll, mobile menu, back-to-top)
 *   18. Bootstrap (DOMContentLoaded)
 * ╚══════════════════════════════════════════════════════════════╝
 */


// ──────────────────────────────────────────────────────────────
// SECTION 1 — CONFIGURATION & STATE
// ───────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// SECTION 1 — CONFIGURATION & STATE
// ──────────────────────────────────────────────────────────────

// Local testing ke liye localhost:5000 use karo
const API_BASE_URL = "http://localhost:5000";

/** Cached courses — populated once by fetchCourses() */
let cachedCourses = [];

/** currentUser — logged-in user object */
let currentUser = null;

/** Tracks whether the auth modal is in Login or Register mode */
let isLoginMode = true;


// ──────────────────────────────────────────────────────────────
// SECTION 2 — COURSE API LAYER
// ──────────────────────────────────────────────────────────────

async function fetchCourses() {
  const grid    = document.getElementById("coursesGrid");
  const emptyEl = document.getElementById("emptyState");

  showLoadingSkeleton(grid);
  if (emptyEl) emptyEl.style.display = "none";

  try {
    const response = await fetch(`${API_BASE_URL}/api/courses`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Server error ${response.status}`);
    }
    const json = await response.json();
    if (!json.success) throw new Error(json.message || "Unexpected API response.");

    cachedCourses = json.data;
    renderCourses(cachedCourses);
    updateCount(cachedCourses.length);

  } catch (err) {
    console.error("[fetchCourses]", err.message);
    const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes("fetch");
    showErrorState(
      grid,
      isNetwork
        ? "⚠️ Server not reachable. Make sure the backend is running on port 5000."
        : `❌ Could not load courses: ${err.message}`
    );
  }
}


// ──────────────────────────────────────────────────────────────
// SECTION 3 — COURSE RENDER LAYER
// ──────────────────────────────────────────────────────────────

function renderCourses(courses) {
  const grid    = document.getElementById("coursesGrid");
  const emptyEl = document.getElementById("emptyState");

  if (!courses || courses.length === 0) {
    grid.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  grid.innerHTML = courses.map(course => {
    const price    = `₹${course.price.toLocaleString("en-IN")}`;
    const original = `₹${course.originalPrice.toLocaleString("en-IN")}`;
    const reviews  = course.reviews >= 1000
      ? `(${(course.reviews / 1000).toFixed(1)}k reviews)`
      : `(${course.reviews} reviews)`;
    const discount = Math.round(
      ((course.originalPrice - course.price) / course.originalPrice) * 100
    );

    return /* html */`
      <article class="course-card reveal" data-category="${escapeHtml(course.category)}">
        <div class="course-card__banner"></div>
        <div class="course-card__body">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
            <span class="course-card__category">${escapeHtml(course.category)}</span>
            <span style="background:#e8f5e9;color:#2e7d32;font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:99px;">${discount}% OFF</span>
          </div>
          <h3 class="course-card__title">${escapeHtml(course.title)}</h3>
          <p class="course-card__instructor">by <strong>${escapeHtml(course.instructor)}</strong></p>
          <div class="course-card__rating">
            <span class="stars" aria-label="${course.rating} out of 5">${generateStars(course.rating)}</span>
            <span class="rating-num">${course.rating.toFixed(1)}</span>
            <span class="rating-count">${reviews}</span>
          </div>
          <div class="course-card__footer">
            <div>
              <span class="course-card__price">${price}</span>
              <span class="course-card__price-original">${original}</span>
            </div>
            <button 
  class="btn--enroll" 
  onclick="enrollInCourse('${course.id || course._id}')" 
  aria-label="Enrol in ${escapeHtml(course.title)}">
  Enrol Now
</button>



        </div>
      </article>
    `;
  }).join("");

  observeRevealElements();
}

window.enrollInCourse = async function(courseId) {
  // Check if the user is logged in
  if (!currentUser || !currentUser.token) {
    showToast("Please login first to enroll in courses!", "error");
    return;
  }

  try {
    // API call to record enrollment in database
    const res = await fetch(`${API_BASE_URL}/api/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentUser.token}` // JWT protection
      },
      body: JSON.stringify({ courseId })
    });

    const data = await res.json();

    if (data.success) {
      showToast(data.message, "success");
    } else {
      showToast(data.message, "error");
    }
  } catch (err) {
    console.error("Enrollment error:", err);
    showToast("Something went wrong. Please try again.", "error");
  }
};

// ──────────────────────────────────────────────────────────────
// SECTION 4 — UI STATE HELPERS
// ──────────────────────────────────────────────────────────────

function showLoadingSkeleton(grid) {
  grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="course-card" style="pointer-events:none;">
      <div class="course-card__banner" style="background:#e0e0e0;"></div>
      <div class="course-card__body">
        <div class="skeleton" style="width:60%;height:12px;border-radius:4px;background:#ececec;margin-bottom:.8rem;"></div>
        <div class="skeleton" style="width:90%;height:18px;border-radius:4px;background:#ececec;margin-bottom:.5rem;"></div>
        <div class="skeleton" style="width:70%;height:12px;border-radius:4px;background:#ececec;margin-bottom:1rem;"></div>
        <div class="skeleton" style="width:50%;height:12px;border-radius:4px;background:#ececec;margin-bottom:2rem;"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="skeleton" style="width:30%;height:22px;border-radius:4px;background:#ececec;"></div>
          <div class="skeleton" style="width:25%;height:30px;border-radius:99px;background:#ececec;"></div>
        </div>
      </div>
    </div>
  `).join("");

  if (!document.getElementById("skeleton-style")) {
    const s = document.createElement("style");
    s.id = "skeleton-style";
    s.textContent = `
      @keyframes skeleton-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      .skeleton { animation: skeleton-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
  }
}

function showErrorState(grid, message) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:4rem 1.5rem;background:#fff5f5;
                border:2px dashed #fc8181;border-radius:16px;color:#c53030;">
      <p style="font-size:2.5rem;margin-bottom:1rem;">🔌</p>
      <p style="font-weight:700;font-size:1.05rem;margin-bottom:.5rem;">Could not load courses</p>
      <p style="font-size:.9rem;color:#742a2a;max-width:480px;margin:0 auto 1.5rem;">${message}</p>
      <button onclick="fetchCourses()"
        style="background:#3B1FA3;color:#fff;border:none;border-radius:99px;
               padding:.65rem 1.6rem;font-weight:700;cursor:pointer;font-size:.9rem;">
        Retry
      </button>
    </div>`;
}

function updateCount(n) {
  const el = document.getElementById("searchCount");
  if (el) el.textContent = n > 0 ? `${n} course${n !== 1 ? "s" : ""}` : "";
}


// ──────────────────────────────────────────────────────────────
// SECTION 5 — CLIENT-SIDE COURSE SEARCH
// ──────────────────────────────────────────────────────────────

function filterCourses() {
  const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  if (!query) { renderCourses(cachedCourses); updateCount(cachedCourses.length); return; }
  const filtered = cachedCourses.filter(c =>
    c.title.toLowerCase().includes(query)      ||
    c.instructor.toLowerCase().includes(query) ||
    c.category.toLowerCase().includes(query)
  );
  renderCourses(filtered);
  updateCount(filtered.length);
}

function initSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(filterCourses, 200);
  });
}


// ──────────────────────────────────────────────────────────────
// SECTION 6 — UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────

function generateStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function escapeHtml(str) {
  const m = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;" };
  return String(str).replace(/[&<>"']/g, c => m[c]);
}

/**
 * togglePassword — show/hide password field.
 * Exposed on window so inline onclick="togglePassword(...)" in HTML works.
 */
window.togglePassword = function (id, el) {
  const input = document.getElementById(id);
  if (!input) return;
  const hidden = input.type === "password";
  input.type   = hidden ? "text" : "password";
  el.innerText = hidden ? "HIDE" : "SHOW";
};


// ──────────────────────────────────────────────────────────────
// SECTION 7 — AUTH SYSTEM  (login / register / logout)
// ──────────────────────────────────────────────────────────────

/** Open the Login/Register modal */
window.showLogin = function () {
  document.getElementById("loginModal").style.display = "flex";
};

/** Close the auth modal — always resets back to Login mode */
window.closeModal = function () {
  document.getElementById("loginModal").style.display = "none";
  if (!isLoginMode) toggleAuth();   // snap back to Login view
};

/** Toggle the modal between Login ↔ Register mode */
window.toggleAuth = function () {
  isLoginMode = !isLoginMode;

  const get = id => document.getElementById(id);

  if (isLoginMode) {
    get("modalTitle").innerText          = "Log In";
    get("userName").style.display        = "none";
    get("userName").required             = false;
    get("confirmPassWrapper").style.display = "none";
    if (get("forgotRow")) get("forgotRow").style.display = "";
    get("toggleText").innerText          = "New user?";
    get("toggleLink").innerText          = "Register Here";
    get("submitBtn").innerText           = "Log In";
  } else {
    get("modalTitle").innerText          = "Create Account";
    get("userName").style.display        = "block";
    get("userName").required             = true;
    get("confirmPassWrapper").style.display = "block";
    if (get("forgotRow")) get("forgotRow").style.display = "none";
    get("toggleText").innerText          = "Already have an account?";
    get("toggleLink").innerText          = "Login Here";
    get("submitBtn").innerText           = "Register";
  }
};

/**
 * showForgotPassword()
 * ────────────────────
 * Prompts for email, calls POST /api/forgot-password, shows a toast.
 * Kept exactly as written in v3 — no changes.
 */
window.showForgotPassword = function () {
  const email = prompt("Enter your registered email address:");
  if (!email) return;

  fetch(`${API_BASE_URL}/api/forgot-password`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ email })
  })
    .then(r => r.json())
    .then(data => {
      closeModal();
      showToast(data.message || "If that email exists, a reset link has been sent.", "info");
    })
    .catch(() => showToast("Could not reach the server. Try again later.", "error"));
};

// ─────────────────────────────────────────────────────────────
// AUTH FORM SUBMIT  (Login + Register in one handler)
// ─────────────────────────────────────────────────────────────
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "authForm") return;
  e.preventDefault();

  const name        = document.getElementById("userName").value.trim();
  const email       = document.getElementById("userEmail").value.trim();
  const password    = document.getElementById("userPass").value;
  const confirmPass = document.getElementById("confirmPass")?.value || "";

  // ── Client-side validation ──────────────────────────────────
  if (!isLoginMode && password !== confirmPass) {
    showToast("Passwords do not match!", "error");
    return;
  }
  if (!isLoginMode && password.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }

  const endpoint = isLoginMode ? "/api/login" : "/api/register";
  const payload  = isLoginMode ? { email, password } : { name, email, password };

  // Disable submit button to prevent double-submit
  const submitBtn       = document.getElementById("submitBtn");
  submitBtn.disabled    = true;
  submitBtn.innerText   = "Please wait…";

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success) {

      // --- ISSE REPLACE KARO ---
if (isLoginMode) {
    const userPayload = (data.data && data.data.user) ? data.data.user : (data.data || data.user || null);
    const tokenPayload = data.data?.token || data.token; // 🔥 Server se token nikalo

    if (userPayload) {
        currentUser = {
            id   : userPayload.id    || userPayload._id || null,
            name : userPayload.name  || email,
            email: userPayload.email || email,
            role : userPayload.role  || "user",
            token: tokenPayload // 🔥 YE SABSE ZAROORI HAI
        };

        localStorage.setItem("edvantage_user", JSON.stringify(currentUser));
        closeModal();
        updateNavbarForLoggedInUser(currentUser);
        showToast(`Welcome back, ${currentUser.name}! 👋`, "success");
    }
} else {
        // ── REGISTER SUCCESS ──────────────────────────────────
        closeModal();
        showToast(data.message || "Account created! You can now log in.", "success");
      }

    } else {
      // API returned success:false  (wrong password, duplicate email, etc.)
      showToast("Error: " + (data.message || "Something went wrong."), "error");
    }

  } catch (err) {
    console.error("[authForm submit]", err);
    showToast("Unable to connect to the server. Is the backend running on port 5000?", "error");

  } finally {
    // Always re-enable the button
    submitBtn.disabled  = false;
    submitBtn.innerText = isLoginMode ? "Log In" : "Register";
  }
});

/**
 * logoutUser()
 * ─────────────
 * Clears session and restores the Navbar to guest (Log In button) state.
 */
window.logoutUser = function () {
  currentUser = null;
  localStorage.removeItem("edvantage_user");
  closeUserDropdown();

  // ── Restore guest Navbar ──
  const loginBtn = document.getElementById("loginBtn");
  const userMenu = document.getElementById("userMenu");

  if (loginBtn) loginBtn.style.display = "inline-flex"; // show Log In button
  if (userMenu) userMenu.style.display = "none";        // hide user menu

  showToast("You have been logged out. See you soon! 👋", "info");
};


// ──────────────────────────────────────────────────────────────
// SECTION 8 — NAVBAR UPDATER  ★ THE FIXED FUNCTION ★
// ──────────────────────────────────────────────────────────────

/**
 * updateNavbarForLoggedInUser(user)
 * ──────────────────────────────────
 * Called immediately after a successful login AND on page load
 * if sessionStorage has a saved user.
 *
 * FIX v3.1:
 *  • Uses display:"flex" / display:"block" explicitly — NOT display:""
 *    because setting "" on an element that has style="display:none" inline
 *    does NOT reliably remove the override in all browsers.
 *  • Every getElementById call is guarded so the function never crashes
 *    if an element is temporarily missing from the DOM.
 *
 * @param {Object} user  – { id, name, email, role }
 */
function updateNavbarForLoggedInUser(user) {
  if (!user) return;

  // ── 1. Swap Log In button → User menu ──────────────────────
  const loginBtn = document.getElementById("loginBtn");
  const userMenu = document.getElementById("userMenu");

  if (loginBtn) loginBtn.style.display = "none";   // hide "Log In"
  if (userMenu) userMenu.style.display = "flex";   // ← explicit "flex", NOT ""

  // ── 2. Fill in the trigger button (avatar initial + name) ──
  const avatarEl      = document.getElementById("userAvatar");
  const userNameEl    = document.getElementById("userMenuName");
  const initial       = (user.name || "U").charAt(0).toUpperCase();

  if (avatarEl)   avatarEl.innerText   = initial;
  if (userNameEl) userNameEl.innerText = user.name;

  // ── 3. Fill in the dropdown header ─────────────────────────
  const dropdownNameEl  = document.getElementById("dropdownName");
  const dropdownEmailEl = document.getElementById("dropdownEmail");
  const dropdownRoleEl  = document.getElementById("dropdownRole");

  if (dropdownNameEl)  dropdownNameEl.innerText  = user.name;
  if (dropdownEmailEl) dropdownEmailEl.innerText = user.email;
  if (dropdownRoleEl) {
    dropdownRoleEl.innerText          = user.role;
    dropdownRoleEl.style.background   = user.role === "admin" ? "#1a0a5e" : "#ede9ff";
    dropdownRoleEl.style.color        = user.role === "admin" ? "#ffffff" : "#3b1fa3";
  }

  // ── 4. Admin Dashboard item — only for role:"admin" ────────
  const adminBtn = document.getElementById("adminDashboardBtn");
  if (adminBtn) {
    // display:"flex" to match the sibling items; "none" to hide
    adminBtn.style.display = user.role === "admin" ? "flex" : "none";
  }

  console.log(`[Navbar] Updated for ${user.name} (${user.role})`); // handy for debugging
}

/**
 * restoreSession()
 * ─────────────────
 * Called on DOMContentLoaded.
 * If localStorage holds a valid user, immediately re-applies the
 * logged-in Navbar without forcing the user to log in again.
 */
function restoreSession() {
  const stored = localStorage.getItem("edvantage_user");
  if (!stored) return;
  try {
    currentUser = JSON.parse(stored);
    if (currentUser && currentUser.name) {
      updateNavbarForLoggedInUser(currentUser);
    }
  } catch (_) {
    localStorage.removeItem("edvantage_user"); // corrupt data — clear it
  }
}


// ──────────────────────────────────────────────────────────────
// SECTION 9 — USER DROPDOWN MENU
// ──────────────────────────────────────────────────────────────

window.toggleUserDropdown = function () {
  document.getElementById("userDropdown")?.classList.toggle("open");
};

function closeUserDropdown() {
  document.getElementById("userDropdown")?.classList.remove("open");
}

// Close dropdown when clicking anywhere outside the user-menu element
document.addEventListener("click", (e) => {
  const menu = document.getElementById("userMenu");
  if (menu && !menu.contains(e.target)) closeUserDropdown();
});


// ──────────────────────────────────────────────────────────────
// SECTION 10 — PROFILE MODAL
// ──────────────────────────────────────────────────────────────

window.openProfileModal = function () {
  closeUserDropdown();
  if (!currentUser) { showToast("Please log in first.", "error"); return; }

  document.getElementById("profileName").value  = currentUser.name;
  document.getElementById("profileEmail").value = currentUser.email;
  document.getElementById("profileRole").value  = currentUser.role;

  document.getElementById("profileModal").style.display = "flex";
};

window.saveProfile = async function () {
  const name  = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();

  if (!name || !email) { showToast("Name and email are required.", "error"); return; }
  if (!currentUser?.id) { showToast("Session expired. Please log in again.", "error"); return; }

  try {
    const res  = await fetch(`${API_BASE_URL}/api/user/${currentUser.id}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json", "x-user-id": currentUser.id },
      body   : JSON.stringify({ name, email })
    });
    const data = await res.json();

    if (data.success) {
      // Update in-memory state + sessionStorage
      currentUser = { ...currentUser, name: data.data.name, email: data.data.email };
      localStorage.setItem("edvantage_user", JSON.stringify(currentUser));
      updateNavbarForLoggedInUser(currentUser); // refresh Navbar name/avatar
      closeAllModals();
      showToast("Profile updated successfully! ✅", "success");
    } else {
      showToast("Error: " + data.message, "error");
    }
  } catch (err) {
    showToast("Could not connect to the server.", "error");
  }
};


// ──────────────────────────────────────────────────────────────
// SECTION 11 — ACCOUNT SETTINGS MODAL
// ──────────────────────────────────────────────────────────────

window.openSettingsModal = function () {
  closeUserDropdown();
  document.getElementById("settingsModal").style.display = "flex";
};


// ──────────────────────────────────────────────────────────────
// SECTION 12 — DELETE ACCOUNT  (two-step confirmation)
// ──────────────────────────────────────────────────────────────

/**
 * Step 1 — Ask user verbally via confirm(), then open password modal.
 */
window.initiateDeleteAccount = function () {
  const confirmed = window.confirm(
    "⚠️  Are you absolutely sure?\n\n" +
    "Deleting your account will permanently erase all your data, " +
    "progress, and certificates.\n\nClick OK to proceed to the final step."
  );
  if (!confirmed) return;

  document.getElementById("settingsModal").style.display = "none";
  document.getElementById("deleteConfirmPass").value     = "";
  document.getElementById("deleteModal").style.display   = "flex";
};

/**
 * Step 2 — Validate password, call DELETE /api/user/:id.
 */
window.confirmDeleteAccount = async function () {
  const password = document.getElementById("deleteConfirmPass").value;
  if (!password) { showToast("Please enter your password to confirm deletion.", "error"); return; }
  if (!currentUser?.id) { showToast("Session expired. Please log in again.", "error"); return; }

  try {
    const res  = await fetch(`${API_BASE_URL}/api/user/${currentUser.id}`, {
      method : "DELETE",
      headers: { "Content-Type": "application/json", "x-user-id": currentUser.id },
      body   : JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      closeAllModals();
      logoutUser();
      showToast("Your account has been permanently deleted. 👋", "info");
    } else {
      showToast("Error: " + data.message, "error");
    }
  } catch (err) {
    showToast("Could not connect to the server.", "error");
  }
};


// ──────────────────────────────────────────────────────────────
// SECTION 13 — ADMIN DASHBOARD MODAL
// ──────────────────────────────────────────────────────────────

window.openAdminDashboard = async function () {
  closeUserDropdown();
  document.getElementById("adminModal").style.display = "flex";

  const tbody = document.getElementById("adminTableBody");
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#999;">Loading users…</td></tr>';

  try {
    
    const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: { 
        "Authorization": `Bearer ${currentUser.token}` // currentUser se token uthao
      }
    }); 
    const data = await res.json();
   

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#c53030;padding:2rem;">${data.message || "Error"}</td></tr>`;
      return;
    }

    const users  = data.users || []; 
    const admins = users.filter(u => u.role === "admin").length;

    // SECTION 13 ke andar is block ko dhundo:

    document.getElementById("totalUsers").innerText   = users.length;
    document.getElementById("totalAdmins").innerText  = admins;
    document.getElementById("totalRegular").innerText = users.length - admins;

    // 🔥 IS PURE BLOCK KO REPLACE KARO 🔥
    // script_9.js ke Section 13 mein check karo
tbody.innerHTML = users.map((u, i) => `
  <tr>
    <td>${i + 1}</td>
    <td>${escapeHtml(u.name || "N/A")}</td>
    <td>${escapeHtml(u.email || "N/A")}</td>
    <td>
       <span class="user-dropdown__role-badge" 
             style="${u.role === "admin" ? "background:#1a0a5e;color:#fff;" : ""}">
         ${u.role || "user"}
       </span>
    </td>
    <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN") : "N/A"}</td> <!-- 🔥 Joined Date fix -->
    <td>
      <button onclick="deleteUserByAdmin('${u.id || u._id}')" 
              style="background:#ff4d4d; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; cursor:pointer;">
        Delete
      </button>
    </td>
  </tr>
`).join("");

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#c53030;padding:2rem;">Backend offline. Start the server and retry.</td></tr>';
  }
};

window.deleteUserByAdmin = async function (userId) {
  // 1. Professional Check: Khud ko delete karne se rokna
  if (userId === currentUser.id) {
    showToast("Action denied: Administrative accounts cannot be self-deleted.", "error");
    return;
  }
  
  // 2. Confirmation prompt
  if (!confirm("Are you sure you want to permanently delete this user?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/user/${userId}`, {
      method: "DELETE",
      headers: { 
        "Authorization": `Bearer ${currentUser.token}` 
      }
    });

    const data = await res.json();
    if (data.success) {
      showToast("User account has been successfully removed.", "success");
      openAdminDashboard(); // Table refresh karne ke liye
    } else {
      showToast("Error: " + data.message, "error");
    }
  } catch (err) {
    showToast("An error occurred while attempting to delete the user.", "error");
  }
};
// ──────────────────────────────────────────────────────────────
// SECTION 14 — TOAST NOTIFICATION SYSTEM
// ──────────────────────────────────────────────────────────────

let _toastTimer;

/**
 * showToast(message, type)
 * ─────────────────────────
 * Non-blocking notification at the bottom of the screen.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 */
window.showToast = function (message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  clearTimeout(_toastTimer);
  toast.innerText     = message;
  toast.className     = `toast toast--${type}`;
  toast.style.display = "block";
  void toast.offsetWidth;                      // force reflow so transition re-fires
  toast.classList.add("toast--visible");

  _toastTimer = setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => { toast.style.display = "none"; }, 400);
  }, 3500);
};


// ──────────────────────────────────────────────────────────────
// SECTION 15 — CLOSE ALL MODALS + BACKDROP CLICK
// ──────────────────────────────────────────────────────────────

window.closeAllModals = function () {
  ["loginModal","profileModal","settingsModal","deleteModal","adminModal"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
};

// Clicking the dark overlay backdrop closes that modal
document.addEventListener("click", (e) => {
  ["loginModal","profileModal","settingsModal","deleteModal","adminModal"].forEach(id => {
    const el = document.getElementById(id);
    if (el && e.target === el) el.style.display = "none";
  });
});


// ──────────────────────────────────────────────────────────────
// SECTION 16 — SCROLL-REVEAL  (IntersectionObserver)
// ──────────────────────────────────────────────────────────────

let revealObserver;

function observeRevealElements() {
  if (revealObserver) revealObserver.disconnect();

  revealObserver = new IntersectionObserver(
    entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }),
    { threshold: 0.12 }
  );

  document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));
}


// ──────────────────────────────────────────────────────────────
// SECTION 17 — UI BEHAVIOURS
// ──────────────────────────────────────────────────────────────

function handleHeaderScroll() {
  document.getElementById("header")?.classList.toggle("scrolled", window.scrollY > 20);
}

function handleBackToTop() {
  document.getElementById("backToTop")?.classList.toggle("visible", window.scrollY > 400);
}

function initMobileMenu() {
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobileNav");
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    hamburger.classList.toggle("open", open);
    hamburger.setAttribute("aria-expanded", String(open));
  });

  mobileNav.querySelectorAll(".mobile-nav__link").forEach(link =>
    link.addEventListener("click", () => {
      mobileNav.classList.remove("open");
      hamburger.classList.remove("open");
    })
  );
}


// ──────────────────────────────────────────────────────────────
// SECTION 18 — BOOTSTRAP  (DOMContentLoaded)
// ──────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {

  // 1. Restore session from sessionStorage (handles page refresh)
  restoreSession();

  // 2. Fetch & render courses from the backend API
  fetchCourses();

  // 3. Wire up the search box with 200ms debounce
  initSearch();

  // 4. Mobile hamburger menu
  initMobileMenu();

  // 5. Scroll-driven behaviours
  window.addEventListener("scroll", () => {
    handleHeaderScroll();
    handleBackToTop();
  }, { passive: true });

  // 6. Back-to-top button
  document.getElementById("backToTop")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // 7. Mark static elements for scroll-reveal animation
  document.querySelectorAll(
    ".feature-card, .section-header, .testimonial, .hero__badge, .hero__copy, .hero__visual"
  ).forEach(el => el.classList.add("reveal"));

  observeRevealElements();
});

// --- script.js ke bilkul niche ye add karo ---

window.filterAdminUsers = function() {
  const searchTerm = document.getElementById("adminUserSearch").value.toLowerCase();
  
  // 🔥 Screenshot ke hisaab se teri ID 'adminTableBody' hai
  const tbody = document.getElementById("adminTableBody"); 
  
  if (!tbody) {
    console.error("Table body not found! Check if ID is adminTableBody");
    return;
  }

  const rows = tbody.querySelectorAll("tr");

  rows.forEach(row => {
    // Name 2nd column (index 1) aur Email 3rd column (index 2)
    const name = row.cells[1] ? row.cells[1].textContent.toLowerCase() : "";
    const email = row.cells[2] ? row.cells[2].textContent.toLowerCase() : "";

    // Agar search term name ya email mein hai, toh row dikhao, warna hide karo
    if (name.includes(searchTerm) || email.includes(searchTerm)) {
      row.style.display = ""; 
    } else {
      row.style.display = "none"; 
    }
  });
};