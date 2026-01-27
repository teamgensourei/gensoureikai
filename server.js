import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

/* =====================
   trust proxy（必須）
===================== */
app.set("trust proxy", 1);

/* =====================
   middleware
===================== */
app.use(express.json());

app.use(cors({
  origin: "https://teamgensourei.github.io",
  credentials: true
}));

app.use(session({
  name: "gensourei.sid",
  secret: "gensourei-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  }
}));

/* =====================
   DB
===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================
   REGISTER
===================== */
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "missing" });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );

    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "user exists" });
  }
});

/* =====================
   LOGIN
===================== */
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT id, password_hash FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.json({ success: false });
    }

    req.session.userId = user.id;
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* =====================
   SESSION CHECK
===================== */
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    userId: req.session.userId
  });
});

/* =====================
   LOGOUT
===================== */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("gensourei.sid");
    res.json({ success: true });
  });
});

/* =====================
   health check
===================== */
app.get("/", (req, res) => {
  res.send("SERVER OK");
});

/* =====================
   START
===================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
