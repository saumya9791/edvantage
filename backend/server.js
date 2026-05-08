/**
 * EdVantage — backend/server.js (v3.2 — Final Fix)
 * Company  : RR Finco
 */
// Pehle jo require('dotenv').config() tha use hata kar ye likho:
import 'dotenv/config'; 
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express  from "express";
import cors     from "cors";
import mongoose from "mongoose";
// ... baaki imports same rahenge
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────
// SECTION 2 — APP SETUP
// ──────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*", methods: ["GET", "POST", "DELETE", "PATCH"] }));
app.use(express.json());

// ──────────────────────────────────────────────────────────────
// SECTION 3 — DATABASE CONNECTION

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas Connected!"))
  .catch(err => console.error("❌ MongoDB Atlas Error:", err.message));

// ──────────────────────────────────────────────────────────────
// SECTION 4 — USER SCHEMA & MODEL
// ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name      : { type: String, required: true, trim: true },
    email     : { type: String, required: true, unique: true, lowercase: true, trim: true },
    password  : { type: String, required: true },
    role      : { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const enrollmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: String, required: true }, 
  enrolledAt: { type: Date, default: Date.now }
});

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

// ──────────────────────────────────────────────────────────────
// SECTION 5 — HELPERS
// ──────────────────────────────────────────────────────────────
const ok = (res, data, message = "OK", status = 200) => {
  const body = { success: true, message, data };
  if (Array.isArray(data)) body.count = data.length;
  return res.status(status).json(body);
};

const fail = (res, message = "Server error", status = 500) =>
  res.status(status).json({ success: false, message });

const isValidObjectId = id => mongoose.Types.ObjectId.isValid(id);



// ──────────────────────────────────────────────────────────────
// SECTION 6 — AUTH ROUTES (Login & Register)
// ──────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    // ... baaki lines ...
    const existing = await User.findOne({ email: email.toLowerCase().trim() });

    

    if (existing) return fail(res, "Email already registered.", 400);
    

    // 🔥 PASSWORD HASHING (Security)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ 
      name, 
      email: email.toLowerCase().trim(), 
      password: hashedPassword 
    });
    
    await newUser.save();
    return ok(res, null, "Registration successful!", 201);
  } catch (err) { return fail(res, "Registration failed."); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) return fail(res, "Invalid credentials.", 401);
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return fail(res, "Invalid credentials.", 401);

    // 🔥 JWT TOKEN GENERATION (Security ID Card)
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: "1d" } // 1 din tak login rahega
    );

    return ok(res, {
      token, // Ab user ko token bhi milega
      user: {
        id   : user._id.toString(),
        name : user.name,
        email: user.email,
        role : user.role
      }
    }, `Welcome back, ${user.name}!`);
  } catch (err) { return fail(res, "Login failed."); }
});

// ──────────────────────────────────────────────────────────────
// SECTION 7 — USER & ADMIN ROUTES
// ──────────────────────────────────────────────────────────────

// Update Profile
app.patch("/api/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email} = req.body;
    const updated = await User.findByIdAndUpdate(id, { name, email }, { new: true }).select("-password");
    return ok(res, updated, "Profile updated.");
  } catch (err) { return fail(res, "Update failed."); }
});

// Delete Account
app.delete("/api/user/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return ok(res, null, "Account deleted.");
  } catch (err) { return fail(res, "Delete failed."); }
});

// SECURITY GUARD (Middleware) 
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: "No token provided." });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "SUPERSECRET", (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token." });
    req.user = decoded; // Token se user ki ID nikal kar request mein daal di
    next(); // Agle step par bhejo
  });
};

// User Enrollment Route (Normal User can access this)
app.post("/api/enroll", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    const existing = await Enrollment.findOne({ userId, courseId });
    if (existing) {
      return res.status(400).json({ success: false, message: "Already enrolled in this course!" });
    }

    const newEnrollment = new Enrollment({ userId, courseId });
    await newEnrollment.save();
    
    res.json({ success: true, message: "Enrolled successfully! Happy learning. 🎓" });
  } catch (err) {
    console.error("Enrollment error:", err);
    res.status(500).json({ success: false, message: "Enrollment failed." });
  }
});

// Middleware to verify admin token
const verifyAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Access denied. No token provided." });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied. Admins only." });
    }
     req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid token." });
  }
};

// GET Admin Users List (Secured)
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(5000).json({ success: false, message: "Server Error" });
    }
});

// --- server.js ke Section 7 ke bilkul niche ye copy-paste karo ---

// Admin Dashboard se kisi user ko delete karne ke liye (Secured)
app.delete("/api/admin/user/:id", verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await User.findByIdAndDelete(id); // Database se delete kar dega
        res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ──────────────────────────────────────────────────────────────
// SECTION 8 — COURSES (In-Memory)
// ──────────────────────────────────────────────────────────────
const COURSES = [
  { id:1,  title:"JEE Advanced Prep 2025", instructor:"Dr. Ramesh Kumar", category:"Engineering", price:4999, originalPrice:12999, rating:4.9, reviews:18420 },
  { id:2,  title:"UPSC CSE GS Foundation", instructor:"Prof. Ananya Sinha", category:"Civil Services", price:6499, originalPrice:14999, rating:4.8, reviews:9810 },
  { id:3,  title:"CA Foundation Fast Track", instructor:"CA Priya Mehta", category:"Commerce", price:3999, originalPrice:9999, rating:4.7, reviews:7350 },
  { id:4,  title:"Python for Data Science", instructor:"Siddharth Rao", category:"Technology", price:2499, originalPrice:5999, rating:4.8, reviews:21330 },
  { id:5,  title:"NEET Biology Masterclass", instructor:"Dr. Sunita Joshi", category:"Medical", price:5499, originalPrice:13999, rating:4.9, reviews:15620 },
  { id:6,  title:"CFA Level 1 Crash Course", instructor:"Vikram Nair, CFA", category:"Finance", price:7999, originalPrice:19999, rating:4.6, reviews:4200 },
  { id:7,  title:"Spoken English", instructor:"Ms. Rachel D'Souza", category:"Language", price:1299, originalPrice:3499, rating:4.7, reviews:33500 },
  { id:8,  title:"UI/UX Design Bootcamp", instructor:"Arnav Kapoor", category:"Design", price:2999, originalPrice:7499, rating:4.8, reviews:11890 },
  { id:9,  title:"SSC CGL Complete Batch", instructor:"Rahul Deshpande", category:"Civil Services", price:2799, originalPrice:6999, rating:4.6, reviews:8760 },
  { id:10, title:"Full-Stack Web with MERN", instructor:"Karan Mehta", category:"Technology", price:3499, originalPrice:8999, rating:4.9, reviews:27100 }
];

app.get("/api/courses", (req, res) => ok(res, COURSES));

// ──────────────────────────────────────────────────────────────
// SECTION 9 — STATIC FILES (Laxman Rekha)
// ──────────────────────────────────────────────────────────────

// Serve static files from the root folder
app.use(express.static(path.join(__dirname, '../')));

// Always serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// ──────────────────────────────────────────────────────────────
// SECTION 10 — START SERVER
// ──────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));