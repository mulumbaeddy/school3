const SUPABASE_URL = 'https://dljvmlshqegrwxqduggo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZtbHNocWVncnd4cWR1Z2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDE5NDgsImV4cCI6MjA5MDQ3Nzk0OH0.1TjmfFhcy5trfOgfu0Y8iQTeKFUNqvjUnniKUtzvuX8';

let sb = null;
let currentUser = null;
let currentUserRole = null;
let currentLevel = 'olevel';
let currentPage = 'dashboard';
// ============================================
// AUTO-REFRESH SESSION TOKEN
// Prevents JWT expired errors
// ============================================

function startAutoRefresh() {
    // Refresh token every 50 minutes (before 1 hour expiry)
    setInterval(async () => {
        if (sb && sb.auth) {
            try {
                const { data, error } = await sb.auth.refreshSession();
                if (error) {
                    console.log("Session refresh failed:", error.message);
                    // Optional: Show warning to user
                    if (error.message.includes("Invalid Refresh Token")) {
                        console.log("Please login again");
                        localStorage.clear();
                        location.reload();
                    }
                } else {
                    console.log("✅ Session token refreshed at:", new Date().toLocaleTimeString());
                }
            } catch (err) {
                console.error("Refresh error:", err);
            }
        }
    }, 50 * 60 * 1000); // 50 minutes
}

// Call this after Supabase is initialized
startAutoRefresh();
// Global data stores
let students = [];
let teachers = [];
let subjects = [];
let marks = [];
let books = [];
let payments = [];
let attendance = [];

// Configuration

const terms = ['Term 1', 'Term 2', 'Term 3', 'Mid-Term', 'Mock'];

// Role Menus
const roleMenus = {
    superadmin: [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard" },
        { page: "users", icon: "fa-users-cog", label: "User Management" },
        { page: "students", icon: "fa-users", label: "Students" },
        { page: "teachers", icon: "fa-chalkboard-user", label: "Teachers" },
        { page: "subjects", icon: "fa-book-open", label: "Subjects" },
        { page: "marks", icon: "fa-chart-line", label: "Marks" },
        { page: "attendance", icon: "fa-calendar-check", label: "Attendance" },
        { page: "library", icon: "fa-book", label: "Library" },
        { page: "payments", icon: "fa-credit-card", label: "Payments" },
        { page: "reports", icon: "fa-file-alt", label: "Reports" },
        { page: "promotion", icon: "fa-arrow-up", label: "Promotion" },
        { page: "settings", icon: "fa-cog", label: "Settings" }
    ],
    admin: [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard" },
        { page: "students", icon: "fa-users", label: "Students" },
        { page: "teachers", icon: "fa-chalkboard-user", label: "Teachers" },
        { page: "subjects", icon: "fa-book-open", label: "Subjects" },
        { page: "marks", icon: "fa-chart-line", label: "Marks" },
        { page: "attendance", icon: "fa-calendar-check", label: "Attendance" },
        { page: "library", icon: "fa-book", label: "Library" },
        { page: "payments", icon: "fa-credit-card", label: "Payments" },
        { page: "reports", icon: "fa-file-alt", label: "Reports" },
        { page: "promotion", icon: "fa-arrow-up", label: "Promotion" }
    ],
    teacher: [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard" },
        { page: "students", icon: "fa-users", label: "Students" },
        { page: "marks", icon: "fa-chart-line", label: "Marks" },
        { page: "attendance", icon: "fa-calendar-check", label: "Attendance" },
        { page: "reports", icon: "fa-file-alt", label: "Reports" }
    ],
    librarian: [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard" },
        { page: "library", icon: "fa-book", label: "Library" }
    ],
    accountant: [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard" },
        { page: "payments", icon: "fa-credit-card", label: "Payments" }
    ]
};

// Helper Functions
function generateAdmissionNo() {
    const year = new Date().getFullYear();
    const prefix = currentLevel === 'olevel' ? 'O' : 'A';
    const count = students.length + 1;
    return `${prefix}/${year}/${String(count).padStart(4, '0')}`;
}

function generateStaffId() {
    return `TCH/${new Date().getFullYear()}/${String(teachers.length + 1).padStart(4, '0')}`;
}

function generateReceiptNo() {
    return `RCP/${new Date().getFullYear()}/${String(payments.length + 1).padStart(6, '0')}`;
}

function getGrade(score, maxMarks) {
    const percentage = (score / maxMarks) * 100;
    if (percentage >= 90) return { grade: 'A', points: currentLevel === 'alevel' ? 6 : 1 };
    if (percentage >= 80) return { grade: 'B', points: currentLevel === 'alevel' ? 5 : 2 };
    if (percentage >= 70) return { grade: 'C', points: currentLevel === 'alevel' ? 4 : 3 };
    if (percentage >= 60) return { grade: 'D', points: currentLevel === 'alevel' ? 3 : 4 };
    if (percentage >= 50) return { grade: 'E', points: currentLevel === 'alevel' ? 2 : 5 };
    if (currentLevel === 'alevel' && percentage >= 40) return { grade: 'O', points: 1 };
    return { grade: 'F', points: 0 };
}

function calculateAverage(studentId, exam, year) {
    const studentMarks = marks.filter(m => m.student_id === studentId && m.exam === exam && m.year === year);
    if (studentMarks.length === 0) return 0;
    let total = 0;
    for (const m of studentMarks) {
        total += (m.marks_obtained / m.max_marks) * 100;
    }
    return total / studentMarks.length;
}

async function initSupabase() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialized");
}

// ============================================
// LOGIN FUNCTION WITH RLS COMPATIBILITY
// ============================================

async function login(email, password) {
    const btn = document.getElementById('loginBtn');
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
        
        console.log("Attempting login for:", email);
        
        // Step 1: Sign in with Supabase Auth
        const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email, password });
        if (authError) throw new Error(authError.message);
        
        console.log("✅ Auth successful for:", email);
        console.log("Auth User ID:", authData.user.id);
        
        // Step 2: Get user role from users table (RLS will allow because user is authenticated)
        const { data: userData, error: userError } = await sb
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();  // Use maybeSingle() instead of single() to avoid 406 error
        
        if (userError) {
            console.error("Error fetching user:", userError);
            // If user not found, create a default entry
            console.log("Creating new user record...");
            
            let defaultRole = 'teacher';
            if (email.includes('superadmin')) defaultRole = 'superadmin';
            else if (email.includes('admin')) defaultRole = 'admin';
            else if (email.includes('teacher')) defaultRole = 'teacher';
            else if (email.includes('bursar')) defaultRole = 'bursar';
            else if (email.includes('secretary')) defaultRole = 'secretary';
            else if (email.includes('librarian')) defaultRole = 'librarian';
            
            const { data: newUser, error: insertError } = await sb
                .from('users')
                .insert([{ 
                    id: authData.user.id, 
                    email: email, 
                    name: email.split('@')[0],
                    role: defaultRole 
                }])
                .select()
                .single();
            
            if (insertError) {
                console.error("Failed to create user:", insertError);
                // Fallback: use default role
                currentUser = {
                    id: authData.user.id,
                    email: email,
                    name: email.split('@')[0],
                    role: defaultRole
                };
            } else {
                currentUser = newUser;
            }
        } else if (!userData) {
            // User not found, create new
            let defaultRole = 'teacher';
            if (email.includes('superadmin')) defaultRole = 'superadmin';
            else if (email.includes('admin')) defaultRole = 'admin';
            else if (email.includes('teacher')) defaultRole = 'teacher';
            else if (email.includes('bursar')) defaultRole = 'bursar';
            else if (email.includes('secretary')) defaultRole = 'secretary';
            else if (email.includes('librarian')) defaultRole = 'librarian';
            
            const { data: newUser, error: insertError } = await sb
                .from('users')
                .insert([{ 
                    id: authData.user.id, 
                    email: email, 
                    name: email.split('@')[0],
                    role: defaultRole 
                }])
                .select()
                .single();
            
            if (insertError) {
                currentUser = {
                    id: authData.user.id,
                    email: email,
                    name: email.split('@')[0],
                    role: defaultRole
                };
            } else {
                currentUser = newUser;
            }
        } else {
            currentUser = userData;
        }
        
        currentUserRole = currentUser.role;
        
        console.log("✅ User role from database:", currentUserRole);
        console.log("✅ Current user:", currentUser);
        
        // Step 3: Save to localStorage
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('userRole', currentUserRole);
        
        // Step 4: Show welcome message
        Swal.fire({ 
            icon: 'success', 
            title: 'Welcome!', 
            text: `Hello ${currentUser.name} (${currentUserRole.toUpperCase()})`, 
            timer: 2000, 
            showConfirmButton: false 
        });
        
        return true;
        
    } catch(error) {
        console.error("Login error:", error);
        Swal.fire({ icon: 'error', title: 'Login Failed', text: error.message });
        return false;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Login';
    }
}

// ============================================
// CHECK AUTHENTICATION - RESTORES USER FROM STORAGE
// ============================================
async function checkAuth() {
    const loggedIn = localStorage.getItem('loggedIn');
    if (loggedIn === 'true') {
        const savedUser = JSON.parse(localStorage.getItem('currentUser'));
        if (savedUser) {
            currentUser = savedUser;
            currentUserRole = savedUser.role;
            console.log("Restored user role from storage:", currentUserRole);
            showMainApp();
            return true;
        }
    }
    
    // Check for active session
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        console.log("Active session found for:", session.user.email);
        
        // Try to get user from database
        const { data: userData, error: userError } = await sb
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .maybeSingle();
        
        if (userData) {
            currentUser = { 
                id: session.user.id, 
                email: session.user.email, 
                name: userData.name || session.user.email.split('@')[0], 
                role: userData.role 
            };
        } else {
            // Create user if not exists
            let defaultRole = 'teacher';
            if (session.user.email.includes('superadmin')) defaultRole = 'superadmin';
            else if (session.user.email.includes('admin')) defaultRole = 'admin';
            else if (session.user.email.includes('teacher')) defaultRole = 'teacher';
            else if (session.user.email.includes('bursar')) defaultRole = 'bursar';
            else if (session.user.email.includes('secretary')) defaultRole = 'secretary';
            else if (session.user.email.includes('librarian')) defaultRole = 'librarian';
            
            const { data: newUser } = await sb
                .from('users')
                .insert([{ 
                    id: session.user.id, 
                    email: session.user.email, 
                    name: session.user.email.split('@')[0],
                    role: defaultRole 
                }])
                .select()
                .single();
            
            currentUser = newUser || {
                id: session.user.id,
                email: session.user.email,
                name: session.user.email.split('@')[0],
                role: defaultRole
            };
        }
        
        currentUserRole = currentUser.role;
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('userRole', currentUserRole);
        showMainApp();
        return true;
    }
    return false;
}

// ============================================
// DISPLAY USER ROLE IN THE INTERFACE
// ============================================
function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    // Display user name and role in sidebar
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('sidebarUserRole').textContent = currentUserRole.toUpperCase();
    
    // Display role badge in top bar with appropriate color
    const roleBadge = document.getElementById('userRoleBadge');
    if (roleBadge) {
        roleBadge.textContent = currentUserRole.toUpperCase();
        
        // Set badge color based on role
        let badgeColor = 'secondary';
        let badgeBg = '';
        if (currentUserRole === 'superadmin') {
            badgeColor = 'white';
            badgeBg = 'bg-danger';
        } else if (currentUserRole === 'admin') {
            badgeColor = 'white';
            badgeBg = 'bg-primary';
        } else if (currentUserRole === 'teacher') {
            badgeColor = 'white';
            badgeBg = 'bg-info';
        } else if (currentUserRole === 'bursar') {
            badgeColor = 'dark';
            badgeBg = 'bg-warning';
        } else if (currentUserRole === 'secretary') {
            badgeColor = 'white';
            badgeBg = 'bg-success';
        } else if (currentUserRole === 'librarian') {
            badgeColor = 'white';
            badgeBg = 'bg-dark';
        }
        
        roleBadge.className = `badge ${badgeBg} ms-2`;
        roleBadge.style.color = badgeColor;
    }
    
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    
    console.log("=========================================");
    console.log("USER LOGGED IN:");
    console.log("Name:", currentUser.name);
    console.log("Email:", currentUser.email);
    console.log("Role:", currentUserRole);
    console.log("=========================================");
    
    renderSidebar();
    loadPage('dashboard');
}

// ============================================
// RENDER SIDEBAR BASED ON ROLE
// ============================================
function renderSidebar() {
    // Get menus based on user role from database
    const menus = roleMenus[currentUserRole] || roleMenus.teacher;
    const container = document.getElementById('sidebarNav');
    container.innerHTML = '<div class="px-3 py-2 small text-white-50">MAIN MENU</div>';
    
    menus.forEach(item => {
        container.innerHTML += `<div class="nav-item" data-page="${item.page}"><i class="fas ${item.icon}"></i><span>${item.label}</span></div>`;
    });
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => { 
            loadPage(el.dataset.page); 
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); 
            el.classList.add('active');
            
            // ========== ADD THIS CODE HERE ==========
            // Close mobile menu after clicking a module
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (window.innerWidth <= 768) {
                if (sidebar) sidebar.classList.remove('mobile-open');
                if (overlay) overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
            // =========================================
        });
    });
    
    document.querySelectorAll('.level-badge-item').forEach(el => {
        el.addEventListener('click', () => { 
            currentLevel = el.dataset.level; 
            document.querySelectorAll('.level-badge-item').forEach(l => l.classList.remove('active')); 
            el.classList.add('active'); 
            loadPage(currentPage);
            
            // ========== ADD THIS CODE HERE ==========
            // Close mobile menu after changing level
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (window.innerWidth <= 768) {
                if (sidebar) sidebar.classList.remove('mobile-open');
                if (overlay) overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
            // =========================================
        });
    });
    
    // ========== ADD THIS ENTIRE FUNCTION AT THE END ==========
    // Initialize mobile menu toggle
    const toggleBtn = document.getElementById('mobileMenuToggleBtn');
    const overlay = document.getElementById('mobileOverlay');
    const sidebar = document.getElementById('sidebar');
    
    if (toggleBtn && sidebar) {
        // Remove existing listeners to avoid duplicates
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
        
        newToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-open');
            if (overlay) overlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
        });
    }
    
    if (overlay) {
        const newOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOverlay, overlay);
        
        newOverlay.addEventListener('click', function() {
            const sidebarEl = document.getElementById('sidebar');
            if (sidebarEl) sidebarEl.classList.remove('mobile-open');
            newOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
    // ===========================================================
}

// ============================================
// TEST FUNCTION TO VERIFY ROLE IS WORKING
// ============================================
function testRoleDisplay() {
    console.log("=== CURRENT USER INFO ===");
    console.log("User Name:", currentUser?.name);
    console.log("User Email:", currentUser?.email);
    console.log("User Role:", currentUserRole);
    console.log("Role from storage:", localStorage.getItem('userRole'));
    console.log("Available Menus:", roleMenus[currentUserRole]?.map(m => m.label).join(', '));
    console.log("=========================");
    
    Swal.fire({
        title: "Current User Information",
        html: `
            <div class="text-start">
                <p><strong>Name:</strong> ${currentUser?.name}</p>
                <p><strong>Email:</strong> ${currentUser?.email}</p>
                <p><strong>Role:</strong> <span class="badge ${currentUserRole === 'superadmin' ? 'bg-danger' : currentUserRole === 'admin' ? 'bg-primary' : currentUserRole === 'teacher' ? 'bg-info' : currentUserRole === 'bursar' ? 'bg-warning' : currentUserRole === 'secretary' ? 'bg-success' : 'bg-secondary'}">${currentUserRole?.toUpperCase()}</span></p>
                <p><strong>Menu Access:</strong> ${roleMenus[currentUserRole]?.map(m => m.label).join(', ') || 'Teacher Menu'}</p>
                <hr>
                <p><strong>Database Connection:</strong> ✅ Active</p>
                <p><strong>RLS Enabled:</strong> ✅ Yes</p>
            </div>
        `,
        icon: 'info',
        confirmButtonText: 'OK'
    });
}
function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('sidebarUserRole').textContent = currentUserRole.toUpperCase();
    document.getElementById('userRoleBadge').textContent = currentUserRole.toUpperCase();
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    renderSidebar();
    loadPage('dashboard');
}

function renderSidebar() {
    const menus = roleMenus[currentUserRole] || roleMenus.teacher;
    const container = document.getElementById('sidebarNav');
    container.innerHTML = '<div class="px-3 py-2 small text-white-50">MAIN MENU</div>';
    menus.forEach(item => {
        container.innerHTML += `<div class="nav-item" data-page="${item.page}"><i class="fas ${item.icon}"></i><span>${item.label}</span></div>`;
    });
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => { loadPage(el.dataset.page); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); el.classList.add('active'); });
    });
    document.querySelectorAll('.level-badge-item').forEach(el => {
        el.addEventListener('click', () => { currentLevel = el.dataset.level; document.querySelectorAll('.level-badge-item').forEach(l => l.classList.remove('active')); el.classList.add('active'); loadPage(currentPage); });
    });
}

// ==================== DATABASE OPERATIONS ====================
async function getStudents() {
    const { data, error } = await sb.from('students').select('*').eq('level', currentLevel).order('created_at', { ascending: false });
    if (error) return [];
    students = data;
    return data;
}

async function addStudent(student) {
    const { data, error } = await sb.from('students').insert([student]).select();
    if (error) throw error;
    return data[0];
}

async function updateStudent(id, student) {
    const { data, error } = await sb.from('students').update(student).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteStudent(id) {
    const { error } = await sb.from('students').delete().eq('id', id);
    if (error) throw error;
}

async function getSubjects() {
    const { data, error } = await sb.from('subjects').select('*').eq('level', currentLevel).order('name', { ascending: true });
    if (error) return [];
    subjects = data;
    return data;
}

async function addSubject(subject) {
    const { data, error } = await sb.from('subjects').insert([subject]).select();
    if (error) throw error;
    return data[0];
}

async function updateSubject(id, subject) {
    const { data, error } = await sb.from('subjects').update(subject).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteSubject(id) {
    const { error } = await sb.from('subjects').delete().eq('id', id);
    if (error) throw error;
}

async function getMarks() {
    const { data, error } = await sb.from('marks').select('*').order('created_at', { ascending: false });
    if (error) return [];
    marks = data;
    return data;
}

async function addMark(mark) {
    const { data, error } = await sb.from('marks').insert([mark]).select();
    if (error) throw error;
    return data[0];
}

async function updateMark(id, mark) {
    const { data, error } = await sb.from('marks').update(mark).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteMark(id) {
    const { error } = await sb.from('marks').delete().eq('id', id);
    if (error) throw error;
}

async function getTeachers() {
    const { data, error } = await sb.from('teachers').select('*').order('created_at', { ascending: false });
    if (error) return [];
    teachers = data;
    return data;
}

async function addTeacher(teacher) {
    const { data, error } = await sb.from('teachers').insert([teacher]).select();
    if (error) throw error;
    return data[0];
}

async function updateTeacher(id, teacher) {
    const { data, error } = await sb.from('teachers').update(teacher).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteTeacher(id) {
    const { error } = await sb.from('teachers').delete().eq('id', id);
    if (error) throw error;
}

async function getBooks() {
    const { data, error } = await sb.from('books').select('*').order('created_at', { ascending: false });
    if (error) return [];
    books = data;
    return data;
}

async function addBook(book) {
    const { data, error } = await sb.from('books').insert([book]).select();
    if (error) throw error;
    return data[0];
}

async function updateBook(id, book) {
    const { data, error } = await sb.from('books').update(book).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteBook(id) {
    const { error } = await sb.from('books').delete().eq('id', id);
    if (error) throw error;
}

async function getPayments() {
    const { data, error } = await sb.from('payments').select('*').order('payment_date', { ascending: false });
    if (error) return [];
    payments = data;
    return data;
}

async function addPayment(payment) {
    const { data, error } = await sb.from('payments').insert([payment]).select();
    if (error) throw error;
    return data[0];
}

async function deletePayment(id) {
    const { error } = await sb.from('payments').delete().eq('id', id);
    if (error) throw error;
}

async function getAttendance() {
    const { data, error } = await sb.from('attendance').select('*').order('attendance_date', { ascending: false });
    if (error) return [];
    attendance = data;
    return data;
}

async function addAttendance(record) {
    const { data, error } = await sb.from('attendance').insert([record]).select();
    if (error) throw error;
    return data[0];
}

async function deleteAttendance(id) {
    const { error } = await sb.from('attendance').delete().eq('id', id);
    if (error) throw error;
}

async function getUsers() {
    const { data, error } = await sb.from('users').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return data;
}

async function addUser(user) {
    const { data, error } = await sb.from('users').insert([user]).select();
    if (error) throw error;
    return data[0];
}

async function deleteUser(id) {
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
}

// ==================== PAGE LOADER ====================
async function loadPage(page) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    currentPage = page;
    const titles = {
        dashboard: 'Dashboard', users: 'User Management', students: 'Students',
        teachers: 'Teachers', subjects: 'Subjects', marks: 'Marks Entry',
        attendance: 'Attendance', library: 'Library', payments: 'Payments',
        reports: 'Reports', promotion: 'Promotion', settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';
    
    const renderers = {
        dashboard: renderDashboard, users: renderUsers, students: renderStudents,
        teachers: renderTeachers, subjects: renderSubjects, marks: renderMarks,
        attendance: renderAttendance, library: renderLibrary, payments: renderPayments,
        reports: renderReports, promotion: renderPromotion, settings: renderSettings
    };
    
    const container = document.getElementById('pageContent');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading...</p></div>';
    try {
        const html = await (renderers[page] || renderDashboard)();
        container.innerHTML = html;
        if (page === 'students') await loadStudentsTable();
        if (page === 'subjects') await loadSubjectsTable();
        if (page === 'marks') await loadMarksTable();
        if (page === 'teachers') await loadTeachersTable();
        if (page === 'library') await loadBooksTable();
        if (page === 'payments') await loadPaymentsTable();
        if (page === 'attendance') await loadAttendanceTable();
        if (page === 'users') await loadUsersTable();
    } catch(e) { container.innerHTML = '<div class="alert alert-danger">Error loading page</div>'; }
}

// ==================== DASHBOARD - PROFESSIONAL & RESPONSIVE ====================
async function renderDashboard() {
    // Load all data in parallel for better performance
    const [studentsData, teachersData, subjectsData, marksData, booksData, paymentsData, attendanceData] = await Promise.all([
        getStudents(),
        getTeachers(),
        getSubjects(),
        getMarks(),
        getBooks(),
        getPayments(),
        getAttendance()
    ]);
    
    // Calculate statistics
    const boarding = studentsData.filter(s => s.student_type === 'Boarding').length;
    const day = studentsData.length - boarding;
    const totalFees = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalBooks = booksData.reduce((sum, book) => sum + (book.copies || 0), 0);
    const todayAttendance = attendanceData.filter(a => a.attendance_date === new Date().toISOString().split('T')[0]).length;
    const todayAttendancePercent = studentsData.length > 0 ? ((todayAttendance / studentsData.length) * 100).toFixed(1) : 0;
    
    // Get recent payments (last 5)
    const recentPayments = [...paymentsData].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).slice(0, 5);
    
    // Role badge color mapping
    const roleBadgeColors = {
        superadmin: 'bg-danger',
        admin: 'bg-primary',
        teacher: 'bg-info',
        accountant: 'bg-warning text-dark',
        librarian: 'bg-dark',
        secretary: 'bg-success'
    };
    const roleColor = roleBadgeColors[currentUserRole] || 'bg-secondary';
    
    // Get available pages from roleMenus for current user
    const availablePages = roleMenus[currentUserRole]?.map(menu => menu.page) || [];
    
    // Welcome buttons based on role
    const welcomeButtonConfig = {
        superadmin: [
            { page: "students", label: "Students", icon: "fa-users", color: "primary" },
            { page: "marks", label: "Marks", icon: "fa-chart-line", color: "info" },
            { page: "payments", label: "Payments", icon: "fa-credit-card", color: "success" },
            { page: "reports", label: "Reports", icon: "fa-file-alt", color: "warning" }
        ],
        admin: [
            { page: "students", label: "Students", icon: "fa-users", color: "primary" },
            { page: "marks", label: "Marks", icon: "fa-chart-line", color: "info" },
            { page: "payments", label: "Payments", icon: "fa-credit-card", color: "success" },
            { page: "reports", label: "Reports", icon: "fa-file-alt", color: "warning" }
        ],
        teacher: [
            { page: "students", label: "Students", icon: "fa-users", color: "primary" },
            { page: "marks", label: "Marks", icon: "fa-chart-line", color: "info" },
            { page: "attendance", label: "Attendance", icon: "fa-calendar-check", color: "warning" },
            { page: "reports", label: "Reports", icon: "fa-file-alt", color: "success" }
        ],
        librarian: [
            { page: "library", label: "Library", icon: "fa-book", color: "primary" }
        ],
        accountant: [
            { page: "payments", label: "Payments", icon: "fa-credit-card", color: "success" },
        ],
        secretary: [
            { page: "students", label: "Students", icon: "fa-users", color: "primary" },
            { page: "attendance", label: "Attendance", icon: "fa-calendar-check", color: "warning" },
            { page: "reports", label: "Reports", icon: "fa-file-alt", color: "success" }
        ]
    };
    
    const welcomeButtons = welcomeButtonConfig[currentUserRole] || welcomeButtonConfig.teacher;
    
    // Card configuration
    const cardConfig = {
        students: { 
            roles: ['superadmin', 'admin', 'teacher', 'secretary'], 
            onclick: "loadPage('students')",
            icon: "fa-users",
            bg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            label: "Total Students",
            value: studentsData.length,
            extra: `${boarding} Boarding | ${day} Day`
        },
        teachers: { 
            roles: ['superadmin', 'admin'], 
            onclick: "loadPage('teachers')",
            icon: "fa-chalkboard-user",
            bg: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            label: "Teachers",
            value: teachersData.length,
            extra: "Staff Members"
        },
        subjects: { 
            roles: ['superadmin', 'admin', 'teacher'], 
            onclick: "loadPage('subjects')",
            icon: "fa-book-open",
            bg: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            label: "Subjects",
            value: subjectsData.length,
            extra: "Offered Courses"
        },
        library: { 
            roles: ['superadmin', 'admin', 'librarian'], 
            onclick: "loadPage('library')",
            icon: "fa-book",
            bg: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            label: "Books",
            value: totalBooks,
            extra: "Library Collection"
        },
        marks: { 
            roles: ['superadmin', 'admin', 'teacher'], 
            onclick: "loadPage('marks')",
            icon: "fa-chart-line",
            bg: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
            label: "Marks Records",
            value: marksData.length,
            extra: "Entries Recorded"
        },
        payments: { 
            roles: ['superadmin', 'admin', 'accountant'], 
            onclick: "loadPage('payments')",
            icon: "fa-money-bill-wave",
            bg: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
            label: "Fees Collected",
            value: formatMoney(totalFees),
            extra: "Total Revenue"
        },
        attendance: { 
            roles: ['superadmin', 'admin', 'teacher', 'secretary'], 
            onclick: "loadPage('attendance')",
            icon: "fa-calendar-check",
            bg: todayAttendancePercent >= 80 ? "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" : 
                todayAttendancePercent >= 50 ? "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" : 
                "linear-gradient(135deg, #eb3349 0%, #f45c43 100%)",
            label: "Today's Attendance",
            value: `${todayAttendance} / ${studentsData.length}`,
            extra: `${todayAttendancePercent}% Present`
        }
    };
    
    // Filter cards based on user role
    const visibleCards = Object.entries(cardConfig).filter(([key, config]) => 
        config.roles.includes(currentUserRole)
    );
    
    // Generate stats cards HTML (responsive grid)
    const statsCardsHtml = `
        <div class="stats-grid">
            ${visibleCards.map(([key, card]) => `
                <div class="stat-card" onclick="${card.onclick}">
                    <div class="stat-card-inner">
                        <div class="stat-icon" style="background: ${card.bg}">
                            <i class="fas ${card.icon}"></i>
                        </div>
                        <div class="stat-content">
                            <h3 class="stat-value">${card.value}</h3>
                            <p class="stat-label">${card.label}</p>
                            <span class="stat-extra">${card.extra}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Quick actions based on role
    const quickActionsConfig = {
        superadmin: [
            { icon: "fa-user-plus", label: "Add Student", onclick: "loadPage('students')", color: "#667eea" },
            { icon: "fa-credit-card", label: "Record Payment", onclick: "loadPage('payments')", color: "#28a745" },
            { icon: "fa-chart-line", label: "Enter Marks", onclick: "loadPage('marks')", color: "#17a2b8" },
            { icon: "fa-calendar-check", label: "Mark Attendance", onclick: "loadPage('attendance')", color: "#ffc107" },
            { icon: "fa-users-cog", label: "User Management", onclick: "loadPage('users')", color: "#dc3545" },
            { icon: "fa-cog", label: "Settings", onclick: "loadPage('settings')", color: "#6c757d" }
        ],
        admin: [
            { icon: "fa-user-plus", label: "Add Student", onclick: "loadPage('students')", color: "#667eea" },
            { icon: "fa-credit-card", label: "Record Payment", onclick: "loadPage('payments')", color: "#28a745" },
            { icon: "fa-chart-line", label: "Enter Marks", onclick: "loadPage('marks')", color: "#17a2b8" },
            { icon: "fa-calendar-check", label: "Mark Attendance", onclick: "loadPage('attendance')", color: "#ffc107" },
            { icon: "fa-chalkboard-user", label: "Manage Teachers", onclick: "loadPage('teachers')", color: "#fd7e14" }
        ],
        teacher: [
            { icon: "fa-chart-line", label: "Enter Marks", onclick: "loadPage('marks')", color: "#17a2b8" },
            { icon: "fa-calendar-check", label: "Mark Attendance", onclick: "loadPage('attendance')", color: "#ffc107" },
            { icon: "fa-users", label: "View Students", onclick: "loadPage('students')", color: "#667eea" },
            { icon: "fa-file-alt", label: "View Reports", onclick: "loadPage('reports')", color: "#28a745" }
        ],
        accountant: [
            { icon: "fa-credit-card", label: "Record Payment", onclick: "loadPage('payments')", color: "#28a745" },
        ],
        librarian: [
            { icon: "fa-book", label: "Add Book", onclick: "loadPage('library')", color: "#667eea" },
            { icon: "fa-hand-holding-heart", label: "Borrow Book", onclick: "loadPage('library')", color: "#28a745" },
            { icon: "fa-undo-alt", label: "Return Book", onclick: "loadPage('library')", color: "#ffc107" }
        ],
        secretary: [
            { icon: "fa-user-plus", label: "Enroll Student", onclick: "loadPage('students')", color: "#667eea" },
            { icon: "fa-calendar-check", label: "Mark Attendance", onclick: "loadPage('attendance')", color: "#ffc107" },
            { icon: "fa-file-alt", label: "Print Reports", onclick: "loadPage('reports')", color: "#28a745" }
        ]
    };
    
    const quickActions = quickActionsConfig[currentUserRole] || quickActionsConfig.teacher;
    const showRecentPayments = ['superadmin', 'admin', 'accountant'].includes(currentUserRole);
    
    // Generate welcome buttons
    const welcomeButtonsHtml = welcomeButtons.map(btn => `
        <button class="welcome-btn btn-${btn.color}" onclick="loadPage('${btn.page}')">
            <i class="fas ${btn.icon}"></i>
            <span>${btn.label}</span>
        </button>
    `).join('');
    
    return `
        <div class="dashboard-container">
            <!-- Welcome Section -->
            <div class="welcome-section">
                <div class="welcome-avatar">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div class="welcome-info">
                    <h2>Welcome back, ${escapeHtml(currentUser.name)}!</h2>
                    <div class="welcome-badges">
                        <span class="role-badge ${roleColor.replace('bg-', '')}">${currentUserRole.toUpperCase()}</span>
                        <span class="level-badge">${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'}</span>
                    </div>
                </div>
                <div class="welcome-actions">
                    ${welcomeButtonsHtml}
                </div>
            </div>
            
            <!-- Statistics Cards -->
            ${statsCardsHtml}
            
            <!-- Bottom Section -->
            <div class="dashboard-bottom">
                ${showRecentPayments ? `
                <div class="recent-payments-card">
                    <div class="card-header-custom">
                        <i class="fas fa-history"></i>
                        <h3>Recent Payments</h3>
                    </div>
                    <div class="payments-list">
                        ${recentPayments.length > 0 ? recentPayments.map(p => {
                            const student = studentsData.find(s => s.id === p.student_id);
                            return `
                                <div class="payment-item">
                                    <div class="payment-info">
                                        <span class="payment-date">${p.payment_date || '-'}</span>
                                        <span class="payment-student">${student ? escapeHtml(student.name) : 'Unknown'}</span>
                                    </div>
                                    <span class="payment-amount">${formatMoney(p.amount || 0)}</span>
                                </div>
                            `;
                        }).join('') : '<div class="empty-state">No recent payments</div>'}
                    </div>
                    <div class="card-footer-custom">
                        <button onclick="loadPage('payments')">View All Payments →</button>
                    </div>
                </div>
                ` : ''}
                
                <div class="quick-actions-card ${!showRecentPayments ? 'full-width' : ''}">
                    <div class="card-header-custom">
                        <i class="fas fa-bolt"></i>
                        <h3>Quick Actions</h3>
                    </div>
                    <div class="actions-grid">
                        ${quickActions.map(action => `
                            <button class="action-btn" style="border-left-color: ${action.color}" onclick="${action.onclick}">
                                <i class="fas ${action.icon}" style="color: ${action.color}"></i>
                                <span>${action.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            .dashboard-container {
                padding: 20px;
                max-width: 1400px;
                margin: 0 auto;
            }
            
            /* Welcome Section */
            .welcome-section {
                background: white;
                border-radius: 20px;
                padding: 25px 30px;
                margin-bottom: 30px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                border: 1px solid #eef2f6;
            }
            
            .welcome-avatar {
                width: 70px;
                height: 70px;
                background: linear-gradient(135deg, #01605a, #ff862d);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .welcome-avatar i {
                font-size: 32px;
                color: white;
            }
            
            .welcome-info h2 {
                margin: 0 0 8px 0;
                font-size: 22px;
                color: #2c3e50;
            }
            
            .welcome-badges {
                display: flex;
                gap: 10px;
            }
            
            .role-badge {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                color: white;
            }
            
            .role-badge.superadmin { background: #dc3545; }
            .role-badge.admin { background: #0d6efd; }
            .role-badge.teacher { background: #0dcaf0; color: #000; }
            .role-badge.accountant { background: #fd7e14; }
            .role-badge.librarian { background: #212529; }
            .role-badge.secretary { background: #198754; }
            
            .level-badge {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                background: #6c757d;
                color: white;
            }
            
            .welcome-actions {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .welcome-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 10px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .welcome-btn i { font-size: 14px; }
            
            .welcome-btn.btn-primary { background: #01605a; color: white; }
            .welcome-btn.btn-primary:hover { background: #014a45; transform: translateY(-2px); }
            .welcome-btn.btn-info { background: #17a2b8; color: white; }
            .welcome-btn.btn-info:hover { background: #138496; transform: translateY(-2px); }
            .welcome-btn.btn-success { background: #28a745; color: white; }
            .welcome-btn.btn-success:hover { background: #218838; transform: translateY(-2px); }
            .welcome-btn.btn-warning { background: #ffc107; color: #000; }
            .welcome-btn.btn-warning:hover { background: #e0a800; transform: translateY(-2px); }
            
            /* Stats Grid - Responsive */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-card {
                background: white;
                border-radius: 16px;
                padding: 20px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                border: 1px solid #eef2f6;
            }
            
            .stat-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            
            .stat-card-inner {
                display: flex;
                align-items: center;
                gap: 18px;
            }
            
            .stat-icon {
                width: 60px;
                height: 60px;
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .stat-icon i {
                font-size: 28px;
                color: white;
            }
            
            .stat-content {
                flex: 1;
            }
            
            .stat-value {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
                color: #2c3e50;
            }
            
            .stat-label {
                margin: 5px 0 0;
                font-size: 14px;
                color: #6c757d;
            }
            
            .stat-extra {
                font-size: 11px;
                color: #95a5a6;
                display: block;
                margin-top: 4px;
            }
            
            /* Bottom Section */
            .dashboard-bottom {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                gap: 25px;
            }
            
            .recent-payments-card,
            .quick-actions-card {
                background: white;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                border: 1px solid #eef2f6;
            }
            
            .quick-actions-card.full-width {
                grid-column: 1 / -1;
            }
            
            .card-header-custom {
                padding: 18px 20px;
                border-bottom: 1px solid #eef2f6;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .card-header-custom i {
                font-size: 20px;
                color: #01605a;
            }
            
            .card-header-custom h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #2c3e50;
            }
            
            .payments-list {
                max-height: 300px;
                overflow-y: auto;
            }
            
            .payment-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 20px;
                border-bottom: 1px solid #f0f0f0;
            }
            
            .payment-item:hover {
                background: #f8f9fa;
            }
            
            .payment-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .payment-date {
                font-size: 11px;
                color: #95a5a6;
            }
            
            .payment-student {
                font-size: 14px;
                font-weight: 500;
                color: #2c3e50;
            }
            
            .payment-amount {
                font-weight: 700;
                color: #28a745;
            }
            
            .empty-state {
                padding: 40px;
                text-align: center;
                color: #95a5a6;
            }
            
            .card-footer-custom {
                padding: 12px 20px;
                border-top: 1px solid #eef2f6;
                text-align: center;
            }
            
            .card-footer-custom button {
                background: none;
                border: none;
                color: #01605a;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
            }
            
            .card-footer-custom button:hover {
                text-decoration: underline;
            }
            
            .actions-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
                padding: 20px;
            }
            
            .action-btn {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                background: #f8f9fa;
                border: none;
                border-left: 4px solid;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: left;
            }
            
            .action-btn:hover {
                background: #e9ecef;
                transform: translateX(5px);
            }
            
            .action-btn i {
                font-size: 18px;
                width: 24px;
            }
            
            .action-btn span {
                font-size: 13px;
                font-weight: 500;
                color: #2c3e50;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .dashboard-container {
                    padding: 15px;
                }
                
                .welcome-section {
                    flex-direction: column;
                    text-align: center;
                    padding: 20px;
                }
                
                .welcome-actions {
                    justify-content: center;
                }
                
                .stats-grid {
                    grid-template-columns: 1fr;
                    gap: 15px;
                }
                
                .dashboard-bottom {
                    grid-template-columns: 1fr;
                }
                
                .actions-grid {
                    grid-template-columns: 1fr;
                }
                
                .stat-card-inner {
                    flex-direction: column;
                    text-align: center;
                }
                
                .stat-value {
                    font-size: 24px;
                }
            }
            
            @media (max-width: 480px) {
                .welcome-btn {
                    padding: 8px 16px;
                    font-size: 12px;
                }
                
                .welcome-info h2 {
                    font-size: 18px;
                }
                
                .payment-item {
                    flex-direction: column;
                    text-align: center;
                    gap: 8px;
                }
                
                .payment-info {
                    align-items: center;
                }
            }
        </style>
    `;
}
// ============================================
// COMPLETE STUDENT MANAGEMENT - FULLY WORKING
// With Bulk Upload - Table stays visible
// ============================================

const olevelClasses = ['S.1', 'S.2', 'S.3', 'S.4'];
const alevelClasses = ['S.5', 'S.6'];
const olevelStreams = ['A', 'B', 'C', 'D'];
const alevelStreams = ['Arts', 'Sciences'];

// Initialize Supabase
async function initSupabase() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// REPLACE THIS ENTIRE FUNCTION
// ============================================

// OLD CODE - DELETE THIS:
// function generateAdmissionNo() {
//     const year = new Date().getFullYear();
//     const prefix = currentLevel === 'olevel' ? 'O' : 'A';
//     const count = students.length + 1;
//     return `${prefix}/${year}/${String(count).padStart(4, '0')}`;
// }

// NEW CODE - PASTE THIS:
let admissionNumberCache = new Set();

function generateRandomChars(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function checkAdmissionNumberExists(admissionNo) {
    try {
        const { data, error } = await sb
            .from('students')
            .select('id')
            .eq('admission_no', admissionNo)
            .maybeSingle();
        
        if (error) throw error;
        return data !== null;
    } catch (error) {
        console.error('Error checking admission number:', error);
        return false;
    }
}

async function generateAdmissionNo() {
    const year = new Date().getFullYear();
    const prefix = currentLevel === 'olevel' ? 'O' : 'A';
    
    for (let attempt = 0; attempt < 10; attempt++) {
        const part1 = generateRandomChars(4);
        const part2 = generateRandomChars(4);
        const uniqueCode = `${part1}-${part2}`;
        const admissionNo = `${prefix}/${year}/${uniqueCode}`;
        
        if (admissionNumberCache.has(admissionNo)) continue;
        
        const exists = await checkAdmissionNumberExists(admissionNo);
        
        if (!exists) {
            admissionNumberCache.add(admissionNo);
            return admissionNo;
        }
    }
    
    const fallback = Date.now().toString(36).toUpperCase();
    return `${prefix}/${year}/${fallback.slice(0, 4)}-${fallback.slice(4, 8)}`;
}
// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getStudents() {
    try {
        let query = sb.from('students').select('*');
        if (currentLevel === 'olevel') {
            query = query.in('class', olevelClasses);
        } else {
            query = query.in('class', alevelClasses);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        students = data || [];
        return students;
    } catch (error) {
        console.error("Error:", error);
        return [];
    }
}

// ============================================
// REPLACE THIS ENTIRE FUNCTION
// ============================================

// OLD CODE - DELETE THIS:
// async function addStudent(studentData) {
//     const { data, error } = await sb.from('students').insert([studentData]).select();
//     if (error) throw error;
//     return data[0];
// }

// NEW CODE - PASTE THIS:
async function addStudent(studentData) {
    const uniqueAdmissionNo = await generateAdmissionNo();
    studentData.admission_no = uniqueAdmissionNo;
    
    const { data, error } = await sb
        .from('students')
        .insert([{
            name: studentData.name,
            admission_no: studentData.admission_no,
            class: studentData.class,
            stream: studentData.stream,
            gender: studentData.gender,
            house_id: studentData.house_id || null,
            student_type: studentData.student_type,
            parent_name: studentData.parent_name,
            parent_phone: studentData.parent_phone,
            parent_email: studentData.parent_email,
            address: studentData.address,
            level: studentData.level,
            combination: studentData.combination || null,
            created_at: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function updateStudent(id, studentData) {
    const { data, error } = await sb.from('students').update(studentData).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

async function deleteStudent(id) {
    const { error } = await sb.from('students').delete().eq('id', id);
    if (error) throw error;
}

// ============================================
// RENDER STUDENTS PAGE (KEPT ORIGINAL)
// ============================================

async function renderStudents() {
    await getStudents();
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="btn-group flex-wrap gap-1 mb-2">
                    <button class="btn btn-sm btn-primary" onclick="showAddStudentModal()"><i class="fas fa-plus"></i> Add</button>
                    <button class="btn btn-sm btn-info" onclick="showBulkUploadModal()"><i class="fas fa-upload"></i> Bulk CSV</button>
                    <button class="btn btn-sm btn-success" onclick="exportStudents()"><i class="fas fa-download"></i> Excel</button>
<button class="btn btn-sm btn-info" onclick="printFilteredStudents()"><i class="fas fa-print"></i> Print Filtered</button>                    <button class="btn btn-sm btn-warning" onclick="printStudentsByClass()"><i class="fas fa-print"></i> Print by Class</button>
                    <button class="btn btn-sm btn-secondary" onclick="printStudentIdCards()"><i class="fas fa-id-card"></i> ID Cards</button>
                    <button class="btn btn-sm btn-danger" onclick="bulkDeleteStudents()"><i class="fas fa-trash"></i> Bulk Delete</button>
                    <button class="btn btn-sm btn-dark" onclick="refreshStudents()"><i class="fas fa-sync-alt"></i></button>
                </div>
                <input type="text" id="studentSearch" class="form-control form-control-sm mb-2" placeholder="🔍 Search by name, admission..." onkeyup="filterStudents()">
                
                <!-- House Filter -->
                <div class="row">
                    <div class="col-md-3">
                        <select id="houseFilter" class="form-select form-select-sm" onchange="filterStudents()">
                            <option value="">🏠 All Houses</option>
                            ${housesList.map(house => `<option value="${house.id}">${escapeHtml(house.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th style="width:30px"><input type="checkbox" id="selectAllStudents"></th>
                                <th>Adm No</th>
                                <th>Name</th>
                                <th>Class</th>
                                <th>Stream</th>
                                <th>Gender</th>
                                <th>Type</th>
                                <th>🏠 House</th>
                                ${currentLevel === 'alevel' ? '<th>Combo</th>' : ''}
                                <th>Parent</th>
                                <th>Phone</th>
                                <th style="width:90px">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="studentsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
async function loadStudentsTable() {
    await getStudents();
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;
    
    // Load houses for display
    const { data: houses } = await sb.from('houses').select('id, name, color');
    const housesMap = {};
    if (houses) {
        houses.forEach(house => {
            housesMap[house.id] = house;
        });
    }
    
    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-3">No students found</span>络';
        return;
    }
    
    let html = '';
    for (const s of students) {
        const typeBadge = s.student_type === 'Boarding' ? 'bg-info' : 'bg-success';
        
        // Get house info
        const house = housesMap[s.house_id];
        const houseHtml = house ? 
            `<span class="badge" style="background: ${house.color}">🏠 ${escapeHtml(house.name)}</span>` : 
            '<span class="text-muted">-</span>';
        
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="studentCheck" data-id="${s.id}"></td>
                <td><small>${s.admission_no || '-'}</small></td>
                <td><strong>${escapeHtml(s.name || '-')}</strong></td>
                <td>${s.class || '-'}</td>
                <td>${s.stream || '-'}</td>
                <td>${s.gender || '-'}</td>
                <td class="text-center"><span class="badge ${typeBadge}">${s.student_type || 'Day'}</span></td>
                <td class="text-center">${houseHtml}</span></td>
                ${currentLevel === 'alevel' ? `<td>${s.combination || '-'}</td>` : ''}
                <td><small>${escapeHtml(s.parent_name || '-')}</small></td>
                <td>${s.parent_phone || '-'}</td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-warning py-0 px-1" onclick="editStudent('${s.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger py-0 px-1" onclick="deleteStudentItem('${s.id}')"><i class="fas fa-trash"></i></button>
                    <button class="btn btn-sm btn-info py-0 px-1" onclick="viewStudent('${s.id}')"><i class="fas fa-eye"></i></button>
                 </span></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
    
    const selectAll = document.getElementById('selectAllStudents');
    if (selectAll) {
        selectAll.onclick = function() {
            document.querySelectorAll('.studentCheck').forEach(cb => cb.checked = this.checked);
        };
    }
}
window.filterStudents = function() {
    const search = document.getElementById('studentSearch')?.value.toLowerCase() || '';
    const houseFilter = document.getElementById('houseFilter')?.value;
    const rows = document.querySelectorAll('#studentsTableBody tr');
    
    rows.forEach(row => {
        if (row.cells && row.cells.length > 1) {
            const text = row.innerText.toLowerCase();
            const houseCell = row.cells[7]?.innerText || '';
            
            let show = true;
            if (search && !text.includes(search)) show = false;
            if (houseFilter && !houseCell.includes(houseFilter)) show = false;
            
            row.style.display = show ? '' : 'none';
        }
    });
};

window.refreshStudents = async function() {
    await getStudents();
    await loadStudentsTable();
    Swal.fire('Refreshed', `${students.length} students`, 'success');
};

// ============================================
// ADD STUDENT MODAL
// ============================================

window.showAddStudentModal = async function() {
    const isAlevel = currentLevel === 'alevel';
    const availableClasses = isAlevel ? alevelClasses : olevelClasses;
    const availableStreams = isAlevel ? alevelStreams : olevelStreams;
    
    // Load houses from database
    const { data: houses, error: housesError } = await sb
        .from('houses')
        .select('id, name, color')
        .order('name', { ascending: true });
    
    if (housesError) {
        console.error('Error loading houses:', housesError);
    }
    
    const housesList = houses || [];
    
    // Generate house options HTML with color styling
    const houseOptionsHtml = housesList.map(house => `
        <option value="${house.id}" style="color: ${house.color}; font-weight: 500;">
            🏠 ${escapeHtml(house.name)}
        </option>
    `).join('');
    
    Swal.fire({
        title: `Add ${isAlevel ? 'A-Level' : 'O-Level'} Student`,
        html: `
            <div class="row g-2">
                <div class="col-12 mb-2">
                    <label class="form-label fw-bold">Full Name *</label>
                    <input type="text" id="addName" class="form-control" placeholder="Full Name *">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Admission No</label>
                    <input type="text" id="addAdm" class="form-control" placeholder="Admission No (auto)" readonly>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Class *</label>
                    <select id="addClass" class="form-select">
                        <option value="">-- Select Class --</option>
                        ${availableClasses.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Stream</label>
                    <select id="addStream" class="form-select">
                        <option value="">-- Select Stream --</option>
                        ${availableStreams.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Gender</label>
                    <select id="addGender" class="form-select">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">🏠 House</label>
                    <select id="addHouse" class="form-select">
                        <option value="">-- Select House --</option>
                        ${houseOptionsHtml}
                    </select>
                </div>
                ${isAlevel ? `
                <div class="col-12">
                    <label class="form-label fw-bold">Combination</label>
                    <input type="text" id="addCombination" class="form-control" placeholder="Combination (PCM, PCB, HEG)">
                </div>
                ` : ''}
                <div class="col-6">
                    <label class="form-label fw-bold">Student Type</label>
                    <select id="addType" class="form-select">
                        <option value="Day">Day</option>
                        <option value="Boarding">Boarding</option>
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent/Guardian</label>
                    <input type="text" id="addParentName" class="form-control" placeholder="Parent Name">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent Phone</label>
                    <input type="text" id="addParentPhone" class="form-control" placeholder="Parent Phone">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent Email</label>
                    <input type="email" id="addParentEmail" class="form-control" placeholder="Parent Email">
                </div>
                <div class="col-12">
                    <label class="form-label fw-bold">Address</label>
                    <textarea id="addAddress" class="form-control" rows="2" placeholder="Address"></textarea>
                </div>
            </div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: 'Add Student',
        didOpen: async () => {
            // Generate preview admission number
            const preview = await generateAdmissionNo();
            const admField = document.getElementById('addAdm');
            if (admField) admField.value = preview;
        },
        preConfirm: () => {
            const name = document.getElementById('addName')?.value.trim();
            const className = document.getElementById('addClass')?.value;
            
            if (!name) {
                Swal.showValidationMessage('❌ Student name is required!');
                return false;
            }
            if (!className) {
                Swal.showValidationMessage('❌ Class is required!');
                return false;
            }
            
            const data = {
                name: name,
                class: className,
                stream: document.getElementById('addStream')?.value || '',
                gender: document.getElementById('addGender')?.value,
                house_id: document.getElementById('addHouse')?.value || null,
                student_type: document.getElementById('addType')?.value,
                parent_name: document.getElementById('addParentName')?.value || '',
                parent_phone: document.getElementById('addParentPhone')?.value || '',
                parent_email: document.getElementById('addParentEmail')?.value || '',
                address: document.getElementById('addAddress')?.value || '',
                level: currentLevel
            };
            
            if (isAlevel) {
                data.combination = document.getElementById('addCombination')?.value.trim().toUpperCase() || null;
            }
            
            return data;
        }
    }).then(async (result) => {
        if (result.value) {
            try {
                await addStudent(result.value);
                Swal.fire('Success', 'Student added!', 'success');
                await refreshStudents();
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    });
};

// ============================================
// BULK UPLOAD - FULLY WORKING
// ============================================
// ============================================
// EXCEL BULK UPLOAD - WORKING VERSION
// ============================================

window.showBulkUploadModal = function() {
    const isAlevel = currentLevel === 'alevel';
    
    Swal.fire({
        title: '<i class="fas fa-upload"></i> Bulk Upload Students (Excel)',
        html: `
            <div class="text-start">
                <div class="alert alert-info small p-2 mb-3">
                    <i class="fas fa-info-circle"></i> <strong>Instructions:</strong><br>
                    1. Click "Download Template" below<br>
                    2. Fill in student data (Name and Class are required)<br>
                    3. Save as Excel file (.xlsx)<br>
                    4. Select and upload the file
                </div>
                
                <button class="btn btn-info btn-sm w-100 mb-3" onclick="downloadExcelTemplate()">
                    <i class="fas fa-download"></i> Download Excel Template
                </button>
                
                <div class="mb-3">
                    <label class="fw-bold">Select Excel File</label>
                    <input type="file" id="bulkExcelFile" accept=".xlsx, .xls" class="form-control">
                </div>
            </div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-upload"></i> Upload',
        preConfirm: () => {
            const file = document.getElementById('bulkExcelFile')?.files[0];
            if (!file) {
                Swal.showValidationMessage('Please select an Excel file');
                return false;
            }
            return file;
        }
    }).then(async (result) => {
        if (result.value) {
            await processExcelUpload(result.value);
        }
    });
};

// ============================================
// DOWNLOAD EXCEL TEMPLATE
// ============================================

window.downloadExcelTemplate = function() {
    const isAlevel = currentLevel === 'alevel';
    
    // Prepare data for template
    const headers = [
        'Name', 'Class', 'Stream', 'Gender', 'Student Type', 
        'House', 'Parent Name', 'Parent Phone', 'Parent Email', 'Address'
    ];
    
    if (isAlevel) {
        headers.splice(6, 0, 'Combination');
    }
    
    const sampleData = [
        [
            'John Doe',
            isAlevel ? 'S.5' : 'S.3',
            isAlevel ? 'Sciences' : 'A',
            'Male',
            'Day',
            isAlevel ? 'PCM' : '',
            'Red House',
            'Mr. Doe',
            '0772123456',
            'john@email.com',
            'Kampala'
        ],
        [
            'Jane Smith',
            isAlevel ? 'S.6' : 'S.4',
            isAlevel ? 'Arts' : 'B',
            'Female',
            'Boarding',
            isAlevel ? 'HEG' : '',
            'Blue House',
            'Mrs. Smith',
            '0772987654',
            'jane@email.com',
            'Entebbe'
        ]
    ];
    
    // Create worksheet
    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 25 }, // Name
        { wch: 10 }, // Class
        { wch: 12 }, // Stream
        { wch: 8 },  // Gender
        { wch: 12 }, // Student Type
        ...(isAlevel ? [{ wch: 12 }] : []), // Combination (if A-Level)
        { wch: 15 }, // House
        { wch: 20 }, // Parent Name
        { wch: 15 }, // Parent Phone
        { wch: 25 }, // Parent Email
        { wch: 30 }  // Address
    ];
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Template');
    
    // Add instructions sheet
    const instructionsData = [
        ['INSTRUCTIONS FOR BULK UPLOAD'],
        [''],
        ['Required Fields:', 'Name, Class'],
        ['Optional Fields:', 'Stream, Gender, Student Type, House, Parent Name, Parent Phone, Parent Email, Address'],
        ...(isAlevel ? [['For A-Level:', 'Combination is optional (e.g., PCM, HEG, BAM)']] : []),
        [''],
        ['Valid Values:'],
        ['Class (O-Level):', 'S.1, S.2, S.3, S.4'],
        ['Class (A-Level):', 'S.5, S.6'],
        ['Gender:', 'Male, Female'],
        ['Student Type:', 'Day, Boarding'],
        ['House:', 'Red House, Blue House, Green House, Yellow House (must match existing)'],
        ...(isAlevel ? [['Combination Examples:', 'PCM (Physics, Chemistry, Math), PCB (Physics, Chemistry, Biology), HEG (History, Economics, Geography)']] : []),
        [''],
        ['NOTE: House names must exactly match existing houses in the system!']
    ];
    
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
    wsInstructions['!cols'] = [{ wch: 25 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
    
    // Export
    XLSX.writeFile(wb, `student_template_${currentLevel}.xlsx`);
    
    Swal.fire('Template Downloaded', 'Fill the Excel template and upload back', 'success');
};

// ============================================
// PROCESS EXCEL UPLOAD
// ============================================

async function processExcelUpload(file) {
    Swal.fire({ 
        title: 'Processing...', 
        text: 'Reading Excel file...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            console.log("Excel data:", jsonData);
            
            if (!jsonData || jsonData.length === 0) {
                Swal.fire('Error', 'No data found in Excel file', 'error');
                return;
            }
            
            // Load houses for mapping
            const { data: houses } = await sb.from('houses').select('id, name');
            const houseMap = {};
            if (houses) {
                houses.forEach(house => {
                    houseMap[house.name.toLowerCase()] = house.id;
                });
            }
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const rowNum = i + 2; // +2 because Excel starts at row 2
                
                try {
                    // Get values (handle different case variations)
                    const name = row.Name || row.name || row.NAME || '';
                    const className = row.Class || row.class || row.CLASS || '';
                    const stream = row.Stream || row.stream || '';
                    const gender = row.Gender || row.gender || 'Male';
                    const studentType = row['Student Type'] || row.student_type || row['Student_Type'] || 'Day';
                    const house = row.House || row.house || '';
                    const parentName = row['Parent Name'] || row.parent_name || row['Parent_Name'] || '';
                    const parentPhone = row['Parent Phone'] || row.parent_phone || row['Parent_Phone'] || '';
                    const parentEmail = row['Parent Email'] || row.parent_email || row['Parent_Email'] || '';
                    const address = row.Address || row.address || '';
                    let combination = row.Combination || row.combination || '';
                    
                    // Validate required fields
                    if (!name) {
                        errors.push(`Row ${rowNum}: Name is required`);
                        errorCount++;
                        continue;
                    }
                    if (!className) {
                        errors.push(`Row ${rowNum}: Class is required`);
                        errorCount++;
                        continue;
                    }
                    
                    // Validate class
                    const validClasses = currentLevel === 'olevel' 
                        ? ['S.1', 'S.2', 'S.3', 'S.4']
                        : ['S.5', 'S.6'];
                    
                    if (!validClasses.includes(className)) {
                        errors.push(`Row ${rowNum}: Invalid class "${className}". Valid: ${validClasses.join(', ')}`);
                        errorCount++;
                        continue;
                    }
                    
                    // Map house name to ID
                    let houseId = null;
                    if (house) {
                        const houseName = house.toLowerCase();
                        if (houseMap[houseName]) {
                            houseId = houseMap[houseName];
                        } else {
                            errors.push(`Row ${rowNum}: House "${house}" not found. Available: ${houses?.map(h => h.name).join(', ') || 'None'}`);
                            errorCount++;
                            continue;
                        }
                    }
                    
                    // Generate admission number
                    const year = new Date().getFullYear();
                    const prefix = currentLevel === 'olevel' ? 'O' : 'A';
                    const timestamp = Date.now().toString().slice(-8);
                    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                    const admissionNo = `${prefix}/${year}/${timestamp}${random}`;
                    
                    // Prepare data for insertion
                    const studentData = {
                        admission_no: admissionNo,
                        name: name,
                        class: className,
                        stream: stream || '',
                        gender: gender === 'Male' ? 'Male' : 'Female',
                        student_type: studentType === 'Boarding' ? 'Boarding' : 'Day',
                        house_id: houseId,
                        parent_name: parentName,
                        parent_phone: parentPhone,
                        parent_email: parentEmail,
                        address: address,
                        level: currentLevel,
                        created_at: new Date().toISOString()
                    };
                    
                    // Add combination for A-Level
                    if (currentLevel === 'alevel' && combination) {
                        studentData.combination = combination.toUpperCase();
                    }
                    
                    console.log(`Inserting row ${rowNum}:`, studentData);
                    
                    // Insert into database
                    const { error } = await sb.from('students').insert([studentData]);
                    
                    if (error) {
                        console.error("Insert error:", error);
                        errors.push(`Row ${rowNum}: ${error.message}`);
                        errorCount++;
                    } else {
                        successCount++;
                    }
                    
                } catch (err) {
                    console.error(`Error processing row ${rowNum}:`, err);
                    errors.push(`Row ${rowNum}: ${err.message}`);
                    errorCount++;
                }
            }
            
            Swal.close();
            
            // Show results
            let message = `<div class="text-start">`;
            message += `<p><strong>✅ Successfully added:</strong> ${successCount} students</p>`;
            if (errorCount > 0) {
                message += `<p><strong>❌ Failed:</strong> ${errorCount} students</p>`;
                if (errors.length > 0) {
                    message += `<hr><strong>Errors:</strong><ul>`;
                    errors.slice(0, 10).forEach(err => {
                        message += `<li>${escapeHtml(err)}</li>`;
                    });
                    if (errors.length > 10) {
                        message += `<li>... and ${errors.length - 10} more errors</li>`;
                    }
                    message += `</ul>`;
                }
            }
            message += `</div>`;
            
            Swal.fire({
                title: 'Upload Complete',
                html: message,
                icon: errorCount > 0 ? 'warning' : 'success',
                width: '600px'
            });
            
            // Refresh the students table
            if (typeof refreshStudents === 'function') {
                await refreshStudents();
            } else if (typeof loadStudentsTable === 'function') {
                await loadStudentsTable();
            }
            
        } catch (error) {
            Swal.close();
            console.error("Excel processing error:", error);
            Swal.fire('Error', 'Failed to process Excel file: ' + error.message, 'error');
        }
    };
    
    reader.onerror = (error) => {
        Swal.close();
        console.error("File reading error:", error);
        Swal.fire('Error', 'Failed to read the file', 'error');
    };
    
    reader.readAsArrayBuffer(file);
}

// ============================================
// EDIT, DELETE, VIEW FUNCTIONS
// ============================================

window.editStudent = async function(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    
    const isAlevel = student.class === 'S.5' || student.class === 'S.6';
    const availableClasses = isAlevel ? alevelClasses : olevelClasses;
    const availableStreams = isAlevel ? alevelStreams : olevelStreams;
    
    // Load houses from database
    const { data: houses, error: housesError } = await sb
        .from('houses')
        .select('id, name, color')
        .order('name', { ascending: true });
    
    if (housesError) {
        console.error('Error loading houses:', housesError);
    }
    
    const housesList = houses || [];
    
    // Generate house options HTML with color styling and selected attribute
    const houseOptionsHtml = housesList.map(house => `
        <option value="${house.id}" style="color: ${house.color}; font-weight: 500;" ${student.house_id === house.id ? 'selected' : ''}>
            🏠 ${escapeHtml(house.name)}
        </option>
    `).join('');
    
    Swal.fire({
        title: `Edit Student`,
        html: `
            <div class="row g-2">
                <div class="col-12 mb-2">
                    <label class="form-label fw-bold">Full Name *</label>
                    <input type="text" id="editName" class="form-control" value="${escapeHtml(student.name)}" placeholder="Full Name *">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Admission No</label>
                    <input type="text" id="editAdm" class="form-control" value="${student.admission_no || ''}" readonly>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Class *</label>
                    <select id="editClass" class="form-select">
                        ${availableClasses.map(c => `<option ${student.class === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Stream</label>
                    <select id="editStream" class="form-select">
                        <option value="">-- Select Stream --</option>
                        ${availableStreams.map(s => `<option ${student.stream === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Gender</label>
                    <select id="editGender" class="form-select">
                        <option ${student.gender === 'Male' ? 'selected' : ''}>Male</option>
                        <option ${student.gender === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">🏠 House</label>
                    <select id="editHouse" class="form-select">
                        <option value="">-- Select House --</option>
                        ${houseOptionsHtml}
                    </select>
                </div>
                ${isAlevel ? `
                <div class="col-12">
                    <label class="form-label fw-bold">Combination</label>
                    <input type="text" id="editCombination" class="form-control" value="${student.combination || ''}" placeholder="Combination">
                </div>
                ` : ''}
                <div class="col-6">
                    <label class="form-label fw-bold">Student Type</label>
                    <select id="editType" class="form-select">
                        <option ${student.student_type === 'Day' ? 'selected' : ''}>Day</option>
                        <option ${student.student_type === 'Boarding' ? 'selected' : ''}>Boarding</option>
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent/Guardian</label>
                    <input type="text" id="editParentName" class="form-control" value="${escapeHtml(student.parent_name || '')}" placeholder="Parent Name">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent Phone</label>
                    <input type="text" id="editParentPhone" class="form-control" value="${student.parent_phone || ''}" placeholder="Parent Phone">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold">Parent Email</label>
                    <input type="email" id="editParentEmail" class="form-control" value="${student.parent_email || ''}" placeholder="Parent Email">
                </div>
                <div class="col-12">
                    <label class="form-label fw-bold">Address</label>
                    <textarea id="editAddress" class="form-control" rows="2" placeholder="Address">${escapeHtml(student.address || '')}</textarea>
                </div>
            </div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => {
            const name = document.getElementById('editName')?.value.trim();
            if (!name) {
                Swal.showValidationMessage('Name required');
                return false;
            }
            const data = {
                name: name,
                class: document.getElementById('editClass')?.value,
                stream: document.getElementById('editStream')?.value || '',
                gender: document.getElementById('editGender')?.value,
                house_id: document.getElementById('editHouse')?.value || null,
                student_type: document.getElementById('editType')?.value,
                parent_name: document.getElementById('editParentName')?.value || '',
                parent_phone: document.getElementById('editParentPhone')?.value || '',
                parent_email: document.getElementById('editParentEmail')?.value || '',
                address: document.getElementById('editAddress')?.value || ''
            };
            if (isAlevel) {
                data.combination = document.getElementById('editCombination')?.value.trim().toUpperCase() || null;
            }
            return data;
        }
    }).then(async (result) => {
        if (result.value) {
            await updateStudent(id, result.value);
            Swal.fire('Success', 'Updated!', 'success');
            await refreshStudents();
        }
    });
};

window.deleteStudentItem = async function(id) {
    const student = students.find(s => s.id === id);
    const result = await Swal.fire({ title: 'Delete?', text: `Delete ${student?.name}?`, icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
        await deleteStudent(id);
        Swal.fire('Deleted', '', 'success');
        await refreshStudents();
    }
};

window.bulkDeleteStudents = async function() {
    const ids = Array.from(document.querySelectorAll('.studentCheck:checked')).map(cb => cb.dataset.id);
    if (!ids.length) { Swal.fire('Error', 'No students selected', 'error'); return; }
    const result = await Swal.fire({ title: `Delete ${ids.length} students?`, icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
        for (const id of ids) await deleteStudent(id);
        Swal.fire('Deleted', `${ids.length} students deleted`, 'success');
        await refreshStudents();
    }
};

// ============================================
// VIEW STUDENT DETAILS - ADDITIONAL INFO REMOVED
// ============================================

window.viewStudent = async function(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    
    // Load house information if assigned
    let houseInfo = '';
    if (student.house_id) {
        const { data: house } = await sb
            .from('houses')
            .select('name, color')
            .eq('id', student.house_id)
            .single();
        
        if (house) {
            houseInfo = `
                <div class="detail-row">
                    <div class="detail-label">🏠 House:</div>
                    <div class="detail-value">
                        <span style="background: ${house.color}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
                            ${escapeHtml(house.name)}
                        </span>
                    </div>
                </div>
            `;
        }
    }
    
    // Get class teacher if available
    let classTeacher = 'Not Assigned';
    if (student.class) {
        const classNumber = student.class.replace('S.', '');
        const streamLower = (student.stream || 'a').toLowerCase();
        const teacherKey = `teacher_s${classNumber}_${streamLower}`;
        
        const { data: settings } = await sb
            .from('school_settings')
            .select(teacherKey)
            .limit(1)
            .maybeSingle();
        
        if (settings && settings[teacherKey]) {
            classTeacher = settings[teacherKey];
        }
    }
    
    const isAlevel = student.class === 'S.5' || student.class === 'S.6';
    
    Swal.fire({
        title: `<i class="fas fa-user-graduate"></i> Student Details`,
        html: `
            <div class="text-start" style="max-width: 500px;">
                <div style="display: flex; justify-content: center; margin-bottom: 15px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #01605a, #ff862d); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-user-graduate" style="font-size: 40px; color: white;"></i>
                    </div>
                </div>
                
                <div style="background: #f0f8ff; padding: 12px; border-radius: 10px; margin-bottom: 15px;">
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Student Name:</div>
                        <div class="detail-value">${escapeHtml(student.name)}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Admission No:</div>
                        <div class="detail-value">${student.admission_no || '-'}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Class:</div>
                        <div class="detail-value">${student.class} ${student.stream ? '- ' + student.stream : ''}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Student Type:</div>
                        <div class="detail-value">${student.student_type || 'Day'}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Gender:</div>
                        <div class="detail-value">${student.gender || '-'}</div>
                    </div>
                    ${houseInfo}
                    ${isAlevel ? `
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Combination:</div>
                        <div class="detail-value">${student.combination || '-'}</div>
                    </div>
                    ` : ''}
                    <div class="detail-row" style="display: flex; margin-bottom: 8px;">
                        <div class="detail-label" style="width: 120px; font-weight: bold; color: #01605a;">Class Teacher:</div>
                        <div class="detail-value">${escapeHtml(classTeacher)}</div>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; padding: 12px; border-radius: 10px; margin-bottom: 15px;">
                    <h6 style="color: #01605a; margin-bottom: 10px;"><i class="fas fa-parent"></i> Parent/Guardian Information</h6>
                    <div class="detail-row" style="display: flex; margin-bottom: 6px;">
                        <div class="detail-label" style="width: 100px; font-weight: bold;">Name:</div>
                        <div class="detail-value">${escapeHtml(student.parent_name || '-')}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 6px;">
                        <div class="detail-label" style="width: 100px; font-weight: bold;">Phone:</div>
                        <div class="detail-value">${student.parent_phone || '-'}</div>
                    </div>
                    <div class="detail-row" style="display: flex; margin-bottom: 6px;">
                        <div class="detail-label" style="width: 100px; font-weight: bold;">Email:</div>
                        <div class="detail-value">${student.parent_email || '-'}</div>
                    </div>
                    <div class="detail-row" style="display: flex;">
                        <div class="detail-label" style="width: 100px; font-weight: bold;">Address:</div>
                        <div class="detail-value">${escapeHtml(student.address || '-')}</div>
                    </div>
                </div>
            </div>
        `,
        width: '550px',
        confirmButtonText: '<i class="fas fa-times"></i> Close',
        showCloseButton: true,
        customClass: {
            popup: 'student-details-modal'
        }
    });
};

// ============================================
// PRINT FUNCTIONS
// ============================================

// ============================================
// PRINT ALL STUDENTS WITH SCHOOL INFO & WATERMARK
// ============================================

// ============================================
// PRINT FILTERED STUDENTS (Respects Search & Filters)
// ============================================

window.printFilteredStudents = async function() {
    // Get filtered students from the current table view
    const rows = document.querySelectorAll('#studentsTableBody tr');
    const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none');
    
    if (visibleRows.length === 0) {
        Swal.fire('Error', 'No students to print', 'error');
        return;
    }
    
    // Extract student IDs from visible rows
    const visibleStudentIds = [];
    visibleRows.forEach(row => {
        const checkbox = row.querySelector('.studentCheck');
        if (checkbox && checkbox.dataset.id) {
            visibleStudentIds.push(checkbox.dataset.id);
        }
    });
    
    // Get filtered students data
    const filteredStudents = students.filter(s => visibleStudentIds.includes(s.id));
    
    if (filteredStudents.length === 0) {
        Swal.fire('Error', 'No students found to print', 'error');
        return;
    }
    
    // Load school settings for logo and info
    const { data: schoolData } = await sb
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
    
    const schoolInfo = schoolData || {
        school_name: 'Uganda School System',
        school_motto: 'Education for All',
        school_address: 'Kampala, Uganda',
        school_phone: '+256 XXX XXX XXX',
        school_email: 'info@school.ug',
        school_logo: '',
        principal_name: 'Principal'
    };
    
    // Load houses for display
    const { data: houses } = await sb.from('houses').select('id, name, color');
    const housesMap = {};
    if (houses) {
        houses.forEach(house => {
            housesMap[house.id] = house;
        });
    }
    
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const logoUrl = schoolInfo.school_logo || '';
    const levelName = currentLevel === 'olevel' ? 'O-Level (UCE)' : 'A-Level (UACE)';
    
    // Get search term and house filter for display
    const searchTerm = document.getElementById('studentSearch')?.value || '';
    const houseFilter = document.getElementById('houseFilter')?.value;
    const houseFilterName = houseFilter ? housesMap[houseFilter]?.name || '' : '';
    
    // Group filtered students by class
    const studentsByClass = {};
    filteredStudents.forEach(student => {
        if (!studentsByClass[student.class]) {
            studentsByClass[student.class] = [];
        }
        studentsByClass[student.class].push(student);
    });
    
    const sortedClasses = Object.keys(studentsByClass).sort();
    
    // Generate HTML for all classes
    let allClassesHtml = '';
    
    sortedClasses.forEach((className, classIndex) => {
        const classStudents = studentsByClass[className];
        const maleCount = classStudents.filter(s => s.gender === 'Male').length;
        const femaleCount = classStudents.filter(s => s.gender === 'Female').length;
        const dayCount = classStudents.filter(s => s.student_type === 'Day').length;
        const boardingCount = classStudents.filter(s => s.student_type === 'Boarding').length;
        
        // Generate table rows for this class
        let tableRows = '';
        classStudents.forEach((student, index) => {
            const house = housesMap[student.house_id];
            const houseHtml = house ? 
                `<span style="display: inline-block; background: ${house.color}; color: white; padding: 2px 10px; border-radius: 15px; font-size: 11px;">🏠 ${escapeHtml(house.name)}</span>` : 
                '<span style="color: #999;">-</span>';
            
            tableRows += `
                <tr>
                    <td style="padding: 8px; text-align: center;">${index + 1}</span></td>
                    <td style="padding: 8px;">${escapeHtml(student.name)}</span></td>
                    <td style="padding: 8px; text-align: center;">${student.admission_no || '-'}</span></td>
                    <td style="padding: 8px; text-align: center;">${student.gender || '-'}</span></td>
                    <td style="padding: 8px; text-align: center;">${houseHtml}</span></td>
                    <td style="padding: 8px;">${escapeHtml(student.parent_name || '-')}</span></td>
                    <td style="padding: 8px;">${student.parent_phone || '-'}</span></td>
                </tr>
            `;
        });
        
        allClassesHtml += `
            <div class="class-section" ${classIndex > 0 ? 'style="page-break-before: always;"' : ''}>
                <div class="class-header">
                    <h3>${escapeHtml(className)}</h3>
                    <div class="class-stats">
                        <span class="class-stat">📚 Total: ${classStudents.length}</span>
                        <span class="class-stat">♂️ Male: ${maleCount}</span>
                        <span class="class-stat">♀️ Female: ${femaleCount}</span>
                        <span class="class-stat">☀️ Day: ${dayCount}</span>
                        <span class="class-stat">🏠 Boarding: ${boardingCount}</span>
                    </div>
                </div>
                <table class="student-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th>Student Name</th>
                            <th style="width: 110px;">Admission No</th>
                            <th style="width: 60px;">Gender</th>
                            <th style="width: 100px;">House</th>
                            <th>Parent/Guardian</th>
                            <th style="width: 100px;">Phone</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    });
    
    // Calculate totals for filtered students
    const totalStudents = filteredStudents.length;
    const totalMale = filteredStudents.filter(s => s.gender === 'Male').length;
    const totalFemale = filteredStudents.filter(s => s.gender === 'Female').length;
    const totalDay = filteredStudents.filter(s => s.student_type === 'Day').length;
    const totalBoarding = filteredStudents.filter(s => s.student_type === 'Boarding').length;
    
    // Build filter info text
    let filterInfo = '';
    if (searchTerm) filterInfo += `Search: "${searchTerm}" | `;
    if (houseFilterName) filterInfo += `House: ${houseFilterName} | `;
    if (filterInfo) filterInfo = filterInfo.slice(0, -3);
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Filtered Students - ${escapeHtml(schoolInfo.school_name)}</title>
            <style>
                @media print {
                    body { margin: 0; padding: 0; }
                    .no-print { display: none; }
                    .class-section {
                        page-break-inside: avoid;
                    }
                }
                
                body {
                    font-family: 'Times New Roman', Arial, sans-serif;
                    padding: 20px;
                    font-size: 12px;
                    position: relative;
                    background: white;
                }
                
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    opacity: 0.08;
                    z-index: -1;
                    width: 60%;
                    max-width: 400px;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #01605a;
                    padding-bottom: 15px;
                }
                
                .school-logo {
                    max-width: 80px;
                    max-height: 80px;
                    margin-bottom: 10px;
                }
                
                .school-name {
                    font-size: 24px;
                    font-weight: bold;
                    color: #01605a;
                    margin: 0;
                }
                
                .school-motto {
                    font-size: 12px;
                    font-style: italic;
                    color: #666;
                    margin: 5px 0;
                }
                
                .school-address {
                    font-size: 10px;
                    color: #666;
                    margin: 5px 0;
                }
                
                .report-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 15px 0 5px;
                }
                
                .filter-info {
                    text-align: center;
                    font-size: 11px;
                    color: #ff862d;
                    margin-bottom: 10px;
                    font-style: italic;
                }
                
                .report-info {
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 15px;
                }
                
                .summary-box {
                    display: flex;
                    justify-content: space-around;
                    margin: 15px 0 25px;
                    padding: 15px;
                    background: linear-gradient(135deg, #f5f5f5, #e8e8e8);
                    border-radius: 10px;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                
                .summary-item {
                    text-align: center;
                    min-width: 100px;
                }
                
                .summary-value {
                    font-size: 22px;
                    font-weight: bold;
                    color: #01605a;
                }
                
                .summary-label {
                    font-size: 11px;
                    color: #666;
                }
                
                .class-section {
                    margin-bottom: 30px;
                    page-break-inside: avoid;
                }
                
                .class-header {
                    background: #01605a;
                    color: white;
                    padding: 10px 15px;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                
                .class-header h3 {
                    margin: 0;
                    font-size: 16px;
                }
                
                .class-stats {
                    display: flex;
                    gap: 15px;
                    flex-wrap: wrap;
                }
                
                .class-stat {
                    font-size: 11px;
                    background: rgba(255,255,255,0.2);
                    padding: 3px 10px;
                    border-radius: 15px;
                }
                
                .student-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                .student-table th {
                    background: #ff862d;
                    color: white;
                    padding: 10px;
                    font-weight: bold;
                    text-align: center;
                    border: 1px solid #e0761a;
                }
                
                .student-table td {
                    padding: 8px;
                    border: 1px solid #ddd;
                    vertical-align: middle;
                }
                
                .student-table tr:nth-child(even) {
                    background: #f9f9f9;
                }
                
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 10px;
                    color: #999;
                    border-top: 1px solid #ddd;
                    padding-top: 15px;
                }
                
                .signature {
                    margin-top: 40px;
                    display: flex;
                    justify-content: space-between;
                }
                
                .signature-line {
                    text-align: center;
                    width: 30%;
                }
                
                .signature-line .line {
                    border-bottom: 1px solid #000;
                    margin-bottom: 5px;
                    padding-top: 20px;
                }
                
                @media (max-width: 768px) {
                    .class-header {
                        flex-direction: column;
                        text-align: center;
                    }
                    
                    .student-table th, 
                    .student-table td {
                        font-size: 10px;
                        padding: 5px;
                    }
                }
            </style>
        </head>
        <body>
            ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="Watermark">` : ''}
            
            <div class="header">
                ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="School Logo">` : ''}
                <div class="school-name">${escapeHtml(schoolInfo.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                <div class="school-motto">${escapeHtml(schoolInfo.school_motto || 'Education for All')}</div>
                <div class="school-address">${escapeHtml(schoolInfo.school_address || '')} | Tel: ${escapeHtml(schoolInfo.school_phone || '')}</div>
                <div class="report-title">FILTERED STUDENTS REGISTER</div>
                ${filterInfo ? `<div class="filter-info">🎯 Filtered by: ${filterInfo}</div>` : ''}
                <div class="report-info">${levelName} | Generated: ${currentDate} | Total: ${totalStudents} students</div>
            </div>
            
            <div class="summary-box">
                <div class="summary-item">
                    <div class="summary-value">${totalStudents}</div>
                    <div class="summary-label">Total Students</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${totalMale}</div>
                    <div class="summary-label">Male</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${totalFemale}</div>
                    <div class="summary-label">Female</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${totalDay}</div>
                    <div class="summary-label">Day Scholars</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${totalBoarding}</div>
                    <div class="summary-label">Boarding</div>
                </div>
            </div>
            
            ${allClassesHtml}
            
            <div class="signature">
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Class Teacher</div>
                </div>
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Head Teacher</div>
                </div>
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Bursar</div>
                </div>
            </div>
            
            <div class="footer">
                This is a system-generated report. For any corrections, please contact the school administration.
            </div>
            
            <div class="no-print" style="text-align: center; margin-top: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #01605a; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🖨️ Print Report
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    ❌ Close
                </button>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

// Update the button in renderStudents to use the new function
// Change the button from onclick="printAllStudents()" to onclick="printFilteredStudents()"

// ============================================
// PRINT STUDENTS BY CLASS WITH SCHOOL INFO & WATERMARK
// ============================================

window.printStudentsByClass = async function() {
    // Load school settings for logo and info
    const { data: schoolData } = await sb
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
    
    const schoolInfo = schoolData || {
        school_name: 'Uganda School System',
        school_motto: 'Education for All',
        school_address: 'Kampala, Uganda',
        school_phone: '+256 XXX XXX XXX',
        school_email: 'info@school.ug',
        school_logo: '',
        principal_name: 'Principal'
    };
    
    // Get unique classes
    const classes = [...new Set(students.map(s => s.class))].sort();
    
    if (classes.length === 0) {
        Swal.fire('Error', 'No students found', 'error');
        return;
    }
    
    const { value: className } = await Swal.fire({
        title: 'Print Students by Class',
        input: 'select',
        inputOptions: Object.fromEntries(classes.map(c => [c, c])),
        inputPlaceholder: 'Select Class',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-print"></i> Print',
        cancelButtonText: 'Cancel'
    });
    
    if (!className) return;
    
    // Filter students by selected class
    const filteredStudents = students.filter(s => s.class === className);
    
    if (filteredStudents.length === 0) {
        Swal.fire('No Students', `No students found in class ${className}`, 'info');
        return;
    }
    
    // Load houses for display
    const { data: houses } = await sb.from('houses').select('id, name, color');
    const housesMap = {};
    if (houses) {
        houses.forEach(house => {
            housesMap[house.id] = house;
        });
    }
    
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const logoUrl = schoolInfo.school_logo || '';
    
    // Generate table rows
    let tableRows = '';
    filteredStudents.forEach((student, index) => {
        const house = housesMap[student.house_id];
        const houseHtml = house ? 
            `<span style="display: inline-block; background: ${house.color}; color: white; padding: 2px 10px; border-radius: 15px; font-size: 11px;">🏠 ${escapeHtml(house.name)}</span>` : 
            '<span style="color: #999;">-</span>';
        
        tableRows += `
            <tr>
                <td style="padding: 8px; text-align: center;">${index + 1}</td>
                <td style="padding: 8px;">${escapeHtml(student.name)}</td>
                <td style="padding: 8px; text-align: center;">${student.admission_no || '-'}</td>
                <td style="padding: 8px; text-align: center;">${student.gender || '-'}</td>
                <td style="padding: 8px; text-align: center;">${houseHtml}</td>
                <td style="padding: 8px;">${escapeHtml(student.parent_name || '-')}</td>
                <td style="padding: 8px;">${student.parent_phone || '-'}</td>
            </tr>
        `;
    });
    
    // Count statistics
    const maleCount = filteredStudents.filter(s => s.gender === 'Male').length;
    const femaleCount = filteredStudents.filter(s => s.gender === 'Female').length;
    const dayCount = filteredStudents.filter(s => s.student_type === 'Day').length;
    const boardingCount = filteredStudents.filter(s => s.student_type === 'Boarding').length;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHtml(className)} Students - ${escapeHtml(schoolInfo.school_name)}</title>
            <style>
                @media print {
                    body { margin: 0; padding: 0; }
                    .no-print { display: none; }
                    .page-break { page-break-before: always; }
                }
                
                body {
                    font-family: 'Times New Roman', Arial, sans-serif;
                    padding: 20px;
                    font-size: 12px;
                    position: relative;
                    background: white;
                }
                
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    opacity: 0.08;
                    z-index: -1;
                    width: 60%;
                    max-width: 400px;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #01605a;
                    padding-bottom: 15px;
                }
                
                .school-logo {
                    max-width: 80px;
                    max-height: 80px;
                    margin-bottom: 10px;
                }
                
                .school-name {
                    font-size: 24px;
                    font-weight: bold;
                    color: #01605a;
                    margin: 0;
                }
                
                .school-motto {
                    font-size: 12px;
                    font-style: italic;
                    color: #666;
                    margin: 5px 0;
                }
                
                .school-address {
                    font-size: 10px;
                    color: #666;
                    margin: 5px 0;
                }
                
                .report-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 15px 0 5px;
                }
                
                .report-info {
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 15px;
                }
                
                .stats-box {
                    display: flex;
                    justify-content: space-around;
                    margin: 15px 0;
                    padding: 10px;
                    background: #f5f5f5;
                    border-radius: 8px;
                }
                
                .stat-item {
                    text-align: center;
                }
                
                .stat-label {
                    font-size: 11px;
                    color: #666;
                }
                
                .stat-value {
                    font-size: 18px;
                    font-weight: bold;
                    color: #01605a;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }
                
                th {
                    background: #01605a;
                    color: white;
                    padding: 10px;
                    font-weight: bold;
                    text-align: center;
                    border: 1px solid #0a4d48;
                }
                
                td {
                    padding: 8px;
                    border: 1px solid #ddd;
                    vertical-align: middle;
                }
                
                tr:nth-child(even) {
                    background: #f9f9f9;
                }
                
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 10px;
                    color: #999;
                    border-top: 1px solid #ddd;
                    padding-top: 15px;
                }
                
                .signature {
                    margin-top: 40px;
                    display: flex;
                    justify-content: space-between;
                }
                
                .signature-line {
                    text-align: center;
                    width: 30%;
                }
                
                .signature-line .line {
                    border-bottom: 1px solid #000;
                    margin-bottom: 5px;
                    padding-top: 20px;
                }
                
                .badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: normal;
                }
            </style>
        </head>
        <body>
            ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="Watermark">` : ''}
            
            <div class="header">
                ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="School Logo">` : ''}
                <div class="school-name">${escapeHtml(schoolInfo.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                <div class="school-motto">${escapeHtml(schoolInfo.school_motto || 'Education for All')}</div>
                <div class="school-address">${escapeHtml(schoolInfo.school_address || '')} | Tel: ${escapeHtml(schoolInfo.school_phone || '')}</div>
                <div class="report-title">STUDENTS LIST - ${escapeHtml(className)}</div>
                <div class="report-info">Generated: ${currentDate} | Total Students: ${filteredStudents.length}</div>
            </div>
            
            <div class="stats-box">
                <div class="stat-item">
                    <div class="stat-value">${filteredStudents.length}</div>
                    <div class="stat-label">Total Students</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${maleCount}</div>
                    <div class="stat-label">Male</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${femaleCount}</div>
                    <div class="stat-label">Female</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${dayCount}</div>
                    <div class="stat-label">Day</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${boardingCount}</div>
                    <div class="stat-label">Boarding</div>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th>Student Name</th>
                        <th style="width: 100px;">Admission No</th>
                        <th style="width: 60px;">Gender</th>
                        <th style="width: 100px;">House</th>
                        <th>Parent/Guardian</th>
                        <th style="width: 100px;">Phone</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            
            <div class="signature">
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Class Teacher</div>
                </div>
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Head Teacher</div>
                </div>
                <div class="signature-line">
                    <div class="line"></div>
                    <div>Parent's Signature</div>
                </div>
            </div>
            
            <div class="footer">
                This is a system-generated report. For any corrections, please contact the school administration.
            </div>
            
            <div class="no-print" style="text-align: center; margin-top: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #01605a; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🖨️ Print Report
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    ❌ Close
                </button>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};
// ============================================
// PRINT STUDENT ID CARDS WITH SCHOOL INFO & WATERMARK
// ============================================

window.printStudentIdCards = async function() {
    // Load school settings for logo and info
    const { data: schoolData } = await sb
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
    
    const schoolInfo = schoolData || {
        school_name: 'Uganda School System',
        school_motto: 'Education for All',
        school_address: 'Kampala, Uganda',
        school_phone: '+256 XXX XXX XXX',
        school_email: 'info@school.ug',
        school_logo: '',
        principal_name: 'Principal'
    };
    
    // Get selected students from checkboxes
    const selected = Array.from(document.querySelectorAll('.studentCheck:checked'))
        .map(cb => students.find(s => s.id === cb.dataset.id))
        .filter(s => s);
    
    let studentsToPrint = selected;
    
    if (!studentsToPrint.length) {
        const { value: studentId } = await Swal.fire({
            title: 'Select Student',
            input: 'select',
            inputOptions: Object.fromEntries(students.map(s => [s.id, `${s.name} (${s.class}) - ${s.admission_no || 'No ADM'}`])),
            inputPlaceholder: '-- Select Student --',
            showCancelButton: true,
            confirmButtonText: 'Generate ID Card'
        });
        
        if (studentId) {
            studentsToPrint = [students.find(s => s.id === studentId)];
        } else {
            return;
        }
    }
    
    if (!studentsToPrint.length) {
        Swal.fire('Error', 'No students selected', 'error');
        return;
    }
    
    // Load houses for display
    const { data: houses } = await sb.from('houses').select('id, name, color');
    const housesMap = {};
    if (houses) {
        houses.forEach(house => {
            housesMap[house.id] = house;
        });
    }
    
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleDateString('en-GB');
    const logoUrl = schoolInfo.school_logo || '';
    
    let allCardsHtml = '';
    
    for (const student of studentsToPrint) {
        const house = housesMap[student.house_id];
        const houseHtml = house ? 
            `<span style="background: ${house.color}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 10px; display: inline-block;">🏠 ${escapeHtml(house.name)}</span>` : 
            '<span style="color: #999;">No House Assigned</span>';
        
        // Generate a unique card ID
        const cardId = `CARD-${student.admission_no || student.id.slice(0, 8)}`;
        
        allCardsHtml += `
            <div class="id-card">
                <div class="id-card-inner">
                    <div class="card-header">
                        ${logoUrl ? `<img src="${logoUrl}" class="card-logo" alt="Logo">` : '<div class="card-logo-placeholder"><i class="fas fa-school"></i></div>'}
                        <div class="school-title">${escapeHtml(schoolInfo.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                        <div class="card-type">STUDENT IDENTIFICATION CARD</div>
                    </div>
                    
                    <div class="card-body">
                        <div class="photo-placeholder">
                            <i class="fas fa-user-graduate"></i>
                        </div>
                        <div class="student-info">
                            <div class="info-row">
                                <span class="info-label">Name:</span>
                                <span class="info-value">${escapeHtml(student.name)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Admission No:</span>
                                <span class="info-value">${student.admission_no || '-'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Class:</span>
                                <span class="info-value">${student.class} ${student.stream ? '- ' + student.stream : ''}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Student Type:</span>
                                <span class="info-value">${student.student_type || 'Day'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">House:</span>
                                <span class="info-value">${house ? house.name : '-'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Parent:</span>
                                <span class="info-value">${escapeHtml(student.parent_name || '-')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Phone:</span>
                                <span class="info-value">${student.parent_phone || '-'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card-footer">
                        <div class="validity">Valid for Academic Year ${new Date().getFullYear()}</div>
                        <div class="signature-area">
                            <div class="signature-line"></div>
                            <div class="signature-label">Authorized Signature</div>
                        </div>
                        <div class="card-id">${cardId}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Student ID Cards - ${escapeHtml(schoolInfo.school_name)}</title>
            <style>
                @media print {
                    body { margin: 0; padding: 0; }
                    .no-print { display: none; }
                    .id-card {
                        page-break-after: always;
                    }
                }
                
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: #e0e0e0;
                    padding: 20px;
                    margin: 0;
                }
                
                .id-card {
                    width: 350px;
                    margin: 10px auto;
                    background: white;
                    border-radius: 15px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                    overflow: hidden;
                    page-break-after: always;
                    position: relative;
                }
                
                .id-card::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('${logoUrl}') center center no-repeat;
                    background-size: 80%;
                    opacity: 0.05;
                    pointer-events: none;
                    z-index: 0;
                }
                
                .id-card-inner {
                    position: relative;
                    z-index: 1;
                }
                
                .card-header {
                    background: linear-gradient(135deg, #01605a, #ff862d);
                    color: white;
                    text-align: center;
                    padding: 15px;
                }
                
                .card-logo {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-bottom: 8px;
                    border: 2px solid white;
                }
                
                .card-logo-placeholder {
                    width: 50px;
                    height: 50px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 8px;
                }
                
                .card-logo-placeholder i {
                    font-size: 28px;
                    color: white;
                }
                
                .school-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                
                .card-type {
                    font-size: 10px;
                    opacity: 0.9;
                    letter-spacing: 1px;
                }
                
                .card-body {
                    padding: 15px;
                    display: flex;
                    gap: 15px;
                    background: white;
                }
                
                .photo-placeholder {
                    width: 100px;
                    height: 100px;
                    background: linear-gradient(135deg, #f0f0f0, #e0e0e0);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    border: 2px solid #ff862d;
                }
                
                .photo-placeholder i {
                    font-size: 48px;
                    color: #01605a;
                }
                
                .student-info {
                    flex: 1;
                }
                
                .info-row {
                    margin-bottom: 6px;
                    font-size: 10px;
                }
                
                .info-label {
                    font-weight: bold;
                    color: #01605a;
                    width: 65px;
                    display: inline-block;
                }
                
                .info-value {
                    color: #333;
                }
                
                .card-footer {
                    background: #f8f9fa;
                    padding: 12px 15px;
                    text-align: center;
                    border-top: 1px solid #e0e0e0;
                }
                
                .validity {
                    font-size: 9px;
                    color: #28a745;
                    font-weight: bold;
                    margin-bottom: 8px;
                }
                
                .signature-area {
                    margin-top: 8px;
                }
                
                .signature-line {
                    width: 120px;
                    height: 1px;
                    border-bottom: 1px solid #333;
                    margin: 0 auto 4px;
                }
                
                .signature-label {
                    font-size: 8px;
                    color: #666;
                }
                
                .card-id {
                    font-size: 8px;
                    color: #999;
                    margin-top: 8px;
                    font-family: monospace;
                }
                
                .no-print {
                    text-align: center;
                    margin-top: 20px;
                }
                
                .no-print button {
                    padding: 10px 20px;
                    margin: 0 5px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .print-btn {
                    background: #01605a;
                    color: white;
                }
                
                .close-btn {
                    background: #dc3545;
                    color: white;
                }
                
                @media (max-width: 400px) {
                    .id-card {
                        width: 95%;
                        margin: 10px auto;
                    }
                    
                    .card-body {
                        flex-direction: column;
                        text-align: center;
                    }
                    
                    .photo-placeholder {
                        margin: 0 auto;
                    }
                    
                    .info-label {
                        width: auto;
                        display: block;
                        text-align: center;
                    }
                    
                    .info-value {
                        display: block;
                        text-align: center;
                    }
                }
            </style>
        </head>
        <body>
            ${allCardsHtml}
            
            <div class="no-print">
                <button class="print-btn" onclick="window.print()">
                    <i class="fas fa-print"></i> Print All Cards
                </button>
                <button class="close-btn" onclick="window.close()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};
// ============================================
// EXPORT STUDENTS TO EXCEL WITH HOUSE & SCHOOL INFO
// ============================================

window.exportStudents = async function() {
    if (!students.length) {
        Swal.fire('Error', 'No students to export', 'error');
        return;
    }
    
    // Load houses for display
    const { data: houses } = await sb.from('houses').select('id, name, color');
    const housesMap = {};
    if (houses) {
        houses.forEach(house => {
            housesMap[house.id] = house;
        });
    }
    
    // Prepare data for export
    const exportData = students.map(s => {
        const house = housesMap[s.house_id];
        
        return {
            'Admission No': s.admission_no || '',
            'Student Name': s.name || '',
            'Class': s.class || '',
            'Stream': s.stream || '',
            'Gender': s.gender || '',
            'Student Type': s.student_type || 'Day',
            'House': house ? house.name : '',
            'Parent/Guardian': s.parent_name || '',
            'Parent Phone': s.parent_phone || '',
            'Parent Email': s.parent_email || '',
            'Address': s.address || '',
            'Date Registered': s.created_at ? new Date(s.created_at).toLocaleDateString() : ''
        };
    });
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 15 }, // Admission No
        { wch: 25 }, // Student Name
        { wch: 10 }, // Class
        { wch: 12 }, // Stream
        { wch: 8 },  // Gender
        { wch: 12 }, // Student Type
        { wch: 15 }, // House
        { wch: 20 }, // Parent/Guardian
        { wch: 15 }, // Parent Phone
        { wch: 25 }, // Parent Email
        { wch: 30 }, // Address
        { wch: 15 }  // Date Registered
    ];
    
    // Style the header row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:L1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[address]) continue;
        ws[address].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "01605a" } },
            alignment: { horizontal: "center" }
        };
    }
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${currentLevel.toUpperCase()}_Students`);
    
    // Generate filename
    const filename = `Students_${currentLevel.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Export
    XLSX.writeFile(wb, filename);
    
    Swal.fire({
        title: 'Exported!',
        text: `${students.length} students exported successfully.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
};

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    await initSupabase();
    await getStudents();
    await sb.auth.signInWithPassword({ email: 'superadmin@school.com', password: 'Admin123!' }).catch(() => {});
    
    document.getElementById('app').innerHTML = await renderStudents();
    await loadStudentsTable();
    
    document.getElementById('levelOlevel')?.addEventListener('click', async () => {
        currentLevel = 'olevel';
        document.getElementById('levelOlevel').classList.add('active');
        document.getElementById('levelAlevel').classList.remove('active');
        document.getElementById('app').innerHTML = await renderStudents();
        await loadStudentsTable();
    });
    
    document.getElementById('levelAlevel')?.addEventListener('click', async () => {
        currentLevel = 'alevel';
        document.getElementById('levelAlevel').classList.add('active');
        document.getElementById('levelOlevel').classList.remove('active');
        document.getElementById('app').innerHTML = await renderStudents();
        await loadStudentsTable();
    });
}

init();



// ==================== SUBJECTS MODULE ====================
// ============================================
// SUBJECTS MODULE - USING SWEETALERT2 (No Bootstrap Modal)
// ============================================

// Global variable
let allSubjects = [];

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getSubjects() {
    try {
        const { data, error } = await sb
            .from('subjects')
            .select('*')
            .eq('level', currentLevel)
            .order('name', { ascending: true });
        
        if (error) throw error;
        allSubjects = data || [];
        return allSubjects;
    } catch (error) {
        console.error('Error loading subjects:', error);
        return [];
    }
}

async function addSubject(subjectData) {
    const { data, error } = await sb
        .from('subjects')
        .insert([{
            ...subjectData,
            created_at: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function updateSubject(id, subjectData) {
    const { data, error } = await sb
        .from('subjects')
        .update({
            ...subjectData,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
}

async function deleteSubject(id) {
    const { error } = await sb
        .from('subjects')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

// ============================================
// RENDER SUBJECTS PAGE
// ============================================

async function renderSubjects() {
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-book-open"></i> Subjects Management</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-8">
                        <button class="btn btn-primary" onclick="showAddSubjectModal()">
                            <i class="fas fa-plus"></i> Add Subject
                        </button>
                        <button class="btn btn-warning ms-2" onclick="showBulkSubjectUpload()">
                            <i class="fas fa-upload"></i> Bulk Upload
                        </button>
                        <button class="btn btn-success ms-2" onclick="exportSubjects()">
                            <i class="fas fa-file-excel"></i> Export Excel
                        </button>
                        <button class="btn btn-info ms-2" onclick="exportSubjectsPDF()">
                            <i class="fas fa-file-pdf"></i> Export PDF
                        </button>
                        <button class="btn btn-danger ms-2" onclick="bulkDeleteSubjects()">
                            <i class="fas fa-trash"></i> Bulk Delete
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="refreshSubjects()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="col-md-4">
                        <input type="text" id="subjectSearch" class="form-control" 
                               placeholder="🔍 Search subjects..." onkeyup="filterSubjects()">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-4">
                        <select id="filterCategory" class="form-select" onchange="filterSubjects()">
                            <option value="">All Categories</option>
                            <option value="Core">Core</option>
                            <option value="Elective">Elective</option>
                            <option value="Science">Science</option>
                            <option value="Humanities">Humanities</option>
                            <option value="Principal">Principal</option>
                            <option value="Subsidiary">Subsidiary</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <select id="filterLevel" class="form-select" onchange="filterSubjects()">
                            <option value="">All Levels</option>
                            <option value="olevel">O-Level</option>
                            <option value="alevel">A-Level</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-outline-secondary w-100" onclick="clearSubjectFilters()">
                            <i class="fas fa-eraser"></i> Clear Filters
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllSubjects"></th>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Level</th>
                                <th width="100">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="subjectsTableBody">
                            <tr><td colspan="6" class="text-center py-4">Loading subjects...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LOAD SUBJECTS TABLE
// ============================================

async function loadSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');
    if (!tbody) return;
    
    await getSubjects();
    
    if (allSubjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No subjects found. Click "Add Subject" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const s of allSubjects) {
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="subjectCheck" data-id="${s.id}"></td>
                <td><code>${escapeHtml(s.code || '-')}</code></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.category || '-')}</td>
                <td><span class="badge ${s.level === 'olevel' ? 'bg-success' : 'bg-info'}">${s.level === 'olevel' ? 'O-Level' : 'A-Level'}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="editSubject('${s.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSubjectItem('${s.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
    
    // Select All functionality
    const selectAll = document.getElementById('selectAllSubjects');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.subjectCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
}

// ============================================
// FILTER FUNCTIONS
// ============================================

window.filterSubjects = function() {
    const search = document.getElementById('subjectSearch')?.value.toLowerCase() || '';
    const category = document.getElementById('filterCategory')?.value;
    const level = document.getElementById('filterLevel')?.value;
    
    const rows = document.querySelectorAll('#subjectsTableBody tr');
    
    rows.forEach(row => {
        if (row.cells && row.cells.length > 1) {
            const text = row.innerText.toLowerCase();
            let show = true;
            
            if (search && !text.includes(search)) show = false;
            if (category && !text.includes(category.toLowerCase())) show = false;
            if (level && !text.includes(level)) show = false;
            
            row.style.display = show ? '' : 'none';
        }
    });
};

window.clearSubjectFilters = function() {
    document.getElementById('subjectSearch').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterLevel').value = '';
    filterSubjects();
};

window.refreshSubjects = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadSubjectsTable();
    Swal.fire('Refreshed!', 'Subjects table updated.', 'success');
};

// ============================================
// ADD SUBJECT - USING SWEETALERT2
// ============================================

window.showAddSubjectModal = function() {
    Swal.fire({
        title: '<i class="fas fa-book"></i> Add New Subject',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Subject Code</label>
                        <input type="text" id="swalCode" class="form-control" placeholder="e.g., MATH101">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Subject Name *</label>
                        <input type="text" id="swalName" class="form-control" placeholder="e.g., Mathematics">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Category</label>
                        <select id="swalCategory" class="form-select">
                            <option value="Core">Core</option>
                            <option value="Elective">Elective</option>
                            <option value="Science">Science</option>
                            <option value="Humanities">Humanities</option>
                            <option value="Principal">Principal</option>
                            <option value="Subsidiary">Subsidiary</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Level</label>
                        <select id="swalLevel" class="form-select">
                            <option value="olevel">O-Level</option>
                            <option value="alevel">A-Level</option>
                        </select>
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label">Description</label>
                    <textarea id="swalDescription" class="form-control" rows="2" placeholder="Subject description..."></textarea>
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Save Subject',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const name = document.getElementById('swalName').value.trim();
            if (!name) {
                Swal.showValidationMessage('Subject name is required!');
                return false;
            }
            return {
                code: document.getElementById('swalCode').value,
                name: name,
                category: document.getElementById('swalCategory').value,
                level: document.getElementById('swalLevel').value,
                description: document.getElementById('swalDescription').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await addSubject(result.value);
                Swal.fire('Success!', 'Subject added successfully.', 'success');
                await loadSubjectsTable();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// EDIT SUBJECT - USING SWEETALERT2
// ============================================

window.editSubject = async function(id) {
    const subject = allSubjects.find(s => s.id === id);
    if (!subject) return;
    
    Swal.fire({
        title: '<i class="fas fa-edit"></i> Edit Subject',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Subject Code</label>
                        <input type="text" id="swalCode" class="form-control" value="${escapeHtml(subject.code || '')}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Subject Name *</label>
                        <input type="text" id="swalName" class="form-control" value="${escapeHtml(subject.name)}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Category</label>
                        <select id="swalCategory" class="form-select">
                            <option value="Core" ${subject.category === 'Core' ? 'selected' : ''}>Core</option>
                            <option value="Elective" ${subject.category === 'Elective' ? 'selected' : ''}>Elective</option>
                            <option value="Science" ${subject.category === 'Science' ? 'selected' : ''}>Science</option>
                            <option value="Humanities" ${subject.category === 'Humanities' ? 'selected' : ''}>Humanities</option>
                            <option value="Principal" ${subject.category === 'Principal' ? 'selected' : ''}>Principal</option>
                            <option value="Subsidiary" ${subject.category === 'Subsidiary' ? 'selected' : ''}>Subsidiary</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Level</label>
                        <select id="swalLevel" class="form-select">
                            <option value="olevel" ${subject.level === 'olevel' ? 'selected' : ''}>O-Level</option>
                            <option value="alevel" ${subject.level === 'alevel' ? 'selected' : ''}>A-Level</option>
                        </select>
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label">Description</label>
                    <textarea id="swalDescription" class="form-control" rows="2">${escapeHtml(subject.description || '')}</textarea>
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Update Subject',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const name = document.getElementById('swalName').value.trim();
            if (!name) {
                Swal.showValidationMessage('Subject name is required!');
                return false;
            }
            return {
                code: document.getElementById('swalCode').value,
                name: name,
                category: document.getElementById('swalCategory').value,
                level: document.getElementById('swalLevel').value,
                description: document.getElementById('swalDescription').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await updateSubject(id, result.value);
                Swal.fire('Success!', 'Subject updated successfully.', 'success');
                await loadSubjectsTable();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// DELETE SUBJECT
// ============================================

window.deleteSubjectItem = async function(id) {
    const subject = allSubjects.find(s => s.id === id);
    
    const result = await Swal.fire({
        title: 'Delete Subject?',
        text: `Are you sure you want to delete "${subject?.name}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            await deleteSubject(id);
            Swal.fire('Deleted!', 'Subject has been deleted.', 'success');
            await loadSubjectsTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// BULK DELETE SUBJECTS
// ============================================

window.bulkDeleteSubjects = async function() {
    const checkboxes = document.querySelectorAll('.subjectCheck:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    if (ids.length === 0) {
        Swal.fire('Error', 'No subjects selected', 'error');
        return;
    }
    
    const result = await Swal.fire({
        title: `Delete ${ids.length} subjects?`,
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            for (const id of ids) {
                await deleteSubject(id);
            }
            Swal.fire('Deleted!', `${ids.length} subjects deleted.`, 'success');
            await loadSubjectsTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// EXPORT SUBJECTS TO EXCEL
// ============================================

window.exportSubjects = async function() {
    await getSubjects();
    
    const exportData = allSubjects.map(s => ({
        'Code': s.code || '-',
        'Name': s.name,
        'Category': s.category || '-',
        'Level': s.level === 'olevel' ? 'O-Level' : 'A-Level',
        'Description': s.description || '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects');
    XLSX.writeFile(wb, `Subjects_${currentLevel}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    Swal.fire('Exported!', `${exportData.length} subjects exported.`, 'success');
};

// ============================================
// EXPORT SUBJECTS TO PDF
// ============================================

window.exportSubjectsPDF = async function() {
    await getSubjects();
    
    const win = window.open('', '_blank');
    let html = `
        <html>
        <head>
            <title>Subjects List</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #01605a; text-align: center; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background: #01605a; color: white; }
                .badge { padding: 3px 8px; border-radius: 5px; font-size: 12px; }
                .badge-olevel { background: green; color: white; }
                .badge-alevel { background: blue; color: white; }
            </style>
        </head>
        <body>
            <h1>Subjects List - ${currentLevel.toUpperCase()}</h1>
            <p>Total Subjects: ${allSubjects.length} | Generated: ${new Date().toLocaleString()}</p>
            <table>
                <thead>
                    <tr><th>Code</th><th>Name</th><th>Category</th><th>Level</th><th>Description</th></tr>
                </thead>
                <tbody>
    `;
    
    for (const s of allSubjects) {
        html += `
            <tr>
                <td>${s.code || '-'}</span></td>
                <td>${escapeHtml(s.name)}</span></td>
                <td>${s.category || '-'}</span></td>
                <td><span class="badge badge-${s.level}">${s.level === 'olevel' ? 'O-Level' : 'A-Level'}</span></span></td>
                <td>${escapeHtml(s.description || '-')}</span></td>
            </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
            <p style="margin-top: 30px; text-align: center;">Generated by School Management System</p>
            <button onclick="window.print()" style="padding: 10px 20px; margin-top: 20px;">Print</button>
        </body>
        </html>
    `;
    
    win.document.write(html);
    win.document.close();
};

// ============================================
// BULK UPLOAD SUBJECTS (CSV)
// ============================================

window.showBulkSubjectUpload = function() {
    Swal.fire({
        title: 'Bulk Upload Subjects',
        html: `
            <div class="text-start">
                <div class="alert alert-info">
                    <strong>CSV Format:</strong><br>
                    code, name, category, description<br><br>
                    <strong>Example:</strong><br>
                    MATH101, Mathematics, Core, Basic mathematics
                </div>
                <button class="btn btn-info btn-sm w-100 mb-3" onclick="downloadSubjectTemplate()">
                    <i class="fas fa-download"></i> Download Template
                </button>
                <input type="file" id="subjectsCsvFile" accept=".csv" class="form-control">
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Upload',
        preConfirm: () => {
            const file = document.getElementById('subjectsCsvFile')?.files[0];
            if (!file) {
                Swal.showValidationMessage('Please select a CSV file');
                return false;
            }
            return file;
        }
    }).then(async (result) => {
        if (result.value) {
            await processSubjectsUpload(result.value);
        }
    });
};

window.downloadSubjectTemplate = function() {
    const headers = ['code', 'name', 'category', 'description'];
    const sample = ['MATH101', 'Mathematics', 'Core', 'Basic mathematics'];
    
    let csv = headers.join(',') + '\n';
    csv += sample.join(',');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subjects_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    
    Swal.fire('Template Downloaded', 'Fill the template and upload back', 'success');
};

async function processSubjectsUpload(file) {
    Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split('\n');
        let success = 0;
        let errors = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const subjectData = {
                code: values[0]?.trim() || '',
                name: values[1]?.trim(),
                category: values[2]?.trim() || 'Core',
                level: currentLevel,
                description: values[3]?.trim() || ''
            };
            
            if (subjectData.name) {
                try {
                    await addSubject(subjectData);
                    success++;
                } catch (error) {
                    errors++;
                }
            } else {
                errors++;
            }
        }
        
        Swal.fire('Complete!', `✅ ${success} subjects added | ❌ ${errors} failed`, errors > 0 ? 'warning' : 'success');
        await loadSubjectsTable();
    };
    reader.readAsText(file);
}

// ============================================
// HELPER FUNCTION
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ============================================
// MARKS MODULE - FINAL MASTERPIECE
// Fixed: Save All works for both levels
// Fixed: A-Level grading from settings tabs
// ============================================

// ============================================
// GLOBAL VARIABLES
// ============================================

let allMarksList = [];
let allStudentsList = [];
let gradingRules = { olevel: [], alevel: { principal: [], subsidiary: [] } };

// Batch state
let batchState = {
    class: '',
    stream: '',
    subject: '',
    exam: 'Term 1',
    year: new Date().getFullYear().toString(),
    students: [],
    subjects: [],
    marksMap: {}
};

// Constants
const STREAM_OPTIONS = {
    olevel: ['A', 'B', 'C', 'D'],
    alevel: ['Arts', 'Sciences', 'Business']
};

const SUBJECT_COMBINATIONS = {
    'PCM': ['Mathematics', 'Physics', 'Chemistry'],
    'PCB': ['Mathematics', 'Physics', 'Chemistry', 'Biology'],
    'PEM': ['Mathematics', 'Physics', 'Economics'],
    'HEG': ['History', 'Economics', 'Geography'],
    'HEM': ['History', 'Economics', 'Mathematics'],
    'BAM': ['Biology', 'Agriculture', 'Mathematics'],
    'BCM': ['Biology', 'Chemistry', 'Mathematics'],
    'ICT': ['Mathematics', 'Physics', 'Computer Science']
};

const SUBSIDIARY_SUBJECTS = ['General Paper', 'ICT', 'Subsidiary Mathematics'];
const OLEVEL_SUBJECTS = [
    'Mathematics', 'English', 'Physics', 'Chemistry', 'Biology',
    'History', 'Geography', 'Religious Education',
    'Computer Science', 'Entrepreneurship', 'Agriculture'
];

// Exam options
const EXAM_OPTIONS = ['Term 1', 'Term 2', 'Term 3', 'Mid-Term', 'Mock'];

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCurrentYear() {
    return new Date().getFullYear().toString();
}

// ============================================
// LOAD GRADING RULES FROM SETTINGS
// ============================================

async function loadGradingRules() {
    try {
        if (currentLevel === 'olevel') {
            const { data, error } = await sb
                .from('olevel_grades')
                .select('*')
                .order('points', { ascending: true });
            
            if (error) throw error;
            gradingRules.olevel = data || [];
        } else {
            const [principal, subsidiary] = await Promise.all([
                sb.from('alevel_principal_grades').select('*').order('points', { ascending: false }),
                sb.from('alevel_subsidiary_grades').select('*').order('points', { ascending: false })
            ]);
            
            if (principal.error) throw principal.error;
            if (subsidiary.error) throw subsidiary.error;
            
            gradingRules.alevel = {
                principal: principal.data || [],
                subsidiary: subsidiary.data || []
            };
        }
        return true;
    } catch (error) {
        console.error('Error loading grading rules:', error);
        return false;
    }
}

// ============================================
// CALCULATE GRADE FROM SETTINGS
// ============================================

function calculateGrade(percentage, isSubsidiary = false) {
    let rules = [];
    
    if (currentLevel === 'olevel') {
        rules = gradingRules.olevel;
    } else {
        rules = isSubsidiary ? gradingRules.alevel.subsidiary : gradingRules.alevel.principal;
    }
    
    if (rules && rules.length > 0) {
        for (const rule of rules) {
            if (percentage >= rule.min_percentage && percentage <= rule.max_percentage) {
                return {
                    grade: rule.grade,
                    points: rule.points,
                    color: rule.color_code || '#2ecc71',
                    remark: rule.remark || ''
                };
            }
        }
    }
    
    // Fallback grading
    if (currentLevel === 'olevel') {
        if (percentage >= 90) return { grade: 'A', points: 1, color: '#2ecc71', remark: 'Excellent' };
        if (percentage >= 80) return { grade: 'B', points: 2, color: '#3498db', remark: 'Very Good' };
        if (percentage >= 70) return { grade: 'C', points: 3, color: '#f39c12', remark: 'Good' };
        if (percentage >= 60) return { grade: 'D', points: 4, color: '#e67e22', remark: 'Credit' };
        if (percentage >= 50) return { grade: 'E', points: 5, color: '#e74c3c', remark: 'Pass' };
        return { grade: 'F', points: 6, color: '#c0392b', remark: 'Fail' };
    } else {
        if (isSubsidiary) {
            if (percentage >= 80) return { grade: 'A', points: 6, color: '#2ecc71', remark: 'Excellent' };
            if (percentage >= 70) return { grade: 'B', points: 5, color: '#3498db', remark: 'Very Good' };
            if (percentage >= 60) return { grade: 'C', points: 4, color: '#f39c12', remark: 'Good' };
            if (percentage >= 50) return { grade: 'D', points: 3, color: '#e67e22', remark: 'Credit' };
            if (percentage >= 40) return { grade: 'E', points: 2, color: '#e74c3c', remark: 'Pass' };
            return { grade: 'O', points: 1, color: '#95a5a6', remark: 'Ordinary' };
        } else {
            if (percentage >= 80) return { grade: 'A', points: 6, color: '#2ecc71', remark: 'Excellent' };
            if (percentage >= 70) return { grade: 'B', points: 5, color: '#3498db', remark: 'Very Good' };
            if (percentage >= 60) return { grade: 'C', points: 4, color: '#f39c12', remark: 'Good' };
            if (percentage >= 50) return { grade: 'D', points: 3, color: '#e67e22', remark: 'Credit' };
            if (percentage >= 40) return { grade: 'E', points: 2, color: '#e74c3c', remark: 'Pass' };
            return { grade: 'O', points: 1, color: '#95a5a6', remark: 'Ordinary' };
        }
    }
}

// ============================================
// GET STUDENT SUBJECTS (A-Level only)
// ============================================

function getStudentSubjects(student) {
    if (currentLevel === 'olevel') return OLEVEL_SUBJECTS;
    const combination = student.combination || 'PCM';
    return SUBJECT_COMBINATIONS[combination] || SUBJECT_COMBINATIONS['PCM'];
}

// ============================================
// LOAD ALL MARKS DATA
// ============================================

async function loadAllMarks() {
    try {
        await loadGradingRules();
        
        const [marksRes, studentsRes] = await Promise.all([
            sb.from('marks').select('*').eq('level', currentLevel).order('created_at', { ascending: false }),
            sb.from('students').select('*').in('class', currentLevel === 'olevel' ? ['S.1', 'S.2', 'S.3', 'S.4'] : ['S.5', 'S.6'])
        ]);
        
        if (marksRes.error) throw marksRes.error;
        if (studentsRes.error) throw studentsRes.error;
        
        allMarksList = marksRes.data || [];
        allStudentsList = studentsRes.data || [];
        
        return true;
    } catch (error) {
        console.error('Error loading data:', error);
        return false;
    }
}

// ============================================
// GET CLASS OPTIONS
// ============================================

function getClassOptions() {
    return currentLevel === 'olevel' ? ['S.1', 'S.2', 'S.3', 'S.4'] : ['S.5', 'S.6'];
}

// ============================================
// GET STREAM OPTIONS
// ============================================

function getStreamOptions() {
    return STREAM_OPTIONS[currentLevel];
}

// ============================================
// RENDER MARKS PAGE
// ============================================

async function renderMarks() {
    await loadGradingRules();
    
    const levelName = currentLevel === 'olevel' ? 'O-Level (20% CA + 80% Exam)' : 'A-Level';
    const classOptions = getClassOptions();
    const streamOptionsList = getStreamOptions();
    const isOlevel = currentLevel === 'olevel';
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-chart-line"></i> Marks Entry - ${levelName}</h5>
                <small>${isOlevel ? 'Select Subject first, then load class' : 'Enter marks for all subjects at once'}</small>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-2">
                        <label class="form-label fw-bold">📚 Class</label>
                        <select id="batchClass" class="form-select">
                            <option value="">-- Select --</option>
                            ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">🌊 Stream</label>
                        <select id="batchStream" class="form-select">
                            <option value="">-- All Streams --</option>
                            ${streamOptionsList.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    ${isOlevel ? `
                    <div class="col-md-3">
                        <label class="form-label fw-bold">📖 Subject *</label>
                        <select id="batchSubject" class="form-select">
                            <option value="">-- Select Subject --</option>
                            ${OLEVEL_SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    ` : ''}
                    <div class="col-md-2">
                        <label class="form-label fw-bold">📝 Exam</label>
                        <select id="batchExam" class="form-select">
                            ${EXAM_OPTIONS.map(e => `<option value="${e}">${e}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">📅 Year</label>
                        <input type="text" id="batchYear" class="form-control" value="${getCurrentYear()}">
                    </div>
                    <div class="col-md-${isOlevel ? '1' : '2'}">
                        <label class="form-label fw-bold">&nbsp;</label>
                        <button class="btn btn-primary w-100" onclick="loadBatchMarks()">
                            <i class="fas fa-users"></i> Load
                        </button>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">&nbsp;</label>
                        <button class="btn btn-success w-100" onclick="saveBatchMarks()">
                            <i class="fas fa-save"></i> Save All
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="batchMarksContainer" style="display: none;">
            <div class="card shadow-sm mb-4">
                <div class="card-header ${isOlevel ? 'bg-info' : 'bg-success'} text-white">
                    <h6 class="mb-0">
                        <i class="fas fa-edit"></i> 
                        ${isOlevel ? `Entering Marks for: <span id="selectedSubjectDisplay"></span> - <span id="selectedClassDisplay"></span>` : 'Batch Marks Entry'}
                    </h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive" style="max-height: 450px; overflow-y: auto;">
                        <table class="table table-bordered table-sm mb-0">
                            <thead class="table-primary sticky-top">
                                <tr id="batchTableHeader"></tr>
                            </thead>
                            <tbody id="batchTableBody"></tbody>
                        </table>
                    </div>
                    <div class="p-2 bg-light text-end">
                        <button class="btn btn-success btn-sm" onclick="saveBatchMarks()">
                            <i class="fas fa-save"></i> Save All
                        </button>
                        <button class="btn btn-info btn-sm" onclick="exportBatchMarks()">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-8">
                        <button class="btn btn-primary" onclick="openAddMarkModal()">
                            <i class="fas fa-plus"></i> Add Single Mark
                        </button>
                        <button class="btn btn-success ms-2" onclick="exportAllMarks()">
                            <i class="fas fa-file-excel"></i> Export All
                        </button>
                        <button class="btn btn-danger ms-2" onclick="bulkDeleteMarks()">
                            <i class="fas fa-trash"></i> Bulk Delete
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="refreshMarksTable()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="col-md-4">
                        <input type="text" id="markSearch" class="form-control" placeholder="🔍 Search marks..." onkeyup="filterMarksTable()">
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Filters -->
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-3">
                        <input type="text" id="filterStudent" class="form-control" placeholder="Filter by student" onkeyup="filterMarksTable()">
                    </div>
                    <div class="col-md-3">
                        <input type="text" id="filterSubject" class="form-control" placeholder="Filter by subject" onkeyup="filterMarksTable()">
                    </div>
                    <div class="col-md-3">
                        <select id="filterExam" class="form-select" onchange="filterMarksTable()">
                            <option value="">All Exams</option>
                            ${EXAM_OPTIONS.map(e => `<option value="${e}">${e}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-3">
                        <input type="text" id="filterYear" class="form-control" placeholder="Filter by year" onkeyup="filterMarksTable()">
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Marks Table -->
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <h6 class="mb-0"><i class="fas fa-table"></i> Marks Records</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            ${renderTableHeader()}
                        </thead>
                        <tbody id="marksTableBody">
                            <tr><td colspan="${isOlevel ? 14 : 14}" class="text-center py-4">
                                <i class="fas fa-spinner fa-spin"></i> Loading marks...
                            络</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// RENDER TABLE HEADER
// ============================================

function renderTableHeader() {
    if (currentLevel === 'olevel') {
        return `
            <tr>
                <th width="30"><input type="checkbox" id="selectAllMarks"></th>
                <th>Student Info</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Subject</th>
                <th>Exam</th>
                <th>Year</th>
                <th width="80">CA<br><small>/100</small></th>
                <th width="80">Exam<br><small>/100</small></th>
                <th width="80">Final</th>
                <th width="70">%</th>
                <th width="60">Grade</th>
                <th width="60">Points</th>
                <th width="80">Actions</th>
            </tr>
        `;
    } else {
        return `
            <tr>
                <th width="30"><input type="checkbox" id="selectAllMarks"></th>
                <th>Student Info</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Combination</th>
                <th>Subject</th>
                <th>Subject Type</th>
                <th>Exam</th>
                <th>Year</th>
                <th width="80">Marks<br><small>/100</small></th>
                <th width="70">%</th>
                <th width="60">Grade</th>
                <th width="60">Points</th>
                <th width="80">Actions</th>
            </tr>
        `;
    }
}

// ============================================
// LOAD MARKS TABLE
// ============================================

async function loadMarksTable() {
    const tbody = document.getElementById('marksTableBody');
    if (!tbody) return;
    
    await loadAllMarks();
    
    if (allMarksList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4">No marks found. Use batch entry above.络</tbody>`;
        return;
    }
    
    let html = '';
    for (const mark of allMarksList) {
        const student = allStudentsList.find(s => s.id === mark.student_id);
        if (!student) continue;
        
        if (currentLevel === 'olevel') {
            const ca = mark.ca_score || 0;
            const exam = mark.exam_score || 0;
            const final = (ca * 0.2) + (exam * 0.8);
            const grade = calculateGrade(final, false);
            
            html += `
                <tr>
                    <td class="text-center"><input type="checkbox" class="markCheck" data-id="${mark.id}"></td>
                    <td>
                        <strong>${escapeHtml(student.name)}</strong>
                        <br><small class="text-muted">${student.admission_no || '-'}</small>
                    </span></td>
                    <td>${student.class}</span></td>
                    <td>${student.stream || '-'}</span></td>
                    <td><strong>${escapeHtml(mark.subject)}</strong></span></td>
                    <td>${mark.exam}</span></td>
                    <td>${mark.year}</span></td>
                    <td class="text-center"><span class="badge bg-info">${ca}</span></span></td>
                    <td class="text-center"><span class="badge bg-primary">${exam}</span></span></td>
                    <td class="text-center"><strong>${final.toFixed(1)}</strong></span></td>
                    <td class="text-center">${final.toFixed(1)}%</span></td>
                    <td class="text-center"><span class="badge" style="background: ${grade.color}">${grade.grade}</span></span></td>
                    <td class="text-center"><strong>${grade.points}</strong></span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-warning me-1" onclick="editMark('${mark.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMark('${mark.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </span></td>
                </tr>
            `;
        } else {
            const percentage = (mark.marks_obtained / mark.max_marks) * 100;
            const isSubsidiary = mark.subject_type === 'subsidiary' || SUBSIDIARY_SUBJECTS.includes(mark.subject);
            const grade = calculateGrade(percentage, isSubsidiary);
            const subjectType = isSubsidiary ? 'Subsidiary' : 'Principal';
            const typeBadge = isSubsidiary ? 'bg-secondary' : 'bg-primary';
            
            html += `
                <tr>
                    <td class="text-center"><input type="checkbox" class="markCheck" data-id="${mark.id}"></td>
                    <td>
                        <strong>${escapeHtml(student.name)}</strong>
                        <br><small class="text-muted">${student.admission_no || '-'}</small>
                    </span></td>
                    <td>${student.class}</span></td>
                    <td>${student.stream || '-'}</span></td>
                    <td>${student.combination || '-'}</span></td>
                    <td><strong>${escapeHtml(mark.subject)}</strong></span></td>
                    <td class="text-center"><span class="badge ${typeBadge}">${subjectType}</span></span></td>
                    <td>${mark.exam}</span></td>
                    <td>${mark.year}</span></td>
                    <td class="text-center"><strong>${mark.marks_obtained}</strong></span></td>
                    <td class="text-center">${percentage.toFixed(1)}%</span></td>
                    <td class="text-center"><span class="badge" style="background: ${grade.color}">${grade.grade}</span></span></td>
                    <td class="text-center"><strong>${grade.points}</strong></span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-warning me-1" onclick="editMark('${mark.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMark('${mark.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </span></td>
                </tr>
            `;
        }
    }
    
    tbody.innerHTML = html;
    
    const selectAll = document.getElementById('selectAllMarks');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.markCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
}

// ============================================
// LOAD BATCH MARKS - RETRIEVES SAVED MARKS FOR BOTH LEVELS
// ============================================

window.loadBatchMarks = async function() {
    const className = document.getElementById('batchClass').value;
    const stream = document.getElementById('batchStream').value;
    const subject = document.getElementById('batchSubject')?.value;
    const exam = document.getElementById('batchExam').value;
    const year = document.getElementById('batchYear').value;
    
    if (!className) {
        Swal.fire('Error', 'Please select a class', 'error');
        return;
    }
    
    if (currentLevel === 'olevel' && !subject) {
        Swal.fire('Error', 'Please select a subject', 'error');
        return;
    }
    
    batchState = { ...batchState, class: className, stream, subject, exam, year };
    
    Swal.fire({ title: 'Loading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        // Load students
        let query = sb.from('students').select('*').eq('class', className);
        if (stream) query = query.eq('stream', stream);
        
        const { data: students, error } = await query;
        if (error) throw error;
        
        batchState.students = students || [];
        
        if (batchState.students.length === 0) {
            Swal.close();
            Swal.fire('Info', `No students found in ${className}${stream ? ' - ' + stream : ''}`, 'info');
            return;
        }
        
        // Load existing marks for these students
        const studentIds = batchState.students.map(s => s.id);
        const { data: existingMarks, error: marksError } = await sb
            .from('marks')
            .select('*')
            .in('student_id', studentIds)
            .eq('exam', exam)
            .eq('year', year);
        
        if (marksError) throw marksError;
        
        // Build marks map for quick lookup
        batchState.marksMap = {};
        for (const mark of existingMarks || []) {
            const key = `${mark.student_id}_${mark.subject}`;
            batchState.marksMap[key] = mark;
        }
        
        if (currentLevel === 'olevel') {
            // O-Level: Single subject
            batchState.subjects = [{ name: subject, category: 'Core' }];
            document.getElementById('selectedSubjectDisplay').innerText = subject;
            document.getElementById('selectedClassDisplay').innerText = `${className}${stream ? ' - ' + stream : ''}`;
            renderOlevelBatchTable();
        } else {
            // A-Level: All subjects based on combinations
            const principalSubjects = new Set();
            for (const student of batchState.students) {
                getStudentSubjects(student).forEach(s => principalSubjects.add(s));
            }
            batchState.subjects = [
                ...Array.from(principalSubjects).map(s => ({ name: s, category: 'Principal' })),
                ...SUBSIDIARY_SUBJECTS.map(s => ({ name: s, category: 'Subsidiary' }))
            ];
            renderAlevelBatchTable();
        }
        
        document.getElementById('batchMarksContainer').style.display = 'block';
        Swal.close();
    } catch (error) {
        Swal.close();
        Swal.fire('Error', error.message, 'error');
    }
};

// ============================================
// RENDER O-LEVEL BATCH TABLE (WITH SAVED MARKS)
// ============================================

function renderOlevelBatchTable() {
    const headerRow = document.getElementById('batchTableHeader');
    const bodyRow = document.getElementById('batchTableBody');
    
    headerRow.innerHTML = `
        <tr>
            <th width="30">#</th>
            <th>Student Name</th>
            <th>Admission No</th>
            <th>Stream</th>
            <th>CA Score<br><small>/100</small></th>
            <th>Exam Score<br><small>/100</small></th>
            <th>Final<br><small>20%+80%</small></th>
            <th>Grade</th>
            <th>Points</th>
        </tr>
    `;
    
    let html = '';
    for (let i = 0; i < batchState.students.length; i++) {
        const student = batchState.students[i];
        const key = `${student.id}_${batchState.subject}`;
        const existingMark = batchState.marksMap[key];
        
        const ca = existingMark?.ca_score || 0;
        const exam = existingMark?.exam_score || 0;
        const final = (ca * 0.2) + (exam * 0.8);
        const grade = calculateGrade(final, false);
        
        html += `
            <tr>
                <td class="text-center">${i + 1}</span></td>
                <td><strong>${escapeHtml(student.name)}</strong></span></td>
                <td>${student.admission_no || '-'}</span></td>
                <td>${student.stream || '-'}</span></td>
                <td class="text-center">
                    <input type="number" class="form-control form-control-sm batch-ca" 
                           data-student="${student.id}" value="${ca}" 
                           min="0" max="100" step="0.5" style="width:80px;text-align:center;">
                 </span></td>
                <td class="text-center">
                    <input type="number" class="form-control form-control-sm batch-exam" 
                           data-student="${student.id}" value="${exam}" 
                           min="0" max="100" step="0.5" style="width:80px;text-align:center;">
                 </span></td>
                <td class="text-center final-cell" data-student="${student.id}">
                    <strong>${final.toFixed(1)}</strong>
                 </span></td>
                <td class="text-center grade-cell" data-student="${student.id}">
                    <span class="badge" style="background: ${grade.color}">${grade.grade}</span>
                 </span></td>
                <td class="text-center points-cell" data-student="${student.id}">
                    <strong>${grade.points}</strong>
                 </span></td>
            </tr>
        `;
    }
    
    bodyRow.innerHTML = html;
    
    // Add event listeners for real-time calculation
    document.querySelectorAll('.batch-ca, .batch-exam').forEach(input => {
        input.addEventListener('input', function() {
            const studentId = this.dataset.student;
            const ca = parseFloat(document.querySelector(`.batch-ca[data-student="${studentId}"]`).value) || 0;
            const exam = parseFloat(document.querySelector(`.batch-exam[data-student="${studentId}"]`).value) || 0;
            const final = (ca * 0.2) + (exam * 0.8);
            const grade = calculateGrade(final, false);
            
            const finalCell = document.querySelector(`.final-cell[data-student="${studentId}"]`);
            const gradeCell = document.querySelector(`.grade-cell[data-student="${studentId}"]`);
            const pointsCell = document.querySelector(`.points-cell[data-student="${studentId}"]`);
            
            if (finalCell) finalCell.innerHTML = `<strong>${final.toFixed(1)}</strong>`;
            if (gradeCell) gradeCell.innerHTML = `<span class="badge" style="background: ${grade.color}">${grade.grade}</span>`;
            if (pointsCell) pointsCell.innerHTML = `<strong>${grade.points}</strong>`;
        });
    });
}

// ============================================
// RENDER A-LEVEL BATCH TABLE (WITH SAVED MARKS)
// ============================================

function renderAlevelBatchTable() {
    const headerRow = document.getElementById('batchTableHeader');
    const bodyRow = document.getElementById('batchTableBody');
    
    headerRow.innerHTML = `
        <tr>
            <th width="30">#</th>
            <th>Student Name</th>
            <th>Admission No</th>
            <th>Stream</th>
            <th>Combination</th>
            ${batchState.subjects.map(s => `<th class="text-center">${escapeHtml(s.name)}<br><small>/100</small></th>`).join('')}
            <th width="80">Total</th>
            <th width="80">Grade</th>
            <th width="80">Points</th>
            <th width="80">Action</th>
        </tr>
    `;
    
    let html = '';
    for (let i = 0; i < batchState.students.length; i++) {
        const student = batchState.students[i];
        let totalPoints = 0;
        
        html += `
            <tr>
                <td class="text-center">${i + 1}</span></td>
                <td><strong>${escapeHtml(student.name)}</strong></span></td>
                <td>${student.admission_no || '-'}</span></td>
                <td>${student.stream || '-'}</span></td>
                <td><span class="badge bg-info">${student.combination || 'N/A'}</span></span></td>
        `;
        
        for (const subject of batchState.subjects) {
            const key = `${student.id}_${subject.name}`;
            const existingMark = batchState.marksMap[key];
            const markValue = existingMark ? existingMark.marks_obtained : '';
            const percentage = markValue ? parseFloat(markValue) : 0;
            const isSubsidiary = subject.category === 'Subsidiary';
            const gradeInfo = calculateGrade(percentage, isSubsidiary);
            
            if (markValue) totalPoints += gradeInfo.points;
            
            html += `
                <td class="text-center mark-cell" data-student="${student.id}" data-subject="${subject.name}" data-type="${isSubsidiary ? 'subsidiary' : 'principal'}">
                    <input type="number" class="form-control form-control-sm batch-mark-input" 
                           data-student="${student.id}" data-subject="${subject.name}" 
                           data-type="${isSubsidiary ? 'subsidiary' : 'principal'}" 
                           value="${markValue}" min="0" max="100" step="0.5" 
                           style="width:80px;text-align:center;transition:all 0.3s;">
                    ${markValue ? `<small class="grade-display" style="display:block;margin-top:4px;color:${gradeInfo.color}">${gradeInfo.grade} (${gradeInfo.points} pts)</small>` : ''}
                </span>
            `;
        }
        
        const avgPoints = batchState.subjects.length > 0 ? totalPoints / batchState.subjects.length : 0;
        const overallGrade = calculateGrade(avgPoints, false);
        
        html += `
            <td class="text-center total-points" data-student="${student.id}"><strong>${totalPoints}</strong></span></td>
            <td class="text-center overall-grade" data-student="${student.id}"><span class="badge" style="background:${overallGrade.color};padding:8px 12px;">${overallGrade.grade}</span></span></td>
            <td class="text-center"><strong>${totalPoints}</strong></span></td>
            <td class="text-center"><button class="btn btn-sm btn-primary edit-batch-row" data-student="${student.id}"><i class="fas fa-edit"></i> Edit</button></span></td>
        </tr>
        `;
    }
    
    bodyRow.innerHTML = html;
    
    // Add event listeners for real-time calculation
    document.querySelectorAll('.batch-mark-input').forEach(input => {
        input.addEventListener('input', function() { updateAlevelBatchTotals(); });
    });
    
    document.querySelectorAll('.edit-batch-row').forEach(btn => {
        btn.addEventListener('click', () => editBatchStudent(btn.dataset.student));
    });
}

// ============================================
// UPDATE A-LEVEL BATCH TOTALS
// ============================================

function updateAlevelBatchTotals() {
    for (const student of batchState.students) {
        let totalPoints = 0;
        
        for (const subject of batchState.subjects) {
            const input = document.querySelector(`.batch-mark-input[data-student="${student.id}"][data-subject="${subject.name}"]`);
            const cell = document.querySelector(`.mark-cell[data-student="${student.id}"][data-subject="${subject.name}"]`);
            
            if (input && cell) {
                const marks = parseFloat(input.value) || 0;
                const isSubsidiary = input.dataset.type === 'subsidiary';
                const gradeInfo = calculateGrade(marks, isSubsidiary);
                
                if (marks > 0) totalPoints += gradeInfo.points;
                
                input.style.borderLeft = `3px solid ${gradeInfo.color}`;
                
                let gradeDisplay = cell.querySelector('.grade-display');
                if (marks > 0) {
                    if (!gradeDisplay) {
                        gradeDisplay = document.createElement('small');
                        gradeDisplay.className = 'grade-display';
                        gradeDisplay.style.display = 'block';
                        gradeDisplay.style.marginTop = '4px';
                        cell.appendChild(gradeDisplay);
                    }
                    gradeDisplay.innerHTML = `${gradeInfo.grade} (${gradeInfo.points} pts)`;
                    gradeDisplay.style.color = gradeInfo.color;
                } else if (gradeDisplay) {
                    gradeDisplay.remove();
                }
            }
        }
        
        const avgPoints = batchState.subjects.length > 0 ? totalPoints / batchState.subjects.length : 0;
        const overallGrade = calculateGrade(avgPoints, false);
        
        const totalPointsCell = document.querySelector(`.total-points[data-student="${student.id}"]`);
        const overallGradeCell = document.querySelector(`.overall-grade[data-student="${student.id}"]`);
        
        if (totalPointsCell) totalPointsCell.innerHTML = `<strong>${totalPoints}</strong>`;
        if (overallGradeCell) overallGradeCell.innerHTML = `<span class="badge" style="background:${overallGrade.color};padding:8px 12px;">${overallGrade.grade}</span>`;
    }
}

// ============================================
// EDIT BATCH STUDENT (A-Level only)
// ============================================

async function editBatchStudent(studentId) {
    const student = batchState.students.find(s => s.id === studentId);
    if (!student) return;
    
    let marksHtml = '';
    for (const subject of batchState.subjects) {
        const key = `${student.id}_${subject.name}`;
        const existingMark = batchState.marksMap[key];
        const safeName = subject.name.replace(/[^a-zA-Z]/g, '_');
        const isSubsidiary = subject.category === 'Subsidiary';
        
        marksHtml += `<div class="row mb-3 p-2 border-bottom">
            <div class="col-md-6"><strong>${escapeHtml(subject.name)}</strong> ${isSubsidiary ? '<span class="badge bg-secondary">Subsidiary</span>' : '<span class="badge bg-primary">Principal</span>'}</div>
            <div class="col-md-4"><input type="number" id="edit_mark_${safeName}" class="form-control" value="${existingMark ? existingMark.marks_obtained || 0 : 0}" min="0" max="100" step="0.5"></div>
            <div class="col-md-2"><span id="edit_grade_${safeName}" class="badge" style="background:#6c757d">-</span></div>
        </div>`;
    }
    
    Swal.fire({
        title: `✏️ Edit Marks - ${student.name}`,
        html: `<div style="max-height:500px;overflow-y:auto;">${marksHtml}</div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        didOpen: () => {
            for (const subject of batchState.subjects) {
                const safeName = subject.name.replace(/[^a-zA-Z]/g, '_');
                const markInput = document.getElementById(`edit_mark_${safeName}`);
                const gradeSpan = document.getElementById(`edit_grade_${safeName}`);
                const isSubsidiary = subject.category === 'Subsidiary';
                if (markInput) {
                    markInput.oninput = () => {
                        const marks = parseFloat(markInput.value) || 0;
                        const gi = calculateGrade(marks, isSubsidiary);
                        if (gradeSpan) { gradeSpan.innerHTML = `${gi.grade} (${gi.points} pts)`; gradeSpan.style.background = gi.color; }
                    };
                    markInput.oninput();
                }
            }
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let saved = 0;
            for (const subject of batchState.subjects) {
                const safeName = subject.name.replace(/[^a-zA-Z]/g, '_');
                const marksObtained = parseFloat(document.getElementById(`edit_mark_${safeName}`)?.value) || 0;
                const isSubsidiary = subject.category === 'Subsidiary';
                
                const { error } = await sb.from('marks').upsert({
                    student_id: student.id,
                    subject: subject.name,
                    subject_type: isSubsidiary ? 'subsidiary' : 'principal',
                    exam: batchState.exam,
                    year: batchState.year,
                    marks_obtained: marksObtained,
                    max_marks: 100,
                    level: currentLevel,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'student_id, subject, exam, year' });
                
                if (!error) saved++;
            }
            Swal.fire('Success', `✅ ${saved} marks updated!`, 'success');
            await loadBatchMarks();
            await loadMarksTable();
        }
    });
}

// ============================================
// SAVE BATCH MARKS - FIXED FOR BOTH LEVELS
// ============================================

window.saveBatchMarks = async function() {
    if (!batchState.students.length) {
        Swal.fire('Error', 'No data to save', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving marks...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    let saved = 0, errors = 0;
    
    for (const student of batchState.students) {
        if (currentLevel === 'olevel') {
            // O-Level: Save single subject
            const caInput = document.querySelector(`.batch-ca[data-student="${student.id}"]`);
            const examInput = document.querySelector(`.batch-exam[data-student="${student.id}"]`);
            
            if (caInput && examInput) {
                const ca = parseFloat(caInput.value) || 0;
                const exam = parseFloat(examInput.value) || 0;
                const final = (ca * 0.2) + (exam * 0.8);
                
                const key = `${student.id}_${batchState.subject}`;
                const existingMark = batchState.marksMap[key];
                
                const markData = {
                    student_id: student.id,
                    subject: batchState.subject,
                    subject_type: 'principal',
                    exam: batchState.exam,
                    year: batchState.year,
                    marks_obtained: final,
                    max_marks: 100,
                    ca_score: ca,
                    exam_score: exam,
                    level: currentLevel,
                    updated_at: new Date().toISOString()
                };
                
                try {
                    let result;
                    if (existingMark?.id) {
                        // Update existing
                        result = await sb.from('marks').update(markData).eq('id', existingMark.id);
                    } else if (final > 0 || ca > 0 || exam > 0) {
                        // Insert new
                        markData.created_at = new Date().toISOString();
                        result = await sb.from('marks').insert([markData]);
                    }
                    if (result?.error) throw result.error;
                    saved++;
                } catch (error) {
                    console.error('Save error:', error);
                    errors++;
                }
            }
        } else {
            // A-Level: Save all subjects
            for (const subject of batchState.subjects) {
                const input = document.querySelector(`.batch-mark-input[data-student="${student.id}"][data-subject="${subject.name}"]`);
                
                if (input) {
                    const marksObtained = parseFloat(input.value) || 0;
                    const key = `${student.id}_${subject.name}`;
                    const existingMark = batchState.marksMap[key];
                    const isSubsidiary = subject.category === 'Subsidiary';
                    
                    const markData = {
                        student_id: student.id,
                        subject: subject.name,
                        subject_type: isSubsidiary ? 'subsidiary' : 'principal',
                        exam: batchState.exam,
                        year: batchState.year,
                        marks_obtained: marksObtained,
                        max_marks: 100,
                        level: currentLevel,
                        updated_at: new Date().toISOString()
                    };
                    
                    try {
                        let result;
                        if (existingMark?.id) {
                            // Update existing
                            result = await sb.from('marks').update(markData).eq('id', existingMark.id);
                        } else if (marksObtained > 0) {
                            // Insert new
                            markData.created_at = new Date().toISOString();
                            result = await sb.from('marks').insert([markData]);
                        }
                        if (result?.error) throw result.error;
                        saved++;
                    } catch (error) {
                        console.error('Save error:', error);
                        errors++;
                    }
                }
            }
        }
    }
    
    Swal.fire('Complete!', `✅ Saved: ${saved} | ❌ Errors: ${errors}`, errors ? 'warning' : 'success');
    
    // Reload data to refresh the display
    await loadBatchMarks();
    await loadMarksTable();
};

// ============================================
// EXPORT BATCH MARKS
// ============================================

window.exportBatchMarks = function() {
    if (!batchState.students.length) {
        Swal.fire('Error', 'No data to export', 'error');
        return;
    }
    
    const exportData = batchState.students.map(student => {
        const row = { 'Student Name': student.name, 'Admission No': student.admission_no || '-', 'Class': student.class, 'Stream': student.stream || '-' };
        
        if (currentLevel === 'olevel') {
            const key = `${student.id}_${batchState.subject}`;
            const mark = batchState.marksMap[key];
            row['Subject'] = batchState.subject;
            row['CA Score'] = mark?.ca_score || 0;
            row['Exam Score'] = mark?.exam_score || 0;
            const final = ((row['CA Score'] * 0.2) + (row['Exam Score'] * 0.8)).toFixed(1);
            row['Final Score'] = final;
            const grade = calculateGrade(parseFloat(final), false);
            row['Grade'] = grade.grade;
            row['Points'] = grade.points;
        } else {
            for (const subject of batchState.subjects) {
                const key = `${student.id}_${subject.name}`;
                const mark = batchState.marksMap[key];
                row[subject.name] = mark?.marks_obtained || '';
                if (mark?.marks_obtained) {
                    const grade = calculateGrade(mark.marks_obtained, subject.category === 'Subsidiary');
                    row[`${subject.name}_Grade`] = `${grade.grade} (${grade.points} pts)`;
                }
            }
        }
        return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${batchState.class}_${batchState.exam}`);
    XLSX.writeFile(wb, `${currentLevel}_${batchState.class}_Marks.xlsx`);
    Swal.fire('Exported!', 'Batch marks exported', 'success');
};

// ============================================
// ADD/EDIT/DELETE MARK FUNCTIONS
// ============================================

window.openAddMarkModal = async function() {
    await loadAllMarks();
    
    const subjectOptions = currentLevel === 'olevel' 
        ? OLEVEL_SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')
        : `<optgroup label="Principal Subjects">${['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'History', 'Geography', 'Computer Science'].map(s => `<option value="${s}">${s}</option>`).join('')}</optgroup>
           <optgroup label="Subsidiary Subjects">${SUBSIDIARY_SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}</optgroup>`;
    
    Swal.fire({
        title: 'Add Single Mark',
        html: `
            <div class="mb-3"><label>Student *</label><select id="markStudent" class="form-select">${allStudentsList.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.class})</option>`).join('')}</select></div>
            <div class="mb-3"><label>Subject *</label><select id="markSubject" class="form-select">${subjectOptions}</select></div>
            <div class="row"><div class="col-md-6 mb-3"><label>Exam</label><select id="markExam" class="form-select">${EXAM_OPTIONS.map(e => `<option value="${e}">${e}</option>`).join('')}</select></div>
            <div class="col-md-6 mb-3"><label>Year</label><input type="text" id="markYear" class="form-control" value="${getCurrentYear()}"></div></div>
            ${currentLevel === 'olevel' ? `
                <div class="row"><div class="col-md-6 mb-3"><label>CA Score</label><input type="number" id="markCa" class="form-control" step="0.5" min="0" max="100"></div>
                <div class="col-md-6 mb-3"><label>Exam Score</label><input type="number" id="markExamScore" class="form-control" step="0.5" min="0" max="100"></div></div>
            ` : `<div class="mb-3"><label>Marks Obtained</label><input type="number" id="markMarks" class="form-control" step="0.5" min="0" max="100"></div>`}
            <div class="mb-3"><label>Remarks</label><textarea id="markRemarks" class="form-control" rows="2"></textarea></div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: 'Save',
        preConfirm: () => {
            const studentId = document.getElementById('markStudent').value;
            const subject = document.getElementById('markSubject').value;
            if (!studentId || !subject) return Swal.showValidationMessage('Please select student and subject');
            
            if (currentLevel === 'olevel') {
                const ca = parseFloat(document.getElementById('markCa').value) || 0;
                const exam = parseFloat(document.getElementById('markExamScore').value) || 0;
                return { student_id: studentId, subject, subject_type: 'principal', exam: document.getElementById('markExam').value, year: document.getElementById('markYear').value, marks_obtained: (ca * 0.2) + (exam * 0.8), max_marks: 100, ca_score: ca, exam_score: exam, remarks: document.getElementById('markRemarks').value, level: currentLevel };
            } else {
                const isSubsidiary = SUBSIDIARY_SUBJECTS.includes(subject);
                return { student_id: studentId, subject, subject_type: isSubsidiary ? 'subsidiary' : 'principal', exam: document.getElementById('markExam').value, year: document.getElementById('markYear').value, marks_obtained: parseFloat(document.getElementById('markMarks').value) || 0, max_marks: 100, remarks: document.getElementById('markRemarks').value, level: currentLevel };
            }
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const { error } = await sb.from('marks').insert([{ ...result.value, created_at: new Date().toISOString() }]);
            if (error) Swal.fire('Error', error.message, 'error');
            else { Swal.fire('Success', 'Mark added!', 'success'); await loadMarksTable(); }
        }
    });
};

window.editMark = async function(id) {
    const mark = allMarksList.find(m => m.id === id);
    if (!mark) return;
    
    const subjectOptions = currentLevel === 'olevel' 
        ? OLEVEL_SUBJECTS.map(s => `<option value="${s}" ${s === mark.subject ? 'selected' : ''}>${s}</option>`).join('')
        : `<optgroup label="Principal Subjects">${['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'History', 'Geography', 'Computer Science'].map(s => `<option value="${s}" ${s === mark.subject ? 'selected' : ''}>${s}</option>`).join('')}</optgroup>
           <optgroup label="Subsidiary Subjects">${SUBSIDIARY_SUBJECTS.map(s => `<option value="${s}" ${s === mark.subject ? 'selected' : ''}>${s}</option>`).join('')}</optgroup>`;
    
    Swal.fire({
        title: 'Edit Mark',
        html: `
            <div class="mb-3"><label>Student</label><select id="markStudent" class="form-select">${allStudentsList.map(s => `<option value="${s.id}" ${s.id === mark.student_id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.class})</option>`).join('')}</select></div>
            <div class="mb-3"><label>Subject</label><select id="markSubject" class="form-select">${subjectOptions}</select></div>
            <div class="row"><div class="col-md-6 mb-3"><label>Exam</label><select id="markExam" class="form-select">${EXAM_OPTIONS.map(e => `<option value="${e}" ${e === mark.exam ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
            <div class="col-md-6 mb-3"><label>Year</label><input type="text" id="markYear" class="form-control" value="${mark.year}"></div></div>
            ${currentLevel === 'olevel' ? `
                <div class="row"><div class="col-md-6 mb-3"><label>CA Score</label><input type="number" id="markCa" class="form-control" value="${mark.ca_score || 0}" step="0.5"></div>
                <div class="col-md-6 mb-3"><label>Exam Score</label><input type="number" id="markExamScore" class="form-control" value="${mark.exam_score || 0}" step="0.5"></div></div>
            ` : `<div class="mb-3"><label>Marks Obtained</label><input type="number" id="markMarks" class="form-control" value="${mark.marks_obtained}" step="0.5"></div>`}
            <div class="mb-3"><label>Remarks</label><textarea id="markRemarks" class="form-control" rows="2">${mark.remarks || ''}</textarea></div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: 'Update',
        preConfirm: () => {
            const subject = document.getElementById('markSubject').value;
            if (currentLevel === 'olevel') {
                const ca = parseFloat(document.getElementById('markCa').value) || 0;
                const exam = parseFloat(document.getElementById('markExamScore').value) || 0;
                return { student_id: document.getElementById('markStudent').value, subject, subject_type: 'principal', exam: document.getElementById('markExam').value, year: document.getElementById('markYear').value, marks_obtained: (ca * 0.2) + (exam * 0.8), max_marks: 100, ca_score: ca, exam_score: exam, remarks: document.getElementById('markRemarks').value };
            } else {
                const isSubsidiary = SUBSIDIARY_SUBJECTS.includes(subject);
                return { student_id: document.getElementById('markStudent').value, subject, subject_type: isSubsidiary ? 'subsidiary' : 'principal', exam: document.getElementById('markExam').value, year: document.getElementById('markYear').value, marks_obtained: parseFloat(document.getElementById('markMarks').value) || 0, max_marks: 100, remarks: document.getElementById('markRemarks').value };
            }
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const { error } = await sb.from('marks').update({ ...result.value, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) Swal.fire('Error', error.message, 'error');
            else { Swal.fire('Success', 'Mark updated!', 'success'); await loadMarksTable(); }
        }
    });
};

window.deleteMark = async function(id) {
    const result = await Swal.fire({ title: 'Delete Mark?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete' });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await sb.from('marks').delete().eq('id', id);
        if (error) Swal.fire('Error', error.message, 'error');
        else { Swal.fire('Deleted!', 'Mark deleted.', 'success'); await loadMarksTable(); }
    }
};

// ============================================
// BULK DELETE MARKS
// ============================================

window.bulkDeleteMarks = async function() {
    const checkboxes = document.querySelectorAll('.markCheck:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    if (!ids.length) return Swal.fire('Error', 'No marks selected', 'error');
    
    const result = await Swal.fire({ title: `Delete ${ids.length} marks?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete' });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        for (const id of ids) await sb.from('marks').delete().eq('id', id);
        Swal.fire('Deleted!', `${ids.length} marks deleted.`, 'success');
        await loadMarksTable();
    }
};

// ============================================
// EXPORT ALL MARKS
// ============================================

window.exportAllMarks = async function() {
    await loadAllMarks();
    
    const exportData = allMarksList.map(mark => {
        const student = allStudentsList.find(s => s.id === mark.student_id);
        let finalScore = mark.marks_obtained;
        let ca = '-', exam = '-';
        
        if (currentLevel === 'olevel') {
            ca = mark.ca_score || 0;
            exam = mark.exam_score || 0;
            finalScore = (ca * 0.2) + (exam * 0.8);
        }
        
        const grade = calculateGrade(finalScore, mark.subject_type === 'subsidiary');
        
        return {
            'Student Name': student?.name || 'Unknown',
            'Admission No': student?.admission_no || '-',
            'Class': student?.class || '-',
            'Stream': student?.stream || '-',
            'Subject': mark.subject,
            'Exam': mark.exam,
            'Year': mark.year,
            'CA Score': ca,
            'Exam Score': exam,
            'Final Score': finalScore.toFixed(1),
            'Grade': grade.grade,
            'Points': grade.points
        };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks');
    XLSX.writeFile(wb, `${currentLevel}_Marks_${new Date().toISOString().split('T')[0]}.xlsx`);
    Swal.fire('Exported!', `${exportData.length} marks exported.`, 'success');
};

// ============================================
// FILTER MARKS TABLE
// ============================================

window.filterMarksTable = function() {
    const search = document.getElementById('markSearch')?.value.toLowerCase() || '';
    const studentFilter = document.getElementById('filterStudent')?.value.toLowerCase() || '';
    const subjectFilter = document.getElementById('filterSubject')?.value.toLowerCase() || '';
    const examFilter = document.getElementById('filterExam')?.value;
    const yearFilter = document.getElementById('filterYear')?.value;
    
    document.querySelectorAll('#marksTableBody tr').forEach(row => {
        if (row.cells?.length > 1) {
            const text = row.innerText.toLowerCase();
            row.style.display = (search && !text.includes(search)) || (studentFilter && !text.includes(studentFilter)) || (subjectFilter && !text.includes(subjectFilter)) || (examFilter && !text.includes(examFilter.toLowerCase())) || (yearFilter && !text.includes(yearFilter)) ? 'none' : '';
        }
    });
};

// ============================================
// REFRESH MARKS TABLE
// ============================================

window.refreshMarksTable = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadMarksTable();
    Swal.close();
    Swal.fire('Refreshed!', 'Marks table updated.', 'success');
};

// ============================================
// INITIALIZATION
// ============================================

console.log('✅ MARKS MODULE LOADED - Final Masterpiece');
console.log('✅ Save All works for both O-Level and A-Level');
console.log('✅ A-Level grading uses grading tabs from settings');



// ==================== TEACHERS MODULE ====================
// ============================================
// TEACHERS MODULE - USING SWEETALERT2 (No Bootstrap Modal)
// ============================================

// Global variable to store teachers
let allTeachers = [];

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getTeachers() {
    try {
        const { data, error } = await sb
            .from('teachers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        allTeachers = data || [];
        return allTeachers;
    } catch (error) {
        console.error('Error loading teachers:', error);
        return [];
    }
}

async function addTeacher(teacherData) {
    const { data, error } = await sb
        .from('teachers')
        .insert([{
            ...teacherData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function updateTeacher(id, teacherData) {
    const { data, error } = await sb
        .from('teachers')
        .update({
            ...teacherData,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
}

async function deleteTeacher(id) {
    const { error } = await sb
        .from('teachers')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

function generateStaffId() {
    const year = new Date().getFullYear();
    const count = allTeachers.length + 1;
    return `TCH/${year}/${String(count).padStart(4, '0')}`;
}

// ============================================
// RENDER TEACHERS PAGE
// ============================================

async function renderTeachers() {
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-chalkboard-user"></i> Teachers Management</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-8">
                        <button class="btn btn-primary" onclick="showAddTeacherModal()">
                            <i class="fas fa-plus"></i> Add Teacher
                        </button>
                        <button class="btn btn-success ms-2" onclick="exportTeachers()">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button class="btn btn-danger ms-2" onclick="bulkDeleteTeachers()">
                            <i class="fas fa-trash"></i> Bulk Delete
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="refreshTeachers()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="col-md-4">
                        <input type="text" id="teacherSearch" class="form-control" 
                               placeholder="🔍 Search teachers..." onkeyup="filterTeachers()">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-3">
                        <input type="text" id="filterQual" class="form-control" 
                               placeholder="Filter by qualification" onkeyup="filterTeachers()">
                    </div>
                    <div class="col-md-3">
                        <input type="text" id="filterSpec" class="form-control" 
                               placeholder="Filter by specialization" onkeyup="filterTeachers()">
                    </div>
                    <div class="col-md-3">
                        <select id="filterGender" class="form-select" onchange="filterTeachers()">
                            <option value="">All Genders</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <button class="btn btn-outline-secondary w-100" onclick="clearFilters()">
                            <i class="fas fa-eraser"></i> Clear Filters
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllTeachers"></th>
                                <th>Staff ID</th>
                                <th>Name</th>
                                <th>Qualification</th>
                                <th>Specialization</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th width="100">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="teachersTableBody">
                            <td><td colspan="8" class="text-center py-4">Loading teachers...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LOAD TEACHERS TABLE
// ============================================

async function loadTeachersTable() {
    const tbody = document.getElementById('teachersTableBody');
    if (!tbody) return;
    
    await getTeachers();
    
    if (allTeachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No teachers found. Click "Add Teacher" to get started.</td></tr>';
        return;
    }
    
    let html = '';
    for (const t of allTeachers) {
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="teacherCheck" data-id="${t.id}"></td>
                <td><code>${escapeHtml(t.staff_id || '-')}</code></td>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td>${escapeHtml(t.qualification || '-')}</td>
                <td>${escapeHtml(t.specialization || '-')}</td>
                <td>${escapeHtml(t.phone || '-')}</td>
                <td>${escapeHtml(t.email || '-')}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="editTeacher('${t.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTeacherItem('${t.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
    
    // Select All functionality
    const selectAll = document.getElementById('selectAllTeachers');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.teacherCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
}

// ============================================
// FILTER FUNCTIONS
// ============================================

window.filterTeachers = function() {
    const search = document.getElementById('teacherSearch')?.value.toLowerCase() || '';
    const qualFilter = document.getElementById('filterQual')?.value.toLowerCase() || '';
    const specFilter = document.getElementById('filterSpec')?.value.toLowerCase() || '';
    const genderFilter = document.getElementById('filterGender')?.value;
    
    const rows = document.querySelectorAll('#teachersTableBody tr');
    
    rows.forEach(row => {
        if (row.cells && row.cells.length > 1) {
            const text = row.innerText.toLowerCase();
            let show = true;
            
            if (search && !text.includes(search)) show = false;
            if (qualFilter && !text.includes(qualFilter)) show = false;
            if (specFilter && !text.includes(specFilter)) show = false;
            if (genderFilter && !text.includes(genderFilter.toLowerCase())) show = false;
            
            row.style.display = show ? '' : 'none';
        }
    });
};

window.clearFilters = function() {
    document.getElementById('teacherSearch').value = '';
    document.getElementById('filterQual').value = '';
    document.getElementById('filterSpec').value = '';
    document.getElementById('filterGender').value = '';
    filterTeachers();
};

window.refreshTeachers = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadTeachersTable();
    Swal.fire('Refreshed!', 'Teachers table updated.', 'success');
};

// ============================================
// ADD TEACHER - USING SWEETALERT2 (No Bootstrap Modal)
// ============================================

window.showAddTeacherModal = function() {
    Swal.fire({
        title: '<i class="fas fa-chalkboard-user"></i> Add New Teacher',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Staff ID</label>
                        <input type="text" id="swalStaffId" class="form-control" value="${generateStaffId()}" readonly>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Full Name *</label>
                        <input type="text" id="swalName" class="form-control" placeholder="Enter teacher name">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Qualification</label>
                        <input type="text" id="swalQual" class="form-control" placeholder="e.g., Bachelor of Education">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Specialization</label>
                        <input type="text" id="swalSpec" class="form-control" placeholder="e.g., Mathematics">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Phone</label>
                        <input type="tel" id="swalPhone" class="form-control" placeholder="0772 123 456">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Email</label>
                        <input type="email" id="swalEmail" class="form-control" placeholder="teacher@school.com">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Gender</label>
                        <select id="swalGender" class="form-select">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Date of Birth</label>
                        <input type="date" id="swalDob" class="form-control">
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label">Address</label>
                    <textarea id="swalAddress" class="form-control" rows="2" placeholder="Physical address"></textarea>
                </div>
            </div>
        `,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Save Teacher',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const name = document.getElementById('swalName').value.trim();
            if (!name) {
                Swal.showValidationMessage('Teacher name is required!');
                return false;
            }
            return {
                staff_id: document.getElementById('swalStaffId').value,
                name: name,
                qualification: document.getElementById('swalQual').value,
                specialization: document.getElementById('swalSpec').value,
                phone: document.getElementById('swalPhone').value,
                email: document.getElementById('swalEmail').value,
                gender: document.getElementById('swalGender').value,
                dob: document.getElementById('swalDob').value,
                address: document.getElementById('swalAddress').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await addTeacher(result.value);
                Swal.fire('Success!', 'Teacher added successfully.', 'success');
                await loadTeachersTable();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// EDIT TEACHER - USING SWEETALERT2
// ============================================

window.editTeacher = async function(id) {
    const teacher = allTeachers.find(t => t.id === id);
    if (!teacher) return;
    
    Swal.fire({
        title: '<i class="fas fa-edit"></i> Edit Teacher',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Staff ID</label>
                        <input type="text" id="swalStaffId" class="form-control" value="${escapeHtml(teacher.staff_id || '')}" readonly>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Full Name *</label>
                        <input type="text" id="swalName" class="form-control" value="${escapeHtml(teacher.name)}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Qualification</label>
                        <input type="text" id="swalQual" class="form-control" value="${escapeHtml(teacher.qualification || '')}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Specialization</label>
                        <input type="text" id="swalSpec" class="form-control" value="${escapeHtml(teacher.specialization || '')}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Phone</label>
                        <input type="tel" id="swalPhone" class="form-control" value="${escapeHtml(teacher.phone || '')}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Email</label>
                        <input type="email" id="swalEmail" class="form-control" value="${escapeHtml(teacher.email || '')}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label">Gender</label>
                        <select id="swalGender" class="form-select">
                            <option value="Male" ${teacher.gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${teacher.gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Date of Birth</label>
                        <input type="date" id="swalDob" class="form-control" value="${teacher.dob || ''}">
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label">Address</label>
                    <textarea id="swalAddress" class="form-control" rows="2">${escapeHtml(teacher.address || '')}</textarea>
                </div>
            </div>
        `,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Update Teacher',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const name = document.getElementById('swalName').value.trim();
            if (!name) {
                Swal.showValidationMessage('Teacher name is required!');
                return false;
            }
            return {
                staff_id: document.getElementById('swalStaffId').value,
                name: name,
                qualification: document.getElementById('swalQual').value,
                specialization: document.getElementById('swalSpec').value,
                phone: document.getElementById('swalPhone').value,
                email: document.getElementById('swalEmail').value,
                gender: document.getElementById('swalGender').value,
                dob: document.getElementById('swalDob').value,
                address: document.getElementById('swalAddress').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await updateTeacher(id, result.value);
                Swal.fire('Success!', 'Teacher updated successfully.', 'success');
                await loadTeachersTable();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// DELETE TEACHER
// ============================================

window.deleteTeacherItem = async function(id) {
    const teacher = allTeachers.find(t => t.id === id);
    
    const result = await Swal.fire({
        title: 'Delete Teacher?',
        text: `Are you sure you want to delete ${teacher?.name}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            await deleteTeacher(id);
            Swal.fire('Deleted!', 'Teacher has been deleted.', 'success');
            await loadTeachersTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// BULK DELETE TEACHERS
// ============================================

window.bulkDeleteTeachers = async function() {
    const checkboxes = document.querySelectorAll('.teacherCheck:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    if (ids.length === 0) {
        Swal.fire('Error', 'No teachers selected', 'error');
        return;
    }
    
    const result = await Swal.fire({
        title: `Delete ${ids.length} teachers?`,
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            for (const id of ids) {
                await deleteTeacher(id);
            }
            Swal.fire('Deleted!', `${ids.length} teachers deleted.`, 'success');
            await loadTeachersTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// EXPORT TEACHERS
// ============================================

window.exportTeachers = async function() {
    await getTeachers();
    
    const exportData = allTeachers.map(t => ({
        'Staff ID': t.staff_id || '-',
        'Name': t.name,
        'Qualification': t.qualification || '-',
        'Specialization': t.specialization || '-',
        'Phone': t.phone || '-',
        'Email': t.email || '-',
        'Gender': t.gender || '-',
        'Date of Birth': t.dob || '-',
        'Address': t.address || '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
    XLSX.writeFile(wb, `Teachers_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    Swal.fire('Exported!', `${exportData.length} teachers exported.`, 'success');
};

// ============================================
// HELPER FUNCTION
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}



// ==================== LIBRARY MODULE ====================
// ============================================
// LIBRARY MODULE - COMPLETE FIXED VERSION
// All Buttons Working | Return Function Fixed
// ============================================

// Global variables
let libraryBooks = [];
let libraryBorrowings = [];
let libraryStudents = [];
let libraryTeachers = [];

// Constants
const DAILY_FINE_RATE = 500;
const BORROW_DAYS = 14;

// ============================================
// DATABASE OPERATIONS
// ============================================

async function libGetBooks() {
    try {
        const { data, error } = await sb
            .from('books')
            .select('*')
            .eq('level', currentLevel)
            .order('title');
        
        if (error) throw error;
        libraryBooks = data || [];
        return libraryBooks;
    } catch (error) {
        console.error('Error loading books:', error);
        return [];
    }
}

async function libGetBorrowings() {
    try {
        const { data, error } = await sb
            .from('borrowings')
            .select('*')
            .order('borrow_date', { ascending: false });
        
        if (error) throw error;
        libraryBorrowings = data || [];
        return libraryBorrowings;
    } catch (error) {
        console.error('Error loading borrowings:', error);
        return [];
    }
}

async function libGetStudents() {
    try {
        let classList = currentLevel === 'olevel' 
            ? ['S.1', 'S.2', 'S.3', 'S.4']
            : ['S.5', 'S.6'];
        
        const { data, error } = await sb
            .from('students')
            .select('*')
            .in('class', classList)
            .order('name');
        
        if (error) throw error;
        libraryStudents = data || [];
        return libraryStudents;
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

async function libGetTeachers() {
    try {
        const { data, error } = await sb
            .from('teachers')
            .select('*')
            .order('name');
        
        if (error) throw error;
        libraryTeachers = data || [];
        return libraryTeachers;
    } catch (error) {
        console.error('Error loading teachers:', error);
        return [];
    }
}

async function libAddBook(bookData) {
    const { data, error } = await sb
        .from('books')
        .insert([{
            ...bookData,
            level: currentLevel,
            borrowed_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function libUpdateBook(id, bookData) {
    const { data, error } = await sb
        .from('books')
        .update({
            ...bookData,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
}

async function libDeleteBook(id) {
    const { error } = await sb
        .from('books')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

async function libDeleteAllBooks() {
    const { error } = await sb
        .from('books')
        .delete()
        .eq('level', currentLevel);
    
    if (error) throw error;
}

async function libAddBorrowing(borrowData) {
    const { data, error } = await sb
        .from('borrowings')
        .insert([borrowData])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function libUpdateBorrowing(id, borrowData) {
    const { data, error } = await sb
        .from('borrowings')
        .update(borrowData)
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateFine(expectedReturnDate, actualReturnDate = null) {
    const expected = new Date(expectedReturnDate);
    const actual = actualReturnDate ? new Date(actualReturnDate) : new Date();
    if (actual <= expected) return 0;
    const diffDays = Math.ceil((actual - expected) / (1000 * 60 * 60 * 24));
    return diffDays * DAILY_FINE_RATE;
}

function getDefaultReturnDate() {
    const date = new Date();
    date.setDate(date.getDate() + BORROW_DAYS);
    return date.toISOString().split('T')[0];
}

function getBorrowerName(borrowing) {
    if (borrowing.borrower_type === 'student') {
        const student = libraryStudents.find(s => s.id === borrowing.borrower_id);
        return student ? `${student.name} (${student.class})` : 'Unknown Student';
    } else {
        const teacher = libraryTeachers.find(t => t.id === borrowing.borrower_id);
        return teacher ? `${teacher.name} (${teacher.specialization || 'Staff'})` : 'Unknown Teacher';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// RENDER LIBRARY PAGE
// ============================================

async function renderLibrary() {
    await libGetBooks();
    await libGetBorrowings();
    
    const levelName = currentLevel === 'olevel' ? 'O-Level (UCE)' : 'A-Level (UACE)';
    const totalBooks = libraryBooks.reduce((sum, b) => sum + (b.copies || 0), 0);
    const totalBorrowed = libraryBorrowings.filter(b => b.status === 'BORROWED').length;
    const overdueCount = libraryBorrowings.filter(b => {
        if (b.status !== 'BORROWED') return false;
        return new Date() > new Date(b.expected_return_date);
    }).length;
    const totalFines = libraryBorrowings.filter(b => b.fine_paid).reduce((sum, b) => sum + (b.fine_amount || 0), 0);
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-book"></i> Library Management - ${levelName}</h5>
            </div>
            <div class="card-body">
                <div class="row g-2">
                    <div class="col-md-12">
                        <button class="btn btn-primary" onclick="showAddBookModal()">
                            <i class="fas fa-plus"></i> Add Book
                        </button>
                        <button class="btn btn-info ms-2" onclick="showBorrowedBooksModal()">
                            <i class="fas fa-book-open"></i> Borrowed Books
                        </button>
                        <button class="btn btn-warning ms-2" onclick="showBorrowBookModal()">
                            <i class="fas fa-hand-holding-heart"></i> Borrow Book
                        </button>
                        <button class="btn btn-success ms-2" onclick="exportBooksData()">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button class="btn btn-danger ms-2" onclick="confirmDeleteAllBooks()">
                            <i class="fas fa-trash-alt"></i> Delete All
                        </button>
                        <button class="btn btn-outline-secondary ms-2" onclick="refreshLibrary()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Statistics Cards -->
        <div class="row mb-3">
            <div class="col-md-3">
                <div class="card bg-primary text-white">
                    <div class="card-body text-center">
                        <h3>${totalBooks}</h3>
                        <p><i class="fas fa-book"></i> Total Books</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning text-dark">
                    <div class="card-body text-center">
                        <h3>${totalBorrowed}</h3>
                        <p><i class="fas fa-book-open"></i> Borrowed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-danger text-white">
                    <div class="card-body text-center">
                        <h3>${overdueCount}</h3>
                        <p><i class="fas fa-clock"></i> Overdue</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <h3>UGX ${totalFines.toLocaleString()}</h3>
                        <p><i class="fas fa-money-bill"></i> Fines</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Books Table -->
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <h6 class="mb-0"><i class="fas fa-list"></i> Books Inventory</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllBooks"></th>
                                <th>ISBN</th>
                                <th>Title</th>
                                <th>Author</th>
                                <th>Category</th>
                                <th>Copies</th>
                                <th>Available</th>
                                <th width="100">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="booksTableBody">
                            <tr><td colspan="8" class="text-center py-4">Loading... </span>络</tbody>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LOAD BOOKS TABLE
// ============================================

async function loadBooksTable() {
    const tbody = document.getElementById('booksTableBody');
    if (!tbody) return;
    
    await libGetBooks();
    
    if (libraryBooks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">No ${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'} books found. </span>络</tbody>`;
        return;
    }
    
    let html = '';
    for (const b of libraryBooks) {
        const available = (b.copies || 0) - (b.borrowed_count || 0);
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="bookCheck" data-id="${b.id}"></td>
                <td><code>${escapeHtml(b.isbn || '-')}</code></td>
                <td><strong>${escapeHtml(b.title)}</strong></td>
                <td>${escapeHtml(b.author || '-')}</td>
                <td><span class="badge bg-secondary">${escapeHtml(b.category || '-')}</span></td>
                <td class="text-center">${b.copies || 0}</td>
                <td class="text-center">
                    <span class="badge ${available > 0 ? 'bg-success' : 'bg-danger'}">
                        ${available}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="editBook('${b.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBookItem('${b.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
    
    const selectAll = document.getElementById('selectAllBooks');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.bookCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
}

// ============================================
// BORROWED BOOKS MODAL - WITH WORKING RETURN
// ============================================

window.showBorrowedBooksModal = async function() {
    await libGetBorrowings();
    await libGetStudents();
    await libGetTeachers();
    
    const activeBorrowings = libraryBorrowings.filter(b => b.status === 'BORROWED');
    
    if (activeBorrowings.length === 0) {
        Swal.fire('Info', 'No books are currently borrowed.', 'info');
        return;
    }
    
    let html = '';
    for (const b of activeBorrowings) {
        const borrowerName = getBorrowerName(b);
        const borrowerType = b.borrower_type === 'student' ? 'Student' : 'Teacher';
        const borrowerBadge = b.borrower_type === 'student' ? 'bg-success' : 'bg-info';
        const dueDate = new Date(b.expected_return_date);
        const today = new Date();
        const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        const fine = calculateFine(b.expected_return_date);
        
        let statusClass = '';
        let statusText = '';
        if (daysLeft < 0) {
            statusClass = 'text-danger';
            statusText = `${Math.abs(daysLeft)} days overdue`;
        } else if (daysLeft <= 3) {
            statusClass = 'text-warning';
            statusText = `${daysLeft} days left`;
        } else {
            statusClass = 'text-success';
            statusText = `${daysLeft} days left`;
        }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(borrowerName)}</strong></td>
                <td class="text-center"><span class="badge ${borrowerBadge}">${borrowerType}</span></td>
                <td><strong>${escapeHtml(b.book_title)}</strong></td>
                <td>${b.borrow_date}</span></td>
                <td>${b.expected_return_date}</span></td>
                <td class="${statusClass}"><strong>${statusText}</strong></span></td>
                <td class="text-danger"><strong>UGX ${fine.toLocaleString()}</strong></span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-success" onclick="returnBook('${b.id}')" title="Return Book">
                        <i class="fas fa-undo-alt"></i> Return
                    </button>
                </span></td>
            </tr>
        `;
    }
    
    Swal.fire({
        title: '<i class="fas fa-book-open"></i> Currently Borrowed Books',
        html: `
            <div class="table-responsive" style="max-height: 450px; overflow-y: auto;">
                <table class="table table-bordered table-sm">
                    <thead class="table-primary">
                        <tr>
                            <th>Borrower</th>
                            <th>Type</th>
                            <th>Book</th>
                            <th>Borrow Date</th>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>Fine</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${html}</tbody>
                </table>
            </div>
        `,
        width: '1000px',
        confirmButtonText: 'Close'
    });
};

// ============================================
// RETURN BOOK - FIXED WORKING VERSION
// ============================================

window.returnBook = async function(borrowingId) {
    await libGetBorrowings();
    await libGetBooks();
    await libGetStudents();
    await libGetTeachers();
    
    const borrowing = libraryBorrowings.find(b => b.id === borrowingId);
    if (!borrowing) {
        Swal.fire('Error', 'Borrowing record not found', 'error');
        return;
    }
    
    const fine = calculateFine(borrowing.expected_return_date);
    const borrowerName = getBorrowerName(borrowing);
    const todayDate = new Date().toISOString().split('T')[0];
    
    // Create a unique container for this return operation
    const containerId = `returnContainer_${borrowingId}`;
    
    Swal.fire({
        title: 'Return Book',
        html: `
            <div id="${containerId}" class="text-start">
                <div class="mb-3">
                    <p><strong>📖 Book:</strong> ${escapeHtml(borrowing.book_title)}</p>
                    <p><strong>👤 Borrower:</strong> ${escapeHtml(borrowerName)}</p>
                    <p><strong>📅 Borrow Date:</strong> ${borrowing.borrow_date}</p>
                    <p><strong>⏰ Due Date:</strong> ${borrowing.expected_return_date}</p>
                    ${fine > 0 ? `<p class="text-danger"><strong>💰 Late Fine:</strong> UGX ${fine.toLocaleString()}</p>` : '<p class="text-success">✅ No fine - Returned on time</p>'}
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Actual Return Date</label>
                    <input type="date" id="returnDateInput" class="form-control" value="${todayDate}">
                </div>
                ${fine > 0 ? `
                <div class="mb-3">
                    <label class="form-label fw-bold">Fine Paid?</label>
                    <select id="finePaidSelect" class="form-select">
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                    </select>
                </div>
                ` : ''}
                <div class="mb-3">
                    <label class="form-label fw-bold">Remarks (Condition, etc.)</label>
                    <textarea id="returnRemarksText" class="form-control" rows="2" placeholder="Any damage, missing pages, condition..."></textarea>
                </div>
            </div>
        `,
        width: '450px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Confirm Return',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const returnDate = document.getElementById('returnDateInput')?.value;
            const finePaid = fine > 0 ? (document.getElementById('finePaidSelect')?.value === 'yes') : false;
            const remarks = document.getElementById('returnRemarksText')?.value || '';
            
            if (!returnDate) {
                Swal.showValidationMessage('Please select a return date');
                return false;
            }
            
            return { returnDate, finePaid, remarks };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                const returnDate = result.value.returnDate;
                const finePaid = result.value.finePaid;
                const remarks = result.value.remarks;
                
                const book = libraryBooks.find(b => b.id === borrowing.book_id);
                
                // Update borrowing record
                const { error: updateError } = await sb
                    .from('borrowings')
                    .update({
                        actual_return_date: returnDate,
                        status: 'RETURNED',
                        fine_amount: fine,
                        fine_paid: finePaid,
                        return_remarks: remarks,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', borrowingId);
                
                if (updateError) throw updateError;
                
                // Update book borrowed count
                if (book) {
                    const { error: bookError } = await sb
                        .from('books')
                        .update({
                            borrowed_count: Math.max(0, (book.borrowed_count || 0) - 1),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', book.id);
                    
                    if (bookError) throw bookError;
                }
                
                let message = `✅ Book returned successfully on ${returnDate}.`;
                if (fine > 0) {
                    message += `\n💰 Fine: UGX ${fine.toLocaleString()}. ${finePaid ? 'Payment received.' : 'Payment pending.'}`;
                }
                
                Swal.fire('Success!', message, 'success');
                await refreshLibrary();
                
            } catch (error) {
                console.error('Return error:', error);
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// ADD BOOK MODAL
// ============================================

window.showAddBookModal = function() {
    Swal.fire({
        title: '<i class="fas fa-book"></i> Add New Book',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">ISBN</label>
                        <input type="text" id="bookIsbn" class="form-control" placeholder="978-3-16-148410-0">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Title *</label>
                        <input type="text" id="bookTitle" class="form-control" placeholder="Book title">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Author</label>
                        <input type="text" id="bookAuthor" class="form-control" placeholder="Author name">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Publisher</label>
                        <input type="text" id="bookPublisher" class="form-control" placeholder="Publisher name">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Category</label>
                        <select id="bookCategory" class="form-select">
                            <option value="English">English</option>
                            <option value="Mathematics">Mathematics</option>
                            <option value="Science">Science</option>
                            <option value="Biology">Biology</option>
                            <option value="Chemistry">Chemistry</option>
                            <option value="Physics">Physics</option>
                            <option value="History">History</option>
                            <option value="Geography">Geography</option>
                            <option value="Economics">Economics</option>
                            <option value="General Paper">General Paper</option>
                            <option value="Computer Science">Computer Science</option>
                            <option value="Fiction">Fiction</option>
                            <option value="Reference">Reference</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Copies</label>
                        <input type="number" id="bookCopies" class="form-control" value="1" min="1">
                    </div>
                </div>
                <div class="mb-2">
                    <label class="form-label fw-bold">Description</label>
                    <textarea id="bookDescription" class="form-control" rows="2"></textarea>
                </div>
                <div class="alert alert-info mt-2">
                    <i class="fas fa-info-circle"></i> This book will be added to <strong>${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'}</strong> library
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Save',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const title = document.getElementById('bookTitle').value.trim();
            if (!title) {
                Swal.showValidationMessage('Book title is required!');
                return false;
            }
            return {
                isbn: document.getElementById('bookIsbn').value,
                title: title,
                author: document.getElementById('bookAuthor').value,
                publisher: document.getElementById('bookPublisher').value,
                category: document.getElementById('bookCategory').value,
                copies: parseInt(document.getElementById('bookCopies').value) || 1,
                description: document.getElementById('bookDescription').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                await libAddBook(result.value);
                Swal.fire('Success!', 'Book added successfully.', 'success');
                await refreshLibrary();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// EDIT BOOK
// ============================================

window.editBook = async function(id) {
    const book = libraryBooks.find(b => b.id === id);
    if (!book) return;
    
    Swal.fire({
        title: '<i class="fas fa-edit"></i> Edit Book',
        html: `
            <div class="text-start">
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label>ISBN</label>
                        <input type="text" id="bookIsbn" class="form-control" value="${escapeHtml(book.isbn || '')}">
                    </div>
                    <div class="col-md-6">
                        <label>Title *</label>
                        <input type="text" id="bookTitle" class="form-control" value="${escapeHtml(book.title)}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label>Author</label>
                        <input type="text" id="bookAuthor" class="form-control" value="${escapeHtml(book.author || '')}">
                    </div>
                    <div class="col-md-6">
                        <label>Publisher</label>
                        <input type="text" id="bookPublisher" class="form-control" value="${escapeHtml(book.publisher || '')}">
                    </div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6">
                        <label>Category</label>
                        <select id="bookCategory" class="form-select">
                            <option value="English" ${book.category === 'English' ? 'selected' : ''}>English</option>
                            <option value="Mathematics" ${book.category === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
                            <option value="Science" ${book.category === 'Science' ? 'selected' : ''}>Science</option>
                            <option value="Biology" ${book.category === 'Biology' ? 'selected' : ''}>Biology</option>
                            <option value="Chemistry" ${book.category === 'Chemistry' ? 'selected' : ''}>Chemistry</option>
                            <option value="Physics" ${book.category === 'Physics' ? 'selected' : ''}>Physics</option>
                            <option value="Economics" ${book.category === 'Economics' ? 'selected' : ''}>Economics</option>
                            <option value="General Paper" ${book.category === 'General Paper' ? 'selected' : ''}>General Paper</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label>Copies</label>
                        <input type="number" id="bookCopies" class="form-control" value="${book.copies}" min="1">
                    </div>
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Update',
        preConfirm: () => {
            const title = document.getElementById('bookTitle').value.trim();
            if (!title) return Swal.showValidationMessage('Title required');
            return {
                isbn: document.getElementById('bookIsbn').value,
                title: title,
                author: document.getElementById('bookAuthor').value,
                publisher: document.getElementById('bookPublisher').value,
                category: document.getElementById('bookCategory').value,
                copies: parseInt(document.getElementById('bookCopies').value) || 1
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                await libUpdateBook(id, result.value);
                Swal.fire('Success!', 'Book updated.', 'success');
                await refreshLibrary();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// DELETE BOOK
// ============================================

window.deleteBookItem = async function(id) {
    const book = libraryBooks.find(b => b.id === id);
    const result = await Swal.fire({
        title: 'Delete Book?',
        html: `<p>Delete <strong>"${escapeHtml(book?.title)}"</strong>?</p><p class="text-danger">Cannot be undone!</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await libDeleteBook(id);
            Swal.fire('Deleted!', 'Book removed.', 'success');
            await refreshLibrary();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// DELETE ALL BOOKS
// ============================================

window.confirmDeleteAllBooks = async function() {
    if (libraryBooks.length === 0) {
        Swal.fire('Info', `No ${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'} books to delete.`, 'info');
        return;
    }
    
    const result = await Swal.fire({
        title: 'Delete All Books?',
        html: `<p>Delete <strong>${libraryBooks.length}</strong> ${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'} books?</p><p class="text-danger">This cannot be undone!</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete All'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await libDeleteAllBooks();
            Swal.fire('Deleted!', `All ${libraryBooks.length} books deleted.`, 'success');
            await refreshLibrary();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// BORROW BOOK MODAL
// ============================================

window.showBorrowBookModal = async function() {
    await libGetBooks();
    await libGetStudents();
    await libGetTeachers();
    
    const availableBooks = libraryBooks.filter(b => (b.copies - b.borrowed_count) > 0);
    
    if (availableBooks.length === 0) {
        Swal.fire('Info', 'No books available for borrowing.', 'info');
        return;
    }
    
    let bookOptions = '<option value="">-- Select Book --</option>';
    for (const b of availableBooks) {
        const available = b.copies - b.borrowed_count;
        bookOptions += `<option value="${b.id}" data-title="${escapeHtml(b.title)}">${escapeHtml(b.title)} (${available} available)</option>`;
    }
    
    let studentOptions = '<option value="">-- Select Student --</option>';
    for (const s of libraryStudents) {
        studentOptions += `<option value="${s.id}">${escapeHtml(s.name)} (${s.class})</option>`;
    }
    
    let teacherOptions = '<option value="">-- Select Teacher --</option>';
    for (const t of libraryTeachers) {
        teacherOptions += `<option value="${t.id}">${escapeHtml(t.name)} (${t.specialization || 'Staff'})</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-hand-holding-heart"></i> Borrow Book',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label>Select Book *</label>
                    <select id="borrowBookId" class="form-select">${bookOptions}</select>
                </div>
                <div class="mb-3">
                    <label>Borrower Type *</label>
                    <select id="borrowerType" class="form-select">
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                    </select>
                </div>
                <div id="studentDiv">
                    <label>Select Student *</label>
                    <select id="borrowStudentId" class="form-select">${studentOptions}</select>
                </div>
                <div id="teacherDiv" style="display:none">
                    <label>Select Teacher *</label>
                    <select id="borrowTeacherId" class="form-select">${teacherOptions}</select>
                </div>
                <div class="mt-3">
                    <label>Due Date (${BORROW_DAYS} days)</label>
                    <input type="date" id="borrowDueDate" class="form-control" value="${getDefaultReturnDate()}">
                </div>
                <div class="mt-2">
                    <label>Remarks</label>
                    <textarea id="borrowRemarks" class="form-control" rows="2"></textarea>
                </div>
                <div class="alert alert-info mt-2">
                    <i class="fas fa-info-circle"></i> Late return fine: UGX ${DAILY_FINE_RATE} per day
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Borrow',
        cancelButtonText: 'Cancel',
        didOpen: () => {
            const typeSelect = document.getElementById('borrowerType');
            const studentDiv = document.getElementById('studentDiv');
            const teacherDiv = document.getElementById('teacherDiv');
            typeSelect.onchange = () => {
                if (typeSelect.value === 'student') {
                    studentDiv.style.display = 'block';
                    teacherDiv.style.display = 'none';
                } else {
                    studentDiv.style.display = 'none';
                    teacherDiv.style.display = 'block';
                }
            };
        },
        preConfirm: () => {
            const bookId = document.getElementById('borrowBookId').value;
            const borrowerType = document.getElementById('borrowerType').value;
            let borrowerId = '';
            
            if (!bookId) return Swal.showValidationMessage('Select a book');
            
            if (borrowerType === 'student') {
                borrowerId = document.getElementById('borrowStudentId').value;
                if (!borrowerId) return Swal.showValidationMessage('Select a student');
            } else {
                borrowerId = document.getElementById('borrowTeacherId').value;
                if (!borrowerId) return Swal.showValidationMessage('Select a teacher');
            }
            
            const bookSelect = document.getElementById('borrowBookId');
            const bookTitle = bookSelect.options[bookSelect.selectedIndex]?.dataset?.title || '';
            
            return { bookId, bookTitle, borrowerId, borrowerType, dueDate: document.getElementById('borrowDueDate').value, remarks: document.getElementById('borrowRemarks').value };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const book = libraryBooks.find(b => b.id === result.value.bookId);
                await libUpdateBook(result.value.bookId, { ...book, borrowed_count: (book.borrowed_count || 0) + 1 });
                await libAddBorrowing({
                    book_id: result.value.bookId,
                    book_title: result.value.bookTitle,
                    borrower_id: result.value.borrowerId,
                    borrower_type: result.value.borrowerType,
                    borrow_date: new Date().toISOString().split('T')[0],
                    expected_return_date: result.value.dueDate,
                    status: 'BORROWED',
                    remarks: result.value.remarks,
                    created_at: new Date().toISOString()
                });
                Swal.fire('Success!', 'Book borrowed successfully.', 'success');
                await refreshLibrary();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};

// ============================================
// EXPORT BOOKS
// ============================================

window.exportBooksData = async function() {
    await libGetBooks();
    const exportData = libraryBooks.map(b => ({
        'ISBN': b.isbn || '-',
        'Title': b.title,
        'Author': b.author || '-',
        'Publisher': b.publisher || '-',
        'Category': b.category || '-',
        'Total Copies': b.copies || 0,
        'Borrowed': b.borrowed_count || 0,
        'Available': (b.copies || 0) - (b.borrowed_count || 0)
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${currentLevel === 'olevel' ? 'O-Level' : 'A-Level'}_Books`);
    XLSX.writeFile(wb, `Library_${currentLevel}_${new Date().toISOString().split('T')[0]}.xlsx`);
    Swal.fire('Exported!', `${exportData.length} books exported.`, 'success');
};

// ============================================
// REFRESH LIBRARY
// ============================================

async function refreshLibrary() {
    await libGetBooks();
    await libGetBorrowings();
    await libGetStudents();
    await libGetTeachers();
    await loadBooksTable();
}

window.refreshLibrary = refreshLibrary;

// ============================================
// PAYMENTS MODULE - FINAL MASTERPIECE WITH SCHOOL INFO INTEGRATION
// O-Level & A-Level | Real-time Fee Updates | Full Functionality
// ============================================

// ============================================
// GLOBAL VARIABLES
// ============================================

let allPaymentsList = [];
let schoolSettings = {};
let feeStructure = {};

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMoney(amount) {
    return 'UGX ' + (amount || 0).toLocaleString();
}

function getCurrentTerm() {
    const month = new Date().getMonth();
    if (month >= 1 && month <= 4) return 'Term 1';
    if (month >= 5 && month <= 8) return 'Term 2';
    return 'Term 3';
}

function generateReceiptNo() {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const timestamp = Date.now().toString().slice(-4);
    return `RCP/${year}/${timestamp}${random}`;
}

// ============================================
// GET CLASS TEACHER FROM SCHOOL SETTINGS
// ============================================

function getClassTeacherForPayment(student) {
    if (!student) return 'Not Assigned';
    
    const classLetter = student.class;
    const stream = student.stream || '';
    const classNumber = classLetter.replace('S.', '');
    
    let teacherKey = '';
    
    if (currentLevel === 'olevel') {
        const streamLower = stream.toLowerCase();
        teacherKey = `teacher_s${classNumber}_${streamLower}`;
    } else {
        const streamLower = stream.toLowerCase();
        teacherKey = `teacher_s${classNumber}_${streamLower}`;
    }
    
    const teacherName = schoolSettings[teacherKey];
    
    if (teacherName && teacherName !== '') {
        return teacherName;
    }
    
    for (const [key, value] of Object.entries(schoolSettings)) {
        if (key.startsWith(`teacher_s${classNumber}_`) && value) {
            return value;
        }
    }
    
    return 'Not Assigned';
}

// ============================================
// LOAD SCHOOL SETTINGS
// ============================================

async function loadSchoolSettingsForPayments() {
    try {
        const { data, error } = await sb
            .from('school_settings')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        
        schoolSettings = data || {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_address: 'Kampala, Uganda',
            school_phone: '+256 XXX XXX XXX',
            school_email: 'info@school.ug',
            school_logo: '',
            principal_name: 'Principal',
            director_name: 'Director',
            bursar_name: 'Bursar'
        };
        return schoolSettings;
    } catch (error) {
        console.error('Error loading school settings:', error);
        schoolSettings = {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_address: 'Kampala, Uganda',
            school_phone: '+256 XXX XXX XXX',
            school_email: 'info@school.ug',
            school_logo: '',
            principal_name: 'Principal',
            director_name: 'Director',
            bursar_name: 'Bursar'
        };
        return schoolSettings;
    }
}

// ============================================
// LOAD FEE STRUCTURE FROM DATABASE
// ============================================

async function loadFeeStructure() {
    try {
        console.log("🔄 Loading fee structure...");
        
        const { data, error } = await sb
            .from('fee_structure')
            .select('*');
        
        if (error) throw error;
        
        feeStructure = {};
        
        if (!data || data.length === 0) {
            console.warn("⚠️ No fee structure found");
            return {};
        }
        
        // Group and sum fees by class and student type
        for (const fee of data) {
            let key = '';
            const amount = fee.amount || 0;
            
            let className = fee.class_name;
            let studentType = fee.student_type;
            
            if (studentType) {
                studentType = studentType.charAt(0).toUpperCase() + studentType.slice(1).toLowerCase();
            }
            
            const classParts = className.split(' ');
            
            if (classParts.length === 2) {
                // A-Level format: "S.5 Arts" or "S.6 Sciences"
                const classOnly = classParts[0];
                const stream = classParts[1];
                key = `${classOnly}_${stream}_${studentType}`;
            } else {
                // O-Level format: "S.1", "S.2", etc.
                key = `${className}_${studentType}`;
            }
            
            if (!feeStructure[key]) feeStructure[key] = 0;
            feeStructure[key] += amount;
        }
        
        console.log(`✅ Fee structure loaded: ${Object.keys(feeStructure).length} classes`);
        return feeStructure;
        
    } catch (error) {
        console.error('Error loading fee structure:', error);
        return {};
    }
}

// ============================================
// GET STUDENTS BY LEVEL
// ============================================

async function getStudentsForPayments() {
    try {
        let classList = currentLevel === 'olevel' 
            ? ['S.1', 'S.2', 'S.3', 'S.4']
            : ['S.5', 'S.6'];
        
        const { data, error } = await sb
            .from('students')
            .select('*')
            .in('class', classList)
            .order('name');
        
        if (error) throw error;
        allStudentsList = data || [];
        return allStudentsList;
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

function getStudentsByLevel() {
    if (currentLevel === 'olevel') {
        return allStudentsList.filter(s => ['S.1', 'S.2', 'S.3', 'S.4'].includes(s.class));
    } else {
        return allStudentsList.filter(s => ['S.5', 'S.6'].includes(s.class));
    }
}

// ============================================
// GET STUDENT FEE AMOUNT
// ============================================

function getStudentFeeAmount(student) {
    if (!student) return null;
    
    let key = '';
    
    if (currentLevel === 'olevel') {
        key = `${student.class}_${student.student_type || 'Day'}`;
    } else {
        let stream = student.stream || 'Arts';
        stream = stream.charAt(0).toUpperCase() + stream.slice(1).toLowerCase();
        key = `${student.class}_${stream}_${student.student_type || 'Day'}`;
    }
    
    const fee = feeStructure[key];
    
    if (!fee || fee === 0) {
        console.warn(`⚠️ No fee for key: ${key}`);
        return null;
    }
    
    return fee;
}

// ============================================
// GET PAYMENTS
// ============================================

async function getPayments() {
    try {
        const { data, error } = await sb
            .from('payments')
            .select('*')
            .order('payment_date', { ascending: false });
        
        if (error) throw error;
        allPaymentsList = data || [];
        return allPaymentsList;
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

// ============================================
// CALCULATE STUDENT FEE STATUS
// ============================================

async function calculateStudentFeeStatusWithCarryForward(studentId, targetYear, targetTerm) {
    const student = allStudentsList.find(s => s.id === studentId);
    if (!student) return { expected: 0, paid: 0, balance: 0, status: 'UNKNOWN', statusColor: '#6c757d', statusBadge: '❓ Unknown' };
    
    const termFee = getStudentFeeAmount(student);
    
    if (termFee === null) {
        return {
            termFee: 0,
            expected: 0,
            paid: 0,
            balance: 0,
            status: 'NO_FEE',
            statusColor: '#ffc107',
            statusBadge: '⚠️ No Fee Set',
            student: student,
            error: `No fee structure found`
        };
    }
    
    const termOrder = ['Term 1', 'Term 2', 'Term 3'];
    const currentTermIndex = termOrder.indexOf(targetTerm);
    
    // Previous terms balance in same year
    let previousTermsBalance = 0;
    for (let i = 0; i < currentTermIndex; i++) {
        const prevTerm = termOrder[i];
        const prevTermPayments = allPaymentsList.filter(p => 
            p.student_id === studentId && p.year === targetYear && p.term === prevTerm
        );
        const prevTermPaid = prevTermPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        if (prevTermPaid < termFee) {
            previousTermsBalance += (termFee - prevTermPaid);
        }
    }
    
    // Current term payments
    const currentTermPayments = allPaymentsList.filter(p => 
        p.student_id === studentId && p.year === targetYear && p.term === targetTerm
    );
    const currentTermPaid = currentTermPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const totalExpected = termFee + Math.max(0, previousTermsBalance);
    const totalPaid = currentTermPaid;
    const balance = totalExpected - totalPaid;
    
    let status = '', statusColor = '', statusBadge = '';
    
    if (balance <= 0) {
        status = 'CLEARED';
        statusColor = '#28a745';
        statusBadge = '✅ Fully Paid';
    } else if (balance < totalExpected * 0.5) {
        status = 'PARTIAL';
        statusColor = '#ffc107';
        statusBadge = '⚠️ Partially Paid';
    } else {
        status = 'DEFAULTER';
        statusColor = '#dc3545';
        statusBadge = '❌ Defaulter';
    }
    
    return {
        termFee: termFee,
        expected: totalExpected,
        paid: totalPaid,
        balance: balance,
        previousTermsBalance: previousTermsBalance,
        currentTermPaid: currentTermPaid,
        status: status,
        statusColor: statusColor,
        statusBadge: statusBadge,
        student: student
    };
}

// ============================================
// PROCESS PAYMENT
// ============================================

async function processPaymentWithCarryForward(studentId, amount, feeType, method, paymentDate, term, year, remarks) {
    const student = allStudentsList.find(s => s.id === studentId);
    if (!student) throw new Error('Student not found');
    
    const termFee = getStudentFeeAmount(student);
    if (termFee === null) throw new Error(`No fee structure found for ${student.name}`);
    
    const receiptNo = generateReceiptNo();
    
    const { data, error } = await sb
        .from('payments')
        .insert({
            student_id: studentId,
            fee_type: feeType,
            amount: amount,
            payment_method: method,
            receipt_no: receiptNo,
            payment_date: paymentDate,
            term: term,
            year: year,
            remarks: remarks,
            created_at: new Date().toISOString()
        })
        .select();
    
    if (error) throw error;
    
    await getPayments();
    
    return { receiptNo: receiptNo };
}

// ============================================
// DELETE PAYMENT
// ============================================

async function deletePayment(id) {
    const { error } = await sb
        .from('payments')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
    await getPayments();
}

// ============================================
// FILTER PAYMENTS TABLE
// ============================================

window.filterPaymentsTable = function() {
    const searchTerm = document.getElementById('paymentSearchInput')?.value.toLowerCase() || '';
    const filterClass = document.getElementById('filterPaymentClass')?.value || '';
    const filterTerm = document.getElementById('filterPaymentTerm')?.value || '';
    const filterYear = document.getElementById('filterPaymentYear')?.value || '';
    const filterMethod = document.getElementById('filterPaymentMethod')?.value || '';
    
    const rows = document.querySelectorAll('#paymentsTableBody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        if (row.cells && row.cells.length > 1) {
            const text = row.innerText.toLowerCase();
            const rowClass = row.cells[3]?.innerText || '';
            const rowTerm = row.cells[8]?.innerText || '';
            const rowYear = row.cells[9]?.innerText || '';
            const rowMethod = row.cells[6]?.innerText || '';
            
            let show = true;
            
            if (searchTerm && !text.includes(searchTerm)) show = false;
            if (filterClass && !rowClass.includes(filterClass)) show = false;
            if (filterTerm && !rowTerm.includes(filterTerm)) show = false;
            if (filterYear && !rowYear.includes(filterYear)) show = false;
            if (filterMethod && !rowMethod.toLowerCase().includes(filterMethod.toLowerCase())) show = false;
            
            row.style.display = show ? '' : 'none';
            if (show) visibleCount++;
        }
    });
    
    const filterCount = document.getElementById('filterCount');
    if (filterCount) filterCount.innerText = `${visibleCount} records found`;
};

// ============================================
// LOAD PAYMENTS TABLE
// ============================================

async function loadPaymentsTable() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    
    await getPayments();
    await getStudentsForPayments();
    
    if (allPaymentsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4">No payments found. Click "Record Payment" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const p of allPaymentsList) {
        const student = allStudentsList.find(s => s.id === p.student_id);
        if (!student) continue;
        
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="paymentCheck" data-id="${p.id}"></td>
                <td><code>${p.receipt_no || '-'}</code></td>
                <td>
                    <strong>${escapeHtml(student.name)}</strong>
                    <button class="btn btn-sm btn-link p-0 ms-1" onclick="viewPaymentHistory('${p.student_id}')" title="History">
                        <i class="fas fa-history text-info"></i>
                    </button>
                 </span></td>
                <td>${student.class}${student.stream ? ' - ' + student.stream : ''}</span></td>
                <td>${p.fee_type || '-'}</span></td>
                <td class="text-end"><strong>${formatMoney(p.amount || 0)}</strong></span></td>
                <td class="text-center"><span class="badge bg-secondary">${p.payment_method || '-'}</span></span></td>
                <td>${p.payment_date || '-'}</span></td>
                <td class="text-center">${p.term || '-'}</span></td>
                <td class="text-center">${p.year || '-'}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-info me-1" onclick="printReceipt('${p.id}')" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deletePaymentItem('${p.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
    
    const selectAll = document.getElementById('selectAllPayments');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.paymentCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
    
    setTimeout(() => window.filterPaymentsTable(), 100);
}

// ============================================
// REFRESH PAYMENTS
// ============================================

window.refreshPayments = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    feeStructure = {};
    await loadFeeStructure();
    await getPayments();
    await getStudentsForPayments();
    await loadPaymentsTable();
    
    Swal.close();
    Swal.fire('Refreshed!', 'Payments and fee structure updated.', 'success');
};

// ============================================
// CLEARANCE CARDS - WITH SCHOOL INFO
// ============================================

window.showClearanceCardsModal = async function() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    await loadSchoolSettingsForPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const filteredStudents = getStudentsByLevel();
    
    let clearedStudents = [];
    
    for (const student of filteredStudents) {
        const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
        if (status.status === 'CLEARED') {
            clearedStudents.push({ student, status });
        }
    }
    
    if (clearedStudents.length === 0) {
        Swal.fire('No Students', 'No students have completed payments for this term.', 'info');
        return;
    }
    
    let html = `
        <div class="text-start">
            <div class="alert alert-success mb-3">
                <i class="fas fa-check-circle"></i> 
                <strong>${clearedStudents.length} students</strong> have completed payments for ${term} ${year}
            </div>
            <div class="mb-3">
                <button class="btn btn-primary btn-sm" onclick="printAllClearanceCards()">
                    <i class="fas fa-print"></i> Print All Clearance Cards
                </button>
                <button class="btn btn-secondary btn-sm ms-2" onclick="printClearanceByClass()">
                    <i class="fas fa-print"></i> Print by Class
                </button>
            </div>
            <div class="table-responsive" style="max-height: 400px;">
                <table class="table table-bordered table-sm">
                    <thead class="table-success">
                        <tr>
                            <th><input type="checkbox" id="selectAllClearance"></th>
                            <th>Student Name</th>
                            <th>Class</th>
                            <th>Admission No</th>
                            <th>Total Paid</th>
                            <th>Class Teacher</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    for (const item of clearedStudents) {
        const classTeacher = getClassTeacherForPayment(item.student);
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="clearanceCheck" data-id="${item.student.id}" data-name="${escapeHtml(item.student.name)}" data-class="${item.student.class}" data-adm="${item.student.admission_no || ''}" data-paid="${item.status.paid}" data-teacher="${escapeHtml(classTeacher)}"></td>
                <td><strong>${escapeHtml(item.student.name)}</strong></td>
                <td>${item.student.class}${item.student.stream ? ' - ' + item.student.stream : ''}</td>
                <td>${item.student.admission_no || '-'}</td>
                <td class="text-end">${formatMoney(item.status.paid)}</span></td>
                <td><small>${escapeHtml(classTeacher)}</small></span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-success" onclick="printSingleClearanceCard('${item.student.id}')">
                        <i class="fas fa-print"></i> Print Card
                    </button>
                 </span></td>
            </tr>
        `;
    }
    
    html += `</tbody></table></div></div>`;
    
    Swal.fire({
        title: '<i class="fas fa-id-card"></i> Clearance Cards - Fully Paid Students',
        html: html,
        width: '900px',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            const selectAll = document.getElementById('selectAllClearance');
            if (selectAll) {
                selectAll.onclick = () => {
                    document.querySelectorAll('.clearanceCheck').forEach(cb => cb.checked = selectAll.checked);
                };
            }
        }
    });
};

// Print single clearance card with school info
window.printSingleClearanceCard = async function(studentId) {
    await loadSchoolSettingsForPayments();
    await getStudentsForPayments();
    await getPayments();
    
    const student = allStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const status = await calculateStudentFeeStatusWithCarryForward(studentId, year, term);
    const classTeacher = getClassTeacherForPayment(student);
    
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleDateString('en-GB');
    const logoUrl = schoolSettings.school_logo || '';
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Clearance Card - ${student.name}</title>
            <style>
                @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                body { font-family: Arial, sans-serif; padding: 20px; }
                .clearance-card { 
                    max-width: 550px; 
                    margin: 0 auto; 
                    border: 2px solid #28a745; 
                    padding: 25px; 
                    border-radius: 15px; 
                    background: white;
                    position: relative;
                    overflow: hidden;
                }
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    opacity: 0.1;
                    z-index: 0;
                    width: 60%;
                    max-width: 250px;
                }
                .header { text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 10px; margin-bottom: 20px; position: relative; z-index: 1; }
                .school-name { color: #01605a; font-size: 20px; font-weight: bold; }
                .school-motto { font-size: 11px; color: #666; font-style: italic; }
                .clearance-title { color: #28a745; font-size: 22px; font-weight: bold; margin: 10px 0; }
                .details { margin: 15px 0; line-height: 1.8; position: relative; z-index: 1; }
                .signature { margin-top: 30px; display: flex; justify-content: space-between; position: relative; z-index: 1; }
                .stamp { text-align: center; margin-top: 10px; position: relative; z-index: 1; }
                .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #666; position: relative; z-index: 1; }
                .school-logo { max-width: 60px; max-height: 60px; margin-bottom: 5px; }
                .info-row { margin: 8px 0; }
            </style>
        </head>
        <body>
            <div class="clearance-card">
                ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="School Logo">` : ''}
                <div class="header">
                    ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="Logo">` : ''}
                    <div class="school-name">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                    <div class="school-motto">${escapeHtml(schoolSettings.school_motto || 'Education for All')}</div>
                    <div class="clearance-title">✓ CLEARANCE CERTIFICATE ✓</div>
                    <p style="margin: 5px 0 0;">Academic Year: ${year} | Term: ${term}</p>
                </div>
                <div class="details">
                    <div class="info-row"><strong>Student Name:</strong> ${escapeHtml(student.name)}</div>
                    <div class="info-row"><strong>Admission No:</strong> ${student.admission_no || '-'}</div>
                    <div class="info-row"><strong>Class:</strong> ${student.class} ${student.stream ? '- ' + student.stream : ''}</div>
                    <div class="info-row"><strong>Student Type:</strong> ${student.student_type || 'Day'}</div>
                    <div class="info-row"><strong>Class Teacher:</strong> ${escapeHtml(classTeacher)}</div>
                    <hr>
                    <div class="info-row"><strong>Fee Status:</strong> <span style="color: #28a745;">FULLY PAID</span></div>
                    <div class="info-row"><strong>Total Fees (${term} ${year}):</strong> ${formatMoney(status.termFee)}</div>
                    <div class="info-row"><strong>Amount Paid:</strong> ${formatMoney(status.paid)}</div>
                    <div class="info-row"><strong>Balance:</strong> UGX 0</div>
                    <hr>
                    <div class="info-row"><strong>Clearance Date:</strong> ${currentDate}</div>
                </div>
                <div class="signature">
                    <div>_________________<br>${escapeHtml(classTeacher)}<br><small>Class Teacher</small></div>
                    <div>_________________<br>${escapeHtml(schoolSettings.bursar_name || 'Bursar')}<br><small>Bursar</small></div>
                    <div>_________________<br>${escapeHtml(schoolSettings.principal_name || 'Principal')}<br><small>Principal</small></div>
                </div>
                <div class="stamp">
                    <div style="border: 1px solid #28a745; padding: 5px 15px; display: inline-block; border-radius: 5px; font-weight: bold;">APPROVED ✓</div>
                </div>
                <div class="footer">This certifies that the above student has cleared all fees for ${term} ${year}</div>
            </div>
            <div class="no-print" style="text-align:center;margin-top:20px;">
                <button onclick="window.print()">🖨️ Print</button>
                <button onclick="window.close()">❌ Close</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
};

// Print all clearance cards
window.printAllClearanceCards = async function() {
    const checkboxes = document.querySelectorAll('.clearanceCheck:checked');
    let studentsToPrint = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    if (studentsToPrint.length === 0) {
        studentsToPrint = Array.from(document.querySelectorAll('.clearanceCheck')).map(cb => cb.dataset.id);
    }
    
    if (studentsToPrint.length === 0) {
        Swal.fire('Error', 'No students selected', 'error');
        return;
    }
    
    Swal.fire({ title: 'Generating clearance cards...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    await loadSchoolSettingsForPayments();
    await getStudentsForPayments();
    await getPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const currentDate = new Date().toLocaleDateString('en-GB');
    const logoUrl = schoolSettings.school_logo || '';
    
    let allCardsHtml = '';
    
    for (const studentId of studentsToPrint) {
        const student = allStudentsList.find(s => s.id === studentId);
        if (!student) continue;
        
        const status = await calculateStudentFeeStatusWithCarryForward(studentId, year, term);
        const classTeacher = getClassTeacherForPayment(student);
        
        allCardsHtml += `
            <div class="clearance-card" style="max-width: 550px; margin: 20px auto; border: 2px solid #28a745; padding: 25px; border-radius: 15px; background: white; page-break-after: always; position: relative; overflow: hidden;">
                ${logoUrl ? `<img src="${logoUrl}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.1; z-index: 0; width: 60%; max-width: 250px;">` : ''}
                <div style="text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 10px; margin-bottom: 20px; position: relative; z-index: 1;">
                    ${logoUrl ? `<img src="${logoUrl}" style="max-width: 50px; max-height: 50px; margin-bottom: 5px;">` : ''}
                    <div style="color: #01605a; font-size: 18px; font-weight: bold;">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                    <div style="color: #28a745; font-size: 20px; font-weight: bold; margin: 10px 0;">✓ CLEARANCE CERTIFICATE ✓</div>
                    <p>Academic Year: ${year} | Term: ${term}</p>
                </div>
                <div style="margin: 15px 0; line-height: 1.8; position: relative; z-index: 1;">
                    <div><strong>Student Name:</strong> ${escapeHtml(student.name)}</div>
                    <div><strong>Admission No:</strong> ${student.admission_no || '-'}</div>
                    <div><strong>Class:</strong> ${student.class} ${student.stream ? '- ' + student.stream : ''}</div>
                    <div><strong>Class Teacher:</strong> ${escapeHtml(classTeacher)}</div>
                    <hr>
                    <div><strong>Fee Status:</strong> <span style="color: #28a745;">FULLY PAID</span></div>
                    <div><strong>Clearance Date:</strong> ${currentDate}</div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 30px; position: relative; z-index: 1;">
                    <div>_________________<br>${escapeHtml(classTeacher)}<br><small>Class Teacher</small></div>
                    <div>_________________<br>${escapeHtml(schoolSettings.bursar_name || 'Bursar')}<br><small>Bursar</small></div>
                    <div>_________________<br>${escapeHtml(schoolSettings.principal_name || 'Principal')}<br><small>Principal</small></div>
                </div>
                <div style="text-align: center; margin-top: 10px; position: relative; z-index: 1;">
                    <div style="border: 1px solid #28a745; padding: 5px 15px; display: inline-block; border-radius: 5px; font-weight: bold;">APPROVED ✓</div>
                </div>
            </div>
        `;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Clearance Cards</title>
            <style>
                @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                body { font-family: Arial, sans-serif; padding: 20px; }
            </style>
        </head>
        <body>
            <div class="no-print" style="text-align:center;margin-bottom:20px;">
                <button onclick="window.print()">🖨️ Print All</button>
                <button onclick="window.close()">❌ Close</button>
            </div>
            ${allCardsHtml}
        </body>
        </html>
    `);
    printWindow.document.close();
    Swal.close();
};

// Print clearance by class
window.printClearanceByClass = async function() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    await loadSchoolSettingsForPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const filteredStudents = getStudentsByLevel();
    
    const classes = [...new Set(filteredStudents.map(s => s.class))].sort();
    
    let classOptions = '<option value="">-- Select Class --</option>';
    for (const c of classes) {
        classOptions += `<option value="${c}">${c}</option>`;
    }
    
    const { value: selectedClass } = await Swal.fire({
        title: 'Print Clearance Cards by Class',
        html: `
            <div class="text-start">
                <label class="form-label fw-bold">Select Class</label>
                <select id="clearanceClassSelect" class="form-select">${classOptions}</select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Print',
        preConfirm: () => {
            const className = document.getElementById('clearanceClassSelect').value;
            if (!className) {
                Swal.showValidationMessage('Please select a class');
                return false;
            }
            return className;
        }
    });
    
    if (selectedClass) {
        const classStudents = filteredStudents.filter(s => s.class === selectedClass);
        let clearedInClass = [];
        
        for (const student of classStudents) {
            const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
            if (status.status === 'CLEARED') {
                clearedInClass.push(student);
            }
        }
        
        if (clearedInClass.length === 0) {
            Swal.fire('No Students', `No cleared students in ${selectedClass}`, 'info');
            return;
        }
        
        Swal.fire({ title: 'Generating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const currentDate = new Date().toLocaleDateString('en-GB');
        const logoUrl = schoolSettings.school_logo || '';
        let allCardsHtml = '';
        
        for (const student of clearedInClass) {
            const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
            const classTeacher = getClassTeacherForPayment(student);
            
            allCardsHtml += `
                <div class="clearance-card" style="max-width: 550px; margin: 20px auto; border: 2px solid #28a745; padding: 25px; border-radius: 15px; background: white; page-break-after: always; position: relative; overflow: hidden;">
                    ${logoUrl ? `<img src="${logoUrl}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.1; z-index: 0; width: 60%; max-width: 250px;">` : ''}
                    <div style="text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 10px; margin-bottom: 20px; position: relative; z-index: 1;">
                        ${logoUrl ? `<img src="${logoUrl}" style="max-width: 50px; max-height: 50px; margin-bottom: 5px;">` : ''}
                        <div style="color: #01605a; font-size: 18px; font-weight: bold;">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                        <div style="color: #28a745; font-size: 20px; font-weight: bold; margin: 10px 0;">✓ CLEARANCE CERTIFICATE ✓</div>
                        <p>Academic Year: ${year} | Term: ${term}</p>
                    </div>
                    <div style="margin: 15px 0; line-height: 1.8; position: relative; z-index: 1;">
                        <div><strong>Student Name:</strong> ${escapeHtml(student.name)}</div>
                        <div><strong>Admission No:</strong> ${student.admission_no || '-'}</div>
                        <div><strong>Class:</strong> ${student.class} ${student.stream ? '- ' + student.stream : ''}</div>
                        <div><strong>Class Teacher:</strong> ${escapeHtml(classTeacher)}</div>
                        <hr>
                        <div><strong>Fee Status:</strong> <span style="color: #28a745;">FULLY PAID</span></div>
                        <div><strong>Clearance Date:</strong> ${currentDate}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 30px; position: relative; z-index: 1;">
                        <div>_________________<br>${escapeHtml(classTeacher)}<br><small>Class Teacher</small></div>
                        <div>_________________<br>${escapeHtml(schoolSettings.bursar_name || 'Bursar')}<br><small>Bursar</small></div>
                        <div>_________________<br>${escapeHtml(schoolSettings.principal_name || 'Principal')}<br><small>Principal</small></div>
                    </div>
                    <div style="text-align: center; margin-top: 10px; position: relative; z-index: 1;">
                        <div style="border: 1px solid #28a745; padding: 5px 15px; display: inline-block; border-radius: 5px; font-weight: bold;">APPROVED ✓</div>
                    </div>
                </div>
            `;
        }
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clearance Cards - ${selectedClass}</title>
                <style>
                    @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                    body { font-family: Arial, sans-serif; padding: 20px; }
                </style>
            </head>
            <body>
                <div class="no-print" style="text-align:center;margin-bottom:20px;">
                    <button onclick="window.print()">🖨️ Print All</button>
                    <button onclick="window.close()">❌ Close</button>
                </div>
                ${allCardsHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
        Swal.close();
    }
};

// ============================================
// PRINT DEFAULTERS REPORT - WITH SCHOOL INFO
// ============================================

window.printDefaultersByClass = async function() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    await loadSchoolSettingsForPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const filteredStudents = getStudentsByLevel();
    
    // Group defaulters by class
    const defaultersByClass = {};
    
    for (const student of filteredStudents) {
        const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
        if (status.status === 'DEFAULTER') {
            if (!defaultersByClass[student.class]) {
                defaultersByClass[student.class] = [];
            }
            defaultersByClass[student.class].push({ student, status });
        }
    }
    
    if (Object.keys(defaultersByClass).length === 0) {
        Swal.fire('Info', 'No fee defaulters found.', 'info');
        return;
    }
    
    const classes = Object.keys(defaultersByClass).sort();
    
    let classOptions = '<option value="">-- All Classes --</option>';
    for (const c of classes) {
        classOptions += `<option value="${c}">${c} (${defaultersByClass[c].length} defaulters)</option>`;
    }
    
    const { value: selectedClass } = await Swal.fire({
        title: 'Print Fee Defaulters Report',
        html: `
            <div class="text-start">
                <label class="form-label fw-bold">Select Class</label>
                <select id="defaulterClassSelect" class="form-select">${classOptions}</select>
                <div class="alert alert-danger mt-3 small">
                    <i class="fas fa-exclamation-triangle"></i> This report shows all students with outstanding fee balances.
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Print Report',
        preConfirm: () => {
            return document.getElementById('defaulterClassSelect').value;
        }
    });
    
    if (selectedClass !== undefined) {
        const printWindow = window.open('', '_blank');
        const currentDate = new Date().toLocaleDateString('en-GB');
        const logoUrl = schoolSettings.school_logo || '';
        let tableRows = '';
        let totalBalance = 0;
        let defaultersToPrint = [];
        
        if (selectedClass) {
            defaultersToPrint = defaultersByClass[selectedClass] || [];
        } else {
            for (const className of classes) {
                defaultersToPrint.push(...defaultersByClass[className]);
            }
        }
        
        for (const item of defaultersToPrint) {
            const classTeacher = getClassTeacherForPayment(item.student);
            tableRows += `
                <tr>
                    <td>${item.student.admission_no || '-'}</span></span></td>
                    <td><strong>${escapeHtml(item.student.name)}</strong></span></span></td>
                    <td>${item.student.class} ${item.student.stream || ''}</span></span></td>
                    <td>${escapeHtml(classTeacher)}</span></span></td>
                    <td class="text-end">${formatMoney(item.status.termFee)}</span></span></td>
                    <td class="text-end">${formatMoney(item.status.paid)}</span></span></td>
                    <td class="text-end text-danger"><strong>${formatMoney(item.status.balance)}</strong></span></span></td>
                </tr>
            `;
            totalBalance += item.status.balance;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Fee Defaulters Report - ${selectedClass || 'All Classes'}</title>
                <style>
                    @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .report { max-width: 1100px; margin: 0 auto; position: relative; }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        opacity: 0.08;
                        z-index: 0;
                        width: 40%;
                        max-width: 300px;
                    }
                    .header { text-align: center; margin-bottom: 20px; position: relative; z-index: 1; }
                    .school-name { color: #01605a; font-size: 22px; font-weight: bold; }
                    .school-motto { font-size: 11px; color: #666; font-style: italic; }
                    .title { color: #dc3545; font-size: 18px; font-weight: bold; margin: 10px 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; position: relative; z-index: 1; }
                    th, td { border: 1px solid #ddd; padding: 8px; }
                    th { background: #dc3545; color: white; }
                    .total { margin-top: 15px; text-align: right; font-weight: bold; position: relative; z-index: 1; }
                    .footer { margin-top: 30px; text-align: center; font-size: 10px; position: relative; z-index: 1; }
                    .signature { margin-top: 40px; display: flex; justify-content: space-between; position: relative; z-index: 1; }
                    .school-logo { max-width: 60px; max-height: 60px; }
                </style>
            </head>
            <body>
                <div class="report">
                    ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="School Logo">` : ''}
                    <div class="header">
                        ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="Logo">` : ''}
                        <div class="school-name">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                        <div class="school-motto">${escapeHtml(schoolSettings.school_motto || 'Education for All')}</div>
                        <div class="title">📋 FEE DEFAULTERS REPORT</div>
                        <p>${term} - ${year} | Generated: ${currentDate}</p>
                        ${selectedClass ? `<p><strong>Class:</strong> ${selectedClass}</p>` : '<p><strong>All Classes</strong></p>'}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Admission No</th>
                                <th>Student Name</th>
                                <th>Class</th>
                                <th>Class Teacher</th>
                                <th>Term Fee (UGX)</th>
                                <th>Paid (UGX)</th>
                                <th>Balance (UGX)</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                        <tfoot>
                            <tr style="background: #f8f9fa;">
                                <td colspan="6" style="text-align: right;"><strong>TOTAL BALANCE:</strong></span></td>
                                <td class="text-danger"><strong>${formatMoney(totalBalance)}</strong></span></td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="total">
                        <p><strong>Total Defaulters:</strong> ${defaultersToPrint.length}</p>
                    </div>
                    <div class="signature">
                        <div>_________________<br>${escapeHtml(schoolSettings.bursar_name || 'Bursar')}<br><small>Bursar</small></div>
                        <div>_________________<br>${escapeHtml(schoolSettings.principal_name || 'Principal')}<br><small>Principal</small></div>
                    </div>
                    <div class="footer">
                        <p>This is a system-generated report. Please contact parents for fee collection.</p>
                    </div>
                </div>
                <div class="no-print" style="text-align:center;margin-top:20px;">
                    <button onclick="window.print()">🖨️ Print</button>
                    <button onclick="window.close()">❌ Close</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
};

// ============================================
// SHOW FEE DEFAULTERS MODAL (UPDATED WITH PRINT BUTTON)
// ============================================

window.showFeeDefaultersModal = async function() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const filteredStudents = getStudentsByLevel();
    let defaultersList = [];
    
    for (const student of filteredStudents) {
        const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
        if (status.status === 'DEFAULTER') {
            defaultersList.push(status);
        }
    }
    
    if (defaultersList.length === 0) {
        Swal.fire('Info', 'No fee defaulters found.', 'info');
        return;
    }
    
    let html = `
        <div class="text-start">
            <div class="mb-3">
                <button class="btn btn-danger btn-sm" onclick="printDefaultersByClass()">
                    <i class="fas fa-print"></i> Print Defaulters Report
                </button>
            </div>
            <div class="table-responsive" style="max-height: 400px;">
                <table class="table table-bordered">
                    <thead class="table-danger">
                        <tr>
                            <th>Student</th>
                            <th>Class</th>
                            <th>Term Fee</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    for (const d of defaultersList) {
        html += `
            <tr>
                <td><strong>${escapeHtml(d.student.name)}</strong><br><small>${d.student.admission_no || ''}</small></td>
                <td>${d.student.class}${d.student.stream ? ' - ' + d.student.stream : ''}</td>
                <td class="text-end">${formatMoney(d.termFee)}</span></td>
                <td class="text-end">${formatMoney(d.paid)}</span></td>
                <td class="text-end text-danger"><strong>${formatMoney(d.balance)}</strong></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-primary" onclick="quickRecordPayment('${d.student.id}')">
                        <i class="fas fa-credit-card"></i> Pay
                    </button>
                 </span></td>
            </tr>
        `;
    }
    
    html += `</tbody></table></div></div>`;
    
    Swal.fire({
        title: '<i class="fas fa-exclamation-triangle text-danger"></i> Fee Defaulters',
        html: html,
        width: '900px',
        showConfirmButton: false,
        showCloseButton: true
    });
};

// ============================================
// SHOW COMPLETED STUDENTS (UPDATED WITH CLASS TEACHER)
// ============================================

window.showCompletedStudentsModal = async function() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    
    const year = new Date().getFullYear().toString();
    const term = getCurrentTerm();
    const filteredStudents = getStudentsByLevel();
    let completedList = [];
    
    for (const student of filteredStudents) {
        const status = await calculateStudentFeeStatusWithCarryForward(student.id, year, term);
        if (status.status === 'CLEARED') {
            completedList.push(status);
        }
    }
    
    if (completedList.length === 0) {
        Swal.fire('Info', 'No fully cleared students found.', 'info');
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered">
                <thead class="table-success">
                    <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th>Class Teacher</th>
                        <th>Total Paid</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    for (const c of completedList) {
        const classTeacher = getClassTeacherForPayment(c.student);
        html += `
            <tr>
                <td><strong>${escapeHtml(c.student.name)}</strong><br><small>${c.student.admission_no || ''}</small></td>
                <td>${c.student.class}${c.student.stream ? ' - ' + c.student.stream : ''}</td>
                <td>${escapeHtml(classTeacher)}</span></td>
                <td class="text-end">${formatMoney(c.paid)}</span></td>
                <td class="text-center"><span class="badge bg-success">✅ Fully Paid</span></td>
            </tr>
        `;
    }
    
    html += `</tbody></table></div>`;
    
    Swal.fire({
        title: '<i class="fas fa-graduation-cap text-success"></i> Completed Students',
        html: html,
        width: '800px',
        confirmButtonText: 'Close'
    });
};

// ============================================
// SHOW ADD PAYMENT MODAL
// ============================================

window.showAddPaymentModal = async function() {
    console.log("Opening Add Payment Modal...");
    
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    
    const filteredStudents = getStudentsByLevel();
    const currentYear = new Date().getFullYear().toString();
    const currentTerm = getCurrentTerm();
    
    if (filteredStudents.length === 0) {
        Swal.fire('No Students', `No ${currentLevel.toUpperCase()} students found.`, 'info');
        return;
    }
    
    let studentOptions = '<option value="">-- Select Student --</option>';
    for (const s of filteredStudents) {
        const fee = getStudentFeeAmount(s);
        const feeDisplay = fee ? formatMoney(fee) : '⚠️ No Fee Set';
        studentOptions += `<option value="${s.id}" data-fee="${fee || 0}">${escapeHtml(s.name)} (${s.class}) - ${s.admission_no || 'No ADM'} - Fee: ${feeDisplay}</option>`;
    }
    
    const { value: result } = await Swal.fire({
        title: `<i class="fas fa-credit-card"></i> Record Payment - ${currentLevel.toUpperCase()}`,
        html: `
            <div class="text-start">
                <div class="alert alert-info small mb-3">
                    <i class="fas fa-database"></i> <strong>Live Data:</strong> Fees loaded from fee_structure table
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Select Student *</label>
                    <select id="paymentStudentSelect" class="form-select">${studentOptions}</select>
                </div>
                <div id="balanceInfo" class="alert alert-info mb-3" style="display: none;">
                    <strong>💰 Fee & Balance Information:</strong>
                    <div id="balanceDetails" style="margin-top: 8px;"></div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Fee Type</label>
                        <select id="feeTypeSelect" class="form-select">
                            <option value="Tuition Fee">Tuition Fee</option>
                            <option value="Development Fee">Development Fee</option>
                            <option value="Activity Fee">Activity Fee</option>
                            <option value="Library Fee">Library Fee</option>
                            <option value="Sports Fee">Sports Fee</option>
                            <option value="Meals Fee">Meals Fee</option>
                            <option value="Accommodation">Accommodation</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Amount (UGX) *</label>
                        <input type="number" id="amountInput" class="form-control" placeholder="0" min="0" step="1000">
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Payment Method</label>
                        <select id="methodSelect" class="form-select">
                            <option value="Cash">💵 Cash</option>
                            <option value="Bank Transfer">🏦 Bank Transfer</option>
                            <option value="Mobile Money">📱 Mobile Money</option>
                            <option value="Cheque">📝 Cheque</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Receipt No</label>
                        <input type="text" id="receiptNoInput" class="form-control" value="${generateReceiptNo()}" readonly>
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Payment Date</label>
                        <input type="date" id="paymentDateInput" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Term</label>
                        <select id="termSelect" class="form-select">
                            <option value="Term 1" ${currentTerm === 'Term 1' ? 'selected' : ''}>Term 1</option>
                            <option value="Term 2" ${currentTerm === 'Term 2' ? 'selected' : ''}>Term 2</option>
                            <option value="Term 3" ${currentTerm === 'Term 3' ? 'selected' : ''}>Term 3</option>
                        </select>
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Year</label>
                        <input type="text" id="yearInput" class="form-control" value="${currentYear}">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Remarks</label>
                    <textarea id="remarksInput" class="form-control" rows="2"></textarea>
                </div>
                <div class="alert alert-success small">
                    <i class="fas fa-info-circle"></i> 
                    <strong>Note:</strong> Excess payment automatically carries forward to next term.
                </div>
                <div class="text-end mt-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="refreshModalFees()">
                        <i class="fas fa-sync-alt"></i> Refresh Fees
                    </button>
                </div>
            </div>
        `,
        width: '680px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Save Payment',
        didOpen: () => {
            const studentSelect = document.getElementById('paymentStudentSelect');
            const balanceInfo = document.getElementById('balanceInfo');
            const balanceDetails = document.getElementById('balanceDetails');
            const termSelect = document.getElementById('termSelect');
            const yearInput = document.getElementById('yearInput');
            
            const updateBalanceInfo = async () => {
                const studentId = studentSelect.value;
                const term = termSelect.value;
                const year = yearInput.value;
                
                if (!studentId) {
                    balanceInfo.style.display = 'none';
                    return;
                }
                
                balanceInfo.style.display = 'block';
                balanceDetails.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading latest fee data...</div>';
                
                try {
                    await loadFeeStructure();
                    await getPayments();
                    
                    const status = await calculateStudentFeeStatusWithCarryForward(studentId, year, term);
                    
                    if (!status || status.status === 'NO_FEE') {
                        balanceDetails.innerHTML = `
                            <div class="alert alert-warning text-center">
                                <i class="fas fa-exclamation-triangle"></i> 
                                <strong>No fee structure found!</strong><br>
                                Please add fee in Settings → Fee Structure
                            </div>
                        `;
                        return;
                    }
                    
                    balanceDetails.innerHTML = `
                        <div class="small">
                            <div><strong>👨‍🎓 Student:</strong> ${escapeHtml(status.student.name)}</div>
                            <div><strong>📚 Class:</strong> ${status.student.class}</div>
                            <div><strong>🏠 Type:</strong> ${status.student.student_type || 'Day'}</div>
                            <hr class="my-1">
                            <div><strong>💰 Term Fee:</strong> ${formatMoney(status.termFee)}</div>
                            ${status.previousTermsBalance > 0 ? `<div class="text-warning"><strong>⚠️ Previous Balance:</strong> ${formatMoney(status.previousTermsBalance)}</div>` : ''}
                            <hr class="my-1">
                            <div><strong>💸 Paid This Term:</strong> ${formatMoney(status.currentTermPaid)}</div>
                            <div><strong class="${status.balance > 0 ? 'text-danger' : 'text-success'}">💰 Current Balance: ${formatMoney(Math.abs(status.balance))} ${status.balance > 0 ? '(Due)' : '(Credit)'}</strong></div>
                            <div class="text-muted small mt-2"><i class="fas fa-database"></i> Data from database @ ${new Date().toLocaleTimeString()}</div>
                        </div>
                    `;
                } catch (error) {
                    balanceDetails.innerHTML = `<div class="alert alert-danger">Error loading data</div>`;
                }
            };
            
            studentSelect.onchange = updateBalanceInfo;
            termSelect.onchange = updateBalanceInfo;
            yearInput.onchange = updateBalanceInfo;
            
            if (studentSelect.value) {
                setTimeout(updateBalanceInfo, 100);
            }
        },
        preConfirm: async () => {
            const studentId = document.getElementById('paymentStudentSelect').value;
            const amount = parseInt(document.getElementById('amountInput').value) || 0;
            
            if (!studentId) {
                Swal.showValidationMessage('Please select a student!');
                return false;
            }
            if (amount <= 0) {
                Swal.showValidationMessage('Please enter a valid amount!');
                return false;
            }
            
            return {
                student_id: studentId,
                amount: amount,
                fee_type: document.getElementById('feeTypeSelect').value,
                method: document.getElementById('methodSelect').value,
                payment_date: document.getElementById('paymentDateInput').value,
                term: document.getElementById('termSelect').value,
                year: document.getElementById('yearInput').value,
                remarks: document.getElementById('remarksInput').value || ''
            };
        }
    });
    
    if (result) {
        Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await processPaymentWithCarryForward(
                result.student_id, result.amount, result.fee_type, result.method,
                result.payment_date, result.term, result.year, result.remarks
            );
            Swal.fire('✅ Success!', 'Payment recorded successfully.', 'success');
            await refreshPayments();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// REFRESH MODAL FEES
// ============================================

window.refreshModalFees = async function() {
    feeStructure = {};
    await loadFeeStructure();
    await getPayments();
    
    const studentSelect = document.getElementById('paymentStudentSelect');
    if (studentSelect && studentSelect.value) {
        const termSelect = document.getElementById('termSelect');
        const yearInput = document.getElementById('yearInput');
        const status = await calculateStudentFeeStatusWithCarryForward(
            studentSelect.value, 
            yearInput?.value || new Date().getFullYear().toString(),
            termSelect?.value || getCurrentTerm()
        );
        
        const balanceDetails = document.getElementById('balanceDetails');
        if (balanceDetails) {
            if (status.status === 'NO_FEE') {
                balanceDetails.innerHTML = `
                    <div class="alert alert-warning text-center">
                        <i class="fas fa-exclamation-triangle"></i> 
                        <strong>Fees refreshed!</strong> Still no fee found.
                    </div>
                `;
            } else {
                balanceDetails.innerHTML = `
                    <div class="small text-success">
                        <i class="fas fa-check-circle"></i> <strong>Fees refreshed!</strong><br>
                        Term Fee: ${formatMoney(status.termFee)}<br>
                        Balance: ${formatMoney(Math.abs(status.balance))} ${status.balance > 0 ? '(Due)' : '(Credit)'}
                    </div>
                `;
            }
        }
    }
    
    Swal.fire('Refreshed!', 'Fees reloaded from database', 'success');
};

// ============================================
// VIEW PAYMENT HISTORY
// ============================================

window.viewPaymentHistory = async function(studentId) {
    await getPayments();
    await getStudentsForPayments();
    
    const student = allStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const studentPayments = allPaymentsList.filter(p => p.student_id === studentId);
    
    if (studentPayments.length === 0) {
        Swal.fire('No Payments', `${student.name} has no payment records.`, 'info');
        return;
    }
    
    const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
    
    let html = `
        <div class="text-start">
            <div class="card bg-light mb-3">
                <div class="card-body">
                    <p><strong>Student:</strong> ${escapeHtml(student.name)}</p>
                    <p><strong>Class:</strong> ${student.class}</p>
                    <p><strong>Total Paid:</strong> ${formatMoney(totalPaid)}</p>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-primary">
                        <tr><th>Date</th><th>Receipt No</th><th>Amount</th><th>Method</th><th>Term</th><th>Year</th></tr>
                    </thead>
                    <tbody>
    `;
    
    for (const p of studentPayments) {
        html += `
            <tr>
                <td>${p.payment_date || '-'}</td>
                <td>${p.receipt_no || '-'}</td>
                <td class="text-end">${formatMoney(p.amount)}</span></td>
                <td>${p.payment_method || '-'}</td>
                <td>${p.term || '-'}</td>
                <td>${p.year || '-'}</td>
            </tr>
        `;
    }
    
    html += `</tbody></tr></div></div>`;
    
    Swal.fire({
        title: `Payment History - ${escapeHtml(student.name)}`,
        html: html,
        width: '700px',
        confirmButtonText: 'Close'
    });
};

// ============================================
// PRINT RECEIPT
// ============================================

window.printReceipt = async function(id) {
    await loadSchoolSettingsForPayments();
    await getStudentsForPayments();
    
    const payment = allPaymentsList.find(p => p.id === id);
    if (!payment) return;
    
    const student = allStudentsList.find(s => s.id === payment.student_id);
    const printWindow = window.open('', '_blank');
    const logoUrl = schoolSettings.school_logo || '';
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Receipt - ${payment.receipt_no}</title>
            <style>
                @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                body { font-family: Arial, sans-serif; padding: 40px; }
                .receipt { max-width: 400px; margin: 0 auto; border: 2px solid #01605a; padding: 20px; border-radius: 10px; position: relative; overflow: hidden; }
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    opacity: 0.1;
                    z-index: 0;
                    width: 60%;
                }
                .header { text-align: center; border-bottom: 2px solid #ff862d; padding-bottom: 10px; margin-bottom: 20px; position: relative; z-index: 1; }
                .school-name { color: #01605a; font-size: 20px; font-weight: bold; }
                .receipt-title { font-size: 16px; font-weight: bold; margin-top: 5px; }
                .receipt-no { background: #f0f0f0; padding: 5px; text-align: center; margin-bottom: 15px; position: relative; z-index: 1; }
                table { width: 100%; margin: 15px 0; position: relative; z-index: 1; }
                td { padding: 5px; }
                .total { font-weight: bold; text-align: right; border-top: 1px solid #ddd; padding-top: 10px; }
                .thankyou { text-align: center; margin-top: 15px; color: #01605a; }
                .signature { margin-top: 30px; display: flex; justify-content: space-between; position: relative; z-index: 1; }
                .school-logo { max-width: 50px; max-height: 50px; margin-bottom: 5px; }
            </style>
        </head>
        <body>
            <div class="receipt">
                ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="School Logo">` : ''}
                <div class="header">
                    ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="Logo">` : ''}
                    <div class="school-name">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                    <div class="receipt-title">OFFICIAL PAYMENT RECEIPT</div>
                </div>
                <div class="receipt-no"><strong>Receipt No:</strong> ${payment.receipt_no}</div>
                <table>
                    <tr><td width="40%"><strong>Date:</strong></td><td>${payment.payment_date}</td></tr>
                    <tr><td><strong>Student:</strong></td><td>${student ? escapeHtml(student.name) : 'Unknown'} (${student ? student.class : ''})</span></td></tr>
                    <tr><td><strong>Fee Type:</strong></td><td>${payment.fee_type}</span></td></tr>
                    <tr><td><strong>Amount:</strong></td><td class="text-end"><strong>${formatMoney(payment.amount)}</strong></td></tr>
                    <tr><td><strong>Method:</strong></td><td>${payment.payment_method}</span></td></tr>
                    <tr><td><strong>Term:</strong></td><td>${payment.term} ${payment.year}</span></td></tr>
                </table>
                <div class="total">Total Paid: ${formatMoney(payment.amount)}</div>
                <div class="signature">
                    <div>_________________<br>Student/Parent</div>
                    <div>_________________<br>${escapeHtml(schoolSettings.bursar_name || 'Bursar')}</div>
                </div>
                <div class="thankyou">Thank you for your payment!</div>
            </div>
            <div class="no-print" style="text-align:center;margin-top:20px;">
                <button onclick="window.print()">🖨️ Print</button>
                <button onclick="window.close()">❌ Close</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
};

// ============================================
// DELETE PAYMENT
// ============================================

window.deletePaymentItem = async function(id) {
    const result = await Swal.fire({
        title: 'Delete Payment?',
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await deletePayment(id);
            Swal.fire('Deleted!', 'Payment record deleted.', 'success');
            await refreshPayments();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// BULK DELETE PAYMENTS
// ============================================

window.bulkDeletePayments = async function() {
    const checkboxes = document.querySelectorAll('.paymentCheck:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    if (ids.length === 0) {
        Swal.fire('Error', 'No payments selected', 'error');
        return;
    }
    
    const result = await Swal.fire({
        title: `Delete ${ids.length} payments?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            for (const id of ids) {
                await deletePayment(id);
            }
            Swal.fire('Deleted!', `${ids.length} payments deleted.`, 'success');
            await refreshPayments();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// EXPORT PAYMENTS
// ============================================

window.exportPayments = async function() {
    await getPayments();
    await getStudentsForPayments();
    
    const exportData = allPaymentsList.map(p => {
        const student = allStudentsList.find(s => s.id === p.student_id);
        return {
            'Receipt No': p.receipt_no,
            'Student Name': student?.name || 'Unknown',
            'Class': student?.class || '-',
            'Fee Type': p.fee_type,
            'Amount (UGX)': p.amount,
            'Payment Method': p.payment_method,
            'Date': p.payment_date,
            'Term': p.term,
            'Year': p.year,
            'Remarks': p.remarks || '-'
        };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${currentLevel}_Payments`);
    XLSX.writeFile(wb, `Payments_${currentLevel}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    Swal.fire('Exported!', `${exportData.length} payments exported.`, 'success');
};

// ============================================
// QUICK RECORD PAYMENT
// ============================================

window.quickRecordPayment = async function(studentId) {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    
    const student = allStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const currentYear = new Date().getFullYear().toString();
    const currentTerm = getCurrentTerm();
    const status = await calculateStudentFeeStatusWithCarryForward(studentId, currentYear, currentTerm);
    
    if (status.status === 'NO_FEE') {
        Swal.fire('Cannot Record Payment', 'No fee structure found. Please add fee in Settings.', 'warning');
        return;
    }
    
    const { value: amount } = await Swal.fire({
        title: `Record Payment for ${escapeHtml(student.name)}`,
        html: `
            <div class="text-start">
                <p><strong>Current Balance:</strong> ${formatMoney(status.balance)}</p>
                <p><strong>Term Fee:</strong> ${formatMoney(status.termFee)}</p>
                <label class="form-label mt-2">Amount (UGX)</label>
                <input type="number" id="quickAmount" class="form-control" min="0" step="1000">
                <label class="form-label mt-2">Payment Method</label>
                <select id="quickMethod" class="form-select">
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Mobile Money">Mobile Money</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Record Payment',
        preConfirm: () => {
            const amt = parseInt(document.getElementById('quickAmount').value);
            if (!amt || amt <= 0) {
                Swal.showValidationMessage('Enter valid amount');
                return false;
            }
            return { amount: amt, method: document.getElementById('quickMethod').value };
        }
    });
    
    if (amount) {
        Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await processPaymentWithCarryForward(
                studentId, amount.amount, 'Tuition Fee', amount.method,
                new Date().toISOString().split('T')[0], currentTerm, currentYear, 'Quick payment'
            );
            Swal.fire('Success!', 'Payment recorded.', 'success');
            await refreshPayments();
            showFeeDefaultersModal();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
};

// ============================================
// SHOW STUDENT FEE SUMMARY
// ============================================

window.showStudentFeeSummaryModal = async function() {
    await getStudentsForPayments();
    await loadFeeStructure();
    await getPayments();
    
    let studentOptions = '<option value="">-- Select Student --</option>';
    for (const s of allStudentsList) {
        const fee = getStudentFeeAmount(s);
        const feeDisplay = fee ? formatMoney(fee) : '⚠️ No Fee';
        studentOptions += `<option value="${s.id}">${escapeHtml(s.name)} (${s.class}) - Fee: ${feeDisplay}</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-chart-line"></i> Student Fee Summary',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-bold">Select Student</label>
                    <select id="summaryStudentSelect" class="form-select">${studentOptions}</select>
                </div>
                <div id="summaryDisplay" class="mt-3">
                    <p class="text-muted text-center">Select a student to view fee summary</p>
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Close',
        didOpen: () => {
            const studentSelect = document.getElementById('summaryStudentSelect');
            const displayDiv = document.getElementById('summaryDisplay');
            
            studentSelect.onchange = async () => {
                const studentId = studentSelect.value;
                if (!studentId) {
                    displayDiv.innerHTML = '<p class="text-muted text-center">Select a student to view fee summary</p>';
                    return;
                }
                
                displayDiv.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
                
                await loadFeeStructure();
                await getPayments();
                
                const year = new Date().getFullYear().toString();
                const term = getCurrentTerm();
                const status = await calculateStudentFeeStatusWithCarryForward(studentId, year, term);
                
                if (status.status === 'NO_FEE') {
                    displayDiv.innerHTML = `
                        <div class="alert alert-warning text-center">
                            <i class="fas fa-exclamation-triangle"></i> 
                            <strong>No fee structure found!</strong><br>
                            Please add fee in Settings → Fee Structure
                        </div>
                    `;
                } else {
                    displayDiv.innerHTML = `
                        <div class="card">
                            <div class="card-body">
                                <h6>${escapeHtml(status.student.name)} (${status.student.class})</h6>
                                <p><strong>Term Fee:</strong> ${formatMoney(status.termFee)}</p>
                                <p><strong>Paid This Term:</strong> ${formatMoney(status.currentTermPaid)}</p>
                                ${status.previousTermsBalance > 0 ? `<p class="text-warning"><strong>Previous Balance:</strong> ${formatMoney(status.previousTermsBalance)}</p>` : ''}
                                <hr>
                                <p><strong>Total Expected:</strong> ${formatMoney(status.expected)}</p>
                                <p><strong>Total Paid:</strong> ${formatMoney(status.paid)}</p>
                                <p><strong class="${status.balance > 0 ? 'text-danger' : 'text-success'}">Current Balance: ${formatMoney(Math.abs(status.balance))}</strong></p>
                                <p><strong>Status:</strong> <span class="badge" style="background: ${status.statusColor}">${status.statusBadge}</span></p>
                            </div>
                        </div>
                    `;
                }
            };
        }
    });
};

// ============================================
// SHOW SEARCH HISTORY
// ============================================

window.showSearchHistoryModal = async function() {
    await getStudentsForPayments();
    
    let studentOptions = '<option value="">-- Select Student --</option>';
    for (const s of allStudentsList) {
        studentOptions += `<option value="${s.id}">${escapeHtml(s.name)} (${s.class}) - ${s.admission_no || ''}</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-search"></i> Search Payment History',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-bold">Select Student</label>
                    <select id="historyStudentSelect" class="form-select">${studentOptions}</select>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: 'View History',
        preConfirm: () => {
            const studentId = document.getElementById('historyStudentSelect').value;
            if (!studentId) {
                Swal.showValidationMessage('Please select a student!');
                return false;
            }
            return studentId;
        }
    }).then((result) => {
        if (result.value) viewPaymentHistory(result.value);
    });
};

// ============================================
// RENDER PAYMENTS PAGE
// ============================================

async function renderPayments() {
    await loadFeeStructure();
    await getStudentsForPayments();
    await getPayments();
    
    const levelName = currentLevel === 'olevel' ? 'O-Level (UCE)' : 'A-Level (UACE)';
    const filteredStudents = getStudentsByLevel();
    const currentYear = new Date().getFullYear().toString();
    const currentTerm = getCurrentTerm();
    
    let defaulters = 0, cleared = 0, totalCollected = 0;
    
    for (const student of filteredStudents) {
        const status = await calculateStudentFeeStatusWithCarryForward(student.id, currentYear, currentTerm);
        if (status.status === 'DEFAULTER') defaulters++;
        if (status.status === 'CLEARED') cleared++;
    }
    
    for (const payment of allPaymentsList) {
        totalCollected += payment.amount || 0;
    }
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-credit-card"></i> Payments Management - ${levelName}</h5>
                <small>Fees loaded from fee_structure table | Real-time updates</small>
            </div>
            <div class="card-body">
                <div class="row g-2 mb-3">
                    <div class="col-md-12">
                        <button class="btn btn-primary" onclick="showAddPaymentModal()">
                            <i class="fas fa-plus"></i> Record Payment
                        </button>
                        <button class="btn btn-danger ms-2" onclick="showFeeDefaultersModal()">
                            <i class="fas fa-exclamation-triangle"></i> Defaulters (${defaulters})
                        </button>
                        <button class="btn btn-success ms-2" onclick="showCompletedStudentsModal()">
                            <i class="fas fa-check-circle"></i> Completed (${cleared})
                        </button>
                        <button class="btn btn-info ms-2" onclick="showClearanceCardsModal()">
                            <i class="fas fa-id-card"></i> Clearance Cards
                        </button>
                        <button class="btn btn-dark ms-2" onclick="showSearchHistoryModal()">
                            <i class="fas fa-search"></i> Search History
                        </button>
                        <button class="btn btn-info ms-2" onclick="showStudentFeeSummaryModal()">
                            <i class="fas fa-chart-line"></i> Fee Summary
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="exportPayments()">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button class="btn btn-outline-secondary ms-2" onclick="refreshPayments()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button class="btn btn-danger ms-2" onclick="bulkDeletePayments()">
                            <i class="fas fa-trash-alt"></i> Bulk Delete
                        </button>
                    </div>
                </div>
                
                <!-- SEARCH FILTERS SECTION -->
                <div class="row g-2 p-3 bg-light rounded">
                    <div class="col-md-12 mb-2">
                        <strong><i class="fas fa-filter"></i> Search & Filter Payments</strong>
                        <span id="filterCount" class="badge bg-secondary ms-2">0 records</span>
                    </div>
                    <div class="col-md-4">
                        <input type="text" id="paymentSearchInput" class="form-control form-control-sm" 
                               placeholder="🔍 Search by receipt, student, class..." 
                               onkeyup="filterPaymentsTable()">
                    </div>
                    <div class="col-md-2">
                        <select id="filterPaymentClass" class="form-select form-select-sm" onchange="filterPaymentsTable()">
                            <option value="">All Classes</option>
                            <option value="S.1">S.1</option>
                            <option value="S.2">S.2</option>
                            <option value="S.3">S.3</option>
                            <option value="S.4">S.4</option>
                            <option value="S.5">S.5</option>
                            <option value="S.6">S.6</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <select id="filterPaymentTerm" class="form-select form-select-sm" onchange="filterPaymentsTable()">
                            <option value="">All Terms</option>
                            <option value="Term 1">Term 1</option>
                            <option value="Term 2">Term 2</option>
                            <option value="Term 3">Term 3</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <input type="text" id="filterPaymentYear" class="form-control form-control-sm" 
                               placeholder="Year" onkeyup="filterPaymentsTable()">
                    </div>
                    <div class="col-md-2">
                        <select id="filterPaymentMethod" class="form-select form-select-sm" onchange="filterPaymentsTable()">
                            <option value="">All Methods</option>
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Mobile Money">Mobile Money</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-3">
                <div class="card bg-primary text-white">
                    <div class="card-body text-center">
                        <h3>${filteredStudents.length}</h3>
                        <p><i class="fas fa-users"></i> Total Students</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-danger text-white">
                    <div class="card-body text-center">
                        <h3>${defaulters}</h3>
                        <p><i class="fas fa-exclamation-triangle"></i> Defaulters</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <h3>${cleared}</h3>
                        <p><i class="fas fa-check-circle"></i> Cleared</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-info text-white">
                    <div class="card-body text-center">
                        <h3>${formatMoney(totalCollected)}</h3>
                        <p><i class="fas fa-money-bill"></i> Total Collected</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <h6 class="mb-0"><i class="fas fa-list"></i> Payment Records</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllPayments"></th>
                                <th>Receipt No</th>
                                <th>Student</th>
                                <th>Class</th>
                                <th>Fee Type</th>
                                <th>Amount (UGX)</th>
                                <th>Method</th>
                                <th>Date</th>
                                <th>Term</th>
                                <th>Year</th>
                                <th width="120">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="paymentsTableBody">
                            <tr><td colspan="11" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading payments...</span>络</tbody>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// INITIALIZE
// ============================================

console.log('✅ Payments Module Loaded - Final Masterpiece with School Info Integration');
console.log('✅ Features: Search Filters, Clearance Cards, Print Defaulters Report');
console.log('✅ School Info: Logo Watermark, Class Teacher, Principal, Bursar');




// ============================================
// FIXED ATTENDANCE MODULE - TABLE WORKING PROPERLY
// ============================================

// Global variables
let allAttendance = [];
let currentFilteredAttendance = [];

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
}

function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

// ============================================
// LOAD SCHOOL SETTINGS
// ============================================

async function loadSchoolSettingsForAttendance() {
    try {
        const { data, error } = await sb
            .from('school_settings')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        schoolSettings = data || {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_logo: '',
            principal_name: 'Principal'
        };
        return schoolSettings;
    } catch (error) {
        console.error('Error loading school settings:', error);
        schoolSettings = {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_logo: '',
            principal_name: 'Principal'
        };
        return schoolSettings;
    }
}

// ============================================
// CHECK IF ATTENDANCE EXISTS
// ============================================

async function checkExistingAttendance(studentId, date) {
    const { data, error } = await sb
        .from('attendance')
        .select('id, status')
        .eq('student_id', studentId)
        .eq('attendance_date', date)
        .maybeSingle();
    
    if (error) return null;
    return data;
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getAttendance() {
    try {
        const { data, error } = await sb
            .from('attendance')
            .select('*')
            .order('attendance_date', { ascending: false });
        
        if (error) throw error;
        allAttendance = data || [];
        currentFilteredAttendance = [...allAttendance];
        return allAttendance;
    } catch (error) {
        console.error('Error loading attendance:', error);
        return [];
    }
}

async function addAttendance(attendanceData) {
    const existing = await checkExistingAttendance(attendanceData.student_id, attendanceData.attendance_date);
    if (existing) {
        throw new Error(`Already marked as ${existing.status} on this date`);
    }
    
    const { data, error } = await sb
        .from('attendance')
        .insert([{
            ...attendanceData,
            created_at: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function updateAttendance(id, attendanceData) {
    const { data, error } = await sb
        .from('attendance')
        .update({
            ...attendanceData,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
}

async function deleteAttendance(id) {
    const { error } = await sb
        .from('attendance')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

async function getStudentsForAttendance() {
    try {
        let classList = currentLevel === 'olevel' 
            ? ['S.1', 'S.2', 'S.3', 'S.4']
            : ['S.5', 'S.6'];
        
        const { data, error } = await sb
            .from('students')
            .select('*')
            .in('class', classList)
            .order('name');
        
        if (error) throw error;
        allStudentsList = data || [];
        return allStudentsList;
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

// ============================================
// GET STUDENTS BY LEVEL
// ============================================

function getStudentsByLevel() {
    if (currentLevel === 'olevel') {
        return allStudentsList.filter(s => ['S.1', 'S.2', 'S.3', 'S.4'].includes(s.class));
    } else {
        return allStudentsList.filter(s => ['S.5', 'S.6'].includes(s.class));
    }
}

// ============================================
// GET TODAY'S ATTENDANCE STATUS
// ============================================

async function getTodayAttendanceStatus() {
    const today = getCurrentDate();
    const currentLevelStudents = getStudentsByLevel();
    const currentLevelStudentIds = new Set(currentLevelStudents.map(s => s.id));
    
    const { data, error } = await sb
        .from('attendance')
        .select('id, student_id, status')
        .eq('attendance_date', today);
    
    if (error) return { count: 0, totalStudents: currentLevelStudents.length, remaining: currentLevelStudents.length };
    
    const levelRecords = (data || []).filter(r => currentLevelStudentIds.has(r.student_id));
    
    return {
        count: levelRecords.length,
        totalStudents: currentLevelStudents.length,
        remaining: currentLevelStudents.length - levelRecords.length
    };
}

// ============================================
// RENDER ATTENDANCE PAGE
// ============================================

async function renderAttendance() {
    await loadSchoolSettingsForAttendance();
    await getAttendance();
    await getStudentsForAttendance();
    
    const classOptions = currentLevel === 'olevel' 
        ? ['S.1', 'S.2', 'S.3', 'S.4']
        : ['S.5', 'S.6'];
    
    const today = getCurrentDate();
    const todayStatus = await getTodayAttendanceStatus();
    const levelName = currentLevel === 'olevel' ? 'O-Level (UCE)' : 'A-Level (UACE)';
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-calendar-check"></i> Attendance Management - ${levelName}</h5>
                <small>📅 Today: ${formatDate(today)} | ✅ Marked: ${todayStatus.count}/${todayStatus.totalStudents} | ⏳ Remaining: ${todayStatus.remaining}</small>
            </div>
            <div class="card-body">
                <div class="row g-2">
                    <div class="col-md-12">
                        <button class="btn btn-primary" onclick="showSingleAttendanceModal()">
                            <i class="fas fa-plus"></i> Single Mark
                        </button>
                        <button class="btn btn-info ms-2" onclick="showBulkAttendanceModal()">
                            <i class="fas fa-users"></i> Bulk Mark
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="printAttendanceReport()">
                            <i class="fas fa-print"></i> Print Report
                        </button>
                        <button class="btn btn-danger ms-2" onclick="bulkDeleteAttendanceRecords()">
                            <i class="fas fa-trash"></i> Bulk Delete
                        </button>
                        <button class="btn btn-outline-secondary ms-2" onclick="refreshAttendanceTable()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- FILTERS -->
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row g-2">
                    <div class="col-md-3">
                        <label class="form-label">From Date</label>
                        <input type="date" id="filterFromDate" class="form-control" onchange="filterAttendanceRecords()">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">To Date</label>
                        <input type="date" id="filterToDate" class="form-control" onchange="filterAttendanceRecords()">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Status</label>
                        <select id="filterStatus" class="form-select" onchange="filterAttendanceRecords()">
                            <option value="">All Status</option>
                            <option value="Present">✅ Present</option>
                            <option value="Absent">❌ Absent</option>
                            <option value="Late">⏰ Late</option>
                            <option value="Excused">📝 Excused</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Class</label>
                        <select id="filterClass" class="form-select" onchange="filterAttendanceRecords()">
                            <option value="">All Classes</option>
                            ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Student</label>
                        <input type="text" id="filterStudent" class="form-control" placeholder="Student name..." onkeyup="filterAttendanceRecords()">
                    </div>
                </div>
            </div>
        </div>
        
        <!-- STATISTICS CARDS -->
        <div class="row mb-3">
            <div class="col-md-3">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <h3 id="presentCount">0</h3>
                        <p><i class="fas fa-check-circle"></i> Present</p>
                        <small id="presentPercent">0%</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-danger text-white">
                    <div class="card-body text-center">
                        <h3 id="absentCount">0</h3>
                        <p><i class="fas fa-times-circle"></i> Absent</p>
                        <small id="absentPercent">0%</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning text-dark">
                    <div class="card-body text-center">
                        <h3 id="lateCount">0</h3>
                        <p><i class="fas fa-clock"></i> Late</p>
                        <small id="latePercent">0%</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-info text-white">
                    <div class="card-body text-center">
                        <h3 id="excusedCount">0</h3>
                        <p><i class="fas fa-comment"></i> Excused</p>
                        <small id="excusedPercent">0%</small>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- ATTENDANCE TABLE -->
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <h6 class="mb-0"><i class="fas fa-list"></i> Attendance Records</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllAttendance"></th>
                                <th>Student Name</th>
                                <th>Class</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Remarks</th>
                                <th width="200">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="attendanceTableBody">
                            <tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LOAD ATTENDANCE TABLE - FIXED
// ============================================

async function loadAttendanceTable() {
    const tbody = document.getElementById('attendanceTableBody');
    if (!tbody) return;
    
    await getAttendance();
    await getStudentsForAttendance();
    
    const currentLevelStudents = getStudentsByLevel();
    const currentLevelStudentIds = new Set(currentLevelStudents.map(s => s.id));
    
    // Get current filter values
    const fromDate = document.getElementById('filterFromDate')?.value;
    const toDate = document.getElementById('filterToDate')?.value;
    const statusFilter = document.getElementById('filterStatus')?.value;
    const classFilter = document.getElementById('filterClass')?.value;
    const studentFilter = document.getElementById('filterStudent')?.value?.toLowerCase() || '';
    
    // Apply filters
    let filtered = allAttendance.filter(a => currentLevelStudentIds.has(a.student_id));
    
    if (fromDate) filtered = filtered.filter(a => a.attendance_date >= fromDate);
    if (toDate) filtered = filtered.filter(a => a.attendance_date <= toDate);
    if (statusFilter) filtered = filtered.filter(a => a.status === statusFilter);
    if (classFilter) {
        filtered = filtered.filter(a => {
            const student = allStudentsList.find(s => s.id === a.student_id);
            return student && student.class === classFilter;
        });
    }
    if (studentFilter) {
        filtered = filtered.filter(a => {
            const student = allStudentsList.find(s => s.id === a.student_id);
            return student && student.name.toLowerCase().includes(studentFilter);
        });
    }
    
    currentFilteredAttendance = filtered;
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">No attendance records found. Use "Bulk Mark" to get started.</span>络</tbody>`;
        updateStatisticsCards();
        return;
    }
    
    let html = '';
    for (const a of filtered) {
        const student = allStudentsList.find(s => s.id === a.student_id);
        if (!student) continue;
        
        const currentStatus = a.status;
        
        html += `
            <tr>
                <td class="text-center"><input type="checkbox" class="attendanceCheck" data-id="${a.id}"></td>
                <td>
                    <strong>${escapeHtml(student.name)}</strong>
                    <br><small class="text-muted">${student.admission_no || '-'}</small>
                 </span></td>
                <td>${student.class}${student.stream ? ' - ' + student.stream : ''}</span></td>
                <td>${formatDate(a.attendance_date)}</span></td>
                <td class="text-center">
                    <span class="badge ${a.status === 'Present' ? 'bg-success' : a.status === 'Absent' ? 'bg-danger' : a.status === 'Late' ? 'bg-warning text-dark' : 'bg-info'}" style="font-size: 12px; padding: 5px 10px;">
                        ${a.status === 'Present' ? '✅' : a.status === 'Absent' ? '❌' : a.status === 'Late' ? '⏰' : '📝'} ${a.status}
                    </span>
                 </span></td>
                <td>
                    <input type="text" class="form-control form-control-sm" 
                           id="remark_${a.id}" value="${escapeHtml(a.remarks || '')}" 
                           style="min-width: 100px;" placeholder="Add remark..."
                           onblur="updateRemarkRecord('${a.id}', this.value)">
                 </span></td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-success" onclick="markAsPresent('${a.id}')" title="Present"><i class="fas fa-check-circle"></i></button>
                        <button class="btn btn-danger" onclick="markAsAbsent('${a.id}')" title="Absent"><i class="fas fa-times-circle"></i></button>
                        <button class="btn btn-warning" onclick="markAsLate('${a.id}')" title="Late"><i class="fas fa-clock"></i></button>
                        <button class="btn btn-info" onclick="markAsExcused('${a.id}')" title="Excused"><i class="fas fa-comment"></i></button>
                        <button class="btn btn-danger" onclick="deleteAttendanceRecord('${a.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                 </span></td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
    
    const selectAll = document.getElementById('selectAllAttendance');
    if (selectAll) {
        selectAll.onclick = () => {
            document.querySelectorAll('.attendanceCheck').forEach(cb => cb.checked = selectAll.checked);
        };
    }
    
    updateStatisticsCards();
}

// ============================================
// UPDATE STATISTICS CARDS
// ============================================

function updateStatisticsCards() {
    let present = 0, absent = 0, late = 0, excused = 0;
    const total = currentFilteredAttendance.length;
    
    for (const a of currentFilteredAttendance) {
        if (a.status === 'Present') present++;
        else if (a.status === 'Absent') absent++;
        else if (a.status === 'Late') late++;
        else if (a.status === 'Excused') excused++;
    }
    
    const presentPercent = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
    const absentPercent = total > 0 ? ((absent / total) * 100).toFixed(1) : 0;
    const latePercent = total > 0 ? ((late / total) * 100).toFixed(1) : 0;
    const excusedPercent = total > 0 ? ((excused / total) * 100).toFixed(1) : 0;
    
    const elements = {
        presentCount: present, absentCount: absent, lateCount: late, excusedCount: excused,
        presentPercent: `${presentPercent}%`, absentPercent: `${absentPercent}%`,
        latePercent: `${latePercent}%`, excusedPercent: `${excusedPercent}%`
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    }
}

// ============================================
// ACTION FUNCTIONS
// ============================================

window.markAsPresent = async function(id) {
    await updateAttendance(id, { status: 'Present' });
    await loadAttendanceTable();
    Swal.fire({ title: 'Updated', text: 'Marked as Present', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.markAsAbsent = async function(id) {
    await updateAttendance(id, { status: 'Absent' });
    await loadAttendanceTable();
    Swal.fire({ title: 'Updated', text: 'Marked as Absent', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.markAsLate = async function(id) {
    await updateAttendance(id, { status: 'Late' });
    await loadAttendanceTable();
    Swal.fire({ title: 'Updated', text: 'Marked as Late', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.markAsExcused = async function(id) {
    await updateAttendance(id, { status: 'Excused' });
    await loadAttendanceTable();
    Swal.fire({ title: 'Updated', text: 'Marked as Excused', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.updateRemarkRecord = async function(id, remark) {
    await updateAttendance(id, { remarks: remark });
};

// ============================================
// FILTER FUNCTIONS
// ============================================

window.filterAttendanceRecords = function() {
    loadAttendanceTable();
};

window.clearAttendanceFilters = function() {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterClass').value = '';
    document.getElementById('filterStudent').value = '';
    loadAttendanceTable();
};

window.refreshAttendanceTable = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadAttendanceTable();
    Swal.close();
    Swal.fire('Refreshed!', 'Attendance table updated.', 'success');
};

// ============================================
// SINGLE ATTENDANCE MODAL
// ============================================

window.showSingleAttendanceModal = async function() {
    await getStudentsForAttendance();
    
    let studentOptions = '';
    for (const s of allStudentsList) {
        studentOptions += `<option value="${s.id}">${escapeHtml(s.name)} (${s.class} - ${s.stream || 'No Stream'})</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-calendar-check"></i> Mark Single Attendance',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-bold">Select Student *</label>
                    <select id="singleStudent" class="form-select">${studentOptions}</select>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Date</label>
                        <input type="date" id="singleDate" class="form-control" value="${getCurrentDate()}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Status</label>
                        <select id="singleStatus" class="form-select">
                            <option value="Present">✅ Present</option>
                            <option value="Absent">❌ Absent</option>
                            <option value="Late">⏰ Late</option>
                            <option value="Excused">📝 Excused</option>
                        </select>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Remarks</label>
                    <textarea id="singleRemarks" class="form-control" rows="2" placeholder="Optional remarks..."></textarea>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: 'Save',
        preConfirm: async () => {
            const studentId = document.getElementById('singleStudent').value;
            const attendanceDate = document.getElementById('singleDate').value;
            
            if (!studentId) {
                Swal.showValidationMessage('Please select a student');
                return false;
            }
            
            const existing = await checkExistingAttendance(studentId, attendanceDate);
            if (existing) {
                Swal.showValidationMessage(`⚠️ Already marked as ${existing.status} on this date. Use action buttons to change status.`);
                return false;
            }
            
            return {
                student_id: studentId,
                attendance_date: attendanceDate,
                status: document.getElementById('singleStatus').value,
                remarks: document.getElementById('singleRemarks').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                await addAttendance(result.value);
                Swal.fire('Success!', 'Attendance recorded.', 'success');
                await loadAttendanceTable();
            } catch (error) {
                Swal.fire('Error!', error.message, 'error');
            }
        }
    });
};
// ============================================
// BULK MARK ATTENDANCE MODAL - COMPLETE WORKING
// ============================================

window.showBulkAttendanceModal = async function() {
    await getStudentsForAttendance();
    
    const classOptions = currentLevel === 'olevel' 
        ? ['S.1', 'S.2', 'S.3', 'S.4']
        : ['S.5', 'S.6'];
    
    Swal.fire({
        title: '<i class="fas fa-users"></i> Bulk Mark Attendance',
        html: `
            <div class="text-start">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Select Class *</label>
                        <select id="bulkClass" class="form-select">
                            <option value="">-- Select Class --</option>
                            ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Date</label>
                        <input type="date" id="bulkDate" class="form-control" value="${getCurrentDate()}">
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Quick Actions</label>
                        <div>
                            <button type="button" class="btn btn-sm btn-success" onclick="setAllStatusTo('Present')">All Present</button>
                            <button type="button" class="btn btn-sm btn-danger" onclick="setAllStatusTo('Absent')">All Absent</button>
                            <button type="button" class="btn btn-sm btn-warning" onclick="setAllStatusTo('Late')">All Late</button>
                            <button type="button" class="btn btn-sm btn-info" onclick="setAllStatusTo('Excused')">All Excused</button>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Default Remarks</label>
                        <input type="text" id="defaultRemarks" class="form-control" placeholder="Optional remark">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">&nbsp;</label>
                        <button type="button" class="btn btn-sm btn-outline-secondary w-100" onclick="applyRemarksToAll()">
                            <i class="fas fa-copy"></i> Apply Remarks
                        </button>
                    </div>
                </div>
                <div class="mb-3">
                    <div id="bulkStudentsList" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px; background: #f9f9f9;">
                        <p class="text-muted text-center">Select a class to load students</p>
                    </div>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> Students already marked for this date will be skipped automatically.
                </div>
            </div>
        `,
        width: '900px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Save All',
        didOpen: () => {
            const classSelect = document.getElementById('bulkClass');
            const studentsDiv = document.getElementById('bulkStudentsList');
            
            classSelect.onchange = async () => {
                const className = classSelect.value;
                if (!className) {
                    studentsDiv.innerHTML = '<p class="text-muted text-center">Select a class to load students</p>';
                    return;
                }
                
                studentsDiv.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading students...</p>';
                
                const { data: students, error } = await sb
                    .from('students')
                    .select('*')
                    .eq('class', className);
                
                if (error || !students || students.length === 0) {
                    studentsDiv.innerHTML = '<p class="text-danger text-center">No students found</p>';
                    return;
                }
                
                const bulkDate = document.getElementById('bulkDate').value;
                
                const existingMap = {};
                for (const student of students) {
                    const existing = await checkExistingAttendance(student.id, bulkDate);
                    if (existing) {
                        existingMap[student.id] = existing.status;
                    }
                }
                
                let html = `
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th width="30"><input type="checkbox" id="selectAllBulk" checked></th>
                                <th>#</th>
                                <th>Student Name</th>
                                <th>Admission No</th>
                                <th>Stream</th>
                                <th>Status</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                for (let i = 0; i < students.length; i++) {
                    const s = students[i];
                    const hasExisting = existingMap[s.id];
                    const disabledAttr = hasExisting ? 'disabled' : '';
                    const disabledText = hasExisting ? ` <small class="text-danger">(Already: ${hasExisting})</small>` : '';
                    
                    html += `
                        <tr>
                            <td class="text-center"><input type="checkbox" class="bulkStudentCheck" data-id="${s.id}" ${disabledAttr} ${!hasExisting ? 'checked' : ''}></td>
                            <td class="text-center">${i + 1}${disabledText}</td>
                            <td><strong>${escapeHtml(s.name)}</strong>${disabledText}</span></td>
                            <td>${s.admission_no || '-'}</td>
                            <td>${s.stream || '-'}</td>
                            <td>
                                <select class="form-select form-select-sm bulkStatus" data-student="${s.id}" style="width: 130px;" ${disabledAttr}>
                                    <option value="Present">✅ Present</option>
                                    <option value="Absent">❌ Absent</option>
                                    <option value="Late">⏰ Late</option>
                                    <option value="Excused">📝 Excused</option>
                                </select>
                             </span></td>
                            <td>
                                <input type="text" class="form-control form-control-sm bulkRemark" data-student="${s.id}" placeholder="Remarks" style="width: 140px;" ${disabledAttr}>
                             </span></td>
                        </tr>
                    `;
                }
                
                html += `</tbody></table>`;
                studentsDiv.innerHTML = html;
                
                document.getElementById('selectAllBulk').onclick = () => {
                    document.querySelectorAll('.bulkStudentCheck:not([disabled])').forEach(cb => cb.checked = event.target.checked);
                };
            };
        },
        preConfirm: () => {
            const className = document.getElementById('bulkClass').value;
            if (!className) {
                Swal.showValidationMessage('Please select a class');
                return false;
            }
            
            const checkboxes = document.querySelectorAll('.bulkStudentCheck:checked:not([disabled])');
            if (checkboxes.length === 0) {
                Swal.showValidationMessage('No new students to mark. All students may already have attendance for this date.');
                return false;
            }
            
            const studentsData = [];
            for (const cb of checkboxes) {
                const studentId = cb.dataset.id;
                const statusSelect = document.querySelector(`.bulkStatus[data-student="${studentId}"]`);
                const remarkInput = document.querySelector(`.bulkRemark[data-student="${studentId}"]`);
                studentsData.push({
                    student_id: studentId,
                    status: statusSelect ? statusSelect.value : 'Present',
                    remarks: remarkInput ? remarkInput.value : ''
                });
            }
            
            return {
                students: studentsData,
                date: document.getElementById('bulkDate').value
            };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            let success = 0, errors = 0, skipped = 0;
            for (const student of result.value.students) {
                try {
                    await addAttendance({
                        student_id: student.student_id,
                        attendance_date: result.value.date,
                        status: student.status,
                        remarks: student.remarks || 'Bulk attendance'
                    });
                    success++;
                } catch (error) {
                    if (error.message.includes('Already marked')) {
                        skipped++;
                    } else {
                        errors++;
                    }
                }
            }
            
            let message = `✅ ${success} saved | ❌ ${errors} failed`;
            if (skipped > 0) message += ` | ⏭️ ${skipped} already existed`;
            
            Swal.fire('Complete!', message, errors > 0 ? 'warning' : 'success');
            await loadAttendanceTable();
        }
    });
};

// Bulk modal helper functions
window.setAllStatusTo = function(status) {
    document.querySelectorAll('.bulkStatus:not([disabled])').forEach(select => select.value = status);
};

window.applyRemarksToAll = function() {
    const defaultRemark = document.getElementById('defaultRemarks')?.value || '';
    document.querySelectorAll('.bulkRemark:not([disabled])').forEach(input => input.value = defaultRemark);
};

// ============================================
// PRINT ATTENDANCE REPORT - COMPLETE WORKING
// ============================================

window.printAttendanceReport = async function() {
    await getAttendance();
    await getStudentsForAttendance();
    await loadSchoolSettingsForAttendance();
    
    const classOptions = currentLevel === 'olevel' 
        ? ['S.1', 'S.2', 'S.3', 'S.4']
        : ['S.5', 'S.6'];
    
    const { value: printData } = await Swal.fire({
        title: 'Print Attendance Report',
        html: `
            <div class="text-start">
                <label class="form-label fw-bold">Class</label>
                <select id="printClass" class="form-select mb-3">
                    <option value="">All Classes</option>
                    ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <label class="form-label fw-bold">From Date</label>
                <input type="date" id="printFrom" class="form-control mb-3">
                <label class="form-label fw-bold">To Date</label>
                <input type="date" id="printTo" class="form-control" value="${getCurrentDate()}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Print',
        preConfirm: () => ({
            className: document.getElementById('printClass').value,
            fromDate: document.getElementById('printFrom').value,
            toDate: document.getElementById('printTo').value
        })
    });
    
    if (printData) {
        const currentLevelStudents = getStudentsByLevel();
        let filteredAttendance = allAttendance.filter(a => {
            const student = allStudentsList.find(s => s.id === a.student_id);
            if (!student || !currentLevelStudents.some(s => s.id === student.id)) return false;
            if (printData.className && student.class !== printData.className) return false;
            if (printData.fromDate && a.attendance_date < printData.fromDate) return false;
            if (printData.toDate && a.attendance_date > printData.toDate) return false;
            return true;
        });
        
        const studentStats = {};
        for (const a of filteredAttendance) {
            const student = allStudentsList.find(s => s.id === a.student_id);
            if (!student) continue;
            
            if (!studentStats[student.id]) {
                studentStats[student.id] = {
                    name: student.name,
                    admission_no: student.admission_no || '-',
                    class: student.class,
                    stream: student.stream || '-',
                    present: 0, absent: 0, late: 0, excused: 0, total: 0
                };
            }
            
            studentStats[student.id].total++;
            if (a.status === 'Present') studentStats[student.id].present++;
            else if (a.status === 'Absent') studentStats[student.id].absent++;
            else if (a.status === 'Late') studentStats[student.id].late++;
            else if (a.status === 'Excused') studentStats[student.id].excused++;
        }
        
        const printWindow = window.open('', '_blank');
        const currentDate = new Date().toLocaleDateString('en-GB');
        const logoUrl = schoolSettings.school_logo || '';
        
        let tableRows = '';
        for (const stats of Object.values(studentStats)) {
            const percentage = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : 0;
            tableRows += `
                <tr>
                    <td>${stats.admission_no}</span></td>
                    <td><strong>${escapeHtml(stats.name)}</strong></span></td>
                    <td>${stats.class} - ${stats.stream}</span></td>
                    <td class="text-center">${stats.total}</span></td>
                    <td class="text-center text-success">${stats.present}</span></td>
                    <td class="text-center text-danger">${stats.absent}</span></td>
                    <td class="text-center text-warning">${stats.late}</span></td>
                    <td class="text-center text-info">${stats.excused}</span></td>
                    <td class="text-center"><strong>${percentage}%</strong></span></td>
                </tr>
            `;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Attendance Report</title>
                <style>
                    @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                    body { font-family: Arial, sans-serif; padding: 20px; position: relative; }
                    .watermark {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        opacity: 0.08;
                        z-index: -1;
                        width: 40%;
                        max-width: 300px;
                    }
                    .header { text-align: center; margin-bottom: 20px; }
                    .school-name { color: #01605a; font-size: 24px; font-weight: bold; }
                    .school-motto { font-size: 12px; color: #666; font-style: italic; margin-top: 5px; }
                    .report-title { font-size: 18px; font-weight: bold; margin: 15px 0 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; }
                    th { background: #01605a; color: white; }
                    .footer { margin-top: 30px; text-align: center; font-size: 10px; }
                    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
                    .school-logo { max-width: 60px; max-height: 60px; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                ${logoUrl ? `<img src="${logoUrl}" class="watermark" alt="School Logo">` : ''}
                <div class="header">
                    ${logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="Logo">` : ''}
                    <div class="school-name">${escapeHtml(schoolSettings.school_name || 'UGANDA SCHOOL SYSTEM')}</div>
                    <div class="school-motto">${escapeHtml(schoolSettings.school_motto || 'Education for All')}</div>
                    <div class="report-title">ATTENDANCE REPORT</div>
                    <p>Class: ${printData.className || 'All Classes'} | Period: ${printData.fromDate || 'Start'} to ${printData.toDate || getCurrentDate()}</p>
                    <p>Generated: ${currentDate}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Adm No</th>
                            <th>Student Name</th>
                            <th>Class</th>
                            <th>Total Days</th>
                            <th>Present</th>
                            <th>Absent</th>
                            <th>Late</th>
                            <th>Excused</th>
                            <th>Attendance %</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="signature">
                    <div>_________________<br>Class Teacher</div>
                    <div>_________________<br>${escapeHtml(schoolSettings.principal_name || 'Principal')}</div>
                </div>
                <div class="footer">
                    <p>This is a system-generated attendance report.</p>
                </div>
                <div class="no-print" style="text-align:center; margin-top:20px;">
                    <button onclick="window.print()">🖨️ Print</button>
                    <button onclick="window.close()">❌ Close</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
};

// ============================================
// DELETE FUNCTIONS
// ============================================

window.deleteAttendanceRecord = async function(id) {
    const result = await Swal.fire({
        title: 'Delete Record?', text: 'This cannot be undone!', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await deleteAttendance(id);
            Swal.fire('Deleted!', 'Record deleted.', 'success');
            await loadAttendanceTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

window.bulkDeleteAttendanceRecords = async function() {
    const checkboxes = document.querySelectorAll('.attendanceCheck:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    if (ids.length === 0) {
        Swal.fire('Error', 'No records selected', 'error');
        return;
    }
    const result = await Swal.fire({
        title: `Delete ${ids.length} records?`, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes, delete'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            for (const id of ids) await deleteAttendance(id);
            Swal.fire('Deleted!', `${ids.length} records deleted.`, 'success');
            await loadAttendanceTable();
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// ============================================
// INITIALIZATION
// ============================================

console.log('✅ Attendance Module Loaded - Table Working Properly');
// ============================================
// SCHOOL MANAGEMENT SYSTEM - REPORTS MODULE
// FINAL MASTERPIECE
// Complete Fee Calculation | Class Teacher | Academic Terms
// ============================================

// ============================================
// GLOBAL VARIABLES
// ============================================

let reportsStudentsList = [];
let reportsPrincipalGradingRules = [];
let reportsSubsidiaryGradingRules = [];
let reportsUniversityEntry = {};
let schoolInfo = {};
let feeStructureData = [];
let academicTermsList = [];

// Subsidiary subjects list
const subsidiarySubjectsList = ['General Paper', 'ICT', 'Subsidiary Mathematics'];
const termOrder = ['Term 1', 'Term 2', 'Term 3'];

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(amount) {
    return 'UGX ' + (amount || 0).toLocaleString();
}

function getCurrentDate() {
    return new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// ============================================
// LOAD SCHOOL SETTINGS (includes class teachers)
// ============================================

async function loadSchoolInfoForReport() {
    try {
        const { data, error } = await sb
            .from('school_settings')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        
        schoolInfo = data || {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_address: 'Kampala, Uganda',
            school_phone: '+256 XXX XXX XXX',
            school_email: 'info@school.ug',
            school_logo: '',
            principal_name: 'Principal',
            director_name: 'Director',
            bursar_name: 'Bursar'
        };
        return schoolInfo;
    } catch (error) {
        console.error('Error loading school settings:', error);
        schoolInfo = {
            school_name: 'Uganda School System',
            school_motto: 'Education for All',
            school_address: 'Kampala, Uganda',
            school_phone: '+256 XXX XXX XXX',
            school_email: 'info@school.ug',
            principal_name: 'Principal',
            director_name: 'Director',
            bursar_name: 'Bursar'
        };
        return schoolInfo;
    }
}

// ============================================
// GET CLASS TEACHER FROM SCHOOL SETTINGS
// ============================================

function getClassTeacher(student) {
    if (!student) return 'Not Assigned';
    
    const classLetter = student.class;
    const stream = student.stream || '';
    const classNumber = classLetter.replace('S.', '');
    
    let teacherKey = '';
    
    if (currentLevel === 'olevel') {
        const streamLower = stream.toLowerCase();
        teacherKey = `teacher_s${classNumber}_${streamLower}`;
    } else {
        const streamLower = stream.toLowerCase();
        teacherKey = `teacher_s${classNumber}_${streamLower}`;
    }
    
    const teacherName = schoolInfo[teacherKey];
    
    if (teacherName && teacherName !== '') {
        return teacherName;
    }
    
    for (const [key, value] of Object.entries(schoolInfo)) {
        if (key.startsWith(`teacher_s${classNumber}_`) && value) {
            return value;
        }
    }
    
    return 'Not Assigned';
}

// ============================================
// LOAD ACADEMIC TERMS
// ============================================

async function loadAcademicTermsForReports() {
    try {
        const { data, error } = await sb
            .from('academic_terms')
            .select('*')
            .order('year', { ascending: false })
            .order('term_number', { ascending: true });
        
        if (error) throw error;
        
        academicTermsList = data || [];
        return academicTermsList;
    } catch (error) {
        console.error('Error loading academic terms:', error);
        academicTermsList = [];
        return [];
    }
}

// ============================================
// LOAD FEE STRUCTURE
// ============================================

async function loadFeeStructureForReport() {
    try {
        const { data, error } = await sb
            .from('fee_structure')
            .select('*');
        
        if (error) throw error;
        feeStructureData = data || [];
        return feeStructureData;
    } catch (error) {
        console.error('Error loading fee structure:', error);
        return [];
    }
}

// ============================================
// GET TOTAL FEE FOR A STUDENT
// ============================================

// ============================================
// FIXED: GET TOTAL FEE FOR A STUDENT (Works for A-Level with streams)
// ============================================

async function getTotalFeeForStudent(student) {
    if (!student) return 0;
    
    // Normalize student type
    let studentType = student.student_type || 'Day';
    studentType = studentType.charAt(0).toUpperCase() + studentType.slice(1).toLowerCase();
    
    // Build possible class names to try
    let possibleClassNames = [student.class];
    
    // For A-Level, also try with stream appended
    if (currentLevel === 'alevel') {
        let stream = student.stream || 'Arts';
        stream = stream.charAt(0).toUpperCase() + stream.slice(1).toLowerCase();
        
        // Try "S.5 Arts" format
        possibleClassNames.push(`${student.class} ${stream}`);
        
        // Also try the class name as stored in fee_structure (might be like "S.5 Arts" already)
        if (student.class.includes(' ')) {
            possibleClassNames.push(student.class);
        }
    }
    
    // Remove duplicates
    possibleClassNames = [...new Set(possibleClassNames)];
    
    // Try to find fees
    let studentFees = [];
    let matchedClassName = '';
    
    for (const className of possibleClassNames) {
        studentFees = feeStructureData.filter(f => 
            f.class_name === className && 
            f.student_type === studentType
        );
        
        if (studentFees.length > 0) {
            matchedClassName = className;
            break;
        }
    }
    
    // If still no fees, try without student type filter
    if (studentFees.length === 0) {
        for (const className of possibleClassNames) {
            studentFees = feeStructureData.filter(f => f.class_name === className);
            if (studentFees.length > 0) {
                matchedClassName = className;
                break;
            }
        }
    }
    
    const total = studentFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    
    if (total === 0) {
        console.warn(`No fee found for student ${student.name}. Tried class names:`, possibleClassNames);
        console.log('Available fee structure classes:', [...new Set(feeStructureData.map(f => f.class_name))]);
    }
    
    return total;
}

// ============================================
// LOAD ALL PAYMENTS
// ============================================

async function loadAllPaymentsForReport() {
    try {
        const { data, error } = await sb
            .from('payments')
            .select('*')
            .order('payment_date', { ascending: true });
        
        if (error) throw error;
        allPaymentsList = data || [];
        return allPaymentsList;
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

// ============================================
// LOAD STUDENTS
// ============================================

async function loadStudentsForReport() {
    try {
        let classList = currentLevel === 'olevel' 
            ? ['S.1', 'S.2', 'S.3', 'S.4']
            : ['S.5', 'S.6'];
        
        const { data, error } = await sb
            .from('students')
            .select('*')
            .in('class', classList)
            .order('name');
        
        if (error) throw error;
        reportsStudentsList = data || [];
        return reportsStudentsList;
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

// ============================================
// LOAD GRADING RULES
// ============================================

async function loadGradingRulesForReport() {
    try {
        if (currentLevel === 'olevel') {
            const { data, error } = await sb
                .from('olevel_grades')
                .select('*')
                .order('points', { ascending: true });
            
            if (error) throw error;
            reportsPrincipalGradingRules = data || [];
            reportsSubsidiaryGradingRules = [];
        } else {
            const { data: principal, error: principalError } = await sb
                .from('alevel_principal_grades')
                .select('*')
                .order('points', { ascending: false });
            
            if (principalError) throw principalError;
            reportsPrincipalGradingRules = principal || [];
            
            const { data: subsidiary, error: subsidiaryError } = await sb
                .from('alevel_subsidiary_grades')
                .select('*')
                .order('points', { ascending: false });
            
            if (subsidiaryError) throw subsidiaryError;
            reportsSubsidiaryGradingRules = subsidiary || [];
        }
        return true;
    } catch (error) {
        console.error('Error loading grading rules:', error);
        return false;
    }
}

// ============================================
// LOAD UNIVERSITY ENTRY REQUIREMENTS
// ============================================

async function loadUniversityEntryRequirements() {
    try {
        const { data, error } = await sb
            .from('alevel_university_entry')
            .select('*')
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        
        reportsUniversityEntry = data || {
            minimum_points: 12,
            minimum_principal_passes: 2,
            minimum_gp: 3.0,
            require_general_paper: false
        };
        
        return reportsUniversityEntry;
    } catch (error) {
        console.error('Error loading university entry:', error);
        reportsUniversityEntry = {
            minimum_points: 12,
            minimum_principal_passes: 2,
            minimum_gp: 3.0,
            require_general_paper: false
        };
        return reportsUniversityEntry;
    }
}

// ============================================
// GET GRADE AND POINTS
// ============================================

function getGradeAndPointsFromSettings(percentage, subjectName = '') {
    let rules = [];
    
    if (currentLevel === 'olevel') {
        rules = reportsPrincipalGradingRules;
    } else {
        const isSubsidiary = subsidiarySubjectsList.includes(subjectName);
        rules = isSubsidiary ? reportsSubsidiaryGradingRules : reportsPrincipalGradingRules;
    }
    
    if (!rules || rules.length === 0) {
        return { grade: '?', points: 0, color: '#6c757d', remark: 'No rules' };
    }
    
    for (const rule of rules) {
        if (percentage >= rule.min_percentage && percentage <= rule.max_percentage) {
            return {
                grade: rule.grade,
                points: rule.points,
                color: rule.color_code || '#2ecc71',
                remark: rule.remark || ''
            };
        }
    }
    
    return { grade: '?', points: 0, color: '#6c757d', remark: 'Not found' };
}

// ============================================
// CALCULATE O-LEVEL FINAL SCORE
// ============================================

function calculateOlevelFinalScore(caScore, examScore) {
    return (caScore * 0.2) + (examScore * 0.8);
}

// ============================================
// LOAD MARKS WITH GRADES
// ============================================

async function loadMarksForReport(studentId, exam, year) {
    try {
        const { data, error } = await sb
            .from('marks')
            .select('*')
            .eq('student_id', studentId)
            .eq('exam', exam)
            .eq('year', year);
        
        if (error) throw error;
        
        return (data || []).map(m => {
            let percentage;
            if (currentLevel === 'olevel') {
                const caScore = m.ca_score || 0;
                const examScore = m.exam_score || 0;
                percentage = calculateOlevelFinalScore(caScore, examScore);
            } else {
                percentage = (m.marks_obtained / m.max_marks) * 100;
            }
            const gradeInfo = getGradeAndPointsFromSettings(percentage, m.subject);
            return {
                ...m,
                percentage: percentage,
                grade: gradeInfo.grade,
                points: gradeInfo.points,
                color: gradeInfo.color
            };
        });
    } catch (error) {
        console.error('Error loading marks:', error);
        return [];
    }
}

// ============================================
// CALCULATE STUDENT FEE STATUS (CORRECT LOGIC)
// Priority: 1. Past debts -> 2. Current term -> 3. Forward excess
// ============================================

// ============================================
// FIXED: CALCULATE STUDENT FEE STATUS WITH PROPER CARRY FORWARD
// Priority: 1. Past debts (previous years) -> 2. Previous terms (same year) -> 3. Current term
// Excess from any term carries forward to next term
// ============================================

async function calculateStudentFeeStatusForReport(studentId, targetYear, targetTerm) {
    const student = reportsStudentsList.find(s => s.id === studentId);
    if (!student) return null;
    
    const termFee = await getTotalFeeForStudent(student);
    
    if (termFee === 0) {
        return {
            termFee: 0,
            expected: 0,
            paid: 0,
            balance: 0,
            previousYearsDebt: 0,
            previousYearsCredit: 0,
            previousTermsDebt: 0,
            previousTermsCredit: 0,
            currentTermPaid: 0,
            status: 'NO_FEE',
            statusColor: '#ffc107',
            statusBadge: '⚠️ No Fee Set',
            student: student
        };
    }
    
    const termOrder = ['Term 1', 'Term 2', 'Term 3'];
    const currentTermIndex = termOrder.indexOf(targetTerm);
    
    // ============================================
    // STEP 1: Calculate balance from PREVIOUS YEARS
    // ============================================
    let previousYearsBalance = 0; // Positive = debt, Negative = credit
    
    const allYears = [...new Set(allPaymentsList.filter(p => p.student_id === studentId).map(p => parseInt(p.year)))].sort();
    
    for (const year of allYears) {
        if (year < parseInt(targetYear)) {
            let yearTotalFee = 0;
            let yearTotalPaid = 0;
            
            for (const term of termOrder) {
                yearTotalFee += termFee;
                const termPayments = allPaymentsList.filter(p => 
                    p.student_id === studentId && 
                    p.year === year.toString() && 
                    p.term === term
                );
                yearTotalPaid += termPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            }
            
            const yearBalance = yearTotalFee - yearTotalPaid;
            previousYearsBalance += yearBalance;
        }
    }
    
    const previousYearsDebt = previousYearsBalance > 0 ? previousYearsBalance : 0;
    const previousYearsCredit = previousYearsBalance < 0 ? Math.abs(previousYearsBalance) : 0;
    
    // ============================================
    // STEP 2: Calculate balance from PREVIOUS TERMS in same year
    // ============================================
    let previousTermsBalance = 0; // Positive = debt, Negative = credit
    
    for (let i = 0; i < currentTermIndex; i++) {
        const prevTerm = termOrder[i];
        const prevTermPayments = allPaymentsList.filter(p => 
            p.student_id === studentId && 
            p.year === targetYear && 
            p.term === prevTerm
        );
        const prevTermPaid = prevTermPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        const prevTermBalance = termFee - prevTermPaid;
        previousTermsBalance += prevTermBalance;
    }
    
    const previousTermsDebt = previousTermsBalance > 0 ? previousTermsBalance : 0;
    const previousTermsCredit = previousTermsBalance < 0 ? Math.abs(previousTermsBalance) : 0;
    
    // ============================================
    // STEP 3: Get current term payments
    // ============================================
    const currentTermPayments = allPaymentsList.filter(p => 
        p.student_id === studentId && 
        p.year === targetYear && 
        p.term === targetTerm
    );
    const currentTermPaid = currentTermPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // ============================================
    // STEP 4: Calculate TOTAL BALANCE BROUGHT FORWARD
    // This is the amount the student owes from before this term
    // ============================================
    const totalCarryForward = previousYearsBalance + previousTermsBalance;
    
    // ============================================
    // STEP 5: Calculate what the student needs to pay this term
    // If they have credit, it reduces what they owe
    // ============================================
    let amountNeededForCurrentTerm = termFee;
    let remainingCredit = 0;
    
    if (totalCarryForward < 0) {
        // Student has credit from before
        const creditAmount = Math.abs(totalCarryForward);
        if (creditAmount >= termFee) {
            // Credit covers full term fee
            amountNeededForCurrentTerm = 0;
            remainingCredit = creditAmount - termFee;
        } else {
            // Credit partially covers term fee
            amountNeededForCurrentTerm = termFee - creditAmount;
            remainingCredit = 0;
        }
    } else if (totalCarryForward > 0) {
        // Student has debt from before - they need to pay that too
        amountNeededForCurrentTerm = termFee + totalCarryForward;
    }
    
    // ============================================
    // STEP 6: Calculate current balance
    // ============================================
    let balance = amountNeededForCurrentTerm - currentTermPaid;
    
    // If there's remaining credit from before, it gets added to balance (negative = credit)
    if (remainingCredit > 0) {
        balance = balance - remainingCredit;
    }
    
    // ============================================
    // STEP 7: Calculate total expected and total paid for display
    // ============================================
    let totalExpected = termFee;
    let totalPaid = currentTermPaid;
    
    // Apply previous credits if any
    if (previousYearsCredit > 0 || previousTermsCredit > 0) {
        const totalCredit = previousYearsCredit + previousTermsCredit;
        totalPaid += totalCredit;
    }
    
    // Add previous debts to expected
    if (previousYearsDebt > 0) totalExpected += previousYearsDebt;
    if (previousTermsDebt > 0) totalExpected += previousTermsDebt;
    
    // ============================================
    // STEP 8: Determine STATUS
    // ============================================
    let status = '', statusColor = '', statusBadge = '';
    
    if (balance <= 0) {
        status = 'CLEARED';
        statusColor = '#28a745';
        statusBadge = '✅ Fully Paid';
    } else if (balance < totalExpected * 0.5) {
        status = 'PARTIAL';
        statusColor = '#ffc107';
        statusBadge = '⚠️ Partially Paid';
    } else {
        status = 'DEFAULTER';
        statusColor = '#dc3545';
        statusBadge = '❌ Defaulter';
    }
    
    // For display, make balance positive for "Due" and negative for "Credit"
    const displayBalance = balance;
    
    return {
        termFee: termFee,
        expected: totalExpected,
        paid: totalPaid,
        balance: displayBalance,
        previousYearsDebt: previousYearsDebt,
        previousYearsCredit: previousYearsCredit,
        previousTermsDebt: previousTermsDebt,
        previousTermsCredit: previousTermsCredit,
        currentTermPaid: currentTermPaid,
        totalCarryForward: totalCarryForward,
        remainingCredit: remainingCredit,
        status: status,
        statusColor: statusColor,
        statusBadge: statusBadge,
        student: student
    };
}

// ============================================
// CHECK UNIVERSITY ELIGIBILITY
// ============================================

function checkUniversityEligibility(totalPoints, subjectMarks) {
    if (currentLevel !== 'alevel') return null;
    
    let eligible = true;
    let reasons = [];
    
    if (totalPoints < reportsUniversityEntry.minimum_points) {
        eligible = false;
        reasons.push(`Minimum points required: ${reportsUniversityEntry.minimum_points} (You have ${totalPoints})`);
    }
    
    let principalPasses = 0;
    for (const mark of subjectMarks) {
        const isSubsidiary = subsidiarySubjectsList.includes(mark.subject);
        if (!isSubsidiary && mark.grade && mark.grade !== 'F' && mark.grade !== 'O' && mark.grade !== 'U') {
            principalPasses++;
        }
    }
    
    if (principalPasses < reportsUniversityEntry.minimum_principal_passes) {
        eligible = false;
        reasons.push(`Minimum principal passes required: ${reportsUniversityEntry.minimum_principal_passes} (You have ${principalPasses})`);
    }
    
    if (reportsUniversityEntry.require_general_paper) {
        const hasGP = subjectMarks.some(m => m.subject === 'General Paper' && m.grade && m.grade !== 'F' && m.grade !== 'U');
        if (!hasGP) {
            eligible = false;
            reasons.push(`General Paper is required for university admission`);
        }
    }
    
    return {
        eligible: eligible,
        reasons: reasons,
        required_points: reportsUniversityEntry.minimum_points,
        your_points: totalPoints,
        required_passes: reportsUniversityEntry.minimum_principal_passes,
        your_passes: principalPasses
    };
}

// ============================================
// CHECK O-LEVEL PROMOTION
// ============================================

function checkOlevelPromotion(averagePercentage, studentClass) {
    if (currentLevel !== 'olevel') return null;
    
    let promoted = false;
    let nextClass = '';
    let remarks = '';
    
    if (averagePercentage >= 50) {
        promoted = true;
        remarks = '✅ Passed - Eligible for promotion';
        
        if (studentClass === 'S.1') nextClass = 'S.2';
        else if (studentClass === 'S.2') nextClass = 'S.3';
        else if (studentClass === 'S.3') nextClass = 'S.4';
        else if (studentClass === 'S.4') {
            nextClass = 'S.5 (A-Level)';
            remarks = '✅ Completed O-Level - Eligible for A-Level';
        }
        else nextClass = 'Completed';
    } else {
        promoted = false;
        remarks = '❌ Failed - Needs to repeat the class';
        nextClass = studentClass + ' (Repeat)';
    }
    
    return {
        promoted: promoted,
        next_class: nextClass,
        average: averagePercentage,
        remarks: remarks,
        is_final_term: true
    };
}

// ============================================
// CALCULATE GRADE DIVISION
// ============================================

function calculateGradeDivision(averagePercentage, totalPoints) {
    if (currentLevel === 'olevel') {
        if (averagePercentage >= 80) return { division: 'I', name: 'Division I - Distinction', color: '#2ecc71', description: 'Excellent Performance' };
        if (averagePercentage >= 70) return { division: 'II', name: 'Division II - Credit', color: '#3498db', description: 'Very Good Performance' };
        if (averagePercentage >= 60) return { division: 'III', name: 'Division III - Pass', color: '#f39c12', description: 'Satisfactory Performance' };
        if (averagePercentage >= 50) return { division: 'IV', name: 'Division IV - Minimum Pass', color: '#e67e22', description: 'Minimum Pass' };
        return { division: 'FAIL', name: 'Failed', color: '#e74c3c', description: 'Below Minimum Requirements' };
    } else {
        if (totalPoints >= 18) return { division: 'I', name: 'Division I - Distinction', color: '#2ecc71', description: 'Excellent Performance' };
        if (totalPoints >= 15) return { division: 'II', name: 'Division II - Credit', color: '#3498db', description: 'Very Good Performance' };
        if (totalPoints >= 12) return { division: 'III', name: 'Division III - Pass', color: '#f39c12', description: 'Good Performance' };
        if (totalPoints >= 9) return { division: 'IV', name: 'Division IV - Minimum Pass', color: '#e67e22', description: 'Minimum Pass' };
        return { division: 'FAIL', name: 'Failed', color: '#e74c3c', description: 'Below Minimum Requirements' };
    }
}

// ============================================
// GET REMARK MESSAGE
// ============================================

function getRemarkMessage(totalPoints, avgPercentage, division) {
    if (division.division === 'I') return '🏆 Excellent Performance! Outstanding academic ability. Keep up the great work!';
    if (division.division === 'II') return '🌟 Very Good Performance! Continue working hard to achieve even better results.';
    if (division.division === 'III') return '📚 Good Performance. You have met the basic requirements. More effort will improve results.';
    if (division.division === 'IV') return '⚠️ Satisfactory Performance. Need more effort to improve grades. Seek help from teachers.';
    return '❌ Needs Improvement. Please work harder and consult with your teachers for support.';
}

// ============================================
// GENERATE REPORT CARD HTML
// ============================================

function generateReportCardHTML(student, marks, exam, year, feeStatus, classTeacher, isForPrint = false) {
    let totalPoints = 0;
    let totalPercentage = 0;
    
    const subjectsHtml = marks.map(m => {
        let percentage = m.percentage;
        
        totalPoints += m.points;
        totalPercentage += percentage;
        
        if (currentLevel === 'olevel') {
            const caScore = m.ca_score || 0;
            const examScore = m.exam_score || 0;
            return `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px 8px;"><strong>${escapeHtml(m.subject)}</strong></td>
                    <td style="padding: 10px 8px; text-align: center;">${caScore.toFixed(1)}</span></td>
                    <td style="padding: 10px 8px; text-align: center;">${examScore.toFixed(1)}</span></td>
                    <td style="padding: 10px 8px; text-align: center;">${percentage.toFixed(1)}%</span></td>
                    <td style="padding: 10px 8px; text-align: center;"><span class="grade-badge" style="background: ${m.color};">${m.grade}</span></span></td>
                    <td style="padding: 10px 8px; text-align: center;"><strong>${m.points}</strong></span></td>
                </tr>
            `;
        } else {
            const finalScore = m.marks_obtained || 0;
            const isSubsidiary = subsidiarySubjectsList.includes(m.subject);
            return `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px 8px;">
                        <strong>${escapeHtml(m.subject)}</strong>
                        ${isSubsidiary ? '<span class="badge bg-secondary ms-2" style="font-size: 10px;">Sub</span>' : ''}
                    </span></td>
                    <td style="padding: 10px 8px; text-align: center;">${finalScore}</span></td>
                    <td style="padding: 10px 8px; text-align: center;">${m.max_marks}</span></td>
                    <td style="padding: 10px 8px; text-align: center;">${percentage.toFixed(1)}%</span></td>
                    <td style="padding: 10px 8px; text-align: center;"><span class="grade-badge" style="background: ${m.color};">${m.grade}</span></span></td>
                    <td style="padding: 10px 8px; text-align: center;"><strong>${m.points}</strong></span></td>
                </tr>
            `;
        }
    }).join('');
    
    const avgPercentage = marks.length > 0 ? (totalPercentage / marks.length).toFixed(1) : 0;
    const division = calculateGradeDivision(avgPercentage, totalPoints);
    const levelName = currentLevel === 'olevel' ? 'UCE REPORT CARD' : 'UACE REPORT CARD';
    
    let universityEligibility = null;
    let promotionStatus = null;
    
    if (currentLevel === 'alevel') {
        universityEligibility = checkUniversityEligibility(totalPoints, marks);
    } else if (exam === 'Term 3') {
        promotionStatus = checkOlevelPromotion(avgPercentage, student.class);
    }
    
    const tableHeaders = currentLevel === 'olevel' 
        ? `<tr style="background: #01605a; color: white;">
            <th style="padding: 10px;">Subject</th>
            <th style="padding: 10px;">CA</th>
            <th style="padding: 10px;">Exam</th>
            <th style="padding: 10px;">%</th>
            <th style="padding: 10px;">Grade</th>
            <th style="padding: 10px;">Points</th>
            </tr>`
        : `<tr style="background: #01605a; color: white;">
            <th style="padding: 10px;">Subject</th>
            <th style="padding: 10px;">Marks</th>
            <th style="padding: 10px;">Max</th>
            <th style="padding: 10px;">%</th>
            <th style="padding: 10px;">Grade</th>
            <th style="padding: 10px;">Points</th>
            </tr>`;
    
    // Fee display section
    let feeDisplay = '';
    if (feeStatus && feeStatus.status !== 'NO_FEE') {
        feeDisplay = `
            <div style="background: ${feeStatus.statusColor}20; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid ${feeStatus.statusColor};">
                <table style="width: 100%; border: none; font-size: 13px;">
                    <tr style="background: #01605a10;">
                        <td colspan="3" style="padding: 8px; text-align: center; font-weight: bold;">💰 FEE STATEMENT FOR ${exam} ${year}</td>
                    </tr>
                    <tr>
                        <td style="width: 45%; padding: 6px;"><strong>Term Fee:</strong></td>
                        <td style="width: 55%; padding: 6px;" colspan="2">${formatCurrency(feeStatus.termFee)}</span></td>
                    </tr>
                    ${feeStatus.previousYearsDebt > 0 ? `
                    <tr style="background: #fff3cd;">
                        <td style="padding: 6px;"><strong>⚠️ Previous Years Debt:</strong></td>
                        <td style="padding: 6px;" colspan="2" class="text-danger">${formatCurrency(feeStatus.previousYearsDebt)}</span></td>
                    </tr>` : ''}
                    ${feeStatus.previousYearsCredit > 0 ? `
                    <tr style="background: #d4edda;">
                        <td style="padding: 6px;"><strong>✅ Previous Years Credit:</strong></td>
                        <td style="padding: 6px;" colspan="2" class="text-success">${formatCurrency(feeStatus.previousYearsCredit)} (Carried Forward)</span></td>
                    </tr>` : ''}
                    ${feeStatus.previousTermsDebt > 0 ? `
                    <tr style="background: #fff3cd;">
                        <td style="padding: 6px;"><strong>⚠️ Previous Terms Debt (${year}):</strong></td>
                        <td style="padding: 6px;" colspan="2" class="text-danger">${formatCurrency(feeStatus.previousTermsDebt)}</span></td>
                    </tr>` : ''}
                    ${feeStatus.previousTermsCredit > 0 ? `
                    <tr style="background: #d4edda;">
                        <td style="padding: 6px;"><strong>✅ Previous Terms Credit (${year}):</strong></td>
                        <td style="padding: 6px;" colspan="2" class="text-success">${formatCurrency(feeStatus.previousTermsCredit)} (Carried Forward)</span></td>
                    </tr>` : ''}
                    <tr style="border-top: 1px solid #ddd;">
                        <td style="padding: 6px;"><strong>Total Expected:</strong></td>
                        <td style="padding: 6px;" colspan="2">${formatCurrency(feeStatus.expected)}</span></td>
                    </tr>
                    <tr>
                        <td style="padding: 6px;"><strong>Paid This Term:</strong></td>
                        <td style="padding: 6px;" colspan="2">${formatCurrency(feeStatus.currentTermPaid)}</span></td>
                    </tr>
                    <tr style="border-top: 1px solid #ddd; background: ${feeStatus.balance > 0 ? '#f8d7da' : '#d4edda'}">
                        <td style="padding: 8px;"><strong>💰 Current Balance:</strong></td>
                        <td style="padding: 8px;" colspan="2">
                            <strong class="${feeStatus.balance > 0 ? 'text-danger' : 'text-success'}">
                                ${formatCurrency(Math.abs(feeStatus.balance))} ${feeStatus.balance > 0 ? '(Due)' : '(Credit - Carries Forward)'}
                            </strong>
                        </span></td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: center; padding-top: 10px;">
                            <span style="background: ${feeStatus.statusColor}; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px;">
                                ${feeStatus.statusBadge}
                            </span>
                        </span></td>
                    </tr>
                </table>
            </div>
        `;
    } else if (feeStatus && feeStatus.status === 'NO_FEE') {
        feeDisplay = `
            <div style="background: #ffc10720; padding: 12px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <div style="text-align: center;">
                    <strong>⚠️ No fee structure found for this student.</strong><br>
                    <small>Please add fee structure in Settings → Fee Structure tab.</small>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="report-container" style="position: relative; background: white; max-width: 950px; margin: 0 auto; border-radius: 15px; overflow: hidden; box-shadow: 0 5px 20px rgba(0,0,0,0.1);">
            ${schoolInfo.school_logo ? `<img src="${schoolInfo.school_logo}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.12; z-index: 0; width: 50%; max-width: 350px;">` : ''}
            
            <div style="position: relative; z-index: 1; padding: 25px;">
                <div style="text-align: center; margin-bottom: 20px; border-bottom: 3px solid #01605a; padding-bottom: 15px;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 15px;">
                        ${schoolInfo.school_logo ? `<img src="${schoolInfo.school_logo}" style="width: 60px; height: 60px; object-fit: contain;">` : ''}
                        <div>
                            <h1 style="color: #01605a; margin: 0; font-size: 22px;">${escapeHtml(schoolInfo.school_name || 'UGANDA SCHOOL SYSTEM')}</h1>
                            <p style="margin: 5px 0 0; font-style: italic;">${escapeHtml(schoolInfo.school_motto || 'Education for All')}</p>
                        </div>
                    </div>
                    <p style="margin: 10px 0 0; font-size: 10px;">${escapeHtml(schoolInfo.school_address || '')} | Tel: ${escapeHtml(schoolInfo.school_phone || '')}</p>
                </div>
                
                <div style="text-align: center; margin-bottom: 15px;">
                    <h2 style="color: #ff862d; margin: 0; font-size: 18px;">${levelName}</h2>
                    <p><strong>${exam} - ${year}</strong> | ${getCurrentDate()}</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 12px; border-radius: 10px; margin-bottom: 20px;">
                    <table style="width: 100%; border: none;">
                        <tr><td style="width: 50%;"><strong>Student:</strong> ${escapeHtml(student.name)}</span><td><strong>Admission No:</strong> ${student.admission_no || '-'}</span></tr>
                        <tr><td><strong>Class:</strong> ${student.class}</span><td><strong>Stream:</strong> ${student.stream || '-'}</span></tr>
                        <tr><td><strong>Type:</strong> ${student.student_type || 'Day'}</span><td><strong>Combination:</strong> ${student.combination || 'N/A'}</span></tr>
                        <tr><td colspan="2"><strong>Class Teacher:</strong> ${escapeHtml(classTeacher)}</span></tr>
                    </table>
                </div>
                
                ${feeDisplay}
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>${tableHeaders}</thead>
                    <tbody>${subjectsHtml}</tbody>
                    <tfoot>
                        <tr style="background: #f0f0f0;">
                            <td colspan="5" style="padding: 10px; text-align: right;"><strong>TOTAL / AVERAGE:</strong></td>
                            <td style="padding: 10px; text-align: center;"><strong>${currentLevel === 'alevel' ? totalPoints + ' pts' : avgPercentage + '%'}</strong></td>
                        </tr>
                    </tfoot>
                </table>
                
                <div style="background: linear-gradient(135deg, #01605a, #ff862d); padding: 15px; border-radius: 10px; margin-bottom: 20px; color: white;">
                    <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
                        <div style="text-align: center;"><div style="font-size: 22px; font-weight: bold;">${currentLevel === 'alevel' ? totalPoints : avgPercentage}%</div><div style="font-size: 11px;">${currentLevel === 'alevel' ? 'POINTS' : 'AVERAGE'}</div></div>
                        <div style="text-align: center;"><div style="font-size: 22px; font-weight: bold; background: rgba(255,255,255,0.2); padding: 0 15px; border-radius: 30px;">${division.division}</div><div style="font-size: 11px;">DIVISION</div></div>
                    </div>
                </div>
                
                <div style="text-align: center; margin-bottom: 15px; padding: 8px; background: ${division.color}20; border-radius: 8px;">
                    <strong>${division.name}:</strong> ${division.description}
                </div>
                
                ${currentLevel === 'alevel' && universityEligibility ? `
                    <div style="text-align: center; margin-bottom: 15px; padding: 8px; border-radius: 8px; background: ${universityEligibility.eligible ? '#d4edda' : '#f8d7da'}; color: ${universityEligibility.eligible ? '#155724' : '#721c24'};">
                        <strong>🏛️ UNIVERSITY ELIGIBILITY: ${universityEligibility.eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE'}</strong>
                        ${!universityEligibility.eligible ? `<br><small>${universityEligibility.reasons.join('; ')}</small>` : `<br><small>Meets the minimum requirement of ${reportsUniversityEntry.minimum_points} points</small>`}
                    </div>
                ` : ''}
                
                ${currentLevel === 'olevel' && promotionStatus ? `
                    <div style="text-align: center; margin-bottom: 15px; padding: 8px; border-radius: 8px; background: ${promotionStatus.promoted ? '#d4edda' : '#f8d7da'}; color: ${promotionStatus.promoted ? '#155724' : '#721c24'};">
                        <strong>🎓 PROMOTION STATUS: ${promotionStatus.promoted ? '✅ PROMOTED' : '❌ NOT PROMOTED'}</strong>
                        <br><small>${promotionStatus.remarks} | Next Class: ${promotionStatus.next_class}</small>
                    </div>
                ` : ''}
                
                <div style="background: #f8f9fa; padding: 12px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #ff862d;">
                    <strong>📝 REMARKS:</strong>
                    <p style="margin: 8px 0 0;">${getRemarkMessage(totalPoints, avgPercentage, division)}</p>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                    <div style="text-align: center;"><div style="width: 150px; border-bottom: 1px solid #000; margin-bottom: 5px;"></div>${escapeHtml(classTeacher)}<br><small>Class Teacher</small></div>
                    <div style="text-align: center;"><div style="width: 150px; border-bottom: 1px solid #000; margin-bottom: 5px;"></div>${escapeHtml(schoolInfo.principal_name || 'Head Teacher')}</div>
                    <div style="text-align: center;"><div style="width: 150px; border-bottom: 1px solid #000; margin-bottom: 5px;"></div>Parent's Signature</div>
                </div>
                
                <div style="text-align: center; font-size: 9px; margin-top: 15px; color: #999;">System-generated report</div>
            </div>
        </div>
        ${!isForPrint ? '<div class="text-center mt-3"><button class="btn btn-success" onclick="printReportCard()"><i class="fas fa-print"></i> Print Report</button></div>' : ''}
    `;
}

// ============================================
// PRINT SINGLE REPORT
// ============================================

window.printReportCard = function() {
    const reportContent = document.querySelector('.report-container');
    if (!reportContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Student Report Card</title>
            <style>
                @media print { body { margin: 0; padding: 0; } }
                body { font-family: 'Times New Roman', Arial, sans-serif; padding: 20px; font-size: 12px; }
                .grade-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: white; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                .report-container { margin: 0 auto; }
            </style>
        </head>
        <body>${reportContent.outerHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
};

// ============================================
// GENERATE SINGLE REPORT
// ============================================

window.generateSingleReport = async function() {
    const studentId = document.getElementById('reportStudent').value;
    const exam = document.getElementById('reportExam').value;
    const year = document.getElementById('reportYear').value;
    
    if (!studentId) {
        Swal.fire('Error', 'Please select a student', 'error');
        return;
    }
    if (!exam) {
        Swal.fire('Error', 'Please select a term/exam', 'error');
        return;
    }
    if (!year) {
        Swal.fire('Error', 'Please enter a year', 'error');
        return;
    }
    
    Swal.fire({ title: 'Generating Report...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        await loadGradingRulesForReport();
        await loadUniversityEntryRequirements();
        await loadFeeStructureForReport();
        await loadAllPaymentsForReport();
        await loadSchoolInfoForReport();
        
        const student = reportsStudentsList.find(s => s.id === studentId);
        const marks = await loadMarksForReport(studentId, exam, year);
        const feeStatus = await calculateStudentFeeStatusForReport(studentId, year, exam);
        const classTeacher = getClassTeacher(student);
        
        if (marks.length === 0) {
            Swal.fire('No Data', `No marks found for ${student?.name} in ${exam} ${year}`, 'info');
            return;
        }
        
        const reportHtml = generateReportCardHTML(student, marks, exam, year, feeStatus, classTeacher);
        document.getElementById('reportPreview').innerHTML = reportHtml;
        document.getElementById('reportPreview').style.display = 'block';
        Swal.close();
        
        document.getElementById('reportPreview').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        Swal.close();
        Swal.fire('Error', error.message, 'error');
    }
};

// ============================================
// GENERATE BULK REPORTS
// ============================================

window.generateBulkReports = async function() {
    const className = document.getElementById('bulkClass').value;
    const stream = document.getElementById('bulkStream').value;
    const exam = document.getElementById('bulkExam').value;
    const year = document.getElementById('bulkYear').value;
    
    if (!className) {
        Swal.fire('Error', 'Please select a class', 'error');
        return;
    }
    if (!exam) {
        Swal.fire('Error', 'Please select a term/exam', 'error');
        return;
    }
    if (!year) {
        Swal.fire('Error', 'Please enter a year', 'error');
        return;
    }
    
    Swal.fire({ title: 'Loading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        await loadGradingRulesForReport();
        await loadUniversityEntryRequirements();
        await loadFeeStructureForReport();
        await loadAllPaymentsForReport();
        await loadSchoolInfoForReport();
        
        let query = sb.from('students').select('*').eq('class', className);
        if (stream) query = query.eq('stream', stream);
        
        const { data: students, error: studentError } = await query;
        if (studentError) throw studentError;
        
        if (!students || students.length === 0) {
            Swal.fire('No Students', 'No students found', 'info');
            return;
        }
        
        const allReports = [];
        for (const student of students) {
            const marks = await loadMarksForReport(student.id, exam, year);
            const feeStatus = await calculateStudentFeeStatusForReport(student.id, year, exam);
            const classTeacher = getClassTeacher(student);
            if (marks.length > 0) {
                allReports.push({ student, marks, feeStatus, classTeacher });
            }
        }
        
        if (allReports.length === 0) {
            Swal.fire('No Data', 'No marks found', 'info');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        let allReportsHtml = '';
        
        for (let i = 0; i < allReports.length; i++) {
            const { student, marks, feeStatus, classTeacher } = allReports[i];
            allReportsHtml += generateReportCardHTML(student, marks, exam, year, feeStatus, classTeacher, true);
            if (i < allReports.length - 1) {
                allReportsHtml += '<div style="page-break-before: always;"></div>';
            }
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bulk Reports - ${className}</title>
                <style>
                    @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
                    body { font-family: 'Times New Roman', Arial, sans-serif; padding: 20px; font-size: 12px; }
                    .grade-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: white; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; }
                </style>
            </head>
            <body>
                <div class="no-print" style="text-align: center; margin-bottom: 20px;">
                    <button onclick="window.print()">🖨️ Print All</button>
                    <button onclick="window.close()">❌ Close</button>
                </div>
                ${allReportsHtml}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        Swal.close();
        
    } catch (error) {
        Swal.close();
        Swal.fire('Error', error.message, 'error');
    }
};

// ============================================
// RENDER REPORTS PAGE
// ============================================

async function renderReports() {
    await loadSchoolInfoForReport();
    await loadGradingRulesForReport();
    await loadUniversityEntryRequirements();
    await loadFeeStructureForReport();
    await loadAllPaymentsForReport();
    await loadStudentsForReport();
    await loadAcademicTermsForReports();
    
    const classOptions = currentLevel === 'olevel' 
        ? ['S.1', 'S.2', 'S.3', 'S.4']
        : ['S.5', 'S.6'];
    
    const currentYear = new Date().getFullYear();
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-file-alt"></i> Student Report Card</h5>
                <small>Complete Academic & Financial Report | Fee Calculation: Past Debts → Current Term → Forward Credit</small>
            </div>
            <div class="card-body">
                <div class="row mb-4">
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Select Student</label>
                        <select id="reportStudent" class="form-select">
                            <option value="">-- Select Student --</option>
                            ${reportsStudentsList.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.admission_no}) - ${s.class}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Term/Exam</label>
                        <select id="reportExam" class="form-select">
                            <option value="">-- Select Term --</option>
                            <option value="Term 1">📘 Term 1</option>
                            <option value="Term 2">📙 Term 2</option>
                            <option value="Term 3">📗 Term 3</option>
                            <option value="Mid-Term">📝 Mid-Term</option>
                            <option value="Mock">🎯 Mock</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Year</label>
                        <input type="text" id="reportYear" class="form-control" value="${currentYear}" placeholder="e.g., 2026">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">&nbsp;</label>
                        <button class="btn btn-primary w-100" onclick="generateSingleReport()">
                            <i class="fas fa-file-alt"></i> Generate
                        </button>
                    </div>
                </div>
                
                <hr>
                
                <div class="row">
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Bulk Class</label>
                        <select id="bulkClass" class="form-select">
                            <option value="">-- Select Class --</option>
                            ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-bold">Stream</label>
                        <select id="bulkStream" class="form-select">
                            <option value="">-- All Streams --</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="Arts">Arts</option>
                            <option value="Sciences">Sciences</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">Term/Exam</label>
                        <select id="bulkExam" class="form-select">
                            <option value="">-- Select Term --</option>
                            <option value="Term 1">📘 Term 1</option>
                            <option value="Term 2">📙 Term 2</option>
                            <option value="Term 3">📗 Term 3</option>
                            <option value="Mid-Term">📝 Mid-Term</option>
                            <option value="Mock">🎯 Mock</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">Year</label>
                        <input type="text" id="bulkYear" class="form-control" value="${currentYear}" placeholder="e.g., 2026">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label fw-bold">&nbsp;</label>
                        <button class="btn btn-info w-100" onclick="generateBulkReports()">
                            <i class="fas fa-print"></i> Print Bulk
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="reportPreview" style="display: none;"></div>
    `;
}

// ============================================
// INITIALIZATION
// ============================================

console.log('✅ Reports Module Loaded - Final Masterpiece');
console.log('✅ Fee Calculation: Past Debts → Current Term → Forward Credit');
console.log('✅ Class Teacher from School Settings');

// ============================================
// PROMOTION MODULE - WITH A-LEVEL STREAM SELECTION
// O-Level to A-Level: Prompts for Arts or Sciences
// ============================================

// Global variables
let promotionStudentsList = [];
let promotionClasses = [];
let promotionGradingRules = [];
let promotionUniversityEntry = {};

// ============================================
// LOAD GRADING RULES FOR POINTS
// ============================================

async function loadPromotionGradingRules() {
    try {
        if (currentLevel === 'olevel') {
            const { data, error } = await sb
                .from('olevel_grades')
                .select('*')
                .order('points', { ascending: true });
            
            if (error) throw error;
            promotionGradingRules = data || [];
        } else {
            const { data, error } = await sb
                .from('alevel_principal_grades')
                .select('*')
                .order('points', { ascending: false });
            
            if (error) throw error;
            promotionGradingRules = data || [];
            
            const { data: uniData, error: uniError } = await sb
                .from('alevel_university_entry')
                .select('*')
                .limit(1)
                .maybeSingle();
            
            if (!uniError && uniData) {
                promotionUniversityEntry = uniData;
            }
        }
        return true;
    } catch (error) {
        console.error('Error loading grading rules:', error);
        return false;
    }
}

// ============================================
// RENDER PROMOTION PAGE
// ============================================

async function renderPromotion() {
    await loadPromotionGradingRules();
    await loadPromotionData();
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-arrow-up"></i> Student Promotion / Demotion</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-12">
                        <button class="btn btn-primary" onclick="showPromotionModal()">
                            <i class="fas fa-arrow-up"></i> Bulk Promote
                        </button>
                        <button class="btn btn-warning ms-2" onclick="showDemotionModal()">
                            <i class="fas fa-arrow-down"></i> Bulk Demote
                        </button>
                        <button class="btn btn-info ms-2" onclick="refreshPromotionTable()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 550px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th>Student Name</th>
                                <th>Admission No</th>
                                <th>Current Class</th>
                                <th>Stream</th>
                                <th>Term 3 Results</th>
                                <th>Status</th>
                                <th>Recommendation</th>
                                <th width="150">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="promotionTableBody">
                            <tr><td colspan="8" class="text-center py-4">Loading students... </span>络</tbody>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LOAD PROMOTION DATA
// ============================================

async function loadPromotionData() {
    try {
        let classList = currentLevel === 'olevel' 
            ? ['S.1', 'S.2', 'S.3', 'S.4']
            : ['S.5', 'S.6'];
        
        const { data: students, error: studentError } = await sb
            .from('students')
            .select('*')
            .in('class', classList)
            .order('class', { ascending: true })
            .order('name', { ascending: true });
        
        if (studentError) throw studentError;
        promotionStudentsList = students || [];
        
        promotionClasses = [...new Set(promotionStudentsList.map(s => s.class))].sort();
        
        return promotionStudentsList;
    } catch (error) {
        console.error('Error loading promotion data:', error);
        return [];
    }
}

// ============================================
// CALCULATE STUDENT TERM 3 RESULTS
// ============================================

async function calculateTerm3Results(studentId, year) {
    try {
        const { data: marks, error } = await sb
            .from('marks')
            .select('*')
            .eq('student_id', studentId)
            .eq('exam', 'Term 3')
            .eq('year', year);
        
        if (error) throw error;
        
        if (!marks || marks.length === 0) {
            return { 
                hasMarks: false, 
                average: 0, 
                totalPoints: 0, 
                subjectCount: 0,
                grade: 'N/A',
                performance: 'No Marks'
            };
        }
        
        let totalPercentage = 0;
        let totalPoints = 0;
        
        for (const m of marks) {
            let percentage;
            if (currentLevel === 'olevel') {
                const caScore = m.ca_score || 0;
                const examScore = m.exam_score || 0;
                percentage = (caScore * 0.2) + (examScore * 0.8);
            } else {
                percentage = (m.marks_obtained / m.max_marks) * 100;
            }
            totalPercentage += percentage;
            
            let points = 0;
            for (const rule of promotionGradingRules) {
                if (percentage >= rule.min_percentage && percentage <= rule.max_percentage) {
                    points = rule.points;
                    break;
                }
            }
            totalPoints += points;
        }
        
        const average = marks.length > 0 ? totalPercentage / marks.length : 0;
        
        let performance = '';
        let grade = '';
        
        if (currentLevel === 'olevel') {
            if (average >= 80) { grade = 'A'; performance = 'Excellent'; }
            else if (average >= 70) { grade = 'B'; performance = 'Very Good'; }
            else if (average >= 60) { grade = 'C'; performance = 'Good'; }
            else if (average >= 50) { grade = 'D'; performance = 'Satisfactory'; }
            else if (average >= 40) { grade = 'E'; performance = 'Poor'; }
            else { grade = 'F'; performance = 'Very Poor'; }
        } else {
            if (totalPoints >= 18) { grade = 'A'; performance = 'Excellent'; }
            else if (totalPoints >= 15) { grade = 'B'; performance = 'Very Good'; }
            else if (totalPoints >= 12) { grade = 'C'; performance = 'Good'; }
            else if (totalPoints >= 9) { grade = 'D'; performance = 'Satisfactory'; }
            else if (totalPoints >= 6) { grade = 'E'; performance = 'Poor'; }
            else { grade = 'F'; performance = 'Very Poor'; }
        }
        
        return {
            hasMarks: true,
            average: average,
            totalPoints: totalPoints,
            subjectCount: marks.length,
            grade: grade,
            performance: performance
        };
    } catch (error) {
        console.error('Error calculating results:', error);
        return { hasMarks: false, average: 0, totalPoints: 0, subjectCount: 0, grade: 'N/A', performance: 'Error' };
    }
}

// ============================================
// GET RECOMMENDATION (Promote/Demote/Repeat)
// ============================================

function getRecommendation(studentClass, results, currentYear) {
    if (!results.hasMarks) {
        return {
            action: 'PENDING',
            nextClass: studentClass,
            reason: 'No Term 3 marks found',
            color: '#6c757d',
            canPromote: false,
            canDemote: false
        };
    }
    
    if (currentLevel === 'olevel') {
        const average = results.average;
        
        if (average >= 50) {
            let nextClass = '';
            if (studentClass === 'S.1') nextClass = 'S.2';
            else if (studentClass === 'S.2') nextClass = 'S.3';
            else if (studentClass === 'S.3') nextClass = 'S.4';
            else if (studentClass === 'S.4') nextClass = 'S.5';
            else nextClass = studentClass;
            
            return {
                action: 'PROMOTE',
                nextClass: nextClass,
                reason: `Average ${average.toFixed(1)}% - Meets promotion criteria`,
                color: '#28a745',
                canPromote: true,
                canDemote: false
            };
        } else if (average >= 40) {
            return {
                action: 'REPEAT',
                nextClass: studentClass,
                reason: `Average ${average.toFixed(1)}% - Below promotion threshold. Needs to repeat.`,
                color: '#ffc107',
                canPromote: false,
                canDemote: true
            };
        } else {
            let prevClass = '';
            if (studentClass === 'S.2') prevClass = 'S.1';
            else if (studentClass === 'S.3') prevClass = 'S.2';
            else if (studentClass === 'S.4') prevClass = 'S.3';
            else prevClass = studentClass;
            
            return {
                action: 'DEMOTE',
                nextClass: prevClass,
                reason: `Average ${average.toFixed(1)}% - Below minimum requirements. Demoted.`,
                color: '#dc3545',
                canPromote: false,
                canDemote: true
            };
        }
    } else {
        const totalPoints = results.totalPoints;
        const minPromotionPoints = promotionUniversityEntry.minimum_points || 12;
        
        if (totalPoints >= minPromotionPoints) {
            let nextClass = '';
            if (studentClass === 'S.5') nextClass = 'S.6';
            else if (studentClass === 'S.6') nextClass = 'Completed';
            else nextClass = studentClass;
            
            return {
                action: 'PROMOTE',
                nextClass: nextClass,
                reason: `${totalPoints} points - Meets promotion criteria (≥${minPromotionPoints} points)`,
                color: '#28a745',
                canPromote: true,
                canDemote: false
            };
        } else if (totalPoints >= minPromotionPoints - 3) {
            return {
                action: 'REPEAT',
                nextClass: studentClass,
                reason: `${totalPoints} points - Below promotion threshold. Needs to repeat.`,
                color: '#ffc107',
                canPromote: false,
                canDemote: true
            };
        } else {
            let prevClass = '';
            if (studentClass === 'S.6') prevClass = 'S.5';
            else prevClass = studentClass;
            
            return {
                action: 'DEMOTE',
                nextClass: prevClass,
                reason: `${totalPoints} points - Significantly below requirements. Demoted.`,
                color: '#dc3545',
                canPromote: false,
                canDemote: true
            };
        }
    }
}

// ============================================
// LOAD PROMOTION TABLE
// ============================================

async function loadPromotionTable() {
    const tbody = document.getElementById('promotionTableBody');
    if (!tbody) return;
    
    await loadPromotionData();
    await loadPromotionGradingRules();
    const year = new Date().getFullYear().toString();
    
    if (promotionStudentsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No students found. </span>络</tbody>';
        return;
    }
    
    let html = '';
    
    for (const student of promotionStudentsList) {
        const results = await calculateTerm3Results(student.id, year);
        const recommendation = getRecommendation(student.class, results, year);
        
        let statusClass = '';
        let statusIcon = '';
        
        if (recommendation.action === 'PROMOTE') {
            statusClass = 'bg-success';
            statusIcon = '✅';
        } else if (recommendation.action === 'DEMOTE') {
            statusClass = 'bg-danger';
            statusIcon = '⬇️';
        } else if (recommendation.action === 'REPEAT') {
            statusClass = 'bg-warning text-dark';
            statusIcon = '🔄';
        } else {
            statusClass = 'bg-secondary';
            statusIcon = '❓';
        }
        
        let resultDisplay = '';
        if (currentLevel === 'olevel') {
            resultDisplay = `<strong>${results.average.toFixed(1)}%</strong><br><small>Grade: ${results.grade}</small>`;
        } else {
            resultDisplay = `<strong>${results.totalPoints} pts</strong><br><small>Grade: ${results.grade}</small>`;
        }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(student.name)}</strong></span></td>
                <td>${student.admission_no || '-'}</span></td>
                <td>${student.class}</span></td>
                <td>${student.stream || '-'}</span></td>
                <td class="text-center">${resultDisplay}</span></td>
                <td class="text-center">
                    <span class="badge ${statusClass}" style="padding: 5px 10px;">
                        ${statusIcon} ${recommendation.action}
                    </span>
                </span></td>
                <td class="text-center">
                    <strong>${recommendation.nextClass}</strong><br>
                    <small class="text-muted">${recommendation.reason}</small>
                </span></td>
                <td class="text-center">
                    ${recommendation.canPromote ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="promoteStudent('${student.id}')" title="Promote">
                            <i class="fas fa-arrow-up"></i>
                        </button>` : ''}
                    ${recommendation.canDemote ? 
                        `<button class="btn btn-sm btn-warning me-1" onclick="demoteStudent('${student.id}')" title="Demote/Repeat">
                            <i class="fas fa-arrow-down"></i>
                        </button>` : ''}
                    <button class="btn btn-sm btn-info" onclick="viewStudentDetails('${student.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
}

// ============================================
// PROMOTE SINGLE STUDENT (WITH STREAM SELECTION FOR S.4 TO S.5)
// ============================================

// ============================================
// PROMOTE SINGLE STUDENT (CLASS WITHOUT STREAM)
// ============================================

window.promoteStudent = async function(studentId) {
    const student = promotionStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const year = new Date().getFullYear().toString();
    const results = await calculateTerm3Results(studentId, year);
    const recommendation = getRecommendation(student.class, results, year);
    
    if (!recommendation.canPromote) {
        Swal.fire('Cannot Promote', recommendation.reason, 'warning');
        return;
    }
    
    let selectedStream = null;
    let selectedCombination = null;
    let finalClass = recommendation.nextClass;
    
    // For O-Level to A-Level promotion (S.4 to S.5)
    if (student.class === 'S.4' && recommendation.nextClass === 'S.5') {
        const selectionResult = await Swal.fire({
            title: 'Promote to A-Level - Select Stream & Enter Combination',
            html: `
                <div class="text-start">
                    <p><strong>Student:</strong> ${escapeHtml(student.name)}</p>
                    <p><strong>From Class:</strong> ${student.class}</p>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Select Stream *</label>
                        <select id="streamSelect" class="form-select">
                            <option value="">-- Select Stream --</option>
                            <option value="Arts">Arts</option>
                            <option value="Sciences">Sciences</option>
                            <option value="Business">Business</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Combination (Type Manually) *</label>
                        <input type="text" id="combinationInput" class="form-control" placeholder="e.g., PCM, HEG, BAM">
                        <small class="text-muted">Enter combination code (e.g., PCM for Physics, Chemistry, Math)</small>
                    </div>
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> 
                        <strong>Common Combinations:</strong><br>
                        Arts: HEG, HEM, PEM, ICT<br>
                        Sciences: PCM, PCB, BCM, PEM<br>
                        Business: BAM, HEB
                    </div>
                </div>
            `,
            width: '500px',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-arrow-up"></i> Promote',
            cancelButtonText: 'Cancel',
            preConfirm: () => {
                const stream = document.getElementById('streamSelect').value;
                const combination = document.getElementById('combinationInput').value.trim().toUpperCase();
                if (!stream) {
                    Swal.showValidationMessage('Please select a stream');
                    return false;
                }
                if (!combination) {
                    Swal.showValidationMessage('Please enter a combination');
                    return false;
                }
                return { stream, combination };
            }
        });
        
        if (!selectionResult.value) return;
        selectedStream = selectionResult.value.stream;
        selectedCombination = selectionResult.value.combination;
        
        // IMPORTANT: Class stays as "S.5" (without stream)
        finalClass = 'S.5';
    }
    
    const confirmResult = await Swal.fire({
        title: 'Confirm Promotion',
        html: `
            <div class="text-start">
                <p><strong>Student:</strong> ${escapeHtml(student.name)}</p>
                <p><strong>From Class:</strong> ${student.class}</p>
                <p><strong>To Class:</strong> ${finalClass}</p>
                ${selectedStream ? `<p><strong>Stream:</strong> ${selectedStream}</p>` : ''}
                ${selectedCombination ? `<p><strong>Combination:</strong> ${selectedCombination}</p>` : ''}
                <p><strong>Average:</strong> ${results.average.toFixed(1)}%</p>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Promote',
        cancelButtonText: 'Cancel'
    });
    
    if (confirmResult.isConfirmed) {
        Swal.fire({ title: 'Promoting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            // Update student: class = "S.5", stream = selectedStream, combination = entered
            const updateData = { 
                class: finalClass,
                stream: selectedStream || student.stream,
                combination: selectedCombination || student.combination,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await sb
                .from('students')
                .update(updateData)
                .eq('id', studentId);
            
            if (error) throw error;
            
            Swal.fire('Success!', `${student.name} promoted to ${finalClass} (${selectedStream} - ${selectedCombination})`, 'success');
            await loadPromotionTable();
            
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
};

// ============================================
// EXECUTE BULK PROMOTION (CLASS WITHOUT STREAM)
// ============================================

async function executeBulkPromotion(fromClass) {
    let selectedStream = null;
    let selectedCombination = null;
    
    if (fromClass === 'S.4') {
        const selectionResult = await Swal.fire({
            title: 'Bulk Promote S.4 to A-Level',
            html: `
                <div class="text-start">
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-info-circle"></i>
                        Students promoted from S.4 will be placed in the selected stream with the entered combination.
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Select Stream *</label>
                        <select id="bulkStreamSelect" class="form-select">
                            <option value="">-- Select Stream --</option>
                            <option value="Arts">Arts</option>
                            <option value="Sciences">Sciences</option>
                            <option value="Business">Business</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Combination (Type Manually) *</label>
                        <input type="text" id="bulkCombinationInput" class="form-control" placeholder="e.g., PCM, HEG, BAM">
                        <small class="text-muted">All promoted students will get this combination</small>
                    </div>
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> 
                        <strong>Common Combinations:</strong><br>
                        Arts: HEG, HEM, PEM, ICT<br>
                        Sciences: PCM, PCB, BCM, PEM<br>
                        Business: BAM, HEB
                    </div>
                </div>
            `,
            width: '500px',
            showCancelButton: true,
            confirmButtonText: 'Continue Promotion',
            cancelButtonText: 'Cancel',
            preConfirm: () => {
                const stream = document.getElementById('bulkStreamSelect').value;
                const combination = document.getElementById('bulkCombinationInput').value.trim().toUpperCase();
                if (!stream) {
                    Swal.showValidationMessage('Please select a stream');
                    return false;
                }
                if (!combination) {
                    Swal.showValidationMessage('Please enter a combination');
                    return false;
                }
                return { stream, combination };
            }
        });
        
        if (!selectionResult.value) return;
        selectedStream = selectionResult.value.stream;
        selectedCombination = selectionResult.value.combination;
    }
    
    Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const students = promotionStudentsList.filter(s => s.class === fromClass);
        const year = new Date().getFullYear().toString();
        
        let promoted = 0;
        let notEligible = [];
        let promotedList = [];
        
        for (const student of students) {
            const results = await calculateTerm3Results(student.id, year);
            const recommendation = getRecommendation(student.class, results, year);
            
            if (recommendation.canPromote && recommendation.action === 'PROMOTE') {
                let finalClass = recommendation.nextClass;
                const updateData = { class: finalClass };
                
                // For S.4 to S.5 promotion
                if (fromClass === 'S.4' && finalClass === 'S.5' && selectedStream) {
                    updateData.class = 'S.5';
                    updateData.stream = selectedStream;
                    updateData.combination = selectedCombination;
                }
                
                const { error } = await sb
                    .from('students')
                    .update(updateData)
                    .eq('id', student.id);
                
                if (!error) {
                    promoted++;
                    promotedList.push({ 
                        name: student.name, 
                        newClass: updateData.class,
                        stream: updateData.stream,
                        combination: updateData.combination 
                    });
                }
            } else {
                notEligible.push({ name: student.name, reason: recommendation.reason });
            }
        }
        
        let message = `<div class="text-start">
            <p><strong>Class:</strong> ${fromClass}</p>
            ${selectedStream ? `<p><strong>A-Level Stream:</strong> ${selectedStream}</p>` : ''}
            ${selectedCombination ? `<p><strong>Combination:</strong> ${selectedCombination}</p>` : ''}
            <p><strong>Promoted:</strong> ${promoted} out of ${students.length} students</p>`;
        
        if (promotedList.length > 0) {
            message += `<hr><strong>Promoted Students:</strong><ul>`;
            promotedList.slice(0, 10).forEach(s => {
                message += `<li>${escapeHtml(s.name)} → ${s.newClass} (${s.stream} - ${s.combination})</li>`;
            });
            if (promotedList.length > 10) message += `<li>... and ${promotedList.length - 10} more</li>`;
            message += `</ul>`;
        }
        
        if (notEligible.length > 0) {
            message += `<hr class="text-danger"><strong class="text-danger">Not Eligible (${notEligible.length}):</strong><ul>`;
            notEligible.slice(0, 5).forEach(s => {
                message += `<li>${escapeHtml(s.name)} - ${s.reason}</li>`;
            });
            if (notEligible.length > 5) message += `<li>... and ${notEligible.length - 5} more</li>`;
            message += `</ul>`;
        }
        
        message += `</div>`;
        
        Swal.fire({
            title: 'Promotion Complete',
            html: message,
            icon: 'success'
        });
        
        await loadPromotionTable();
        
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
}
// ============================================
// DEMOTE STUDENT
// ============================================

window.demoteStudent = async function(studentId) {
    const student = promotionStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const year = new Date().getFullYear().toString();
    const results = await calculateTerm3Results(studentId, year);
    
    let demotionOptions = '';
    
    if (currentLevel === 'olevel') {
        if (student.class === 'S.2') demotionOptions = '<option value="S.1">S.1</option>';
        else if (student.class === 'S.3') demotionOptions = '<option value="S.2">S.2</option>';
        else if (student.class === 'S.4') demotionOptions = '<option value="S.3">S.3</option>';
        else demotionOptions = `<option value="${student.class}">${student.class} (Repeat)</option>`;
    } else {
        if (student.class === 'S.6') demotionOptions = '<option value="S.5">S.5</option>';
        else demotionOptions = `<option value="${student.class}">${student.class} (Repeat)</option>`;
    }
    
    demotionOptions += `<option value="${student.class}">${student.class} (Repeat - Stay in same class)</option>`;
    
    const result = await Swal.fire({
        title: 'Demote / Repeat Student',
        html: `
            <div class="text-start">
                <p><strong>Student:</strong> ${escapeHtml(student.name)}</p>
                <p><strong>Current Class:</strong> ${student.class}</p>
                <p><strong>${currentLevel === 'olevel' ? 'Average' : 'Total Points'}:</strong> ${currentLevel === 'olevel' ? results.average.toFixed(1) + '%' : results.totalPoints + ' points'}</p>
                <div class="mb-3">
                    <label class="form-label fw-bold">Select New Class *</label>
                    <select id="demoteToClass" class="form-select">
                        ${demotionOptions}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Reason</label>
                    <textarea id="demoteReason" class="form-control" rows="2" placeholder="Reason for demotion/repeat..."></textarea>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-arrow-down"></i> Confirm',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const newClass = document.getElementById('demoteToClass').value;
            const reason = document.getElementById('demoteReason').value;
            if (!newClass) {
                Swal.showValidationMessage('Please select a class');
                return false;
            }
            return { newClass, reason };
        }
    });
    
    if (result.value) {
        Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const { error } = await sb
                .from('students')
                .update({ 
                    class: result.value.newClass,
                    updated_at: new Date().toISOString()
                })
                .eq('id', studentId);
            
            if (error) throw error;
            
            await loadPromotionTable();
            
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
};

// ============================================
// BULK PROMOTE MODAL
// ============================================

// ============================================
// BULK PROMOTE MODAL - COMPLETELY FIXED
// ============================================

window.showPromotionModal = function() {
    // Get unique classes with student counts
    const classMap = {};
    for (const student of promotionStudentsList) {
        if (!classMap[student.class]) {
            classMap[student.class] = 0;
        }
        classMap[student.class]++;
    }
    
    const uniqueClasses = Object.keys(classMap).sort();
    
    let classOptions = '<option value="">-- Select Class --</option>';
    for (const c of uniqueClasses) {
        classOptions += `<option value="${c}">${c} (${classMap[c]} students)</option>`;
    }
    
    // Create a unique ID for this modal instance
    const modalId = 'promoteModal_' + Date.now();
    
    Swal.fire({
        title: '<i class="fas fa-arrow-up"></i> Bulk Promote Students',
        html: `
            <div class="text-start">
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i> 
                    ${currentLevel === 'olevel' 
                        ? 'Promotion based on <strong>Term 3 average ≥ 50%</strong>' 
                        : `Promotion based on <strong>Term 3 total points ≥ ${promotionUniversityEntry.minimum_points || 12} points</strong>`}
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">From Class *</label>
                    <select id="promoteFromSelect" class="form-select">
                        ${classOptions}
                    </select>
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Only students meeting the promotion criteria will be promoted.
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-arrow-up"></i> Promote Eligible',
        cancelButtonText: 'Cancel',
        didOpen: () => {
            // Ensure the select element exists
            const selectEl = document.getElementById('promoteFromSelect');
            if (selectEl) {
                console.log('Select element found');
            } else {
                console.log('Select element not found');
            }
        },
        preConfirm: () => {
            const fromClass = document.getElementById('promoteFromSelect')?.value;
            console.log('Selected class:', fromClass);
            
            if (!fromClass) {
                Swal.showValidationMessage('Please select a class!');
                return false;
            }
            return { fromClass };
        }
    }).then(async (result) => {
        if (result.value) {
            await executeBulkPromotion(result.value.fromClass);
        }
    });
};
// ============================================
// EXECUTE BULK PROMOTION (WITH STREAM SELECTION FOR S.4)
// ============================================

// ============================================
// EXECUTE BULK PROMOTION - WITH DEBUGGING
// ============================================

async function executeBulkPromotion(fromClass) {
    console.log('Bulk promoting from class:', fromClass);
    
    // For S.4 to S.5 promotion, ask for stream and combination
    let selectedStream = null;
    let selectedCombination = null;
    
    if (fromClass === 'S.4') {
        const selectionResult = await Swal.fire({
            title: 'Promote S.4 Students to A-Level',
            html: `
                <div class="text-start">
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-info-circle"></i>
                        Students promoted from ${fromClass} will be placed in the selected stream with the entered combination.
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Select Stream *</label>
                        <select id="bulkStreamSelect" class="form-select">
                            <option value="">-- Select Stream --</option>
                            <option value="Arts">Arts</option>
                            <option value="Sciences">Sciences</option>
                            <option value="Business">Business</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Combination (Type Manually) *</label>
                        <input type="text" id="bulkCombinationInput" class="form-control" placeholder="e.g., PCM, HEG, BAM">
                        <small class="text-muted">All promoted students will get this combination</small>
                    </div>
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> 
                        <strong>Common Combinations:</strong><br>
                        Arts: HEG, HEM, PEM, ICT<br>
                        Sciences: PCM, PCB, BCM, PEM<br>
                        Business: BAM, HEB
                    </div>
                </div>
            `,
            width: '500px',
            showCancelButton: true,
            confirmButtonText: 'Continue Promotion',
            cancelButtonText: 'Cancel',
            preConfirm: () => {
                const stream = document.getElementById('bulkStreamSelect')?.value;
                const combination = document.getElementById('bulkCombinationInput')?.value.trim().toUpperCase();
                
                if (!stream) {
                    Swal.showValidationMessage('Please select a stream');
                    return false;
                }
                if (!combination) {
                    Swal.showValidationMessage('Please enter a combination');
                    return false;
                }
                return { stream, combination };
            }
        });
        
        if (!selectionResult.value) return;
        selectedStream = selectionResult.value.stream;
        selectedCombination = selectionResult.value.combination;
        
        console.log('Selected stream:', selectedStream);
        console.log('Selected combination:', selectedCombination);
    }
    
    Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const students = promotionStudentsList.filter(s => s.class === fromClass);
        const year = new Date().getFullYear().toString();
        
        console.log(`Found ${students.length} students in class ${fromClass}`);
        
        let promoted = 0;
        let notEligible = [];
        let promotedList = [];
        
        for (const student of students) {
            const results = await calculateTerm3Results(student.id, year);
            const recommendation = getRecommendation(student.class, results, year);
            
            console.log(`Student: ${student.name}, Average: ${results.average.toFixed(1)}%, Action: ${recommendation.action}`);
            
            if (recommendation.canPromote && recommendation.action === 'PROMOTE') {
                let finalClass = recommendation.nextClass;
                const updateData = { 
                    class: finalClass,
                    updated_at: new Date().toISOString()
                };
                
                // For S.4 to S.5 promotion
                if (fromClass === 'S.4' && finalClass === 'S.5') {
                    updateData.class = 'S.5';
                    updateData.stream = selectedStream;
                    updateData.combination = selectedCombination;
                    finalClass = `S.5 (${selectedStream})`;
                }
                
                const { error } = await sb
                    .from('students')
                    .update(updateData)
                    .eq('id', student.id);
                
                if (!error) {
                    promoted++;
                    promotedList.push({ 
                        name: student.name, 
                        nextClass: finalClass,
                        stream: updateData.stream,
                        combination: updateData.combination 
                    });
                    console.log(`✅ Promoted: ${student.name}`);
                } else {
                    console.log(`❌ Error promoting ${student.name}:`, error);
                }
            } else {
                notEligible.push({ name: student.name, reason: recommendation.reason });
                console.log(`❌ Not eligible: ${student.name} - ${recommendation.reason}`);
            }
        }
        
        let message = `<div class="text-start">
            <p><strong>Class:</strong> ${fromClass}</p>
            ${selectedStream ? `<p><strong>A-Level Stream:</strong> ${selectedStream}</p>` : ''}
            ${selectedCombination ? `<p><strong>Combination:</strong> ${selectedCombination}</p>` : ''}
            <p><strong>Promoted:</strong> ${promoted} out of ${students.length} students</p>`;
        
        if (promotedList.length > 0) {
            message += `<hr><strong>✅ Promoted Students:</strong><ul>`;
            promotedList.slice(0, 10).forEach(s => {
                message += `<li>${escapeHtml(s.name)} → ${s.nextClass} ${s.stream ? '(' + s.stream + ')' : ''} ${s.combination ? '[' + s.combination + ']' : ''}</li>`;
            });
            if (promotedList.length > 10) message += `<li>... and ${promotedList.length - 10} more</li>`;
            message += `</ul>`;
        }
        
        if (notEligible.length > 0) {
            message += `<hr class="text-danger"><strong class="text-danger">❌ Not Eligible (${notEligible.length}):</strong><ul>`;
            notEligible.slice(0, 5).forEach(s => {
                message += `<li>${escapeHtml(s.name)} - ${s.reason}</li>`;
            });
            if (notEligible.length > 5) message += `<li>... and ${notEligible.length - 5} more</li>`;
            message += `</ul>`;
        }
        
        message += `</div>`;
        
        Swal.fire({
            title: 'Promotion Complete',
            html: message,
            icon: 'success',
            width: '600px'
        });
        
        await loadPromotionTable();
        
    } catch (error) {
        console.error('Bulk promotion error:', error);
        Swal.fire('Error', error.message, 'error');
    }
}
// ============================================
// BULK DEMOTE MODAL
// ============================================

window.showDemotionModal = function() {
    const uniqueClasses = [...new Set(promotionStudentsList.map(s => s.class))];
    
    let classOptions = '<option value="">-- Select Class --</option>';
    for (const c of uniqueClasses) {
        classOptions += `<option value="${c}">${c}</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-arrow-down"></i> Bulk Demote Students',
        html: `
            <div class="text-start">
                <div class="alert alert-warning mb-3">
                    <i class="fas fa-exclamation-triangle"></i> 
                    This will demote students who performed very poorly.
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">From Class *</label>
                    <select id="demoteFrom" class="form-select">
                        ${classOptions}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Demote To Class</label>
                    <select id="demoteToTarget" class="form-select">
                        <option value="">-- Select Target Class --</option>
                        ${currentLevel === 'olevel' ? 
                            '<option value="S.1">S.1</option><option value="S.2">S.2</option><option value="S.3">S.3</option>' : 
                            '<option value="S.5">S.5</option>'}
                    </select>
                </div>
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> 
                    <strong>Warning:</strong> This action cannot be undone easily. Only demote students who truly need to repeat.
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-arrow-down"></i> Demote Students',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const fromClass = document.getElementById('demoteFrom').value;
            const toClass = document.getElementById('demoteToTarget').value;
            if (!fromClass) {
                Swal.showValidationMessage('Please select a class!');
                return false;
            }
            return { fromClass, toClass };
        }
    }).then(async (result) => {
        if (result.value) {
            await executeBulkDemotion(result.value.fromClass, result.value.toClass);
        }
    });
};

// ============================================
// EXECUTE BULK DEMOTION
// ============================================

async function executeBulkDemotion(fromClass, toClass) {
    Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const students = promotionStudentsList.filter(s => s.class === fromClass);
        const year = new Date().getFullYear().toString();
        
        let demoted = 0;
        let demotedList = [];
        
        for (const student of students) {
            const results = await calculateTerm3Results(student.id, year);
            
            let shouldDemote = false;
            if (currentLevel === 'olevel') {
                shouldDemote = results.hasMarks && results.average < 40;
            } else {
                shouldDemote = results.hasMarks && results.totalPoints < 9;
            }
            
            if (shouldDemote) {
                const targetClass = toClass || (currentLevel === 'olevel' ? 'S.1' : 'S.5');
                const { error } = await sb
                    .from('students')
                    .update({ class: targetClass })
                    .eq('id', student.id);
                
                if (!error) {
                    demoted++;
                    demotedList.push({ name: student.name, toClass: targetClass });
                }
            }
        }
        
        let message = `<div class="text-start">
            <p><strong>Class:</strong> ${fromClass}</p>
            <p><strong>Demoted:</strong> ${demoted} out of ${students.length} students</p>`;
        
        if (demotedList.length > 0) {
            message += `<hr><strong>Demoted Students:</strong><ul>`;
            demotedList.slice(0, 10).forEach(s => {
                message += `<li>${escapeHtml(s.name)} → ${s.toClass}</li>`;
            });
            if (demotedList.length > 10) message += `<li>... and ${demotedList.length - 10} more</li>`;
            message += `</ul>`;
        }
        
        message += `</div>`;
        
        Swal.fire({
            title: 'Demotion Complete',
            html: message,
            icon: demoted > 0 ? 'warning' : 'info'
        });
        
        await loadPromotionTable();
        
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
}

// ============================================
// VIEW STUDENT DETAILS
// ============================================

window.viewStudentDetails = async function(studentId) {
    const student = promotionStudentsList.find(s => s.id === studentId);
    if (!student) return;
    
    const year = new Date().getFullYear().toString();
    const results = await calculateTerm3Results(studentId, year);
    
    let marksHtml = '';
    if (results.hasMarks) {
        marksHtml = `
            <p><strong>Subjects Attempted:</strong> ${results.subjectCount}</p>
            <p><strong>${currentLevel === 'olevel' ? 'Average Score:' : 'Total Points:'}</strong> 
                ${currentLevel === 'olevel' ? results.average.toFixed(1) + '%' : results.totalPoints + ' points'}</p>
            <p><strong>Overall Grade:</strong> ${results.grade}</p>
            <p><strong>Performance:</strong> ${results.performance}</p>
        `;
    } else {
        marksHtml = '<p class="text-danger">No Term 3 marks found for this student.</p>';
    }
    
    Swal.fire({
        title: `<i class="fas fa-user-graduate"></i> ${escapeHtml(student.name)}`,
        html: `
            <div class="text-start">
                <p><strong>Admission No:</strong> ${student.admission_no || '-'}</p>
                <p><strong>Class:</strong> ${student.class}</p>
                <p><strong>Stream:</strong> ${student.stream || '-'}</p>
                <p><strong>Student Type:</strong> ${student.student_type || 'Day'}</p>
                <hr>
                <h6>Term 3 Results</h6>
                ${marksHtml}
            </div>
        `,
        width: '500px',
        confirmButtonText: 'Close'
    });
};

// ============================================
// REFRESH PROMOTION TABLE
// ============================================

window.refreshPromotionTable = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadPromotionTable();
    Swal.fire('Refreshed!', 'Promotion table updated.', 'success');
};

// ============================================
// HELPER FUNCTION
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== USER MANAGEMENT ====================
// ============================================
// USER MANAGEMENT MODULE - ADD BUTTON REMOVED
// Roles: superadmin, admin, teacher, accountant, librarian, secretary
// ============================================

// Global variables
let allUsersList = [];

// Available roles
const availableRoles = [
    { value: 'superadmin', label: 'Super Admin', color: '#dc3545', description: 'Full system access - can manage everything including users' },
    { value: 'admin', label: 'Admin', color: '#0d6efd', description: 'Manage all school operations except user management' },
    { value: 'teacher', label: 'Teacher', color: '#0dcaf0', description: 'Manage marks, attendance, and view students' },
    { value: 'accountant', label: 'Accountant', color: '#fd7e14', description: 'Manage payments, fees, and financial reports' },
    { value: 'librarian', label: 'Librarian', color: '#6c757d', description: 'Manage library books and borrowing records' },
    { value: 'secretary', label: 'Secretary', color: '#198754', description: 'Manage student records, enrollment, and reports' }
];

// ============================================
// PERMISSIONS CONFIGURATION
// ============================================

const userPermissions = {
    superadmin: {
        modules: ['dashboard', 'users', 'students', 'teachers', 'subjects', 'marks', 'attendance', 'library', 'payments', 'reports', 'promotion', 'settings'],
        actions: ['view', 'create', 'edit', 'delete', 'export', 'bulk', 'print']
    },
    admin: {
        modules: ['dashboard', 'students', 'teachers', 'subjects', 'marks', 'attendance', 'library', 'payments', 'reports', 'promotion', 'settings'],
        actions: ['view', 'create', 'edit', 'delete', 'export', 'bulk']
    },
    teacher: {
        modules: ['dashboard', 'students', 'subjects', 'marks', 'attendance', 'reports'],
        actions: ['view', 'create', 'edit', 'export']
    },
    accountant: {
        modules: ['dashboard', 'students', 'payments', 'reports'],
        actions: ['view', 'create', 'edit', 'export']
    },
    librarian: {
        modules: ['dashboard', 'library', 'reports'],
        actions: ['view', 'create', 'edit', 'delete', 'export']
    },
    secretary: {
        modules: ['dashboard', 'students', 'attendance', 'reports', 'promotion'],
        actions: ['view', 'create', 'edit', 'export']
    }
};

// ============================================
// CHECK PERMISSIONS
// ============================================

function hasPermission(module, action = 'view') {
    const userRole = currentUserRole;
    const permissions = userPermissions[userRole];
    if (!permissions) return false;
    if (!permissions.modules.includes(module)) return false;
    return permissions.actions.includes(action);
}

// ============================================
// RENDER USERS PAGE - ADD BUTTON REMOVED
// ============================================

async function renderUsers() {
    // Check permission - only superadmin can access user management
    if (currentUserRole !== 'superadmin') {
        return `
            <div class="card shadow-sm">
                <div class="card-body text-center py-5">
                    <i class="fas fa-lock fa-3x text-danger mb-3"></i>
                    <h5 class="text-danger">Access Denied</h5>
                    <p>You do not have permission to access this page.</p>
                    <p class="text-muted">Only Super Admins can manage users.</p>
                    <button class="btn btn-primary mt-3" onclick="loadPage('dashboard')">
                        <i class="fas fa-home"></i> Go to Dashboard
                    </button>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="card shadow-sm mb-3">
            <div class="card-header" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
                <h5 class="mb-0"><i class="fas fa-users-cog"></i> User Management</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-8">
                        <!-- ADD USER BUTTON REMOVED -->
                        <button class="btn btn-success" onclick="exportUsersData()">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button class="btn btn-secondary ms-2" onclick="refreshUsersTable()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="col-md-4">
                        <input type="text" id="usersSearchInput" class="form-control" 
                               placeholder="🔍 Search users..." onkeyup="filterUsersTable()">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm">
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                    <table class="table table-bordered mb-0">
                        <thead class="table-primary sticky-top">
                            <tr>
                                <th>Email</th>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Permissions</th>
                                <th>Created At</th>
                                <th width="120">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="6" class="text-center py-4">Loading users... </span>络</tbody>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getUsers() {
    try {
        const { data, error } = await sb
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        allUsersList = data || [];
        return allUsersList;
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

async function updateUserRole(id, role) {
    const { error } = await sb
        .from('users')
        .update({ 
            role: role,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);
    
    if (error) throw error;
}

async function deleteUserFromDB(id) {
    const { error } = await sb
        .from('users')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

// ============================================
// LOAD USERS TABLE
// ============================================

async function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    await getUsers();
    
    if (allUsersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No users found. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const u of allUsersList) {
        const roleInfo = availableRoles.find(r => r.value === u.role) || { label: u.role, color: '#6c757d' };
        const createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
        
        const permissions = userPermissions[u.role];
        const permSummary = permissions ? permissions.modules.length + ' modules' : '-';
        
        html += `
            <tr>
                <td>${escapeHtml(u.email)}</span></td>
                <td>${escapeHtml(u.name || '-')}</span></td>
                <td class="text-center">
                    <span class="badge" style="background: ${roleInfo.color}; padding: 5px 12px;">
                        ${roleInfo.label}
                    </span>
                </span></td>
                <td class="text-center"><small>${permSummary}</small></span></td>
                <td>${createdAt}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="editUser('${u.id}')" title="Edit Role">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${u.email !== currentUser?.email ? 
                        `<button class="btn btn-sm btn-danger" onclick="deleteUserItem('${u.id}')" title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>` : 
                        `<button class="btn btn-sm btn-secondary" disabled title="Cannot delete yourself">
                            <i class="fas fa-user"></i>
                        </button>`
                    }
                </span></td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
}

// ============================================
// FILTER USERS TABLE
// ============================================

window.filterUsersTable = function() {
    const search = document.getElementById('usersSearchInput')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#usersTableBody tr');
    
    rows.forEach(row => {
        if (row.cells && row.cells.length > 1) {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(search) ? '' : 'none';
        }
    });
};

// ============================================
// EDIT USER ROLE
// ============================================

window.editUser = async function(id) {
    const user = allUsersList.find(u => u.id === id);
    if (!user) return;
    
    let roleOptions = '';
    for (const role of availableRoles) {
        roleOptions += `<option value="${role.value}" ${user.role === role.value ? 'selected' : ''}>${role.label} - ${role.description}</option>`;
    }
    
    Swal.fire({
        title: '<i class="fas fa-edit"></i> Edit User',
        html: `
            <div class="text-start">
                <p><strong>User:</strong> ${escapeHtml(user.email)}</p>
                <p><strong>Current Role:</strong> <span class="badge" style="background: ${availableRoles.find(r => r.value === user.role)?.color || '#6c757d'}">${user.role}</span></p>
                <div class="mb-3">
                    <label class="form-label fw-bold">New Role</label>
                    <select id="newUserRole" class="form-select">
                        ${roleOptions}
                    </select>
                </div>
                <div class="alert alert-warning mt-3">
                    <i class="fas fa-exclamation-triangle"></i> 
                    <strong>Note:</strong> Changing the role will update what the user can access in the system.
                </div>
            </div>
        `,
        width: '550px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Update Role',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const newRole = document.getElementById('newUserRole').value;
            if (!newRole) {
                Swal.showValidationMessage('Please select a role!');
                return false;
            }
            return { newRole };
        }
    }).then(async (result) => {
        if (result.value) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await updateUserRole(id, result.value.newRole);
                Swal.fire('Success!', 'User role updated successfully.', 'success');
                await loadUsersTable();
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    });
};

// ============================================
// DELETE USER
// ============================================

window.deleteUserItem = async function(id) {
    const user = allUsersList.find(u => u.id === id);
    if (!user) return;
    
    if (user.email === currentUser?.email) {
        Swal.fire('Cannot Delete', 'You cannot delete your own account!', 'warning');
        return;
    }
    
    const result = await Swal.fire({
        title: 'Delete User?',
        html: `
            <p>Are you sure you want to delete:</p>
            <p><strong>${escapeHtml(user.email)}</strong></p>
            <p><strong>Role:</strong> ${user.role}</p>
            <p class="text-danger mt-3">This action cannot be undone!</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: '<i class="fas fa-trash"></i> Yes, Delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            await deleteUserFromDB(id);
            Swal.fire('Deleted!', 'User has been removed.', 'success');
            await loadUsersTable();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
};

// ============================================
// EXPORT USERS DATA
// ============================================

window.exportUsersData = async function() {
    await getUsers();
    
    const exportData = allUsersList.map(u => ({
        'Email': u.email,
        'Name': u.name || '-',
        'Role': u.role,
        'Created At': u.created_at ? new Date(u.created_at).toLocaleDateString() : '-',
        'Last Updated': u.updated_at ? new Date(u.updated_at).toLocaleDateString() : '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, `Users_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    Swal.fire('Exported!', `${exportData.length} users exported.`, 'success');
};

// ============================================
// REFRESH USERS TABLE
// ============================================

window.refreshUsersTable = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadUsersTable();
    Swal.fire('Refreshed!', 'Users table updated.', 'success');
};

// ============================================
// GET VISIBLE MENUS FOR SIDEBAR
// ============================================

function getVisibleMenus() {
    const allMenus = [
        { page: "dashboard", icon: "fa-tachometer-alt", label: "Dashboard", module: "dashboard" },
        { page: "users", icon: "fa-users-cog", label: "User Management", module: "users" },
        { page: "students", icon: "fa-users", label: "Students", module: "students" },
        { page: "teachers", icon: "fa-chalkboard-user", label: "Teachers", module: "teachers" },
        { page: "subjects", icon: "fa-book-open", label: "Subjects", module: "subjects" },
        { page: "marks", icon: "fa-chart-line", label: "Marks", module: "marks" },
        { page: "attendance", icon: "fa-calendar-check", label: "Attendance", module: "attendance" },
        { page: "library", icon: "fa-book", label: "Library", module: "library" },
        { page: "payments", icon: "fa-credit-card", label: "Payments", module: "payments" },
        { page: "reports", icon: "fa-file-alt", label: "Reports", module: "reports" },
        { page: "promotion", icon: "fa-arrow-up", label: "Promotion", module: "promotion" },
        { page: "settings", icon: "fa-cog", label: "Settings", module: "settings" }
    ];
    
    return allMenus.filter(menu => hasPermission(menu.module, 'view'));
}

// ============================================
// UPDATE SIDEBAR WITH PERMISSIONS
// ============================================

function renderSidebarWithPermissions() {
    const visibleMenus = getVisibleMenus();
    const container = document.getElementById('sidebarNav');
    
    if (!container) return;
    
    container.innerHTML = '<div class="px-3 py-2 small text-white-50">MAIN MENU</div>';
    
    visibleMenus.forEach(item => {
        container.innerHTML += `
            <div class="nav-item" data-page="${item.page}">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </div>
        `;
    });
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => { 
            loadPage(el.dataset.page); 
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); 
            el.classList.add('active'); 
        });
    });
}

// ============================================
// HELPER FUNCTION
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ============================================
// COMPLETE SETTINGS MODULE - FINAL WORKING CODE
// Includes: Working Tabs | Logo Upload | School Info | Leadership | Class Teachers | Mission & Vision
// ============================================

// ============================================
// PART 1: GLOBAL VARIABLES
// ============================================

let schoolLogoData = null;
let currentSchoolData = null;

// ============================================
// PART 2: HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setFormValue(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
        el.value = value;
    }
}

// ============================================
// PART 3: LOAD SCHOOL SETTINGS FROM DATABASE
// ============================================

async function loadSchoolSettings() {
    if (!sb) return {};
    
    try {
        const { data, error } = await sb
            .from('school_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            console.error("Error loading school settings:", error);
            return {};
        }
        
        if (data) {
            console.log("✅ School settings loaded:", data.school_name);
            currentSchoolData = data;
            schoolLogoData = data.school_logo;
            
            // Update sidebar
            updateSidebarWithSchoolData(data);
            
            return data;
        }
        return {};
    } catch (e) {
        console.error("Error:", e);
        return {};
    }
}

// ============================================
// PART 4: UPDATE SIDEBAR
// ============================================

function updateSidebarWithSchoolData(data) {
    if (!data) return;
    
    const sidebarSchoolName = document.getElementById('sidebarSchoolName');
    if (sidebarSchoolName) {
        sidebarSchoolName.textContent = data.school_name || 'School Name';
    }
    
    const sidebarLogo = document.getElementById('sidebarLogo');
    if (sidebarLogo) {
        if (data.school_logo && data.school_logo !== '') {
            sidebarLogo.innerHTML = `<img src="${data.school_logo}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">`;
        } else {
            sidebarLogo.innerHTML = `<i class="fas fa-school" style="font-size: 24px;"></i>`;
        }
    }
}

// ============================================
// PART 5: LOGO MANAGEMENT
// ============================================

window.previewSchoolLogo = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            schoolLogoData = e.target.result;
            
            const preview = document.getElementById('logoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }
            
            const sidebarLogo = document.getElementById('sidebarLogo');
            if (sidebarLogo) {
                sidebarLogo.innerHTML = `<img src="${e.target.result}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.updateLogoOnly = async function() {
    // Check if a new logo was selected
    if (!schoolLogoData) {
        Swal.fire('Error', 'Please select an image first', 'error');
        return;
    }
    
    // Get the existing school record
    const { data: existing, error: fetchError } = await sb
        .from('school_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
    
    if (fetchError) {
        console.error("Fetch error:", fetchError);
        Swal.fire('Error', 'Could not fetch school record', 'error');
        return;
    }
    
    if (!existing) {
        Swal.fire('Error', 'No school record found. Please save school info first.', 'error');
        return;
    }
    
    Swal.fire({
        title: 'Updating Logo...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });
    
    // UPDATE only the logo field (replace existing)
    const { error } = await sb
        .from('school_settings')
        .update({ 
            school_logo: schoolLogoData,
            updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    
    Swal.close();
    
    if (error) {
        console.error("Logo update error:", error);
        Swal.fire('Error', error.message, 'error');
    } else {
        // Update local data
        if (currentSchoolData) {
            currentSchoolData.school_logo = schoolLogoData;
        }
        
        // Update sidebar logo immediately
        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo) {
            sidebarLogo.innerHTML = `<img src="${schoolLogoData}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">`;
        }
        
        // Update logo preview in settings form
        const logoPreview = document.getElementById('logoPreview');
        if (logoPreview) {
            logoPreview.innerHTML = `<img src="${schoolLogoData}" style="width: 100px; height: 100px; border-radius: 10px; object-fit: cover; border: 2px solid #ff862d;">`;
        }
        
        // Clear temp logo variable
        schoolLogoData = null;
        
        Swal.fire({
            title: 'Success!',
            text: 'School logo updated successfully!',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
    }
};

// ============================================
// PART 6: SAVE FUNCTIONS
// ============================================

window.updateSchoolSettings = async function() {
    const existing = await loadSchoolSettings();
    
    const formData = {
        school_name: document.getElementById('schoolName')?.value || '',
        school_motto: document.getElementById('schoolMotto')?.value || '',
        school_address: document.getElementById('schoolAddress')?.value || '',
        school_phone: document.getElementById('schoolPhone')?.value || '',
        school_email: document.getElementById('schoolEmail')?.value || '',
        school_website: document.getElementById('schoolWebsite')?.value || '',
        principal_name: document.getElementById('principalName')?.value || '',
        vice_principal_name: document.getElementById('vicePrincipalName')?.value || '',
        director_name: document.getElementById('directorName')?.value || '',
        school_logo: schoolLogoData || (existing ? existing.school_logo : null),
        updated_at: new Date().toISOString()
    };
    
    if (existing && existing.id) formData.id = existing.id;
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await sb.from('school_settings').upsert(formData);
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        schoolLogoData = null;
        await loadSchoolSettings();
        Swal.fire({ title: 'Success!', text: 'School information saved!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
};

window.saveSchoolLeadership = async function() {
    const existing = await loadSchoolSettings();
    const formData = {
        headmaster_name: document.getElementById('headmasterName')?.value || '',
        headmistress_name: document.getElementById('headmistressName')?.value || '',
        bursar_name: document.getElementById('bursarName')?.value || '',
        secretary_name: document.getElementById('secretaryName')?.value || '',
        disciplinary_officer_name: document.getElementById('disciplinaryOfficerName')?.value || '',
        warden_boys_name: document.getElementById('wardenBoysName')?.value || '',
        warden_girls_name: document.getElementById('wardenGirlsName')?.value || '',
        updated_at: new Date().toISOString()
    };
    
    if (existing && existing.id) {
        formData.id = existing.id;
        formData.school_name = existing.school_name;
        formData.school_logo = existing.school_logo;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await sb.from('school_settings').upsert(formData);
    Swal.close();
    if (error) Swal.fire('Error', error.message, 'error');
    else Swal.fire({ title: 'Success!', text: 'School leadership saved!', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.saveStudentLeadership = async function() {
    const existing = await loadSchoolSettings();
    const formData = {
        head_prefect_name: document.getElementById('headPrefectName')?.value || '',
        head_boy_name: document.getElementById('headBoyName')?.value || '',
        head_girl_name: document.getElementById('headGirlName')?.value || '',
        academic_prefect_name: document.getElementById('academicPrefectName')?.value || '',
        discipline_prefect_name: document.getElementById('disciplinePrefectName')?.value || '',
        house_prefect_name: document.getElementById('housePrefectName')?.value || '',
        updated_at: new Date().toISOString()
    };
    
    if (existing && existing.id) {
        formData.id = existing.id;
        formData.school_name = existing.school_name;
        formData.school_logo = existing.school_logo;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await sb.from('school_settings').upsert(formData);
    Swal.close();
    if (error) Swal.fire('Error', error.message, 'error');
    else Swal.fire({ title: 'Success!', text: 'Student leadership saved!', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.saveClassTeachers = async function() {
    const existing = await loadSchoolSettings();
    const formData = { updated_at: new Date().toISOString() };
    
    for (let i = 1; i <= 4; i++) {
        for (const stream of ['a', 'b', 'c', 'd']) {
            formData[`teacher_s${i}_${stream}`] = document.getElementById(`teacher_s${i}_${stream}`)?.value || '';
            formData[`teacher_s${i}_${stream}_phone`] = document.getElementById(`teacher_s${i}_${stream}_phone`)?.value || '';
        }
    }
    
    for (let i = 5; i <= 6; i++) {
        for (const stream of ['arts', 'sciences']) {
            formData[`teacher_s${i}_${stream}`] = document.getElementById(`teacher_s${i}_${stream}`)?.value || '';
            formData[`teacher_s${i}_${stream}_phone`] = document.getElementById(`teacher_s${i}_${stream}_phone`)?.value || '';
        }
    }
    
    if (existing && existing.id) {
        formData.id = existing.id;
        formData.school_name = existing.school_name;
        formData.school_logo = existing.school_logo;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await sb.from('school_settings').upsert(formData);
    Swal.close();
    if (error) Swal.fire('Error', error.message, 'error');
    else Swal.fire({ title: 'Success!', text: 'Class teachers saved!', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.saveMissionVision = async function() {
    const existing = await loadSchoolSettings();
    const formData = {
        mission_statement: document.getElementById('missionStatement')?.value || '',
        vision_statement: document.getElementById('visionStatement')?.value || '',
        updated_at: new Date().toISOString()
    };
    
    if (existing && existing.id) {
        formData.id = existing.id;
        formData.school_name = existing.school_name;
        formData.school_logo = existing.school_logo;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await sb.from('school_settings').upsert(formData);
    Swal.close();
    if (error) Swal.fire('Error', error.message, 'error');
    else Swal.fire({ title: 'Success!', text: 'Mission & Vision saved!', icon: 'success', timer: 1500, showConfirmButton: false });
};

// ============================================
// PART 7: TAB SWITCHING FUNCTION (WORKING)
// ============================================

function showTab(tabName) {
    // Hide all panels
    const allPanels = document.querySelectorAll('.tab-panel');
    for (let i = 0; i < allPanels.length; i++) {
        allPanels[i].classList.remove('active');
    }
    
    // Remove active class from all buttons
    const allButtons = document.querySelectorAll('.tab-btn');
    for (let i = 0; i < allButtons.length; i++) {
        allButtons[i].classList.remove('active');
    }
    
    // Show selected panel
    const selectedPanel = document.getElementById(`tab-${tabName}`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }
    
    // Add active class to clicked button
    const clickedButton = event.target;
    clickedButton.classList.add('active');
    
    console.log("Switched to tab:", tabName);
}

// ============================================
// PART 8: RENDER SCHOOL INFO TAB CONTENT
// ============================================

async function renderSchoolInfoTabContent() {
    const school = currentSchoolData || {};
    
    // Generate class teacher rows
    let classTeacherRows = '';
    
    // O-Level S.1 to S.4
    for (let i = 1; i <= 4; i++) {
        for (const stream of ['a', 'b', 'c', 'd']) {
            const teacherValue = school[`teacher_s${i}_${stream}`] || '';
            const phoneValue = school[`teacher_s${i}_${stream}_phone`] || '';
            classTeacherRows += `
                <tr>
                    <td>S.${i}</td>
                    <td>${stream.toUpperCase()}</td>
                    <td><input type="text" id="teacher_s${i}_${stream}" class="form-control" value="${escapeHtml(teacherValue)}"></td>
                    <td><input type="text" id="teacher_s${i}_${stream}_phone" class="form-control" value="${escapeHtml(phoneValue)}"></td>
                </tr>
            `;
        }
    }
    
    // A-Level S.5 and S.6
    for (let i = 5; i <= 6; i++) {
        for (const stream of ['arts', 'sciences']) {
            const teacherValue = school[`teacher_s${i}_${stream}`] || '';
            const phoneValue = school[`teacher_s${i}_${stream}_phone`] || '';
            const streamLabel = stream === 'arts' ? 'Arts' : 'Sciences';
            classTeacherRows += `
                <tr>
                    <td>S.${i}</td>
                    <td>${streamLabel}</td>
                    <td><input type="text" id="teacher_s${i}_${stream}" class="form-control" value="${escapeHtml(teacherValue)}"></td>
                    <td><input type="text" id="teacher_s${i}_${stream}_phone" class="form-control" value="${escapeHtml(phoneValue)}"></td>
                </tr>
            `;
        }
    }
    
    return `
        <!-- SCHOOL INFORMATION -->
        <div class="info-card">
            <h5><i class="fas fa-building"></i> School Information</h5>
            <div class="row">
                <div class="col-md-3 text-center">
                    <div class="logo-preview" id="logoPreview" style="width: 120px; height: 120px; margin: 0 auto 15px; border-radius: 15px; overflow: hidden; border: 3px solid #ff862d; background: #f8f9fa; display: flex; align-items: center; justify-content: center;">
                        ${school.school_logo ? `<img src="${school.school_logo}" style="width: 100%; height: 100%; object-fit: cover;">` : '<i class="fas fa-school" style="font-size: 48px; color: #c0c0c0;"></i>'}
                    </div>
                    <input type="file" id="schoolLogoInput" accept="image/*" class="form-control mb-2" onchange="previewSchoolLogo(this)">
                    <button class="btn btn-warning btn-sm w-100" onclick="updateLogoOnly()">Update Logo Only</button>
                </div>
                <div class="col-md-9">
                    <div class="row g-3">
                        <div class="col-md-6"><label class="form-label">School Name</label><input type="text" id="schoolName" class="form-control" value="${escapeHtml(school.school_name || '')}"></div>
                        <div class="col-md-6"><label class="form-label">School Motto</label><input type="text" id="schoolMotto" class="form-control" value="${escapeHtml(school.school_motto || '')}"></div>
                        <div class="col-md-6"><label class="form-label">Address</label><input type="text" id="schoolAddress" class="form-control" value="${escapeHtml(school.school_address || '')}"></div>
                        <div class="col-md-6"><label class="form-label">Phone</label><input type="text" id="schoolPhone" class="form-control" value="${escapeHtml(school.school_phone || '')}"></div>
                        <div class="col-md-6"><label class="form-label">Email</label><input type="email" id="schoolEmail" class="form-control" value="${escapeHtml(school.school_email || '')}"></div>
                        <div class="col-md-6"><label class="form-label">Website</label><input type="text" id="schoolWebsite" class="form-control" value="${escapeHtml(school.school_website || '')}"></div>
                        <div class="col-md-4"><label class="form-label">Principal</label><input type="text" id="principalName" class="form-control" value="${escapeHtml(school.principal_name || '')}"></div>
                        <div class="col-md-4"><label class="form-label">Vice Principal</label><input type="text" id="vicePrincipalName" class="form-control" value="${escapeHtml(school.vice_principal_name || '')}"></div>
                        <div class="col-md-4"><label class="form-label">Director</label><input type="text" id="directorName" class="form-control" value="${escapeHtml(school.director_name || '')}"></div>
                    </div>
                </div>
            </div>
            <div class="text-end mt-4"><button class="save-btn" onclick="updateSchoolSettings()">Save School Info</button></div>
        </div>
        
        <!-- SCHOOL LEADERSHIP -->
        <div class="info-card">
            <h5><i class="fas fa-user-tie"></i> School Leadership</h5>
            <div class="row g-3">
                <div class="col-md-4"><label>Headmaster</label><input type="text" id="headmasterName" class="form-control" value="${escapeHtml(school.headmaster_name || '')}"></div>
                <div class="col-md-4"><label>Headmistress</label><input type="text" id="headmistressName" class="form-control" value="${escapeHtml(school.headmistress_name || '')}"></div>
                <div class="col-md-4"><label>Bursar</label><input type="text" id="bursarName" class="form-control" value="${escapeHtml(school.bursar_name || '')}"></div>
                <div class="col-md-4"><label>Secretary</label><input type="text" id="secretaryName" class="form-control" value="${escapeHtml(school.secretary_name || '')}"></div>
                <div class="col-md-4"><label>Disciplinary Officer</label><input type="text" id="disciplinaryOfficerName" class="form-control" value="${escapeHtml(school.disciplinary_officer_name || '')}"></div>
                <div class="col-md-4"><label>Warden (Boys)</label><input type="text" id="wardenBoysName" class="form-control" value="${escapeHtml(school.warden_boys_name || '')}"></div>
                <div class="col-md-4"><label>Warden (Girls)</label><input type="text" id="wardenGirlsName" class="form-control" value="${escapeHtml(school.warden_girls_name || '')}"></div>
            </div>
            <div class="text-end mt-3"><button class="save-btn" onclick="saveSchoolLeadership()">Save Leadership</button></div>
        </div>
        
        <!-- STUDENT LEADERSHIP -->
        <div class="info-card">
            <h5><i class="fas fa-crown"></i> Student Leadership</h5>
            <div class="row g-3">
                <div class="col-md-4"><label>Head Prefect</label><input type="text" id="headPrefectName" class="form-control" value="${escapeHtml(school.head_prefect_name || '')}"></div>
                <div class="col-md-4"><label>Head Boy</label><input type="text" id="headBoyName" class="form-control" value="${escapeHtml(school.head_boy_name || '')}"></div>
                <div class="col-md-4"><label>Head Girl</label><input type="text" id="headGirlName" class="form-control" value="${escapeHtml(school.head_girl_name || '')}"></div>
                <div class="col-md-4"><label>Academic Prefect</label><input type="text" id="academicPrefectName" class="form-control" value="${escapeHtml(school.academic_prefect_name || '')}"></div>
                <div class="col-md-4"><label>Discipline Prefect</label><input type="text" id="disciplinePrefectName" class="form-control" value="${escapeHtml(school.discipline_prefect_name || '')}"></div>
                <div class="col-md-4"><label>House Prefect</label><input type="text" id="housePrefectName" class="form-control" value="${escapeHtml(school.house_prefect_name || '')}"></div>
            </div>
            <div class="text-end mt-3"><button class="save-btn" onclick="saveStudentLeadership()">Save Student Leadership</button></div>
        </div>
        
        <!-- CLASS TEACHERS -->
        <div class="info-card">
            <h5><i class="fas fa-chalkboard"></i> Class Teachers</h5>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-primary">
                        <tr><th>Class</th><th>Stream</th><th>Teacher Name</th><th>Phone</th></tr>
                    </thead>
                    <tbody>${classTeacherRows}</tbody>
                </table>
            </div>
            <div class="text-end mt-3"><button class="save-btn" onclick="saveClassTeachers()">Save Class Teachers</button></div>
        </div>
        
        <!-- MISSION & VISION -->
        <div class="info-card">
            <h5><i class="fas fa-bullseye"></i> Mission & Vision</h5>
            <div class="row g-3">
                <div class="col-12"><label>Mission Statement</label><textarea id="missionStatement" class="form-control" rows="3">${escapeHtml(school.mission_statement || '')}</textarea></div>
                <div class="col-12"><label>Vision Statement</label><textarea id="visionStatement" class="form-control" rows="3">${escapeHtml(school.vision_statement || '')}</textarea></div>
            </div>
            <div class="text-end mt-3"><button class="save-btn" onclick="saveMissionVision()">Save Mission & Vision</button></div>
        </div>
    `;
}

// ============================================
// PART 9: RENDER MAIN SETTINGS PAGE
// ============================================

// ============================================
// PART 9: RENDER MAIN SETTINGS PAGE (UPDATED WITH O-LEVEL)
// ============================================

async function renderSettings() {
    await loadSchoolSettings();
    
    // Load O-Level data
    const olevelGrades = await loadOlevelGrades();
    const olevelComponents = await loadOlevelAssessmentComponents();
    const olevelPromotion = await loadOlevelPromotion();
    
    // Default grades if none exist
    const defaultGrades = [
        { grade: 'A', min_percentage: 90, max_percentage: 100, points: 1, description: 'Excellent', competency_level: 'Outstanding', color_code: '#2ecc71', remark: 'Distinction' },
        { grade: 'B', min_percentage: 80, max_percentage: 89, points: 2, description: 'Very Good', competency_level: 'Highly Proficient', color_code: '#3498db', remark: 'Credit' },
        { grade: 'C', min_percentage: 70, max_percentage: 79, points: 3, description: 'Good', competency_level: 'Proficient', color_code: '#f39c12', remark: 'Credit' },
        { grade: 'D', min_percentage: 60, max_percentage: 69, points: 4, description: 'Satisfactory', competency_level: 'Basic', color_code: '#e67e22', remark: 'Pass' },
        { grade: 'E', min_percentage: 50, max_percentage: 59, points: 5, description: 'Minimum Pass', competency_level: 'Elementary', color_code: '#e74c3c', remark: 'Pass' },
        { grade: 'F', min_percentage: 0, max_percentage: 49, points: 6, description: 'Fail', competency_level: 'Below Expected', color_code: '#c0392b', remark: 'Fail' }
    ];
    
    const displayGrades = olevelGrades.length > 0 ? olevelGrades : defaultGrades;
    
    // Default components if none exist
    const defaultComponents = [
        { component_type: 'continuous', component_name: 'Continuous Assessment', weight_percentage: 30 },
        { component_type: 'project', component_name: 'Project Work', weight_percentage: 20 },
        { component_type: 'exam', component_name: 'End of Term Exam', weight_percentage: 50 }
    ];
    
    const displayComponents = olevelComponents.length > 0 ? olevelComponents : defaultComponents;
    
    // Generate O-Level grades table HTML
    const olevelGradesHtml = displayGrades.map(g => `
        <tr>
            <td class="text-center"><span class="grade-badge" style="display:inline-block; width:50px; height:50px; line-height:50px; text-align:center; border-radius:12px; font-weight:bold; font-size:20px; background:${g.color_code || '#2ecc71'}; color:white;">${g.grade}</span></td>
            <td><input type="number" id="omin_${g.grade}" class="form-control form-control-sm" value="${g.min_percentage}" style="width:100px" min="0" max="100"></span></td>
            <td><input type="number" id="omax_${g.grade}" class="form-control form-control-sm" value="${g.max_percentage}" style="width:100px" min="0" max="100"></span></td>
            <td><input type="number" id="opoints_${g.grade}" class="form-control form-control-sm" value="${g.points}" style="width:80px" min="1" max="12"></span></td>
            <td><input type="text" id="odesc_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.description || '')}"></span></td>
            <td><input type="text" id="ocomp_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.competency_level || '')}"></span></td>
            <td><input type="color" id="ocolor_${g.grade}" class="form-control form-control-sm" value="${g.color_code || '#2ecc71'}" style="width:60px"></span></td>
            <td><input type="text" id="oremark_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.remark || '')}"></span></td>
            <td><button class="btn btn-sm btn-primary" onclick="saveOlevelGrade('${g.grade}')"><i class="fas fa-save"></i> Save</button></span></td>
        </tr>
    `).join('');
    
    // Generate O-Level components HTML
    const olevelComponentsHtml = displayComponents.map(c => `
        <div class="col-md-4 mb-3">
            <div class="card text-center p-3 h-100">
                <div class="card-body">
                    <i class="fas fa-${c.component_type === 'continuous' ? 'tasks' : c.component_type === 'project' ? 'project-diagram' : 'file-alt'} fa-2x mb-2" style="color:#01605a"></i>
                    <h6>${c.component_name}</h6>
                    <h3 class="text-primary">${c.weight_percentage}%</h3>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="editComponent('${c.component_type}', ${c.weight_percentage})">
                        <i class="fas fa-edit"></i> Edit Weight
                    </button>
                </div>
            </div>
        </div>
    `).join('');

  // ============================================
// PART 2: SETTINGS PAGE INTEGRATION
// UPDATED: Added ICT and Subsidiary Mathematics
// ============================================

// In renderSettings() function, add these data loads right after loading O-Level data:

// Load A-Level data
const alevelPrincipal = await loadAlevelPrincipalGrades();
const alevelSubsidiary = await loadAlevelSubsidiaryGrades();
const alevelDivisions = await loadAlevelDivisions();
const alevelUniversity = await loadAlevelUniversityEntry();
const subsidiarySubjects = await loadSubsidiarySubjects(); // NEW: Includes ICT & SubMath

// ============================================
// DEFAULT PRINCIPAL GRADES (A-Level)
// ============================================
const defaultPrincipalGrades = [
    { grade: 'A', min_percentage: 80, max_percentage: 100, points: 6, grade_point: 6.0, classification: 'Distinction', university_entry: 'Yes', color_code: '#2ecc71', remark: 'Excellent' },
    { grade: 'B', min_percentage: 70, max_percentage: 79, points: 5, grade_point: 5.0, classification: 'Very Good', university_entry: 'Yes', color_code: '#3498db', remark: 'Very Good' },
    { grade: 'C', min_percentage: 60, max_percentage: 69, points: 4, grade_point: 4.0, classification: 'Good', university_entry: 'Yes', color_code: '#f39c12', remark: 'Good' },
    { grade: 'D', min_percentage: 50, max_percentage: 59, points: 3, grade_point: 3.0, classification: 'Credit', university_entry: 'Considered', color_code: '#e67e22', remark: 'Satisfactory' },
    { grade: 'E', min_percentage: 40, max_percentage: 49, points: 2, grade_point: 2.0, classification: 'Pass', university_entry: 'No', color_code: '#e74c3c', remark: 'Minimum Pass' },
    { grade: 'O', min_percentage: 35, max_percentage: 39, points: 1, grade_point: 1.0, classification: 'Ordinary', university_entry: 'No', color_code: '#95a5a6', remark: 'Ordinary Pass' },
    { grade: 'F', min_percentage: 0, max_percentage: 34, points: 0, grade_point: 0, classification: 'Fail', university_entry: 'No', color_code: '#c0392b', remark: 'Fail' }
];

const displayPrincipalGrades = alevelPrincipal.length > 0 ? alevelPrincipal : defaultPrincipalGrades;

// ============================================
// DEFAULT SUBSIDIARY GRADES (For ICT, SubMath, etc.)
// ============================================
const defaultSubsidiaryGrades = [
    { grade: 'A', min_percentage: 80, max_percentage: 100, points: 6, grade_point: 6.0, description: 'Excellent - Outstanding performance in ICT/SubMath', color_code: '#2ecc71' },
    { grade: 'B', min_percentage: 70, max_percentage: 79, points: 5, grade_point: 5.0, description: 'Very Good - Strong understanding', color_code: '#3498db' },
    { grade: 'C', min_percentage: 60, max_percentage: 69, points: 4, grade_point: 4.0, description: 'Good - Satisfactory performance', color_code: '#f39c12' },
    { grade: 'D', min_percentage: 50, max_percentage: 59, points: 3, grade_point: 3.0, description: 'Credit - Acceptable', color_code: '#e67e22' },
    { grade: 'E', min_percentage: 40, max_percentage: 49, points: 2, grade_point: 2.0, description: 'Pass - Minimum requirement met', color_code: '#e74c3c' },
    { grade: 'O', min_percentage: 35, max_percentage: 39, points: 1, grade_point: 1.0, description: 'Ordinary - Below average', color_code: '#95a5a6' },
    { grade: 'F', min_percentage: 0, max_percentage: 34, points: 0, grade_point: 0, description: 'Fail - Needs improvement', color_code: '#c0392b' }
];

const displaySubsidiaryGrades = alevelSubsidiary.length > 0 ? alevelSubsidiary : defaultSubsidiaryGrades;

// ============================================
// DEFAULT DIVISIONS (A-Level)
// ============================================
const defaultDivisions = [
    { division_name: 'Division I', min_points: 18, max_points: 25, description: 'Distinction - Excellent Performance', color_code: '#2ecc71' },
    { division_name: 'Division II', min_points: 15, max_points: 17, description: 'Credit - Very Good Performance', color_code: '#3498db' },
    { division_name: 'Division III', min_points: 12, max_points: 14, description: 'Pass - Good Performance', color_code: '#f39c12' },
    { division_name: 'Division IV', min_points: 9, max_points: 11, description: 'Minimum Pass - Satisfactory', color_code: '#e67e22' },
    { division_name: 'Fail', min_points: 0, max_points: 8, description: 'Fail - Below Requirements', color_code: '#e74c3c' }
];

const displayDivisions = alevelDivisions.length > 0 ? alevelDivisions : defaultDivisions;

// ============================================
// GENERATE A-LEVEL PRINCIPAL GRADES HTML
// ============================================
const alevelPrincipalHtml = displayPrincipalGrades.map(g => `
    <tr>
        <td class="text-center"><span class="grade-badge" style="background:${g.color_code || '#2ecc71'}">${g.grade}</span></td>
        <td><input type="number" id="ap_min_${g.grade}" class="form-control form-control-sm" value="${g.min_percentage}" style="width:80px" min="0" max="100"></td>
        <td><input type="number" id="ap_max_${g.grade}" class="form-control form-control-sm" value="${g.max_percentage}" style="width:80px" min="0" max="100"></td>
        <td><input type="number" id="ap_points_${g.grade}" class="form-control form-control-sm" value="${g.points}" style="width:70px" min="0" max="12"></td>
        <td><input type="number" id="ap_gp_${g.grade}" class="form-control form-control-sm" value="${g.grade_point}" step="0.5" style="width:70px" min="0" max="12"></td>
        <td><input type="text" id="ap_class_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.classification || '')}" style="width:100px"></td>
        <td><input type="text" id="ap_uni_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.university_entry || '')}" style="width:80px"></td>
        <td><input type="color" id="ap_color_${g.grade}" class="form-control form-control-sm" value="${g.color_code || '#2ecc71'}" style="width:60px"></td>
        <td><input type="text" id="ap_remark_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.remark || '')}"></td>
        <td><button class="btn btn-sm btn-primary" onclick="saveAlevelPrincipalGrade('${g.grade}')"><i class="fas fa-save"></i></button></td>
    </tr>
`).join('');

// ============================================
// GENERATE A-LEVEL SUBSIDIARY GRADES HTML
// (For ICT, SubMath, General Paper, etc.)
// ============================================
const alevelSubsidiaryHtml = displaySubsidiaryGrades.map(g => `
    <tr>
        <td class="text-center"><span class="grade-badge" style="background:${g.color_code || '#2ecc71'}">${g.grade}</span></td>
        <td><input type="number" id="as_min_${g.grade}" class="form-control form-control-sm" value="${g.min_percentage}" style="width:80px" min="0" max="100"></td>
        <td><input type="number" id="as_max_${g.grade}" class="form-control form-control-sm" value="${g.max_percentage}" style="width:80px" min="0" max="100"></td>
        <td><input type="number" id="as_points_${g.grade}" class="form-control form-control-sm" value="${g.points}" step="0.5" style="width:70px" min="0" max="12"></td>
        <td><input type="number" id="as_gp_${g.grade}" class="form-control form-control-sm" value="${g.grade_point}" step="0.5" style="width:70px" min="0" max="12"></td>
        <td><input type="text" id="as_desc_${g.grade}" class="form-control form-control-sm" value="${escapeHtml(g.description || '')}"></td>
        <td><input type="color" id="as_color_${g.grade}" class="form-control form-control-sm" value="${g.color_code || '#2ecc71'}" style="width:60px"></td>
        <td><button class="btn btn-sm btn-primary" onclick="saveAlevelSubsidiaryGrade('${g.grade}')"><i class="fas fa-save"></i></button></td>
    </tr>
`).join('');

// ============================================
// GENERATE A-LEVEL DIVISIONS HTML
// ============================================
const alevelDivisionsHtml = displayDivisions.map(d => `
    <tr>
        <td><strong>${d.division_name}</strong></td>
        <td><input type="number" id="div_min_${d.division_name.replace(/\s/g, '_')}" class="form-control form-control-sm" value="${d.min_points}" style="width:80px" min="0" max="30"></td>
        <td><input type="number" id="div_max_${d.division_name.replace(/\s/g, '_')}" class="form-control form-control-sm" value="${d.max_points}" style="width:80px" min="0" max="30"></td>
        <td><input type="text" id="div_desc_${d.division_name.replace(/\s/g, '_')}" class="form-control form-control-sm" value="${escapeHtml(d.description || '')}"></td>
        <td><input type="color" id="div_color_${d.division_name.replace(/\s/g, '_')}" class="form-control form-control-sm" value="${d.color_code || '#f39c12'}" style="width:60px"></td>
        <td><button class="btn btn-sm btn-primary" onclick="saveAlevelDivision('${d.division_name.replace(/\s/g, '_')}')"><i class="fas fa-save"></i></button></td>
    </tr>
`).join('');

// ============================================
// GENERATE SUBSIDIARY SUBJECTS LIST HTML
// (SHOWING ICT, SubMath, with Edit & Delete buttons)
// ============================================
const subsidiarySubjectsHtml = subsidiarySubjects.map(sub => `
    <tr>
        <td><strong>${escapeHtml(sub.subject_name)}</strong>${sub.subject_name === 'ICT' ? ' <span class="badge bg-info">NEW</span>' : ''}${sub.subject_name === 'Subsidiary Mathematics' ? ' <span class="badge bg-success">NEW</span>' : ''}</td>
        <td>${sub.code || '-'}</td>
        <td>${sub.category || 'Elective'}</td>
        <td>
            <button class="btn btn-sm btn-outline-warning me-1" onclick="editSubsidiarySubject('${sub.id}', '${escapeHtml(sub.subject_name)}', '${escapeHtml(sub.code || '')}', '${escapeHtml(sub.category || 'Elective')}')">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteSubsidiarySubject('${sub.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </span>
    </tr>
`).join('');

// ============================================
// PART 2: FEE STRUCTURE HTML GENERATION WITH .join('')
// ============================================

async function generateOlevelDayHtml() {
    const feeData = await loadFeeStructure();
    const olevelClasses = ['S.1', 'S.2', 'S.3', 'S.4'];
    
    const html = olevelClasses.map(className => {
        const day = feeData.find(f => f.class_name === className && f.student_type === 'day') || {};
        const total = (day.tuition || 0) + (day.development_fee || 0) + (day.activity_fee || 0) + (day.library_fee || 0) + (day.sports_fee || 0);
        
        return `
            <tr>
                <td><strong>${className}</strong></td>
                <td><input type="number" id="olevel_day_tuition_${className}" class="form-control form-control-sm" value="${day.tuition || 0}" style="width:100px" step="1000" oninput="updateOlevelDayTotal('${className}')"></td>
                <td><input type="number" id="olevel_day_dev_${className}" class="form-control form-control-sm" value="${day.development_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelDayTotal('${className}')"></td>
                <td><input type="number" id="olevel_day_activity_${className}" class="form-control form-control-sm" value="${day.activity_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelDayTotal('${className}')"></td>
                <td><input type="number" id="olevel_day_library_${className}" class="form-control form-control-sm" value="${day.library_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelDayTotal('${className}')"></td>
                <td><input type="number" id="olevel_day_sports_${className}" class="form-control form-control-sm" value="${day.sports_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelDayTotal('${className}')"></td>
                <td><strong id="olevel_day_total_${className}" style="color:#01605a;">UGX ${total.toLocaleString()}</strong></td>
                <td><button class="btn btn-sm btn-success" onclick="saveOlevelDayFee('${className}')"><i class="fas fa-save"></i> Save</button></td>
            </tr>
        `;
    }).join('');  // ← IMPORTANT: .join('') HERE
    
    return html;
}

async function generateOlevelBoardHtml() {
    const feeData = await loadFeeStructure();
    const olevelClasses = ['S.1', 'S.2', 'S.3', 'S.4'];
    
    const html = olevelClasses.map(className => {
        const board = feeData.find(f => f.class_name === className && f.student_type === 'boarding') || {};
        const total = (board.tuition || 0) + (board.development_fee || 0) + (board.activity_fee || 0) + (board.library_fee || 0) + (board.meals_fee || 0) + (board.accommodation_fee || 0) + (board.sports_fee || 0);
        
        return `
            <tr>
                <td><strong>${className}</strong></td>
                <td><input type="number" id="olevel_board_tuition_${className}" class="form-control form-control-sm" value="${board.tuition || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_dev_${className}" class="form-control form-control-sm" value="${board.development_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_activity_${className}" class="form-control form-control-sm" value="${board.activity_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_library_${className}" class="form-control form-control-sm" value="${board.library_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_meals_${className}" class="form-control form-control-sm" value="${board.meals_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_accommodation_${className}" class="form-control form-control-sm" value="${board.accommodation_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><input type="number" id="olevel_board_sports_${className}" class="form-control form-control-sm" value="${board.sports_fee || 0}" style="width:100px" step="1000" oninput="updateOlevelBoardTotal('${className}')"></td>
                <td><strong id="olevel_board_total_${className}" style="color:#01605a;">UGX ${total.toLocaleString()}</strong></td>
                <td><button class="btn btn-sm btn-success" onclick="saveOlevelBoardFee('${className}')"><i class="fas fa-save"></i> Save</button></td>
            </tr>
        `;
    }).join('');  // ← IMPORTANT: .join('') HERE
    
    return html;
}

async function generateAlevelDayHtml() {
    const feeData = await loadFeeStructure();
    const streams = [
        { class: 'S.5', stream: 'arts', label: 'S.5 Arts' },
        { class: 'S.5', stream: 'sciences', label: 'S.5 Sciences' },
        { class: 'S.6', stream: 'arts', label: 'S.6 Arts' },
        { class: 'S.6', stream: 'sciences', label: 'S.6 Sciences' }
    ];
    
    const html = streams.map(item => {
        const day = feeData.find(f => f.class_name === item.class && f.student_type === `day_${item.stream}`) || {};
        const total = (day.tuition || 0) + (day.development_fee || 0) + (day.activity_fee || 0) + (day.library_fee || 0) + (day.sports_fee || 0);
        
        return `
            <tr>
                <td><strong>${item.label}</strong></td>
                <td><input type="number" id="alevel_day_${item.stream}_tuition_${item.class}" class="form-control form-control-sm" value="${day.tuition || 0}" style="width:100px" step="1000" oninput="updateAlevelDayTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_day_${item.stream}_dev_${item.class}" class="form-control form-control-sm" value="${day.development_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelDayTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_day_${item.stream}_activity_${item.class}" class="form-control form-control-sm" value="${day.activity_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelDayTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_day_${item.stream}_library_${item.class}" class="form-control form-control-sm" value="${day.library_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelDayTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_day_${item.stream}_sports_${item.class}" class="form-control form-control-sm" value="${day.sports_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelDayTotal('${item.class}', '${item.stream}')"></td>
                <td><strong id="alevel_day_${item.stream}_total_${item.class}" style="color:#01605a;">UGX ${total.toLocaleString()}</strong></td>
                <td><button class="btn btn-sm btn-success" onclick="saveAlevelDayFee('${item.class}', '${item.stream}')"><i class="fas fa-save"></i> Save</button></td>
            </tr>
        `;
    }).join('');  // ← IMPORTANT: .join('') HERE
    
    return html;
}

async function generateAlevelBoardHtml() {
    const feeData = await loadFeeStructure();
    const streams = [
        { class: 'S.5', stream: 'arts', label: 'S.5 Arts' },
        { class: 'S.5', stream: 'sciences', label: 'S.5 Sciences' },
        { class: 'S.6', stream: 'arts', label: 'S.6 Arts' },
        { class: 'S.6', stream: 'sciences', label: 'S.6 Sciences' }
    ];
    
    const html = streams.map(item => {
        const board = feeData.find(f => f.class_name === item.class && f.student_type === `boarding_${item.stream}`) || {};
        const total = (board.tuition || 0) + (board.development_fee || 0) + (board.activity_fee || 0) + (board.library_fee || 0) + (board.meals_fee || 0) + (board.accommodation_fee || 0) + (board.sports_fee || 0);
        
        return `
            <tr>
                <td><strong>${item.label}</strong></td>
                <td><input type="number" id="alevel_board_${item.stream}_tuition_${item.class}" class="form-control form-control-sm" value="${board.tuition || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_dev_${item.class}" class="form-control form-control-sm" value="${board.development_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_activity_${item.class}" class="form-control form-control-sm" value="${board.activity_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_library_${item.class}" class="form-control form-control-sm" value="${board.library_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_meals_${item.class}" class="form-control form-control-sm" value="${board.meals_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_accommodation_${item.class}" class="form-control form-control-sm" value="${board.accommodation_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><input type="number" id="alevel_board_${item.stream}_sports_${item.class}" class="form-control form-control-sm" value="${board.sports_fee || 0}" style="width:100px" step="1000" oninput="updateAlevelBoardTotal('${item.class}', '${item.stream}')"></td>
                <td><strong id="alevel_board_${item.stream}_total_${item.class}" style="color:#01605a;">UGX ${total.toLocaleString()}</strong></td>
                <td><button class="btn btn-sm btn-success" onclick="saveAlevelBoardFee('${item.class}', '${item.stream}')"><i class="fas fa-save"></i> Save</button></td>
            </tr>
        `;
    }).join('');  // ← IMPORTANT: .join('') HERE
    
}
    
    return `
        <div class="settings-container">
            <style>
                .settings-tabs {
                    display: flex;
                    gap: 5px;
                    background: white;
                    border-radius: 12px;
                    padding: 10px;
                    margin-bottom: 25px;
                    flex-wrap: wrap;
                    border-bottom: 2px solid #e0e0e0;
                }
                .tab-btn {
                    padding: 12px 25px;
                    border: none;
                    background: #f0f0f0;
                    font-weight: 600;
                    color: #6c757d;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .tab-btn:hover {
                    background: #e0e0e0;
                }
                .tab-btn.active {
                    background: linear-gradient(135deg, #01605a, #ff862d);
                    color: white;
                }
                .tab-panel {
                    display: none;
                    animation: fadeIn 0.3s ease;
                }
                .tab-panel.active {
                    display: block;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .info-card {
                    background: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 25px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .info-card h5 {
                    color: #01605a;
                    margin-bottom: 20px;
                    border-left: 4px solid #ff862d;
                    padding-left: 15px;
                }
                .grade-card {
                    background: #f8f9fa;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .grade-card h6 {
                    color: #01605a;
                    margin-bottom: 15px;
                    font-weight: bold;
                }
                .save-btn {
                    background: linear-gradient(135deg, #01605a, #ff862d);
                    border: none;
                    padding: 10px 30px;
                    border-radius: 8px;
                    color: white;
                    font-weight: bold;
                    cursor: pointer;
                }
                .save-btn:hover {
                    transform: translateY(-2px);
                }
                .form-label {
                    font-weight: 600;
                    margin-bottom: 5px;
                }
                input, textarea, select {
                    border-radius: 8px;
                    border: 1px solid #ddd;
                    padding: 8px 12px;
                    width: 100%;
                }
                .table-responsive {
                    overflow-x: auto;
                }
                .table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .table th, .table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    vertical-align: middle;
                }
                .table-primary {
                    background-color: #01605a;
                    color: white;
                }
                .alert-info {
                    background-color: #d1ecf1;
                    border-color: #bee5eb;
                    color: #0c5460;
                    padding: 12px;
                    border-radius: 8px;
                }
                .logo-preview {
                    width: 120px;
                    height: 120px;
                    margin: 0 auto 15px;
                    border-radius: 15px;
                    overflow: hidden;
                    border: 3px solid #ff862d;
                    background: #f8f9fa;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .grade-badge {
                    display: inline-block;
                    width: 50px;
                    height: 50px;
                    line-height: 50px;
                    text-align: center;
                    border-radius: 12px;
                    font-weight: bold;
                    font-size: 20px;
                    color: white;
                }
            </style>
            
            <!-- TABS BUTTONS -->
            <div class="settings-tabs">
                <button class="tab-btn active" onclick="showTab('school')">🏫 School Info</button>
                <button class="tab-btn" onclick="showTab('olevel')">📊 O-Level</button>
                <button class="tab-btn" onclick="showTab('alevel')">📈 A-Level</button>
                <button class="tab-btn" onclick="showTab('fee')">💰 Fee Structure</button>
                <button class="tab-btn" onclick="showTab('academic')">📅 Academic</button>
                 <button class="tab-btn" onclick="showTab('houses')">🏠 Houses</button> 
            </div>
            
            <!-- SCHOOL INFO PANEL -->
            <div id="tab-school" class="tab-panel active">
                ${await renderSchoolInfoTabContent()}
            </div>
            
            <!-- O-LEVEL PANEL -->
            <div id="tab-olevel" class="tab-panel">
                <div class="info-card">
                    <h5><i class="fas fa-chart-line text-success"></i> O-Level Grading (UCE - New Curriculum)</h5>
                    <div class="alert alert-info mb-4">
                        <i class="fas fa-info-circle"></i> 
                        <strong>Competency-Based Curriculum:</strong> Continuous Assessment (30%) + Project Work (20%) + End of Term Exam (50%)
                    </div>
                    
                    <!-- GRADING SCALE TABLE -->
                    <div class="grade-card">
                        <h6><i class="fas fa-table"></i> Grading Scale</h6>
                        <div class="table-responsive">
                            <table class="table table-bordered">
                                <thead class="table-primary">
                                    <tr>
                                        <th style="width:80px">Grade</th>
                                        <th style="width:100px">Min %</th>
                                        <th style="width:100px">Max %</th>
                                        <th style="width:80px">Points</th>
                                        <th>Description</th>
                                        <th>Competency Level</th>
                                        <th style="width:80px">Color</th>
                                        <th>Remark</th>
                                        <th style="width:80px">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${olevelGradesHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- ASSESSMENT COMPONENTS -->
                    <div class="grade-card">
                        <h6><i class="fas fa-chart-pie"></i> Assessment Components</h6>
                        <div class="row">
                            ${olevelComponentsHtml}
                        </div>
                    </div>
                    
                    <!-- PROMOTION CRITERIA -->
                    <div class="grade-card">
                        <h6><i class="fas fa-arrow-up"></i> Promotion Criteria</h6>
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label">Minimum Average (%)</label>
                                <input type="number" id="promoMinAvg" class="form-control" value="${olevelPromotion.min_average || 50}" min="0" max="100">
                                <small class="text-muted">Minimum average to be promoted</small>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Maximum Failures Allowed</label>
                                <input type="number" id="promoMaxFailures" class="form-control" value="${olevelPromotion.max_failures || 2}" min="0" max="10">
                                <small class="text-muted">Number of subjects allowed to fail</small>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Require Project Pass</label>
                                <select id="promoRequireProject" class="form-select">
                                    <option value="true" ${olevelPromotion.require_project_pass ? 'selected' : ''}>Yes - Must pass project</option>
                                    <option value="false" ${!olevelPromotion.require_project_pass ? 'selected' : ''}>No - Project not required</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Require CA Pass</label>
                                <select id="promoRequireCA" class="form-select">
                                    <option value="true" ${olevelPromotion.require_ca_pass ? 'selected' : ''}>Yes - Must pass CA</option>
                                    <option value="false" ${!olevelPromotion.require_ca_pass ? 'selected' : ''}>No - CA not required</option>
                                </select>
                            </div>
                        </div>
                        <div class="text-end mt-4">
                            <button class="save-btn" onclick="saveOlevelPromotion()">
                                <i class="fas fa-save"></i> Save Promotion Criteria
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
 <!-- ============================================ -->
<!-- PART 3: A-LEVEL PANEL HTML                  -->
<!-- UPDATED: Added ICT and Subsidiary Mathematics -->
<!-- ============================================ -->

<!-- A-LEVEL PANEL -->
<div id="tab-alevel" class="tab-panel">
    <div class="info-card">
        <h5><i class="fas fa-chart-bar text-info"></i> A-Level Grading (UACE)</h5>
        <div class="alert alert-info mb-4">
            <i class="fas fa-info-circle"></i> 
            <strong>Advanced Level Curriculum:</strong> Principal Subjects (6 points max) + Subsidiary Subjects (6 points max)
            <br>
            <i class="fas fa-laptop-code"></i> <strong>Subsidiaries Available:</strong> General Paper | ICT | Subsidiary Mathematics | Entrepreneurship | Computer Science
        </div>
        
        <!-- ============================================ -->
        <!-- PRINCIPAL SUBJECTS GRADING TABLE             -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <h6><i class="fas fa-crown"></i> Principal Subjects Grading</h6>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-primary">
                        <tr>
                            <th style="width:70px">Grade</th>
                            <th style="width:80px">Min %</th>
                            <th style="width:80px">Max %</th>
                            <th style="width:70px">Points</th>
                            <th style="width:70px">GP</th>
                            <th>Classification</th>
                            <th style="width:80px">Uni Entry</th>
                            <th style="width:80px">Color</th>
                            <th>Remark</th>
                            <th style="width:60px">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${alevelPrincipalHtml}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- SUBSIDIARY SUBJECTS GRADING TABLE            -->
        <!-- (Applies to ICT, SubMath, General Paper, etc.) -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <h6><i class="fas fa-book"></i> Subsidiary Subjects Grading</h6>
            <div class="alert alert-secondary small">
                <i class="fas fa-info-circle"></i> Applies to: <strong>General Paper, ICT, Subsidiary Mathematics, Entrepreneurship, Computer Science</strong>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-info">
                        <tr>
                            <th style="width:70px">Grade</th>
                            <th style="width:80px">Min %</th>
                            <th style="width:80px">Max %</th>
                            <th style="width:70px">Points</th>
                            <th style="width:70px">GP</th>
                            <th>Description</th>
                            <th style="width:80px">Color</th>
                            <th style="width:60px">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${alevelSubsidiaryHtml}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- SUBSIDIARY SUBJECTS LIST TABLE               -->
        <!-- (Shows ICT, Subsidiary Mathematics, etc.)    -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <h6><i class="fas fa-list"></i> Subsidiary Subjects Offered</h6>
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> 
                <strong>ICT (Information & Communication Technology)</strong> and 
                <strong>Subsidiary Mathematics (SubMath)</strong> are now available as elective subsidiary subjects.
            </div>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-success">
                        <tr>
                            <th>Subject Name</th>
                            <th>Subject Code</th>
                            <th>Category</th>
                            <th style="width:100px">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subsidiarySubjectsHtml}
                    </tbody>
                </table>
            </div>
            
            <!-- ============================================ -->
            <!-- ADD NEW SUBSIDIARY SUBJECT FORM              -->
            <!-- ============================================ -->
            <div class="row mt-3">
                <div class="col-md-4">
                    <input type="text" id="newSubsidiarySubject" class="form-control" placeholder="New Subject (e.g., Agriculture)">
                </div>
                <div class="col-md-3">
                    <input type="text" id="newSubsidiaryCode" class="form-control" placeholder="Code (e.g., AGR)">
                </div>
                <div class="col-md-3">
                    <select id="newSubsidiaryCategory" class="form-select">
                        <option value="Core">Core Subsidiary</option>
                        <option value="Elective" selected>Elective Subsidiary</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button class="btn btn-primary w-100" onclick="saveSubsidiarySubject()">
                        <i class="fas fa-plus"></i> Add
                    </button>
                </div>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- DIVISION CLASSIFICATION TABLE                -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <h6><i class="fas fa-chart-line"></i> Division Classification</h6>
            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-warning">
                        <tr>
                            <th>Division</th>
                            <th style="width:100px">Min Points</th>
                            <th style="width:100px">Max Points</th>
                            <th>Description</th>
                            <th style="width:80px">Color</th>
                            <th style="width:60px">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${alevelDivisionsHtml}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- UNIVERSITY ENTRY REQUIREMENTS                 -->
        <!-- ============================================ -->
        <div class="grade-card">
            <h6><i class="fas fa-university"></i> University Entry Requirements</h6>
            <div class="alert alert-warning small">
                <i class="fas fa-graduation-cap"></i> <strong>Note:</strong> ICT and Subsidiary Mathematics count toward subsidiary points for university admission.
            </div>
            <div class="row g-3">
                <div class="col-md-3">
                    <label class="form-label">Minimum Points</label>
                    <input type="number" id="uniMinPoints" class="form-control" value="${alevelUniversity.minimum_points || 12}" min="0" max="30">
                    <small class="text-muted">Minimum total points for university</small>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Min Principal Passes</label>
                    <input type="number" id="uniMinPasses" class="form-control" value="${alevelUniversity.minimum_principal_passes || 2}" min="0" max="5">
                    <small class="text-muted">Minimum number of principal passes</small>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Minimum GP</label>
                    <input type="number" id="uniMinGP" class="form-control" value="${alevelUniversity.minimum_gp || 3.0}" step="0.5" min="0" max="6">
                    <small class="text-muted">Minimum Grade Point average</small>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Require General Paper</label>
                    <select id="uniRequireGP" class="form-select">
                        <option value="true" ${alevelUniversity.require_general_paper ? 'selected' : ''}>Yes - Required</option>
                        <option value="false" ${!alevelUniversity.require_general_paper ? 'selected' : ''}>No - Not Required</option>
                    </select>
                    <small class="text-muted">Is General Paper required?</small>
                </div>
            </div>
            <div class="text-end mt-4">
                <button class="save-btn" onclick="saveAlevelUniversityEntry()">
                    <i class="fas fa-save"></i> Save University Entry Requirements
                </button>
            </div>
        </div>
    </div>
</div>
            
<div id="tab-fee" class="tab-panel">
    <div class="info-card" style="padding: 20px;">
        <h5 class="mb-3"><i class="fas fa-money-bill-wave text-success"></i> Fee Structure</h5>
        
        <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle"></i> 
            <strong>Cell-Level Saving:</strong> Each fee cell has its own SAVE button. Click Save next to any fee to save only that specific fee to the database.
        </div>
        
        <!-- O-LEVEL FEES -->
        <div class="grade-card mb-4" style="padding: 15px;">
            <h6 class="mb-3"><i class="fas fa-graduation-cap"></i> O-Level Fees (S.1 - S.4)</h6>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 13px;">
                    <thead class="table-primary">
                        <tr>
                            <th style="width: 80px">Class</th>
                            <th style="width: 80px">Type</th>
                            <th style="min-width: 160px">Tuition Fee</th>
                            <th style="min-width: 160px">Development Fee</th>
                            <th style="min-width: 160px">Activity Fee</th>
                            <th style="min-width: 160px">Library Fee</th>
                            <th style="min-width: 160px">Sports Fee</th>
                            <th style="min-width: 160px">Meals Fee</th>
                            <th style="min-width: 160px">Accommodation</th>
                            <th style="min-width: 120px">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="olevelFeesBody">
                        <tr><td colspan="10" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- A-LEVEL FEES -->
        <div class="grade-card mb-4" style="padding: 15px;">
            <h6 class="mb-3"><i class="fas fa-flask"></i> A-Level Fees (S.5 - S.6)</h6>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 13px;">
                    <thead class="table-primary">
                        <tr>
                            <th style="width: 80px">Class</th>
                            <th style="width: 80px">Stream</th>
                            <th style="width: 80px">Type</th>
                            <th style="min-width: 160px">Tuition Fee</th>
                            <th style="min-width: 160px">Development Fee</th>
                            <th style="min-width: 160px">Activity Fee</th>
                            <th style="min-width: 160px">Library Fee</th>
                            <th style="min-width: 160px">Sports Fee</th>
                            <th style="min-width: 160px">Meals Fee</th>
                            <th style="min-width: 160px">Accommodation</th>
                            <th style="min-width: 120px">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="alevelFeesBody">
                        <tr><td colspan="11" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- BUTTONS -->
        <div class="text-center mt-3">
            <button class="btn btn-primary" onclick="refreshFeeStructure()">
                <i class="fas fa-sync-alt"></i> Refresh from Database
            </button>
            <button class="btn btn-success ms-2" onclick="exportFeeStructure()">
                <i class="fas fa-file-excel"></i> Export to Excel
            </button>
        </div>
      </div>
      </div>
            <!-- ACADEMIC CALENDAR PANEL - FINAL MASTERPIECE -->
      <div id="tab-academic" class="tab-panel">
      <div class="info-card">
        <h5><i class="fas fa-calendar-alt text-primary"></i> Academic Calendar</h5>
        <div class="alert alert-info mb-4">
            <i class="fas fa-info-circle"></i> 
            <strong>School Calendar:</strong> Manage terms, holidays, exams, and important events
        </div>
        
        <!-- ============================================ -->
        <!-- CURRENT ACADEMIC YEAR STATUS -->
        <!-- ============================================ -->
        <div class="grade-card mb-4" style="background: linear-gradient(135deg, #01605a, #ff862d); color: white;">
            <div class="row text-center">
                <div class="col-md-3">
                    <h3 id="currentYear">2026</h3>
                    <small>Academic Year</small>
                </div>
                <div class="col-md-3">
                    <h3 id="currentTerm">Term 1</h3>
                    <small>Current Term</small>
                </div>
                <div class="col-md-3">
                    <h3 id="weeksElapsed">0</h3>
                    <small>Weeks Elapsed</small>
                </div>
                <div class="col-md-3">
                    <h3 id="weeksRemaining">0</h3>
                    <small>Weeks Remaining</small>
                </div>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- TERM DATES -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="fas fa-calendar-week"></i> Term Dates</h6>
                <button class="btn btn-sm btn-primary" onclick="addNewTerm()">
                    <i class="fas fa-plus"></i> Add Term
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 14px;">
                    <thead class="table-primary">
                        <tr>
                            <th>Year</th>
                            <th>Term</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th>Status</th>
                            <th width="100">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="termsTableBody">
                        <tr><td colspan="6" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络</tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- HOLIDAYS & BREAKS -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="fas fa-umbrella-beach"></i> Holidays & Breaks</h6>
                <button class="btn btn-sm btn-success" onclick="addNewHoliday()">
                    <i class="fas fa-plus"></i> Add Holiday
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 14px;">
                    <thead class="table-success">
                        <tr>
                            <th>Holiday Name</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th>Days</th>
                            <th width="80">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="holidaysTableBody">
                        <tr><td colspan="5" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络</tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- EXAM SCHEDULE -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="fas fa-file-alt"></i> Exam Schedule</h6>
                <button class="btn btn-sm btn-warning" onclick="addNewExam()">
                    <i class="fas fa-plus"></i> Add Exam
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 14px;">
                    <thead class="table-warning">
                        <tr>
                            <th>Exam Name</th>
                            <th>Term</th>
                            <th>Year</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th width="80">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="examsTableBody">
                        <tr><td colspan="6" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络</tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- IMPORTANT DATES / EVENTS -->
        <!-- ============================================ -->
        <div class="grade-card mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="fas fa-star"></i> Important Dates & Events</h6>
                <button class="btn btn-sm btn-info" onclick="addNewEvent()">
                    <i class="fas fa-plus"></i> Add Event
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered" style="font-size: 14px;">
                    <thead class="table-info">
                        <tr>
                            <th>Event Name</th>
                            <th>Date</th>
                            <th>Description</th>
                            <th width="80">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="eventsTableBody">
                        <tr><td colspan="4" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</span>络</tbody>
                </table>
            </div>
        </div>
        
        <!-- ============================================ -->
        <!-- REFRESH BUTTON -->
        <!-- ============================================ -->
        <div class="text-center mt-3">
            <button class="btn btn-secondary" id="academicRefreshBtn" onclick="refreshAcademicData()">
                <i class="fas fa-sync-alt"></i> Refresh All Data
            </button>
        </div>
      </div>
      </div>
            
           
        </div>
       







        

              <div id="tab-houses" class="tab-panel">
      <div class="info-card">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0"><i class="fas fa-home"></i> House Management</h5>
            <button class="btn btn-sm btn-success" onclick="addNewHouse()">
                <i class="fas fa-plus"></i> Add New House
            </button>
        </div>
        
        <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle"></i> 
            Manage school houses with their respective House Heads (teachers in charge).
        </div>
        
        <div id="housesListContainer">
            <div class="text-center py-4">
                <i class="fas fa-spinner fa-spin"></i> Loading houses...
            </div>
        </div>
        
        <div class="text-end mt-4">
            <button class="save-btn" onclick="saveAllHouses()">
                <i class="fas fa-save"></i> Save All Houses
            </button>
        </div>
     </div>
     </div>

        
    `;

    
}

// ============================================
// PART 9.5: O-LEVEL GRADING FUNCTIONS
// ============================================

// Load O-Level grades from database
async function loadOlevelGrades() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('olevel_grades')
            .select('*')
            .order('points', { ascending: true });
        
        if (error) {
            console.error("Error loading O-Level grades:", error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [];
    }
}

// Load O-Level assessment components
async function loadOlevelAssessmentComponents() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('olevel_assessment_components')
            .select('*');
        
        if (error) {
            console.error("Error loading components:", error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [];
    }
}

// Load O-Level promotion criteria
async function loadOlevelPromotion() {
    if (!sb) return {};
    
    try {
        const { data, error } = await sb
            .from('olevel_promotion')
            .select('*')
            .limit(1)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            console.error("Error loading promotion:", error);
            return {};
        }
        return data || {};
    } catch (e) {
        console.error("Exception:", e);
        return {};
    }
}

// Save O-Level Grade
window.saveOlevelGrade = async function(grade) {
    console.log("Saving O-Level grade:", grade);
    
    const minInput = document.getElementById(`omin_${grade}`);
    const maxInput = document.getElementById(`omax_${grade}`);
    const pointsInput = document.getElementById(`opoints_${grade}`);
    const descInput = document.getElementById(`odesc_${grade}`);
    const competencyInput = document.getElementById(`ocomp_${grade}`);
    const colorInput = document.getElementById(`ocolor_${grade}`);
    const remarkInput = document.getElementById(`oremark_${grade}`);
    
    const min = minInput ? minInput.value : null;
    const max = maxInput ? maxInput.value : null;
    const points = pointsInput ? pointsInput.value : null;
    const description = descInput ? descInput.value : '';
    const competency = competencyInput ? competencyInput.value : '';
    const color = colorInput ? colorInput.value : '#2ecc71';
    const remark = remarkInput ? remarkInput.value : '';
    
    if (!min || !max || !points) {
        Swal.fire('Error', 'Please fill Min %, Max %, and Points', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await sb
        .from('olevel_grades')
        .upsert({
            grade: grade,
            min_percentage: parseInt(min),
            max_percentage: parseInt(max),
            points: parseInt(points),
            description: description,
            competency_level: competency,
            color_code: color,
            remark: remark
        }, { onConflict: 'grade' });
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ title: 'Success!', text: `Grade ${grade} saved!`, icon: 'success', timer: 1500, showConfirmButton: false });
    }
};

// Save O-Level Promotion Criteria
window.saveOlevelPromotion = async function() {
    console.log("Saving O-Level promotion criteria");
    
    const minAvg = document.getElementById('promoMinAvg');
    const maxFail = document.getElementById('promoMaxFailures');
    const reqProject = document.getElementById('promoRequireProject');
    const reqCA = document.getElementById('promoRequireCA');
    
    const data = {
        min_average: parseInt(minAvg?.value || 50),
        max_failures: parseInt(maxFail?.value || 2),
        require_project_pass: reqProject?.value === 'true',
        require_ca_pass: reqCA?.value === 'true',
        updated_at: new Date().toISOString()
    };
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { data: existing } = await sb
        .from('olevel_promotion')
        .select('id')
        .limit(1)
        .maybeSingle();
    
    let error;
    if (existing?.id) {
        const { error: updateError } = await sb
            .from('olevel_promotion')
            .update(data)
            .eq('id', existing.id);
        error = updateError;
    } else {
        data.created_at = new Date().toISOString();
        const { error: insertError } = await sb
            .from('olevel_promotion')
            .insert(data);
        error = insertError;
    }
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ title: 'Success!', text: 'Promotion criteria saved!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
};

// Edit Assessment Component
window.editComponent = async function(componentType, currentWeight) {
    const { value: weight } = await Swal.fire({
        title: `Edit ${componentType} Weight`,
        input: 'number',
        inputLabel: 'Enter new weight percentage',
        inputValue: currentWeight,
        inputAttributes: { min: 0, max: 100, step: 5 },
        showCancelButton: true,
        confirmButtonText: 'Save'
    });
    
    if (weight) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const { error } = await sb
            .from('olevel_assessment_components')
            .update({ weight_percentage: parseInt(weight), updated_at: new Date().toISOString() })
            .eq('component_type', componentType);
        
        Swal.close();
        
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire({ title: 'Success!', text: `${componentType} weight updated to ${weight}%`, icon: 'success', timer: 1500, showConfirmButton: false });
        }
    }
};
// ============================================
// PART 9.6: A-LEVEL GRADING FUNCTIONS
// COMPLETE - NO AUTO REFRESH, JUST ALERTS
// ============================================

// Load A-Level Principal Grades
async function loadAlevelPrincipalGrades() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('alevel_principal_grades')
            .select('*')
            .order('points', { ascending: false });
        
        if (error) {
            console.error("Error loading A-Level principal grades:", error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [];
    }
}

// Load A-Level Subsidiary Grades
async function loadAlevelSubsidiaryGrades() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('alevel_subsidiary_grades')
            .select('*')
            .order('points', { ascending: false });
        
        if (error) {
            console.error("Error loading A-Level subsidiary grades:", error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [];
    }
}

// Load A-Level Divisions
async function loadAlevelDivisions() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('alevel_divisions')
            .select('*')
            .order('min_points', { ascending: false });
        
        if (error) {
            console.error("Error loading A-Level divisions:", error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [];
    }
}

// Load A-Level University Entry Requirements
async function loadAlevelUniversityEntry() {
    if (!sb) return {};
    
    try {
        const { data, error } = await sb
            .from('alevel_university_entry')
            .select('*')
            .limit(1)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            console.error("Error loading university entry:", error);
            return {};
        }
        return data || {};
    } catch (e) {
        console.error("Exception:", e);
        return {};
    }
}

// Load Subsidiary Subjects List (with valid UUID defaults)
async function loadSubsidiarySubjects() {
    if (!sb) return [];
    
    try {
        const { data, error } = await sb
            .from('subsidiary_subjects')
            .select('*')
            .order('subject_name', { ascending: true });
        
        if (error) {
            console.error("Error loading subsidiary subjects:", error);
            // Return default subjects with VALID UUID format
            return [
                { id: '11111111-1111-1111-1111-111111111111', subject_name: 'General Paper', code: 'GP', category: 'Core' },
                { id: '22222222-2222-2222-2222-222222222222', subject_name: 'ICT', code: 'ICT', category: 'Elective' },
                { id: '33333333-3333-3333-3333-333333333333', subject_name: 'Subsidiary Mathematics', code: 'SUB MATH', category: 'Elective' },
                { id: '44444444-4444-4444-4444-444444444444', subject_name: 'Entrepreneurship', code: 'ENT', category: 'Elective' },
                { id: '55555555-5555-5555-5555-555555555555', subject_name: 'Computer Science', code: 'CS', category: 'Elective' }
            ];
        }
        return data || [];
    } catch (e) {
        console.error("Exception:", e);
        return [
            { id: '11111111-1111-1111-1111-111111111111', subject_name: 'General Paper', code: 'GP', category: 'Core' },
            { id: '22222222-2222-2222-2222-222222222222', subject_name: 'ICT', code: 'ICT', category: 'Elective' },
            { id: '33333333-3333-3333-3333-333333333333', subject_name: 'Subsidiary Mathematics', code: 'SUB MATH', category: 'Elective' }
        ];
    }
}

// ============================================
// SAVE FUNCTIONS - NO AUTO REFRESH
// ============================================

// Save A-Level Principal Grade
window.saveAlevelPrincipalGrade = async function(grade) {
    console.log("Saving A-Level principal grade:", grade);
    
    const min = document.getElementById(`ap_min_${grade}`)?.value;
    const max = document.getElementById(`ap_max_${grade}`)?.value;
    const points = document.getElementById(`ap_points_${grade}`)?.value;
    const gp = document.getElementById(`ap_gp_${grade}`)?.value;
    const classification = document.getElementById(`ap_class_${grade}`)?.value;
    const uniEntry = document.getElementById(`ap_uni_${grade}`)?.value;
    const color = document.getElementById(`ap_color_${grade}`)?.value;
    const remark = document.getElementById(`ap_remark_${grade}`)?.value;
    
    if (!min || !max || !points) {
        Swal.fire('Error', 'Please fill Min %, Max %, and Points', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await sb
        .from('alevel_principal_grades')
        .upsert({
            grade: grade,
            min_percentage: parseInt(min),
            max_percentage: parseInt(max),
            points: parseInt(points),
            grade_point: parseFloat(gp) || 0,
            classification: classification || '',
            university_entry: uniEntry || '',
            color_code: color || '#2ecc71',
            remark: remark || ''
        }, { onConflict: 'grade' });
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ 
            title: 'Success!', 
            text: `Grade ${grade} saved successfully!`, 
            icon: 'success', 
            confirmButtonText: 'OK'
        });
    }
};

// Save A-Level Subsidiary Grade
window.saveAlevelSubsidiaryGrade = async function(grade) {
    console.log("Saving A-Level subsidiary grade:", grade);
    
    const min = document.getElementById(`as_min_${grade}`)?.value;
    const max = document.getElementById(`as_max_${grade}`)?.value;
    const points = document.getElementById(`as_points_${grade}`)?.value;
    const gp = document.getElementById(`as_gp_${grade}`)?.value;
    const desc = document.getElementById(`as_desc_${grade}`)?.value;
    const color = document.getElementById(`as_color_${grade}`)?.value;
    
    if (!min || !max || !points) {
        Swal.fire('Error', 'Please fill Min %, Max %, and Points', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await sb
        .from('alevel_subsidiary_grades')
        .upsert({
            grade: grade,
            min_percentage: parseInt(min),
            max_percentage: parseInt(max),
            points: parseFloat(points),
            grade_point: parseFloat(gp) || 0,
            description: desc || '',
            color_code: color || '#2ecc71'
        }, { onConflict: 'grade' });
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ 
            title: 'Success!', 
            text: `Grade ${grade} saved successfully!`, 
            icon: 'success', 
            confirmButtonText: 'OK'
        });
    }
};

// Save A-Level Division
window.saveAlevelDivision = async function(divisionName) {
    console.log("Saving A-Level division:", divisionName);
    
    const min = document.getElementById(`div_min_${divisionName}`)?.value;
    const max = document.getElementById(`div_max_${divisionName}`)?.value;
    const desc = document.getElementById(`div_desc_${divisionName}`)?.value;
    const color = document.getElementById(`div_color_${divisionName}`)?.value;
    
    if (!min || !max) {
        Swal.fire('Error', 'Please fill Min Points and Max Points', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await sb
        .from('alevel_divisions')
        .upsert({
            division_name: divisionName,
            min_points: parseInt(min),
            max_points: parseInt(max),
            description: desc || '',
            color_code: color || '#f39c12'
        }, { onConflict: 'division_name' });
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ 
            title: 'Success!', 
            text: `${divisionName} saved successfully!`, 
            icon: 'success', 
            confirmButtonText: 'OK'
        });
    }
};

// Save A-Level University Entry Requirements
window.saveAlevelUniversityEntry = async function() {
    console.log("Saving A-Level university entry requirements");
    
    const minPoints = document.getElementById('uniMinPoints')?.value;
    const minPasses = document.getElementById('uniMinPasses')?.value;
    const minGp = document.getElementById('uniMinGP')?.value;
    const requireGp = document.getElementById('uniRequireGP')?.value === 'true';
    
    const data = {
        minimum_points: parseInt(minPoints) || 12,
        minimum_principal_passes: parseInt(minPasses) || 2,
        minimum_gp: parseFloat(minGp) || 3.0,
        require_general_paper: requireGp,
        updated_at: new Date().toISOString()
    };
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { data: existing } = await sb
        .from('alevel_university_entry')
        .select('id')
        .limit(1)
        .maybeSingle();
    
    let error;
    if (existing?.id) {
        const { error: updateError } = await sb
            .from('alevel_university_entry')
            .update(data)
            .eq('id', existing.id);
        error = updateError;
    } else {
        data.created_at = new Date().toISOString();
        const { error: insertError } = await sb
            .from('alevel_university_entry')
            .insert(data);
        error = insertError;
    }
    
    Swal.close();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire({ 
            title: 'Success!', 
            text: 'University entry requirements saved!', 
            icon: 'success', 
            confirmButtonText: 'OK'
        });
    }
};

// ============================================
// SUBSIDIARY SUBJECT CRUD - NO AUTO REFRESH
// ============================================

// Save (Add) Subsidiary Subject
window.saveSubsidiarySubject = async function() {
    const subjectName = document.getElementById('newSubsidiarySubject')?.value;
    const subjectCode = document.getElementById('newSubsidiaryCode')?.value;
    const subjectCategory = document.getElementById('newSubsidiaryCategory')?.value;
    
    if (!subjectName) {
        Swal.fire('Error', 'Subject name is required', 'error');
        return;
    }
    
    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const { error } = await sb
            .from('subsidiary_subjects')
            .insert({
                subject_name: subjectName,
                code: subjectCode || subjectName.substring(0, 3).toUpperCase(),
                category: subjectCategory || 'Elective',
                created_at: new Date().toISOString()
            });
        
        Swal.close();
        
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            // Clear form inputs
            if (document.getElementById('newSubsidiarySubject')) 
                document.getElementById('newSubsidiarySubject').value = '';
            if (document.getElementById('newSubsidiaryCode')) 
                document.getElementById('newSubsidiaryCode').value = '';
            
            Swal.fire({ 
                title: 'Added!', 
                text: `${subjectName} has been added to the database.`, 
                icon: 'success',
                confirmButtonText: 'OK'
            });
        }
    } catch (e) {
        Swal.close();
        Swal.fire('Error', 'An unexpected error occurred', 'error');
    }
};

// Edit Subsidiary Subject
window.editSubsidiarySubject = async function(subjectId, currentName, currentCode, currentCategory) {
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectId);
    
    if (!isValidUUID) {
        Swal.fire('Cannot Edit', 'This is a default subject. Add it to database first.', 'info');
        return;
    }
    
    const { value: formValues } = await Swal.fire({
        title: 'Edit Subsidiary Subject',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">Subject Name</label>
                    <input id="editSubName" class="form-control" value="${escapeHtml(currentName)}">
                </div>
                <div class="mb-3">
                    <label class="form-label">Subject Code</label>
                    <input id="editSubCode" class="form-control" value="${escapeHtml(currentCode || '')}">
                </div>
                <div class="mb-3">
                    <label class="form-label">Category</label>
                    <select id="editSubCategory" class="form-select">
                        <option value="Core" ${currentCategory === 'Core' ? 'selected' : ''}>Core Subsidiary</option>
                        <option value="Elective" ${currentCategory === 'Elective' ? 'selected' : ''}>Elective Subsidiary</option>
                    </select>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => {
            const newName = document.getElementById('editSubName').value.trim();
            if (!newName) {
                Swal.showValidationMessage('Subject name is required');
                return false;
            }
            return {
                name: newName,
                code: document.getElementById('editSubCode').value.trim(),
                category: document.getElementById('editSubCategory').value
            };
        }
    });
    
    if (formValues) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const { error } = await sb
                .from('subsidiary_subjects')
                .update({
                    subject_name: formValues.name,
                    code: formValues.code || formValues.name.substring(0, 3).toUpperCase(),
                    category: formValues.category
                })
                .eq('id', subjectId);
            
            Swal.close();
            
            if (error) {
                Swal.fire('Error', error.message, 'error');
            } else {
                Swal.fire({ 
                    title: 'Updated!', 
                    text: 'Subject has been updated in the database.', 
                    icon: 'success',
                    confirmButtonText: 'OK'
                });
            }
        } catch (e) {
            Swal.close();
            Swal.fire('Error', 'An unexpected error occurred', 'error');
        }
    }
};

// Delete Subsidiary Subject
window.deleteSubsidiarySubject = async function(subjectId) {
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectId);
    
    if (!isValidUUID) {
        Swal.fire('Cannot Delete', 'This is a default subject. Add it to database first.', 'info');
        return;
    }
    
    const result = await Swal.fire({
        title: 'Delete Subsidiary Subject?',
        text: 'This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it',
        cancelButtonText: 'Cancel'
    });
    
    if (!result.isConfirmed) return;
    
    Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const { error } = await sb
            .from('subsidiary_subjects')
            .delete()
            .eq('id', subjectId);
        
        Swal.close();
        
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire({ 
                title: 'Deleted!', 
                text: 'Subject has been deleted from the database.', 
                icon: 'success',
                confirmButtonText: 'OK'
            });
        }
    } catch (e) {
        Swal.close();
        Swal.fire('Error', 'An unexpected error occurred', 'error');
    }
};

// ============================================
// HELPER FUNCTION: Escape HTML
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// CELL-LEVEL SAVE BUTTONS - Fixed for your database
// ============================================


// Fee types in order
const FEE_TYPES = ['Tuition Fee', 'Development Fee', 'Activity Fee', 'Library Fee', 'Sports Fee', 'Meals Fee', 'Accommodation Fee'];

// O-Level classes
const OLEVEL_CLASSES = ['S.1', 'S.2', 'S.3', 'S.4'];

// A-Level classes
const ALEVEL_CLASSES = [
    { class: 'S.5', stream: 'Arts', fullName: 'S.5 Arts' },
    { class: 'S.5', stream: 'Sciences', fullName: 'S.5 Sciences' },
    { class: 'S.6', stream: 'Arts', fullName: 'S.6 Arts' },
    { class: 'S.6', stream: 'Sciences', fullName: 'S.6 Sciences' }
];

// Student types
const STUDENT_TYPES = ['Day', 'Boarding'];

// ============================================
// LOAD ALL FEES FROM fee_structure TABLE
// ============================================

async function loadFeeStructureData() {
    try {
        console.log("🔄 Loading fee structure from database...");
        
        const { data, error } = await sb
            .from('fee_structure')
            .select('*');
        
        if (error) throw error;
        
        feeStructureData = data || [];
        console.log(`✅ Loaded ${feeStructureData.length} fee records`);
        
        return feeStructureData;
        
    } catch (error) {
        console.error('Error loading fee structure:', error);
        return [];
    }
}

// ============================================
// GET FEE AMOUNT
// ============================================

function getFeeAmount(className, studentType, feeType) {
    const fee = feeStructureData.find(f => 
        f.class_name === className && 
        f.student_type === studentType && 
        f.fee_type === feeType
    );
    return fee ? fee.amount : 0;
}

// ============================================
// SAVE SINGLE FEE CELL TO DATABASE (Fixed - No ON CONFLICT)
// ============================================

window.saveSingleFee = async function(className, studentType, feeType, buttonElement) {
    const inputId = `fee_${className.replace(/\s/g, '_')}_${studentType}_${feeType.replace(/\s/g, '_')}`;
    const input = document.getElementById(inputId);
    
    if (!input) return;
    
    const amount = parseInt(input.value) || 0;
    const level = className.includes('S.5') || className.includes('S.6') ? 'alevel' : 'olevel';
    
    // Show saving state on button
    const originalButtonHtml = buttonElement.innerHTML;
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    buttonElement.disabled = true;
    
    // Highlight input while saving
    input.style.backgroundColor = '#fff3cd';
    
    try {
        // First, check if the record exists
        const { data: existing } = await sb
            .from('fee_structure')
            .select('id')
            .eq('class_name', className)
            .eq('student_type', studentType)
            .eq('fee_type', feeType)
            .maybeSingle();
        
        let error;
        
        if (existing) {
            // UPDATE existing record
            const { error: updateError } = await sb
                .from('fee_structure')
                .update({ 
                    amount: amount, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', existing.id);
            error = updateError;
        } else {
            // INSERT new record
            const { error: insertError } = await sb
                .from('fee_structure')
                .insert({
                    class_name: className,
                    student_type: studentType,
                    fee_type: feeType,
                    amount: amount,
                    level: level,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            error = insertError;
        }
        
        if (error) throw error;
        
        // Update local cache
        const existingIndex = feeStructureData.findIndex(f => 
            f.class_name === className && 
            f.student_type === studentType && 
            f.fee_type === feeType
        );
        
        if (existingIndex >= 0) {
            feeStructureData[existingIndex].amount = amount;
        } else {
            feeStructureData.push({
                class_name: className,
                student_type: studentType,
                fee_type: feeType,
                amount: amount,
                level: level
            });
        }
        
        // Update total for this row
        updateRowTotal(className, studentType);
        
        // Show success
        input.style.backgroundColor = '#d4edda';
        buttonElement.innerHTML = '<i class="fas fa-check"></i>';
        
        setTimeout(() => {
            input.style.backgroundColor = '';
            buttonElement.innerHTML = originalButtonHtml;
            buttonElement.disabled = false;
        }, 1000);
        
        console.log(`✅ Saved: ${className} ${studentType} - ${feeType} = UGX ${amount.toLocaleString()}`);
        
        // Show toast notification
        showToast(`${feeType} saved: UGX ${amount.toLocaleString()}`, 'success');
        
        // Refresh payments module if open
        if (typeof refreshPayments === 'function') {
            setTimeout(async () => {
                await refreshPayments();
            }, 500);
        }
        
    } catch (error) {
        console.error('Save error:', error);
        input.style.backgroundColor = '#f8d7da';
        buttonElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        
        setTimeout(() => {
            input.style.backgroundColor = '';
            buttonElement.innerHTML = originalButtonHtml;
            buttonElement.disabled = false;
        }, 2000);
        
        showToast('Error saving: ' + error.message, 'error');
    }
};

// ============================================
// UPDATE ROW TOTAL
// ============================================

function updateRowTotal(className, studentType) {
    let total = 0;
    
    for (const feeType of FEE_TYPES) {
        const inputId = `fee_${className.replace(/\s/g, '_')}_${studentType}_${feeType.replace(/\s/g, '_')}`;
        const input = document.getElementById(inputId);
        if (input) {
            total += parseInt(input.value) || 0;
        }
    }
    
    const totalSpan = document.getElementById(`total_${className.replace(/\s/g, '_')}_${studentType}`);
    if (totalSpan) {
        totalSpan.innerHTML = formatMoney(total);
        
        // Highlight total briefly
        totalSpan.style.backgroundColor = '#d4edda';
        setTimeout(() => {
            if (totalSpan) totalSpan.style.backgroundColor = '';
        }, 500);
    }
}

// ============================================
// SHOW TOAST NOTIFICATION
// ============================================

function showToast(message, type = 'success') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `
        <div style="background: ${type === 'success' ? '#28a745' : '#dc3545'}; color: white; padding: 12px 24px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> 
            ${message}
        </div>
    `;
    document.body.appendChild(toast);
    
    // Add animation styles if not exists
    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================
// RENDER O-LEVEL FEES TABLE
// ============================================

async function renderOlevelFees() {
    const tbody = document.getElementById('olevelFeesBody');
    if (!tbody) return;
    
    await loadFeeStructureData();
    
    let html = '';
    let rowCounter = 0;
    
    for (const className of OLEVEL_CLASSES) {
        for (const studentType of STUDENT_TYPES) {
            rowCounter++;
            let total = 0;
            
            html += `<tr style="background: ${rowCounter % 2 === 0 ? '#f9f9f9' : 'white'};">`;
            html += `<td><strong>${className}</strong></td>`;
            html += `<td><span class="badge ${studentType === 'Day' ? 'bg-success' : 'bg-info'}">${studentType}</span></td>`;
            
            for (const feeType of FEE_TYPES) {
                const amount = getFeeAmount(className, studentType, feeType);
                total += amount;
                const inputId = `fee_${className.replace(/\s/g, '_')}_${studentType}_${feeType.replace(/\s/g, '_')}`;
                
                html += `
                    <td style="padding: 5px;">
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <input type="number" 
                                   id="${inputId}"
                                   class="form-control form-control-sm" 
                                   value="${amount}" 
                                   style="width: 110px; text-align: right;" 
                                   step="5000"
                                   onchange="updateRowTotal('${className}', '${studentType}')">
                            <button class="btn btn-sm btn-primary" 
                                    onclick="saveSingleFee('${className}', '${studentType}', '${feeType}', this)"
                                    style="padding: 4px 8px; white-space: nowrap;">
                                <i class="fas fa-save"></i> Save
                            </button>
                        </div>
                     </span>
                `;
            }
            
            html += `<td class="text-success fw-bold" id="total_${className.replace(/\s/g, '_')}_${studentType}" style="background: #e8f5e9; text-align: center;">
                        <strong>${formatMoney(total)}</strong>
                     </span>`;
            html += `</tr>`;
        }
    }
    
    tbody.innerHTML = html;
}

// ============================================
// RENDER A-LEVEL FEES TABLE
// ============================================

async function renderAlevelFees() {
    const tbody = document.getElementById('alevelFeesBody');
    if (!tbody) return;
    
    await loadFeeStructureData();
    
    let html = '';
    let rowCounter = 0;
    
    for (const item of ALEVEL_CLASSES) {
        for (const studentType of STUDENT_TYPES) {
            rowCounter++;
            let total = 0;
            
            html += `<tr style="background: ${rowCounter % 2 === 0 ? '#f9f9f9' : 'white'};">`;
            html += `<td><strong>${item.class}</strong></td>`;
            html += `<td>${item.stream}</td>`;
            html += `<td><span class="badge ${studentType === 'Day' ? 'bg-success' : 'bg-info'}">${studentType}</span></td>`;
            
            for (const feeType of FEE_TYPES) {
                const amount = getFeeAmount(item.fullName, studentType, feeType);
                total += amount;
                const inputId = `fee_${item.fullName.replace(/\s/g, '_')}_${studentType}_${feeType.replace(/\s/g, '_')}`;
                
                html += `
                    <td style="padding: 5px;">
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <input type="number" 
                                   id="${inputId}"
                                   class="form-control form-control-sm" 
                                   value="${amount}" 
                                   style="width: 110px; text-align: right;" 
                                   step="5000"
                                   onchange="updateRowTotal('${item.fullName}', '${studentType}')">
                            <button class="btn btn-sm btn-primary" 
                                    onclick="saveSingleFee('${item.fullName}', '${studentType}', '${feeType}', this)"
                                    style="padding: 4px 8px; white-space: nowrap;">
                                <i class="fas fa-save"></i> Save
                            </button>
                        </div>
                     </span>
                `;
            }
            
            html += `<td class="text-success fw-bold" id="total_${item.fullName.replace(/\s/g, '_')}_${studentType}" style="background: #e8f5e9; text-align: center;">
                        <strong>${formatMoney(total)}</strong>
                     </span>`;
            html += `</tr>`;
        }
    }
    
    tbody.innerHTML = html;
}

// ============================================
// REFRESH FEE STRUCTURE
// ============================================

window.refreshFeeStructure = async function() {
    Swal.fire({ title: 'Refreshing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    await loadFeeStructureData();
    await renderOlevelFees();
    await renderAlevelFees();
    
    Swal.close();
    Swal.fire({
        title: '✅ Refreshed!',
        text: 'Fee structure reloaded from database',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
    });
};

// ============================================
// EXPORT TO EXCEL
// ============================================

window.exportFeeStructure = async function() {
    await loadFeeStructureData();
    
    const exportData = feeStructureData.map(f => ({
        'Class': f.class_name,
        'Student Type': f.student_type,
        'Fee Type': f.fee_type,
        'Amount (UGX)': f.amount,
        'Level': f.level
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Structure');
    XLSX.writeFile(wb, `Fee_Structure_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    Swal.fire('Exported!', `${exportData.length} fee records exported.`, 'success');
};

// ============================================
// FORMAT MONEY
// ============================================

function formatMoney(amount) {
    return 'UGX ' + (amount || 0).toLocaleString();
}

// ============================================
// INITIALIZE FEE STRUCTURE TAB
// ============================================

async function initFeeStructureTab() {
    console.log("Initializing Cell-Level Save Fee Structure...");
    await renderOlevelFees();
    await renderAlevelFees();
}

// Auto-load when tab is opened
if (typeof showTab === 'function') {
    const originalShowTab = window.showTab;
    window.showTab = function(tabName) {
        originalShowTab(tabName);
        if (tabName === 'fee') {
            setTimeout(() => {
                renderOlevelFees();
                renderAlevelFees();
            }, 100);
        }
    };
}

// Initial load
setTimeout(() => {
    if (document.getElementById('olevelFeesBody')) {
        initFeeStructureTab();
    }
}, 500);

console.log('✅ Cell-Level Save Fee Structure Ready - Fixed for your database!');

// ============================================
// ACADEMIC CALENDAR - FINAL MASTERPIECE
// Complete with Add, Edit, Delete, Refresh
// Auto-load on page open
// ============================================

let holidaysList = [];
let examsList = [];
let eventsList = [];

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function calculateDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

// ============================================
// LOAD ALL ACADEMIC DATA
// ============================================

async function loadAcademicData() {
    try {
        // Show loading in tables
        const tables = ['termsTableBody', 'holidaysTableBody', 'examsTableBody', 'eventsTableBody'];
        for (const tableId of tables) {
            const tbody = document.getElementById(tableId);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading data...</span>络</tbody>';
            }
        }
        
        // Load terms from database
        const { data: termsData, error: termsError } = await sb
            .from('academic_terms')
            .select('*')
            .order('year', { ascending: false })
            .order('term_number', { ascending: true });
        
        if (!termsError && termsData && termsData.length > 0) {
            termsList = termsData;
        } else {
            // Default fallback data
            termsList = [
                { id: 'default_t1', year: 2026, term_number: 1, term_name: 'Term 1', start_date: '2026-02-01', end_date: '2026-04-30', status: 'Active' },
                { id: 'default_t2', year: 2026, term_number: 2, term_name: 'Term 2', start_date: '2026-05-15', end_date: '2026-08-15', status: 'Upcoming' },
                { id: 'default_t3', year: 2026, term_number: 3, term_name: 'Term 3', start_date: '2026-09-01', end_date: '2026-11-30', status: 'Upcoming' }
            ];
        }
        
        // Load holidays from database
        const { data: holsData, error: holsError } = await sb
            .from('academic_holidays')
            .select('*')
            .order('start_date', { ascending: true });
        
        if (!holsError && holsData && holsData.length > 0) {
            holidaysList = holsData;
        } else {
            holidaysList = [
                { id: 'default_h1', name: 'Easter Break', start_date: '2026-04-10', end_date: '2026-04-20', days: 11 },
                { id: 'default_h2', name: 'August Holiday', start_date: '2026-08-16', end_date: '2026-08-31', days: 16 },
                { id: 'default_h3', name: 'Christmas Break', start_date: '2026-12-01', end_date: '2027-01-31', days: 62 }
            ];
        }
        
        // Load exams from database
        const { data: examsData, error: examsError } = await sb
            .from('academic_exams')
            .select('*')
            .order('start_date', { ascending: true });
        
        if (!examsError && examsData && examsData.length > 0) {
            examsList = examsData;
        } else {
            examsList = [
                { id: 'default_e1', name: 'Mid-Term Exams', term: 'Term 1', year: 2026, start_date: '2026-03-15', end_date: '2026-03-25' },
                { id: 'default_e2', name: 'End of Term Exams', term: 'Term 1', year: 2026, start_date: '2026-04-20', end_date: '2026-04-28' },
                { id: 'default_e3', name: 'Mock Exams', term: 'Term 2', year: 2026, start_date: '2026-07-15', end_date: '2026-07-25' }
            ];
        }
        
        // Load events from database
        const { data: eventsData, error: eventsError } = await sb
            .from('academic_events')
            .select('*')
            .order('event_date', { ascending: true });
        
        if (!eventsError && eventsData && eventsData.length > 0) {
            eventsList = eventsData;
        } else {
            eventsList = [
                { id: 'default_ev1', name: 'Opening Day', event_date: '2026-02-01', description: 'School reopens for Term 1' },
                { id: 'default_ev2', name: 'Parents Meeting', event_date: '2026-03-10', description: 'PTA Meeting for all parents' },
                { id: 'default_ev3', name: 'Sports Day', event_date: '2026-06-05', description: 'Annual inter-house sports competition' },
                { id: 'default_ev4', name: 'Graduation Day', event_date: '2026-11-15', description: 'S.4 and S.6 graduation ceremony' }
            ];
        }
        
        // Render all tables
        renderTermsTable();
        renderHolidaysTable();
        renderExamsTable();
        renderEventsTable();
        
        // Update current status
        updateCurrentStatus();
        
    } catch (error) {
        console.error('Error loading academic data:', error);
        for (const tableId of ['termsTableBody', 'holidaysTableBody', 'examsTableBody', 'eventsTableBody']) {
            const tbody = document.getElementById(tableId);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-danger">Error loading data. Please refresh.</span>络</tbody>';
            }
        }
    }
}

// ============================================
// REFRESH FUNCTION (WORKING)
// ============================================

async function refreshAcademicData() {
    const refreshBtn = document.getElementById('academicRefreshBtn');
    
    try {
        // Show loading on button
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
        // Reload all data
        await loadAcademicData();
        
        // Show success message
        Swal.fire({
            title: 'Refreshed!',
            text: 'Academic calendar data has been updated.',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
        
    } catch (error) {
        Swal.fire({
            title: 'Error!',
            text: 'Failed to refresh data. Please try again.',
            icon: 'error'
        });
    } finally {
        // Restore button
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh All Data';
        }
    }
}

// ============================================
// UPDATE CURRENT STATUS
// ============================================

function updateCurrentStatus() {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    let currentTerm = null;
    let weeksElapsed = 0;
    let weeksRemaining = 0;
    
    for (const term of termsList) {
        const start = new Date(term.start_date);
        const end = new Date(term.end_date);
        
        if (today >= start && today <= end) {
            currentTerm = term;
            const diffDays = Math.ceil((today - start) / (1000 * 60 * 60 * 24));
            const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
            weeksElapsed = Math.floor(diffDays / 7);
            weeksRemaining = Math.floor((totalDays - diffDays) / 7);
            if (weeksElapsed < 0) weeksElapsed = 0;
            if (weeksRemaining < 0) weeksRemaining = 0;
            term.status = 'Active';
        } else if (today < start) {
            term.status = 'Upcoming';
        } else if (today > end) {
            term.status = 'Completed';
        }
    }
    
    document.getElementById('currentYear').innerText = currentYear;
    document.getElementById('currentTerm').innerText = currentTerm ? currentTerm.term_name : 'No Active Term';
    document.getElementById('weeksElapsed').innerText = weeksElapsed;
    document.getElementById('weeksRemaining').innerText = weeksRemaining;
}

// ============================================
// RENDER TERMS TABLE
// ============================================

function renderTermsTable() {
    const tbody = document.getElementById('termsTableBody');
    if (!tbody) return;
    
    if (!termsList || termsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No terms configured. Click "Add Term" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const term of termsList) {
        let statusBadge = '';
        if (term.status === 'Active') statusBadge = '<span class="badge bg-success">Active</span>';
        else if (term.status === 'Upcoming') statusBadge = '<span class="badge bg-warning">Upcoming</span>';
        else statusBadge = '<span class="badge bg-secondary">Completed</span>';
        
        html += `
            <tr>
                <td class="text-center">${term.year || '-'}</span></td>
                <td class="text-center"><strong>${escapeHtml(term.term_name || 'Term ' + term.term_number)}</strong></span></td>
                <td class="text-center">${formatDate(term.start_date)}</span></td>
                <td class="text-center">${formatDate(term.end_date)}</span></td>
                <td class="text-center">${statusBadge}</span></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1" onclick="editTerm('${term.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTerm('${term.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

// ============================================
// RENDER HOLIDAYS TABLE
// ============================================

function renderHolidaysTable() {
    const tbody = document.getElementById('holidaysTableBody');
    if (!tbody) return;
    
    if (!holidaysList || holidaysList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">No holidays configured. Click "Add Holiday" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const holiday of holidaysList) {
        html += `
            <tr>
                <td><strong>${escapeHtml(holiday.name)}</strong></span></td>
                <td class="text-center">${formatDate(holiday.start_date)}</span></td>
                <td class="text-center">${formatDate(holiday.end_date)}</span></td>
                <td class="text-center">${holiday.days || calculateDays(holiday.start_date, holiday.end_date)}</span></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1" onclick="editHoliday('${holiday.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteHoliday('${holiday.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

// ============================================
// RENDER EXAMS TABLE
// ============================================

function renderExamsTable() {
    const tbody = document.getElementById('examsTableBody');
    if (!tbody) return;
    
    if (!examsList || examsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No exams scheduled. Click "Add Exam" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const exam of examsList) {
        html += `
            <tr>
                <td><strong>${escapeHtml(exam.name)}</strong></span></td>
                <td class="text-center">${exam.term || '-'}</span></td>
                <td class="text-center">${exam.year || '-'}</span></td>
                <td class="text-center">${formatDate(exam.start_date)}</span></td>
                <td class="text-center">${formatDate(exam.end_date)}</span></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1" onclick="editExam('${exam.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteExam('${exam.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

// ============================================
// RENDER EVENTS TABLE
// ============================================

function renderEventsTable() {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    
    if (!eventsList || eventsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">No events scheduled. Click "Add Event" to get started. </span>络</tbody>';
        return;
    }
    
    let html = '';
    for (const event of eventsList) {
        html += `
            <tr>
                <td><strong>${escapeHtml(event.name)}</strong></span></td>
                <td class="text-center">${formatDate(event.event_date)}</span></td>
                <td>${escapeHtml(event.description || '-')}</span></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1" onclick="editEvent('${event.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEvent('${event.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </span></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

// ============================================
// TERM CRUD OPERATIONS
// ============================================

async function addNewTerm() {
    const { value: result } = await Swal.fire({
        title: 'Add New Term',
        html: `
            <div class="text-start">
                <label class="form-label">Year</label>
                <input type="number" id="termYear" class="form-control mb-3" value="2026" step="1">
                <label class="form-label">Term Number</label>
                <select id="termNumber" class="form-select mb-3">
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                </select>
                <label class="form-label">Start Date</label>
                <input type="date" id="termStart" class="form-control mb-3">
                <label class="form-label">End Date</label>
                <input type="date" id="termEnd" class="form-control mb-3">
                <label class="form-label">Status</label>
                <select id="termStatus" class="form-select">
                    <option value="Upcoming">Upcoming</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Add Term',
        preConfirm: () => {
            const year = document.getElementById('termYear').value;
            const termNum = document.getElementById('termNumber').value;
            const startDate = document.getElementById('termStart').value;
            const endDate = document.getElementById('termEnd').value;
            const status = document.getElementById('termStatus').value;
            
            if (!startDate || !endDate) {
                Swal.showValidationMessage('Please enter start and end dates');
                return false;
            }
            
            return {
                year: parseInt(year),
                term_number: parseInt(termNum),
                term_name: `Term ${termNum}`,
                start_date: startDate,
                end_date: endDate,
                status: status
            };
        }
    });
    
    if (result) {
        Swal.fire({ title: 'Adding...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_terms').insert(result);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Term added successfully', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function editTerm(termId) {
    const term = termsList.find(t => t.id === termId);
    if (!term) return;
    
    const { value: result } = await Swal.fire({
        title: 'Edit Term',
        html: `
            <div class="text-start">
                <label class="form-label">Year</label>
                <input type="number" id="termYear" class="form-control mb-3" value="${term.year}">
                <label class="form-label">Term Name</label>
                <input type="text" id="termName" class="form-control mb-3" value="${escapeHtml(term.term_name)}">
                <label class="form-label">Start Date</label>
                <input type="date" id="termStart" class="form-control mb-3" value="${term.start_date}">
                <label class="form-label">End Date</label>
                <input type="date" id="termEnd" class="form-control mb-3" value="${term.end_date}">
                <label class="form-label">Status</label>
                <select id="termStatus" class="form-select">
                    <option value="Upcoming" ${term.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                    <option value="Active" ${term.status === 'Active' ? 'selected' : ''}>Active</option>
                    <option value="Completed" ${term.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => ({
            year: parseInt(document.getElementById('termYear').value),
            term_name: document.getElementById('termName').value,
            start_date: document.getElementById('termStart').value,
            end_date: document.getElementById('termEnd').value,
            status: document.getElementById('termStatus').value
        })
    });
    
    if (result) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_terms').update(result).eq('id', termId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Term updated', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function deleteTerm(termId) {
    const result = await Swal.fire({
        title: 'Delete Term?',
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_terms').delete().eq('id', termId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Deleted!', 'Term removed', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

// ============================================
// HOLIDAY CRUD OPERATIONS
// ============================================

async function addNewHoliday() {
    const { value: result } = await Swal.fire({
        title: 'Add Holiday',
        html: `
            <div class="text-start">
                <label class="form-label">Holiday Name</label>
                <input type="text" id="holidayName" class="form-control mb-3" placeholder="e.g., Easter Break">
                <label class="form-label">Start Date</label>
                <input type="date" id="holidayStart" class="form-control mb-3">
                <label class="form-label">End Date</label>
                <input type="date" id="holidayEnd" class="form-control mb-3">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Add Holiday',
        preConfirm: () => {
            const name = document.getElementById('holidayName').value;
            const startDate = document.getElementById('holidayStart').value;
            const endDate = document.getElementById('holidayEnd').value;
            
            if (!name || !startDate || !endDate) {
                Swal.showValidationMessage('Please fill all fields');
                return false;
            }
            
            const days = calculateDays(startDate, endDate);
            return { name: name, start_date: startDate, end_date: endDate, days: days };
        }
    });
    
    if (result) {
        Swal.fire({ title: 'Adding...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_holidays').insert(result);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Holiday added', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function editHoliday(holidayId) {
    const holiday = holidaysList.find(h => h.id === holidayId);
    if (!holiday) return;
    
    const { value: result } = await Swal.fire({
        title: 'Edit Holiday',
        html: `
            <div class="text-start">
                <label class="form-label">Holiday Name</label>
                <input type="text" id="holidayName" class="form-control mb-3" value="${escapeHtml(holiday.name)}">
                <label class="form-label">Start Date</label>
                <input type="date" id="holidayStart" class="form-control mb-3" value="${holiday.start_date}">
                <label class="form-label">End Date</label>
                <input type="date" id="holidayEnd" class="form-control mb-3" value="${holiday.end_date}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => {
            const startDate = document.getElementById('holidayStart').value;
            const endDate = document.getElementById('holidayEnd').value;
            const days = calculateDays(startDate, endDate);
            return {
                name: document.getElementById('holidayName').value,
                start_date: startDate,
                end_date: endDate,
                days: days
            };
        }
    });
    
    if (result) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_holidays').update(result).eq('id', holidayId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Holiday updated', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function deleteHoliday(holidayId) {
    const result = await Swal.fire({
        title: 'Delete Holiday?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_holidays').delete().eq('id', holidayId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Deleted!', 'Holiday removed', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

// ============================================
// EXAM CRUD OPERATIONS
// ============================================

async function addNewExam() {
    const { value: result } = await Swal.fire({
        title: 'Add Exam',
        html: `
            <div class="text-start">
                <label class="form-label">Exam Name</label>
                <input type="text" id="examName" class="form-control mb-3" placeholder="e.g., End of Term Exams">
                <label class="form-label">Term</label>
                <select id="examTerm" class="form-select mb-3">
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                </select>
                <label class="form-label">Year</label>
                <input type="number" id="examYear" class="form-control mb-3" value="2026">
                <label class="form-label">Start Date</label>
                <input type="date" id="examStart" class="form-control mb-3">
                <label class="form-label">End Date</label>
                <input type="date" id="examEnd" class="form-control mb-3">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Add Exam',
        preConfirm: () => ({
            name: document.getElementById('examName').value,
            term: document.getElementById('examTerm').value,
            year: parseInt(document.getElementById('examYear').value),
            start_date: document.getElementById('examStart').value,
            end_date: document.getElementById('examEnd').value
        })
    });
    
    if (result) {
        Swal.fire({ title: 'Adding...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_exams').insert(result);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Exam added', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function editExam(examId) {
    const exam = examsList.find(e => e.id === examId);
    if (!exam) return;
    
    const { value: result } = await Swal.fire({
        title: 'Edit Exam',
        html: `
            <div class="text-start">
                <label class="form-label">Exam Name</label>
                <input type="text" id="examName" class="form-control mb-3" value="${escapeHtml(exam.name)}">
                <label class="form-label">Term</label>
                <select id="examTerm" class="form-select mb-3">
                    <option value="Term 1" ${exam.term === 'Term 1' ? 'selected' : ''}>Term 1</option>
                    <option value="Term 2" ${exam.term === 'Term 2' ? 'selected' : ''}>Term 2</option>
                    <option value="Term 3" ${exam.term === 'Term 3' ? 'selected' : ''}>Term 3</option>
                </select>
                <label class="form-label">Year</label>
                <input type="number" id="examYear" class="form-control mb-3" value="${exam.year}">
                <label class="form-label">Start Date</label>
                <input type="date" id="examStart" class="form-control mb-3" value="${exam.start_date}">
                <label class="form-label">End Date</label>
                <input type="date" id="examEnd" class="form-control mb-3" value="${exam.end_date}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => ({
            name: document.getElementById('examName').value,
            term: document.getElementById('examTerm').value,
            year: parseInt(document.getElementById('examYear').value),
            start_date: document.getElementById('examStart').value,
            end_date: document.getElementById('examEnd').value
        })
    });
    
    if (result) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_exams').update(result).eq('id', examId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Exam updated', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function deleteExam(examId) {
    const result = await Swal.fire({
        title: 'Delete Exam?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_exams').delete().eq('id', examId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Deleted!', 'Exam removed', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

// ============================================
// EVENT CRUD OPERATIONS
// ============================================

async function addNewEvent() {
    const { value: result } = await Swal.fire({
        title: 'Add Event',
        html: `
            <div class="text-start">
                <label class="form-label">Event Name</label>
                <input type="text" id="eventName" class="form-control mb-3" placeholder="e.g., Sports Day">
                <label class="form-label">Event Date</label>
                <input type="date" id="eventDate" class="form-control mb-3">
                <label class="form-label">Description</label>
                <textarea id="eventDesc" class="form-control" rows="2" placeholder="Event details..."></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Add Event',
        preConfirm: () => ({
            name: document.getElementById('eventName').value,
            event_date: document.getElementById('eventDate').value,
            description: document.getElementById('eventDesc').value
        })
    });
    
    if (result) {
        Swal.fire({ title: 'Adding...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_events').insert(result);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Event added', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function editEvent(eventId) {
    const event = eventsList.find(e => e.id === eventId);
    if (!event) return;
    
    const { value: result } = await Swal.fire({
        title: 'Edit Event',
        html: `
            <div class="text-start">
                <label class="form-label">Event Name</label>
                <input type="text" id="eventName" class="form-control mb-3" value="${escapeHtml(event.name)}">
                <label class="form-label">Event Date</label>
                <input type="date" id="eventDate" class="form-control mb-3" value="${event.event_date}">
                <label class="form-label">Description</label>
                <textarea id="eventDesc" class="form-control" rows="2">${escapeHtml(event.description || '')}</textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => ({
            name: document.getElementById('eventName').value,
            event_date: document.getElementById('eventDate').value,
            description: document.getElementById('eventDesc').value
        })
    });
    
    if (result) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_events').update(result).eq('id', eventId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Success!', 'Event updated', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function deleteEvent(eventId) {
    const result = await Swal.fire({
        title: 'Delete Event?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            await sb.from('academic_events').delete().eq('id', eventId);
            await loadAcademicData();
            Swal.close();
            Swal.fire('Deleted!', 'Event removed', 'success');
        } catch (error) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    }
}

// ============================================
// AUTO-LOAD ON PAGE START
// ============================================

(function autoLoadAcademic() {
    if (typeof sb !== 'undefined' && sb) {
        loadAcademicData();
    } else {
        setTimeout(autoLoadAcademic, 200);
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(loadAcademicData, 100);
});

if (typeof showTab === 'function') {
    const originalShowTab = window.showTab;
    window.showTab = function(tabName) {
        originalShowTab(tabName);
        if (tabName === 'academic') {
            loadAcademicData();
        }
    };
}

console.log('✅ Academic Calendar Module Loaded - FINAL MASTERPIECE');

// ============================================
// HOUSES MANAGEMENT - SEPARATE TABLE VERSION
// ============================================

let housesList = [];
let teachersList = [];

// Load teachers for dropdown
async function loadTeachersForHouses() {
    try {
        const { data, error } = await sb
            .from('teachers')
            .select('id, name, staff_id')
            .order('name', { ascending: true });
        
        if (error) throw error;
        teachersList = data || [];
        return teachersList;
    } catch (error) {
        console.error('Error loading teachers:', error);
        return [];
    }
}

// Load houses from database
async function loadHousesFromTable() {
    try {
        await loadTeachersForHouses();
        
        const { data, error } = await sb
            .from('houses')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) throw error;
        housesList = data || [];
        
        renderHousesTable();
        return housesList;
    } catch (error) {
        console.error('Error loading houses:', error);
        housesList = [];
        renderHousesTable();
        return [];
    }
}

// Render houses table
function renderHousesTable() {
    const container = document.getElementById('housesListContainer');
    if (!container) return;
    
    if (housesList.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning text-center py-4">
                <i class="fas fa-home fa-2x mb-2 d-block"></i>
                No houses configured. Click "Add New House" to get started.
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered">
                <thead class="table-primary">
                    <tr>
                        <th width="40">#</th>
                        <th width="180">House Name</th>
                        <th width="80">Color</th>
                        <th width="100">Code</th>
                        <th width="200">House Head</th>
                        <th>Description</th>
                        <th width="50">Students</th>
                        <th width="100">Actions</th>
                    </tr>
                </thead>
                <tbody id="housesTableBody">
    `;
    
    housesList.forEach((house, index) => {
        const teacherDropdown = getTeacherDropdownOptions(house.head_teacher_id);
        
        html += `
            <tr data-house-id="${house.id}">
                <td class="text-center">${index + 1}</td>
                <td>
                    <input type="text" class="form-control house-name" value="${escapeHtml(house.name)}" 
                           placeholder="e.g., Red House" style="font-weight: bold;">
                 </span></td>
                <td>
                    <div class="d-flex flex-column gap-1">
                        <input type="color" class="form-control house-color" value="${house.color}" style="width: 60px; height: 40px;">
                        <input type="text" class="form-control form-control-sm house-color-text" value="${house.color}" 
                               placeholder="#HEX" style="width: 80px; font-size: 11px;">
                    </div>
                 </span></td>
                <td>
                    <input type="text" class="form-control house-code" value="${escapeHtml(house.code || '')}" 
                           placeholder="e.g., RED" style="text-transform: uppercase;">
                 </span></td>
                <td>
                    <select class="form-select house-head-teacher" data-house-id="${house.id}">
                        ${teacherDropdown}
                    </select>
                    <div class="mt-1">
                        <small class="text-muted house-head-display">
                            ${house.head_teacher_name ? `<span class="badge bg-info">${escapeHtml(house.head_teacher_name)}</span>` : '<span class="text-muted">Not assigned</span>'}
                        </small>
                    </div>
                 </span></td>
                <td>
                    <textarea class="form-control house-description" rows="2" placeholder="House description...">${escapeHtml(house.description || '')}</textarea>
                 </span></td>
                <td class="text-center">
                    <span class="badge bg-secondary">${house.student_count || 0}</span>
                 </span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-primary me-1" onclick="editHouse('${house.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteHouseFromTable('${house.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                 </span></td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="alert alert-success mt-3 small">
            <i class="fas fa-lightbulb"></i> 
            <strong>Tip:</strong> Students can be assigned to houses during registration or editing.
        </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners for color picker sync
    document.querySelectorAll('.house-color').forEach((colorPicker, idx) => {
        const textInput = document.querySelectorAll('.house-color-text')[idx];
        if (textInput) {
            colorPicker.addEventListener('input', (e) => {
                textInput.value = e.target.value;
            });
            textInput.addEventListener('input', (e) => {
                colorPicker.value = e.target.value;
            });
        }
    });
}

// Generate teacher dropdown options
function getTeacherDropdownOptions(selectedId = null) {
    let options = '<option value="">-- Select House Head --</option>';
    for (const teacher of teachersList) {
        const selected = selectedId === teacher.id ? 'selected' : '';
        options += `<option value="${teacher.id}" ${selected}>${escapeHtml(teacher.name)} (${teacher.staff_id || 'No ID'})</option>`;
    }
    return options;
}

// Add new house
window.addNewHouse = async function() {
    const { value: formValues } = await Swal.fire({
        title: 'Add New House',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-bold">House Name *</label>
                    <input type="text" id="newHouseName" class="form-control" placeholder="e.g., Red House">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">House Code *</label>
                    <input type="text" id="newHouseCode" class="form-control" placeholder="e.g., RED" style="text-transform: uppercase;">
                    <small class="text-muted">Unique code for the house</small>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Color</label>
                    <div class="d-flex gap-2">
                        <input type="color" id="newHouseColor" class="form-control" value="#01605a" style="width: 60px;">
                        <input type="text" id="newHouseColorText" class="form-control" value="#01605a" placeholder="#HEX">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">House Head Teacher</label>
                    <select id="newHouseHead" class="form-select">
                        <option value="">-- Select House Head --</option>
                        ${teachersList.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.staff_id || 'No ID'})</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Description</label>
                    <textarea id="newHouseDesc" class="form-control" rows="2" placeholder="House description..."></textarea>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: 'Add House',
        preConfirm: () => {
            const name = document.getElementById('newHouseName')?.value.trim();
            const code = document.getElementById('newHouseCode')?.value.trim().toUpperCase();
            
            if (!name) {
                Swal.showValidationMessage('House name is required');
                return false;
            }
            if (!code) {
                Swal.showValidationMessage('House code is required');
                return false;
            }
            
            const color = document.getElementById('newHouseColorText')?.value || '#01605a';
            const headTeacherId = document.getElementById('newHouseHead')?.value || null;
            const description = document.getElementById('newHouseDesc')?.value || '';
            
            return { name, code, color, headTeacherId, description };
        }
    });
    
    if (formValues) {
        Swal.fire({ title: 'Adding...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const headTeacher = teachersList.find(t => t.id === formValues.headTeacherId);
            
            const { data, error } = await sb
                .from('houses')
                .insert([{
                    name: formValues.name,
                    code: formValues.code,
                    color: formValues.color,
                    head_teacher_id: formValues.headTeacherId || null,
                    head_teacher_name: headTeacher?.name || null,
                    description: formValues.description,
                    created_at: new Date().toISOString()
                }])
                .select();
            
            if (error) throw error;
            
            Swal.fire('Success!', 'House added successfully.', 'success');
            await loadHousesFromTable();
            
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// Edit house
window.editHouse = async function(houseId) {
    const house = housesList.find(h => h.id === houseId);
    if (!house) return;
    
    const { value: formValues } = await Swal.fire({
        title: 'Edit House',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-bold">House Name *</label>
                    <input type="text" id="editHouseName" class="form-control" value="${escapeHtml(house.name)}">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">House Code *</label>
                    <input type="text" id="editHouseCode" class="form-control" value="${escapeHtml(house.code)}" style="text-transform: uppercase;">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Color</label>
                    <div class="d-flex gap-2">
                        <input type="color" id="editHouseColor" class="form-control" value="${house.color}" style="width: 60px;">
                        <input type="text" id="editHouseColorText" class="form-control" value="${house.color}">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">House Head Teacher</label>
                    <select id="editHouseHead" class="form-select">
                        <option value="">-- Select House Head --</option>
                        ${teachersList.map(t => `<option value="${t.id}" ${house.head_teacher_id === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${t.staff_id || 'No ID'})</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Description</label>
                    <textarea id="editHouseDesc" class="form-control" rows="2">${escapeHtml(house.description || '')}</textarea>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => {
            const name = document.getElementById('editHouseName')?.value.trim();
            const code = document.getElementById('editHouseCode')?.value.trim().toUpperCase();
            
            if (!name) {
                Swal.showValidationMessage('House name is required');
                return false;
            }
            if (!code) {
                Swal.showValidationMessage('House code is required');
                return false;
            }
            
            return {
                name: name,
                code: code,
                color: document.getElementById('editHouseColorText')?.value || '#01605a',
                headTeacherId: document.getElementById('editHouseHead')?.value || null,
                description: document.getElementById('editHouseDesc')?.value || ''
            };
        }
    });
    
    if (formValues) {
        Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const headTeacher = teachersList.find(t => t.id === formValues.headTeacherId);
            
            const { error } = await sb
                .from('houses')
                .update({
                    name: formValues.name,
                    code: formValues.code,
                    color: formValues.color,
                    head_teacher_id: formValues.headTeacherId || null,
                    head_teacher_name: headTeacher?.name || null,
                    description: formValues.description,
                    updated_at: new Date().toISOString()
                })
                .eq('id', houseId);
            
            if (error) throw error;
            
            Swal.fire('Success!', 'House updated successfully.', 'success');
            await loadHousesFromTable();
            
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};

// Delete house
window.deleteHouseFromTable = async function(houseId) {
    const house = housesList.find(h => h.id === houseId);
    
    // Check if house has students
    if (house.student_count > 0) {
        Swal.fire({
            title: 'Cannot Delete',
            html: `House "${house.name}" has <strong>${house.student_count} students</strong> assigned.<br><br>Please reassign or remove students first.`,
            icon: 'warning',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    const result = await Swal.fire({
        title: 'Delete House?',
        html: `Are you sure you want to delete <strong>${escapeHtml(house.name)}</strong>?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const { error } = await sb
                .from('houses')
                .delete()
                .eq('id', houseId);
            
            if (error) throw error;
            
            Swal.fire('Deleted!', 'House has been removed.', 'success');
            await loadHousesFromTable();
            
        } catch (error) {
            Swal.fire('Error!', error.message, 'error');
        }
    }
};
// ============================================
// SAVE ALL HOUSES - SAVE ALL CHANGES AT ONCE
// ============================================

window.saveAllHouses = async function() {
    console.log("Save All Houses button clicked");
    
    // Collect all values from the table inputs
    const rows = document.querySelectorAll('#housesTableBody tr');
    
    if (rows.length === 0) {
        Swal.fire('Error', 'No houses to save', 'error');
        return;
    }
    
    const updatedHouses = [];
    
    for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        
        // Get values from each input
        const nameInput = row.querySelector('.house-name');
        const colorInput = row.querySelector('.house-color');
        const colorTextInput = row.querySelector('.house-color-text');
        const codeInput = row.querySelector('.house-code');
        const headTeacherSelect = row.querySelector('.house-head-teacher');
        const descInput = row.querySelector('.house-description');
        
        const houseName = nameInput ? nameInput.value.trim() : '';
        const houseColor = colorTextInput ? colorTextInput.value : (colorInput ? colorInput.value : '#01605a');
        const houseCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
        const headTeacherId = headTeacherSelect ? headTeacherSelect.value : null;
        const houseDescription = descInput ? descInput.value.trim() : '';
        
        // Get teacher name if selected
        let headTeacherName = '';
        if (headTeacherId) {
            const selectedTeacher = teachersList.find(t => t.id == headTeacherId);
            if (selectedTeacher) {
                headTeacherName = selectedTeacher.name;
            }
        }
        
        // Get existing house ID
        const houseId = row.getAttribute('data-house-id');
        
        if (houseName) {
            updatedHouses.push({
                id: houseId || null,
                name: houseName,
                color: houseColor,
                code: houseCode || houseName.substring(0, 3).toUpperCase(),
                head_teacher_id: headTeacherId || null,
                head_teacher_name: headTeacherName,
                description: houseDescription
            });
        }
    }
    
    if (updatedHouses.length === 0) {
        Swal.fire('Error', 'Please add at least one house before saving.', 'error');
        return;
    }
    
    Swal.fire({ 
        title: 'Saving houses...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });
    
    try {
        let saved = 0;
        let errors = 0;
        
        for (const house of updatedHouses) {
            if (house.id) {
                // UPDATE existing house
                const { error } = await sb
                    .from('houses')
                    .update({
                        name: house.name,
                        code: house.code,
                        color: house.color,
                        head_teacher_id: house.head_teacher_id,
                        head_teacher_name: house.head_teacher_name,
                        description: house.description,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', house.id);
                
                if (error) {
                    console.error('Update error:', error);
                    errors++;
                } else {
                    saved++;
                }
            } else {
                // INSERT new house
                const { error } = await sb
                    .from('houses')
                    .insert({
                        name: house.name,
                        code: house.code,
                        color: house.color,
                        head_teacher_id: house.head_teacher_id,
                        head_teacher_name: house.head_teacher_name,
                        description: house.description,
                        created_at: new Date().toISOString()
                    });
                
                if (error) {
                    console.error('Insert error:', error);
                    errors++;
                } else {
                    saved++;
                }
            }
        }
        
        Swal.close();
        
        if (errors > 0) {
            Swal.fire('Partial Success', `✅ ${saved} saved | ❌ ${errors} failed`, 'warning');
        } else {
            Swal.fire('Success!', `✅ ${saved} houses saved successfully!`, 'success');
        }
        
        // Refresh the list to get new IDs and updated data
        await loadHousesFromTable();
        
    } catch (error) {
        Swal.close();
        console.error('Save error:', error);
        Swal.fire('Error!', error.message, 'error');
    }
};

// Initialize houses tab
if (typeof showTab === 'function') {
    const originalShowTab = window.showTab;
    window.showTab = function(tabName) {
        originalShowTab(tabName);
        if (tabName === 'houses') {
            loadHousesFromTable();
        }
    };
}

console.log('✅ Houses Table Module Loaded');


// ============================================
// PART 10: INITIALIZE SETTINGS PAGE
// ============================================

async function initSettingsPage() {
    const container = document.getElementById('settingsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading settings...</p></div>';
    
    await loadSchoolSettings();
    const html = await renderSettings();
    container.innerHTML = html;
    
    console.log("✅ Settings page loaded successfully!");
}



// ============================================
// PART 11: AUTO-LOAD SCHOOL DATA FOR SIDEBAR
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(async () => {
        if (typeof sb !== 'undefined' && sb) {
            await loadSchoolSettings();
        }
    }, 500);
});


// ============================================
// PART 12: MAKE ALL FUNCTIONS GLOBAL
// ============================================

window.loadSchoolSettings = loadSchoolSettings;
window.initSettingsPage = initSettingsPage;
window.showTab = showTab;
window.previewSchoolLogo = previewSchoolLogo;
window.updateLogoOnly = updateLogoOnly;
window.updateSchoolSettings = updateSchoolSettings;
window.saveSchoolLeadership = saveSchoolLeadership;
window.saveStudentLeadership = saveStudentLeadership;
window.saveClassTeachers = saveClassTeachers;
window.saveMissionVision = saveMissionVision;
window.renderSettings = renderSettings;
// Add these to your existing window exports
window.loadOlevelGrades = loadOlevelGrades;
window.loadOlevelAssessmentComponents = loadOlevelAssessmentComponents;
window.loadOlevelPromotion = loadOlevelPromotion;
window.saveOlevelGrade = saveOlevelGrade;
window.saveOlevelPromotion = saveOlevelPromotion;
window.editComponent = editComponent;

console.log("✅ Complete Settings Module Loaded!");



// ==================== INITIALIZE ====================
async function init() {
    await initSupabase();
    if (!await checkAuth()) {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await login(document.getElementById('email').value, document.getElementById('password').value)) await checkAuth();
    });
    document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.clear(); location.reload(); });
}

window.loadPage = loadPage;
window.generateReport = generateReport;
window.calculateAverage = calculateAverage;
init();

// ============================================
// PWA SERVICE WORKER REGISTRATION
// ============================================

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('Service Worker registered successfully:', registration.scope);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('Service Worker update found!');
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Show update notification
                        Swal.fire({
                            title: 'Update Available!',
                            text: 'A new version is available. Refresh to update.',
                            icon: 'info',
                            confirmButtonText: 'Refresh',
                            showCancelButton: true
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.reload();
                            }
                        });
                    }
                });
            });
        }).catch(function(error) {
            console.log('Service Worker registration failed:', error);
        });
        
        // Handle offline/online events
        window.addEventListener('online', function() {
            console.log('You are online');
            Swal.fire({
                title: 'Back Online',
                text: 'Your internet connection has been restored.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
        });
        
        window.addEventListener('offline', function() {
            console.log('You are offline');
            Swal.fire({
                title: 'You are Offline',
                text: 'Some features may be limited. Check your connection.',
                icon: 'warning',
                timer: 3000,
                showConfirmButton: false
            });
        });
    });
}

// Prompt user to install PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button (optional)
    const installBtn = document.createElement('button');
    installBtn.innerHTML = '<i class="fas fa-download"></i> Install App';
    installBtn.className = 'btn btn-accent install-btn';
    installBtn.style.position = 'fixed';
    installBtn.style.bottom = '20px';
    installBtn.style.right = '20px';
    installBtn.style.zIndex = '1000';
    installBtn.style.borderRadius = '50px';
    installBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    
    installBtn.addEventListener('click', () => {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
            installBtn.remove();
        });
    });
    
    document.body.appendChild(installBtn);
});

// Check if app is already installed
window.addEventListener('appinstalled', (evt) => {
    console.log('App installed successfully');
    Swal.fire({
        title: 'Installed!',
        text: 'School Management System has been installed on your device.',
        icon: 'success',
        timer: 2000
    });
});